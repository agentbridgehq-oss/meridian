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
    const token = process.env.TWILIO_WEBHOOK_TOKEN || req.query?.token || '';
    const q = token ? `?token=${encodeURIComponent(token)}` : '';
    const actionUrl = `${publicBase()}/api/twilio/voice/${req.params.agentId}/turn${q}`;
    res.type('text/xml').send(inboundVoiceGatherTwiml(agent, { actionUrl }));
  });

  app.post('/api/twilio/voice/:agentId/turn', async (req, res) => {
    if (rejectTwilio(req, res)) return;
    const agent = resolveTwilioAgent({
      agentId: req.params.agentId,
      toNumber: req.body?.To,
    });
    const token = process.env.TWILIO_WEBHOOK_TOKEN || req.query?.token || '';
    const q = token ? `?token=${encodeURIComponent(token)}` : '';
    const actionUrl = `${publicBase()}/api/twilio/voice/${req.params.agentId}/turn${q}`;
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
