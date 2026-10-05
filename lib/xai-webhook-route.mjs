/**
 * POST /api/xai/webhooks/realtime — xAI Grok Voice SIP `realtime.call.incoming`.
 * Same ingress as OpenAI (routing, readiness, billing gate/caps, sideband,
 * call-limit, ledger) with the xAI adapter plugged in.
 * Configure this URL as the webhook when registering the number with
 * POST https://api.x.ai/v2/phone-numbers (origin: "byo_trunk").
 */
import { registerRealtimeWebhookRoute } from './openai-webhook-route.mjs';
import {
  acceptXaiRealtimeCall,
  connectXaiRealtimeSideband,
  hangupXaiRealtimeCall,
  referXaiRealtimeCall,
  rejectXaiRealtimeCall,
  verifyXaiWebhook,
} from './xai-realtime-adapter.mjs';

export const XAI_WEBHOOK_PATH = '/api/xai/webhooks/realtime';

export function registerXaiRealtimeWebhookRoute(app, options = {}) {
  return registerRealtimeWebhookRoute(app, {
    verifyWebhook: verifyXaiWebhook,
    acceptCall: acceptXaiRealtimeCall,
    rejectCall: rejectXaiRealtimeCall,
    hangupCall: hangupXaiRealtimeCall,
    referCall: referXaiRealtimeCall,
    attachSideband: connectXaiRealtimeSideband,
    ...options,
    provider: 'xai',
    path: XAI_WEBHOOK_PATH,
  });
}
