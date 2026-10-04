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
  webhookUrls,
} from './twilio-channel.mjs';

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
      });
      res.type('text/xml').send(xml);
    } catch (e) {
      console.error('[twilio sms]', e.message);
      res
        .type('text/xml')
        .send(
          '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks — we got your text and will follow up.</Message></Response>',
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
      });
      res.type('text/xml').send(xml);
    } catch (e) {
      console.error('[twilio sms map]', e.message);
      res
        .type('text/xml')
        .send(
          '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks — we got your text.</Message></Response>',
        );
    }
  });

  app.post('/api/twilio/voice/:agentId', (req, res) => {
    if (rejectTwilio(req, res)) return;
    const agent = resolveTwilioAgent({
      agentId: req.params.agentId,
      toNumber: req.body?.To,
    });
    const actionUrl = voiceTurnUrl(req);
    res.type('text/xml').send(inboundVoiceGatherTwiml(agent, { actionUrl }));
  });

  app.post('/api/twilio/voice/:agentId/turn', async (req, res) => {
    if (rejectTwilio(req, res)) return;
    const agent = resolveTwilioAgent({
      agentId: req.params.agentId,
      toNumber: req.body?.To,
    });
    const actionUrl = voiceTurnUrl(req);
    try {
      const xml = await handleInboundVoiceTurn({
        agent,
        speech: req.body?.SpeechResult,
        digits: req.body?.Digits,
        actionUrl,
      });
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
