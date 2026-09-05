import crypto from 'node:crypto';
import {
  createOpenAIRealtimeWebRTCCall,
  hangupOpenAIRealtimeCall,
  openAIProviderStatus,
} from './openai-provider-adapter.mjs';

const DEMO_WINDOW_MS = 10 * 60 * 1000;
const DEMO_SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_SDP_BYTES = 128 * 1024;

function clean(value, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function enabled() {
  return process.env.MERIDIAN_VOICE_DEMO_ENABLED === '1';
}

export function buildVoiceDemoSessionConfig() {
  return {
    type: 'realtime',
    model: process.env.MERIDIAN_VOICE_DEMO_MODEL || process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
    output_modalities: ['audio'],
    instructions: [
      'You are the Meridian voice demo, a concise and natural AI receptionist demonstration.',
      'This session is a demonstration only and is not connected to a real client business, calendar, CRM, phone transfer system, payment system, or messaging system.',
      'Never claim that you booked, transferred, messaged, charged, changed a record, checked live availability, or completed any real-world action.',
      'Do not ask for or accept passwords, authentication codes, payment-card data, bank details, government identification numbers, detailed medical information, or other highly sensitive information.',
      'If asked about an emergency, tell the caller to contact the appropriate local emergency service rather than relying on this demonstration.',
      'If asked what production Meridian can do, explain that production actions are available only after the client integrations are connected and verified.',
      'Keep responses brief enough for a live phone-style conversation.',
    ].join(' '),
    tools: [],
    tool_choice: 'none',
    parallel_tool_calls: false,
    max_output_tokens: 384,
    tracing: null,
  };
}

export function voiceDemoStatus() {
  const provider = openAIProviderStatus();
  return {
    enabled: enabled(),
    available: enabled() && provider.apiKeyConfigured,
    apiKeyConfigured: provider.apiKeyConfigured,
    model: buildVoiceDemoSessionConfig().model,
    mode: 'server-mediated-webrtc',
    toolsEnabled: false,
  };
}

function validSdp(value) {
  if (typeof value !== 'string') return false;
  if (Buffer.byteLength(value, 'utf8') > MAX_SDP_BYTES) return false;
  const sdp = value.trim();
  return sdp.startsWith('v=0') && sdp.includes('\nm=audio ');
}

function safeProviderError(error) {
  const code = clean(error?.code, 120);
  if (code === 'openai_api_key_missing' || code === 'openai_sdk_missing') {
    return { status: 503, error: code };
  }
  return { status: 502, error: 'voice_demo_provider_unavailable' };
}

export function registerVoiceDemoRoutes(app, {
  publicLimiter,
  createCall = createOpenAIRealtimeWebRTCCall,
  hangupCall = hangupOpenAIRealtimeCall,
  now = () => Date.now(),
} = {}) {
  const limiter = publicLimiter || ((_req, _res, next) => next());
  const startsByIp = new Map();
  const sessions = new Map();

  function prune() {
    const at = now();
    for (const [ip, starts] of startsByIp) {
      const recent = starts.filter(time => at - time < DEMO_WINDOW_MS);
      if (recent.length) startsByIp.set(ip, recent); else startsByIp.delete(ip);
    }
    for (const [id, session] of sessions) {
      if (session.expiresAt <= at) sessions.delete(id);
    }
  }

  function demoRateAllowed(req) {
    prune();
    const key = clean(req.ip || req.socket?.remoteAddress || 'unknown', 160) || 'unknown';
    const current = startsByIp.get(key) || [];
    const max = Math.max(1, Math.min(Number(process.env.MERIDIAN_VOICE_DEMO_MAX_STARTS_PER_10M || 3) || 3, 10));
    if (current.length >= max) return false;
    current.push(now());
    startsByIp.set(key, current);
    return true;
  }

  app.get('/api/voice-demo/status', limiter, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, demo: voiceDemoStatus() });
  });

  app.post('/api/voice-demo/session', limiter, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    if (!enabled()) return res.status(503).json({ ok: false, error: 'voice_demo_disabled' });
    if (req.body?.consent !== true)
      return res.status(400).json({ ok: false, error: 'voice_demo_consent_required' });
    if (!validSdp(req.body?.sdp))
      return res.status(400).json({ ok: false, error: 'invalid_webrtc_sdp' });
    if (!demoRateAllowed(req))
      return res.status(429).json({ ok: false, error: 'voice_demo_rate_limited' });

    try {
      const result = await createCall({
        sdp: req.body.sdp,
        session: buildVoiceDemoSessionConfig(),
      });
      if (!result?.ok || !validSdp(result.answerSdp))
        return res.status(502).json({ ok: false, error: 'voice_demo_invalid_provider_answer' });

      let sessionId = '';
      if (/^rtc_[A-Za-z0-9_-]+$/.test(result.callId || '')) {
        sessionId = crypto.randomBytes(18).toString('hex');
        sessions.set(sessionId, {
          callId: result.callId,
          createdAt: now(),
          expiresAt: now() + DEMO_SESSION_TTL_MS,
        });
      }

      return res.status(201).json({
        ok: true,
        sdp: result.answerSdp,
        ...(sessionId ? { sessionId } : {}),
      });
    } catch (error) {
      const safe = safeProviderError(error);
      return res.status(safe.status).json({ ok: false, error: safe.error });
    }
  });

  app.post('/api/voice-demo/session/:sessionId/end', limiter, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    prune();
    const id = clean(req.params.sessionId, 80);
    if (!/^[a-f0-9]{36}$/.test(id)) return res.status(404).json({ ok: false, error: 'voice_demo_session_not_found' });
    const session = sessions.get(id);
    if (!session) return res.status(404).json({ ok: false, error: 'voice_demo_session_not_found' });
    sessions.delete(id);
    try {
      await hangupCall({ callId: session.callId });
      return res.json({ ok: true, ended: true });
    } catch {
      return res.status(502).json({ ok: false, error: 'voice_demo_hangup_failed' });
    }
  });
}
