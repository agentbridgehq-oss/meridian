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
  return /^(stop|unsubscribe|cancel|end|quit)$/i.test(String(body || '').trim());
}

function isStart(body) {
  return /^(start|unstop|subscribe|yes)$/i.test(String(body || '').trim());
}

export async function handleInboundSms({ agent, body, from, to }) {
  const text = String(body || '').trim().slice(0, 1600);
  if (!agent) {
    return twiml(`<Message>${xmlEscape("This number isn't assigned yet.")}</Message>`);
  }
  if (!text) {
    return twiml(`<Message>${xmlEscape(`Thanks for texting ${agent.businessName}. How can we help?`)}</Message>`);
  }
  if (isStop(text)) {
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
    return twiml(`<Message>You're unsubscribed from ${xmlEscape(agent.businessName)}. Reply START to opt back in.</Message>`);
  }
  if (isStart(text)) {
    return twiml(`<Message>You're opted in to ${xmlEscape(agent.businessName)}. How can we help?</Message>`);
  }

  const turn = await runCustomerTurn(agent, text, {
    channel: 'sms',
    customerPhone: from,
    maxLen: 1400,
    blockSpam: true,
  });
  const reply = String(turn.reply || `Thanks — the ${agent.businessName} team will follow up.`)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1400);

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

  return twiml(`<Message>${xmlEscape(reply)}</Message>`);
}

export function inboundVoiceGatherTwiml(agent, { actionUrl, prompt } = {}) {
  const name = agent?.businessName || 'us';
  const say =
    prompt ||
    agent?.config?.voiceGreeting ||
    `Thanks for calling ${name}. How can I help you today?`;
  return twiml(
    `<Gather input="speech dtmf" action="${xmlEscape(actionUrl)}" method="POST" speechTimeout="auto" timeout="6" actionOnEmptyResult="true">` +
      `<Say voice="Polly.Joanna">${xmlEscape(say)}</Say>` +
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
