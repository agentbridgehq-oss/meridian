/**
 * Mount Twilio inbound webhooks on the Express app.
 * Public URLs Twilio can hit. Auth = Twilio signature + optional token.
 */
import {
  twilioStatus,
  validateTwilioSignature,
  webhookTokenOk,
  resolveTwilioAgent,
  handleInboundSms,
  inboundVoiceGatherTwiml,
  handleInboundVoiceTurn,
  capVoiceTwiml,
  voicemailDoneTwiml,
  webhookUrls,
} from './twilio-channel.mjs';
import { beginTwilioVoiceCall, checkTwilioVoiceTurn, endTwilioVoiceCall } from './usage-meter.mjs';
import { markLiveCallVerified } from './voice-connections.mjs';
import { notifyOwner } from './notify.mjs';

const ENDED_CALL_STATUSES = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);

function isPublicBase(root) {
  if (!/^https?:\/\//i.test(root)) return false;
  try {
    const host = new URL(root).hostname;
    return !['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(host);
  } catch {
    return false;
  }
}

function rejectTwilio(req, res) {
  if (!webhookTokenOk(req)) {
    res.status(401).type('text/plain').send('unauthorized');
    return true;
  }
  const sig = validateTwilioSignature(req);
  if (!sig.ok) {
    res.status(403).type('text/plain').send(sig.error || 'bad signature');
    return true;
  }
  return false;
}

export function registerTwilioRoutes(app, { BASE } = {}) {
  const publicBase = () => String(BASE || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

  // Gather callback URL. Twilio signs the exact URL it posts to, so the
  // callback must land on the same public host Twilio already reached.
  // With a real public base we use it; if the base is unset or still the
  // localhost default, emit a relative URL, which Twilio resolves against the
  // current webhook URL (same host, so the signature still validates).
  const voiceTurnUrl = (req) => {
    const token = process.env.TWILIO_WEBHOOK_TOKEN || req.query?.token || '';
    const q = token ? `?token=${encodeURIComponent(token)}` : '';
    const path = `/api/twilio/voice/${encodeURIComponent(req.params.agentId)}/turn${q}`;
    const root = publicBase();
    return isPublicBase(root) ? `${root}${path}` : path;
  };

  app.get('/api/twilio/status', (_req, res) => {
    res.json({
      ok: true,
      ...twilioStatus(),
      // Public diagnostics must never include the private webhook token.
      example: webhookUrls(publicBase(), 'YOUR_AGENT_ID'),
    });
  });

  app.post('/api/twilio/sms/:agentId', async (req, res) => {
    if (rejectTwilio(req, res)) return;
    const agent = resolveTwilioAgent({
      agentId: req.params.agentId,
      toNumber: req.body?.To,
    });
    try {
      const xml = await handleInboundSms({
        agent,
        body: req.body?.Body,
        from: req.body?.From,
        to: req.body?.To,
        messageSid: req.body?.MessageSid || req.body?.SmsSid || '',
        optOutType: req.body?.OptOutType || '',
      });
      res.type('text/xml').send(xml);
    } catch (e) {
      console.error('[twilio sms]', e.message);
      res
        .type('text/xml')
        .send(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        );
    }
  });

  app.post('/api/twilio/sms', async (req, res) => {
    if (rejectTwilio(req, res)) return;
    const agent = resolveTwilioAgent({ toNumber: req.body?.To, agentId: req.query?.agent });
    try {
      const xml = await handleInboundSms({
        agent,
        body: req.body?.Body,
        from: req.body?.From,
        to: req.body?.To,
        messageSid: req.body?.MessageSid || req.body?.SmsSid || '',
        optOutType: req.body?.OptOutType || '',
      });
      res.type('text/xml').send(xml);
    } catch (e) {
      console.error('[twilio sms map]', e.message);
      res
        .type('text/xml')
        .send(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        );
    }
  });

  app.post('/api/twilio/voice/:agentId', (req, res) => {
    if (rejectTwilio(req, res)) return;
    markLiveCallVerified();
    const agent = resolveTwilioAgent({
      agentId: req.params.agentId,
      toNumber: req.body?.To,
    });
    if (agent) {
      // Usage metering (fail safe): reserve AI minutes before the AI speaks.
      const callSid = String(req.body?.CallSid || '');
      const gate = callSid ? beginTwilioVoiceCall(agent, callSid) : { ok: false, code: 'billing.call_id_missing' };
      if (!gate.ok) return res.type('text/xml').send(capVoiceTwiml(agent, gate.code));
    }
    const actionUrl = voiceTurnUrl(req);
    res.type('text/xml').send(inboundVoiceGatherTwiml(agent, { actionUrl }));
  });

  // Twilio call status callback (set as the number's Status Callback URL): settles AI minutes.
  app.post('/api/twilio/voice/:agentId/status', async (req, res) => {
    if (rejectTwilio(req, res)) return;
    const agent = resolveTwilioAgent({ agentId: req.params.agentId, toNumber: req.body?.To });
    const callSid = String(req.body?.CallSid || '');
    if (agent && callSid && ENDED_CALL_STATUSES.has(String(req.body?.CallStatus || ''))) {
      const d = Number(req.body?.CallDuration);
      await endTwilioVoiceCall(agent, callSid, Number.isFinite(d) && d >= 0 ? { durationSeconds: d } : {}).catch(() => {});
    }
    res.status(204).end();
  });

  // No-AI fallback TwiML (point the SIP trunk disaster-recovery / number fallback URL here).
  app.post('/api/twilio/voice/:agentId/fallback', (req, res) => {
    if (rejectTwilio(req, res)) return;
    const agent = resolveTwilioAgent({ agentId: req.params.agentId, toNumber: req.body?.To });
    res.type('text/xml').send(capVoiceTwiml(agent, 'fallback'));
  });

  // Voicemail fallback (PAYG payment failed): recording finished → notify the owner, hang up.
  app.post('/api/twilio/voice/:agentId/voicemail-done', (req, res) => {
    if (rejectTwilio(req, res)) return;
    const agent = resolveTwilioAgent({ agentId: req.params.agentId, toNumber: req.body?.To });
    const url = String(req.body?.RecordingUrl || '').slice(0, 500);
    if (agent && url) {
      notifyOwner(agent, {
        subject: `New voicemail · ${agent.businessName}`,
        text: `From: ${String(req.body?.From || 'unknown').slice(0, 40)}\nRecording: ${url}\nDuration: ${Number(req.body?.RecordingDuration) || 0}s\n(AI receptionist paused: overage payment failed; update the card on file to restore.)`,
      }).catch(() => {});
    }
    res.type('text/xml').send(voicemailDoneTwiml());
  });

  app.post('/api/twilio/voice/:agentId/turn', async (req, res) => {
    if (rejectTwilio(req, res)) return;
    const agent = resolveTwilioAgent({
      agentId: req.params.agentId,
      toNumber: req.body?.To,
    });
    const actionUrl = voiceTurnUrl(req);
    const callSid = String(req.body?.CallSid || '');
    if (agent) {
      const check = callSid ? checkTwilioVoiceTurn(agent, callSid) : { ok: false, code: 'billing.call_id_missing' };
      if (!check.ok) {
        if (callSid) await endTwilioVoiceCall(agent, callSid).catch(() => {});
        return res.type('text/xml').send(capVoiceTwiml(agent, check.code));
      }
    }
    try {
      const xml = await handleInboundVoiceTurn({
        agent,
        speech: req.body?.SpeechResult,
        digits: req.body?.Digits,
        actionUrl,
      });
      // AI leg ends when the caller is handed to a human.
      if (agent && callSid && xml.includes('<Dial>')) await endTwilioVoiceCall(agent, callSid).catch(() => {});
      res.type('text/xml').send(xml);
    } catch (e) {
      console.error('[twilio voice]', e.message);
      res
        .type('text/xml')
        .send(
          '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, something went wrong. Please try again.</Say><Hangup/></Response>',
        );
    }
  });
}
