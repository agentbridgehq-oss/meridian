import express from 'express';
import { processVerifiedOpenAIRealtimeWebhook } from './openai-realtime-ingress.mjs';
import {
  acceptOpenAIRealtimeCall,
  hangupOpenAIRealtimeCall,
  referOpenAIRealtimeCall,
  rejectOpenAIRealtimeCall,
  verifyOpenAIWebhook,
} from './openai-provider-adapter.mjs';
import { connectOpenAIRealtimeSideband } from './openai-realtime-sideband.mjs';

const CONFIG_ERRORS = new Set([
  'openai_sdk_missing', 'openai_api_key_missing', 'openai_webhook_secret_missing',
  'xai_api_key_missing', 'xai_webhook_secret_missing',
]);

function safeMessage(error, provider = 'openai') {
  const code = typeof error?.code === 'string' ? error.code : `${provider}_webhook_verification_failed`;
  if (CONFIG_ERRORS.has(code)) return { status: 503, error: code };
  return { status: 400, error: `invalid_${provider}_webhook` };
}

/**
 * Provider-neutral realtime SIP webhook route. Raw body is required for the
 * signature check, so this MUST be registered before express.json().
 */
export function registerRealtimeWebhookRoute(app, options = {}) {
  const provider = options.provider || 'openai';
  const path = options.path || '/api/openai/webhooks/realtime';
  const verifyWebhook = options.verifyWebhook || verifyOpenAIWebhook;
  const processWebhook = options.processWebhook || processVerifiedOpenAIRealtimeWebhook;
  const acceptCall = options.acceptCall || acceptOpenAIRealtimeCall;
  const rejectCall = options.rejectCall || rejectOpenAIRealtimeCall;
  const hangupCall = options.hangupCall || hangupOpenAIRealtimeCall;
  const referCall = options.referCall || referOpenAIRealtimeCall;
  const attachSideband = options.attachSideband || connectOpenAIRealtimeSideband;
  const requireSideband = options.requireSideband !== false;
  const environment = options.environment || process.env.MERIDIAN_VOICE_ENVIRONMENT || 'staging';

  app.post(
    path,
    express.raw({ type: 'application/json', limit: '256kb' }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      if (!Buffer.isBuffer(req.body)) {
        return res.status(400).json({ ok: false, error: 'raw_webhook_body_required' });
      }

      const rawBody = req.body.toString('utf8');
      let event;
      try {
        event = await verifyWebhook(rawBody, req.headers);
      } catch (error) {
        const safe = safeMessage(error, provider);
        return res.status(safe.status).json({ ok: false, error: safe.error });
      }

      const result = await processWebhook(event, {
        provider,
        environment,
        acceptCall,
        rejectCall,
        hangupCall,
        referCall,
        attachSideband,
        requireSideband,
      });

      if (!result?.ok) {
        return res.status(result?.status || 400).json({
          ok: false,
          error: result?.error || `${provider}_realtime_webhook_failed`,
          ...(result?.plan?.blockers ? { blockers: result.plan.blockers } : {}),
          ...(result?.accepted === true ? { accepted: true } : {}),
          ...(result?.rejected === true ? { rejected: true } : {}),
          ...(result?.sidebandAttached === false ? { sidebandAttached: false } : {}),
        ...(result?.billing?.code ? { billing: result.billing.code } : {}),
        });
      }

      return res.status(200).json({
        ok: true,
        handled: result.handled === true,
        accepted: result.accepted === true,
        rejected: result.rejected === true,
        sidebandAttached: result.sidebandAttached === true,
        ...(result.callId ? { callId: result.callId } : {}),
        ...(result.deploymentId ? { deploymentId: result.deploymentId } : {}),
      });
    },
  );
}

export function registerOpenAIRealtimeWebhookRoute(app, options = {}) {
  return registerRealtimeWebhookRoute(app, { ...options, provider: 'openai', path: '/api/openai/webhooks/realtime' });
}
