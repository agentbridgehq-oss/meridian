import express from 'express';
import { processVerifiedOpenAIRealtimeWebhook } from './openai-realtime-ingress.mjs';
import {
  acceptOpenAIRealtimeCall,
  hangupOpenAIRealtimeCall,
  rejectOpenAIRealtimeCall,
  verifyOpenAIWebhook,
} from './openai-provider-adapter.mjs';
import { connectOpenAIRealtimeSideband } from './openai-realtime-sideband.mjs';

function safeMessage(error) {
  const code = typeof error?.code === 'string' ? error.code : 'openai_webhook_verification_failed';
  if (code === 'openai_sdk_missing' || code === 'openai_api_key_missing' || code === 'openai_webhook_secret_missing') {
    return { status: 503, error: code };
  }
  return { status: 400, error: 'invalid_openai_webhook' };
}

export function registerOpenAIRealtimeWebhookRoute(app, options = {}) {
  const verifyWebhook = options.verifyWebhook || verifyOpenAIWebhook;
  const processWebhook = options.processWebhook || processVerifiedOpenAIRealtimeWebhook;
  const acceptCall = options.acceptCall || acceptOpenAIRealtimeCall;
  const rejectCall = options.rejectCall || rejectOpenAIRealtimeCall;
  const hangupCall = options.hangupCall || hangupOpenAIRealtimeCall;
  const attachSideband = options.attachSideband || connectOpenAIRealtimeSideband;
  const requireSideband = options.requireSideband !== false;
  const environment = options.environment || process.env.MERIDIAN_VOICE_ENVIRONMENT || 'staging';

  app.post(
    '/api/openai/webhooks/realtime',
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
        const safe = safeMessage(error);
        return res.status(safe.status).json({ ok: false, error: safe.error });
      }

      const result = await processWebhook(event, {
        environment,
        acceptCall,
        rejectCall,
        hangupCall,
        attachSideband,
        requireSideband,
      });

      if (!result?.ok) {
        return res.status(result?.status || 400).json({
          ok: false,
          error: result?.error || 'openai_realtime_webhook_failed',
          ...(result?.plan?.blockers ? { blockers: result.plan.blockers } : {}),
          ...(result?.accepted === true ? { accepted: true } : {}),
          ...(result?.rejected === true ? { rejected: true } : {}),
          ...(result?.sidebandAttached === false ? { sidebandAttached: false } : {}),
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
