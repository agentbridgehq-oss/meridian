/**
 * Twilio inbound channel for Meridian.
 * Uses existing brain tokens (Claude → Groq → regex). No xAI TTS charge.
 * Twilio trial free units cover the SMS / Gather-Say minutes.
 */
import crypto from 'crypto';
import { getAgent } from '../engine.mjs';
import { runVoiceTurn } from './voice-pipeline.mjs';
import { runCustomerTurn } from './turn-pipeline.mjs';
import { analyzeIntent } from './knowledge.mjs';
import { logInteraction } from './interactions.mjs';
import { notifyOwner } from './notify.mjs';
import { claimCapNotice, fitSmsSegments, meterSms, smsGate, smsSegmentCount } from './usage-meter.mjs';
import { getBillingAccount } from './usage-billing.mjs';
import { smsSuppressed, setSmsSuppressed } from './sms-preferences.mjs';

export function twilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim(),
  );
}

export function twilioStatus() {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim() || '';
  return {
    configured: twilioConfigured(),
    from: process.env.TWILIO_FROM_NUMBER || null,
    accountHint: sid ? `${sid.slice(0, 6)}…` : null,
    webhookTokenSet: Boolean(process.env.TWILIO_WEBHOOK_TOKEN?.trim()),
    agentMapKeys: Object.keys(parseAgentMap()),
    trialNote:
      'Trial: SMS/voice only to verified numbers (max 5). Brain uses existing ANTHROPIC/GROQ tokens. Do not pass audio:true — Twilio <Say>/<Message> is free at Meridian layer.',
  };
}

function parseAgentMap() {
  const raw = process.env.TWILIO_AGENT_MAP?.trim();
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

export function resolveTwilioAgent({ agentId, toNumber } = {}) {
  if (agentId) {
    const a = getAgent(agentId);
    if (a) return a;
  }
  const map = parseAgentMap();
  const digits = normalizePhone(toNumber);
  for (const [num, id] of Object.entries(map)) {
    if (normalizePhone(num) === digits) {
      return getAgent(id);
    }
  }
  return null;
}

export function normalizePhone(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const keepPlus = s.startsWith('+');
  const digits = s.replace(/[^\d]/g, '');
  return keepPlus ? `+${digits}` : digits;
}

export function xmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function twiml(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

export function validateTwilioSignature(req) {
  if (process.env.TWILIO_SKIP_SIGNATURE === '1') return { ok: true, skipped: true };
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!token) return { ok: false, error: 'TWILIO_AUTH_TOKEN missing' };
  const sig = req.get('X-Twilio-Signature') || '';
  if (!sig) return { ok: false, error: 'missing X-Twilio-Signature' };

  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const host = req.get('x-forwarded-host') || req.get('host');
  const url = `${proto}://${host}${req.originalUrl}`;

  const params = req.body && typeof req.body === 'object' ? req.body : {};
  const keys = Object.keys(params).sort();
  let data = url;
  for (const k of keys) data += k + String(params[k] ?? '');

  const expected = crypto.createHmac('sha1', token).update(data, 'utf8').digest('base64');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, error: 'bad_signature' };
  return crypto.timingSafeEqual(a, b) ? { ok: true } : { ok: false, error: 'bad_signature' };
}

export function webhookTokenOk(req) {
  const needed = process.env.TWILIO_WEBHOOK_TOKEN?.trim();
  if (!needed) return true;
  const got = String(req.query?.token || req.get('X-Twilio-Webhook-Token') || '');
  if (got.length !== needed.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(needed));
}

function isStop(body) {
  return /^(stop|stopall|unsubscribe|cancel|end|quit)$/i.test(String(body || '').trim());
}

function isStart(body) {
  return /^(start|unstop)$/i.test(String(body || '').trim());
}

/** Max SMS segments one AI reply may use (still bounded by the plan balance). */
const MAX_REPLY_SEGMENTS = 10;

/** Stop-at-cap SMS notice: sent at most once per customer number per billing period. */
export function smsCapNotice(agent) {
  return `Thanks for texting ${agent?.businessName || 'us'}. Our team will reply to you personally as soon as they can.`;
}

export async function handleInboundSms({ agent, body, from, to, messageSid = '', optOutType = '' }) {
  const text = String(body || '').trim().slice(0, 1600);
  const providerOptOut = String(optOutType).toUpperCase();
  const stop = providerOptOut === 'STOP' || isStop(text);
  const start = providerOptOut === 'START' || isStart(text);
  // Process signed opt-out signals even when the number is not assigned yet.
  if (stop) setSmsSuppressed(to, from, true);
  else if (start) setSmsSuppressed(to, from, false);
  // Twilio already sent its confirmation for Advanced Opt-Out events.
  if (['STOP', 'START', 'HELP'].includes(providerOptOut)) return twiml('');
  if (!stop && !start && smsSuppressed(to, from)) return twiml('');
  if (!agent) {
    return twiml(`<Message>${xmlEscape("This number isn't assigned yet.")}</Message>`);
  }

  // Usage metering (fail safe): the number must map to a billing account with an
  // active plan or prepaid SMS. Inbound segments are always counted.
  const mapped = smsGate(agent, 0);
  const accountId = mapped.accountId || '';
  // PAYG meter-event identifiers: one per Twilio message (a webhook retry can't bill twice in Stripe).
  const sid = String(messageSid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 64);
  if (accountId) await meterSms(accountId, Math.max(1, smsSegmentCount(text)), { direction: 'inbound', force: true, reason: 'inbound', identifier: sid ? `in_${sid}` : undefined });
  const replyWith = async (message, { force = false, reason = 'reply' } = {}) => {
    if (accountId) await meterSms(accountId, Math.max(1, smsSegmentCount(message)), { direction: 'outbound', force, reason, identifier: sid ? `out_${sid}` : undefined });
    return twiml(`<Message>${xmlEscape(message)}</Message>`);
  };

  if (!text) {
    if (!smsGate(agent, 1).ok) return twiml('');
    return replyWith(`Thanks for texting ${agent.businessName}. How can we help?`, { reason: 'greeting' });
  }
  if (stop) {
    logInteraction({
      agentId: agent.id,
      businessName: agent.businessName,
      channel: 'sms',
      message: text,
      reply: 'opt_out',
      brainSource: 'twilio_stop',
      intent: { priority: 'opt_out' },
      meta: { from: from ? 'set' : null },
    });
    // Compliance reply: always sent (counted, never blocked).
    return replyWith(`You're unsubscribed from ${agent.businessName}. Reply START to opt back in.`, { force: true, reason: 'compliance' });
  }
  if (start) {
    return replyWith(`You're opted in to ${agent.businessName}. How can we help?`, { force: true, reason: 'compliance' });
  }

  const gate = smsGate(agent, 1);
  if (!gate.ok) {
    // Stop at cap / unmapped: no AI reply. Forward the text to the owner so it is not lost.
    logInteraction({
      agentId: agent.id,
      businessName: agent.businessName,
      channel: 'sms',
      message: text,
      reply: '(no AI reply: ' + gate.code + ')',
      brainSource: 'usage_cap',
      intent: { priority: 'normal' },
      meta: { from: from ? 'set' : null, billing: gate.code },
    });
    notifyOwner(agent, {
      subject: `New text for ${agent.businessName} (AI paused)`,
      text: `From: ${from}\nTo: ${to}\nSaid: ${text}\n\nThe AI did not reply (${gate.code}). Please reply personally.`,
    }).catch(() => {});
    const period = accountId ? getBillingAccount(accountId)?.periodKey : '';
    if (gate.code === 'billing.sms_cap_reached' && accountId && from && claimCapNotice(accountId, period, from)) {
      return replyWith(smsCapNotice(agent), { force: true, reason: 'cap_notice' });
    }
    return twiml('');
  }

  const turn = await runCustomerTurn(agent, text, {
    channel: 'sms',
    customerPhone: from,
    maxLen: 1400,
    blockSpam: true,
  });
  const fullReply = String(turn.reply || `Thanks — the ${agent.businessName} team will follow up.`)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1400);
  const available = smsGate(agent, 1).available || 0;
  const reply = fitSmsSegments(fullReply, Math.min(MAX_REPLY_SEGMENTS, available)) || fitSmsSegments(fullReply, 1);

  const intent = turn.intent || analyzeIntent(text);
  if (intent.emergency || intent.frustrated || intent.wantHuman) {
    notifyOwner(agent, {
      subject: intent.emergency
        ? `Emergency SMS · ${agent.businessName}`
        : `SMS transfer signal · ${agent.businessName}`,
      text: `From: ${from}\nTo: ${to}\nSaid: ${text}\nAgent: ${reply}`,
      forceSms: Boolean(intent.emergency),
    }).catch(() => {});
  }

  return replyWith(reply, { reason: 'ai_reply' });
}

/** Stop-at-cap / unmapped / payment-failed voice: no AI. Transfer to the team if configured, else polite hang-up. */
export function capVoiceTwiml(agent, code = '') {
  const name = agent?.businessName || 'us';
  const transfer = agent?.config?.humanTransfer;
  const intro = `Thanks for calling ${name}. Our virtual receptionist is not available right now.`;
  if (code === 'billing.payment_failed') {
    // PAYG payment failed: no AI. Team line if configured, else take a message (voicemail).
    if (transfer) {
      return twiml(`<Say>${xmlEscape(intro)} Connecting you with the team.</Say><Dial>${xmlEscape(transfer)}</Dial>`);
    }
    const action = `/api/twilio/voice/${encodeURIComponent(agent?.id || 'unknown')}/voicemail-done`;
    return twiml(
      `<Say>${xmlEscape(intro)} Please leave your name, number and a short message after the beep, and the team will call you back.</Say>` +
        `<Record maxLength="120" playBeep="true" action="${xmlEscape(action)}" method="POST"/>` +
        `<Say>We did not receive a message. Goodbye.</Say><Hangup/>`,
    );
  }
  if (transfer) {
    return twiml(`<Say>${xmlEscape(intro)} Connecting you with the team.</Say><Dial>${xmlEscape(transfer)}</Dial>`);
  }
  return twiml(
    `<Say>${xmlEscape(intro)} Please call back later or send us a text, and the team will get back to you. Goodbye.</Say><Hangup/>`,
  );
}

/** After a voicemail recording: thank the caller and hang up (no AI). */
export function voicemailDoneTwiml() {
  return twiml(`<Say>Thanks, your message has been recorded. The team will get back to you soon. Goodbye.</Say><Hangup/>`);
}

export function inboundVoiceGatherTwiml(agent, { actionUrl, prompt } = {}) {
  const name = agent?.businessName || 'us';
  const say =
    prompt ||
    agent?.config?.voiceGreeting ||
    `Thanks for calling ${name}. How can I help you today?`;
  return twiml(
    `<Gather input="speech dtmf" action="${xmlEscape(actionUrl)}" method="POST" speechTimeout="auto" timeout="6" actionOnEmptyResult="true">` +
      `<Say voice="Polly.Joanna">${prompt ? '' : 'You are speaking with an AI assistant. '}${xmlEscape(say)}</Say>` +
      `</Gather>` +
      `<Say>Sorry, I did not catch that. Please call back or text this number.</Say>`,
  );
}

export async function handleInboundVoiceTurn({ agent, speech, digits, actionUrl }) {
  const message = String(speech || digits || '').trim().slice(0, 2000);
  if (!agent) {
    return twiml(`<Say>This line is not assigned. Goodbye.</Say><Hangup/>`);
  }
  if (!message) {
    return inboundVoiceGatherTwiml(agent, {
      actionUrl,
      prompt: 'I did not catch that. What can I help you with?',
    });
  }

  const turn = await runVoiceTurn(agent, message, { wantAudio: false });
  const reply = String(turn.reply || 'Let me have the team follow up.')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
  const intent = analyzeIntent(message);

  logInteraction({
    agentId: agent.id,
    businessName: agent.businessName,
    channel: 'voice',
    message,
    reply,
    brainSource: turn.brainSource || 'twilio_gather',
    intent,
    meta: { provider: 'twilio', billed: false },
  });

  if (intent.emergency || intent.wantHuman || intent.frustrated) {
    const transfer = agent.config?.humanTransfer;
    notifyOwner(agent, {
      subject: intent.emergency
        ? `Emergency call · ${agent.businessName}`
        : `Voice transfer · ${agent.businessName}`,
      text: `Caller said: ${message}\nAgent: ${reply}\nTransfer: ${transfer || 'n/a'}`,
      forceSms: Boolean(intent.emergency),
    }).catch(() => {});
    if (transfer) {
      return twiml(
        `<Say>${xmlEscape(reply)}</Say>` +
          `<Say>I will connect you with the team now.</Say>` +
          `<Dial>${xmlEscape(transfer)}</Dial>`,
      );
    }
  }

  return twiml(
    `<Gather input="speech dtmf" action="${xmlEscape(actionUrl)}" method="POST" speechTimeout="auto" timeout="6" actionOnEmptyResult="true">` +
      `<Say voice="Polly.Joanna">${xmlEscape(reply)}</Say>` +
      `<Say voice="Polly.Joanna">Anything else?</Say>` +
      `</Gather>` +
      `<Say>Thanks for calling ${xmlEscape(agent.businessName)}. Goodbye.</Say>` +
      `<Hangup/>`,
  );
}

export function webhookUrls(base, agentId, token) {
  const root = String(base || '').replace(/\/$/, '');
  const q = token ? `?token=${encodeURIComponent(token)}` : '';
  return {
    sms: `${root}/api/twilio/sms/${agentId}${q}`,
    voice: `${root}/api/twilio/voice/${agentId}${q}`,
    voiceTurn: `${root}/api/twilio/voice/${agentId}/turn${q}`,
    status: `${root}/api/twilio/status`,
  };
}
