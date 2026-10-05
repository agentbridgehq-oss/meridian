/**
 * xAI Grok Voice (Speech-to-Speech) session config for a Meridian deployment.
 *
 * Docs (retrieved 2026-10-04):
 *   https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech
 *   https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech/sip
 *
 * Same business instructions + Meridian tool definitions as the OpenAI path
 * (shared builder), so behaviour and fail-closed tool rules are identical.
 * Pure metadata — never calls xAI and never contains secret values.
 */
import { getLead } from '../engine.mjs';
import { getDeployment } from './deployment-core.mjs';
import { realtimeToolDefinitions } from './realtime-tool-gateway.mjs';
import { buildRealtimeInstructions } from './openai-realtime-config.mjs';
import { resolveAgentRole } from './expertise.mjs';

/** Pinned per xAI guidance ("pin a version in production"); grok-voice-latest aliases this today. */
export const XAI_DEFAULT_VOICE_MODEL = 'grok-voice-think-fast-2.0';
export const XAI_DEFAULT_VOICE = 'eve';
export const XAI_REALTIME_URL = (process.env.XAI_REALTIME_URL || 'wss://api.x.ai/v1/realtime').replace(/\/$/, '');

export function xaiVoiceModel() {
  return String(process.env.XAI_VOICE_MODEL || XAI_DEFAULT_VOICE_MODEL).trim();
}

function cleanVoice(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[a-z][a-z0-9_-]{1,39}$/.test(v) ? v : '';
}

/** OpenAI voice names (marin/cedar/…) are not xAI voices — only an explicit xAI voice is honoured. */
export function xaiVoiceFor(agent = {}) {
  return cleanVoice(agent.xaiVoice) || cleanVoice(process.env.XAI_VOICE_DEFAULT) || XAI_DEFAULT_VOICE;
}

export function buildXaiRealtimeSession(deployment, lead = getLead(deployment.projectId)) {
  const agent = deployment.config?.agent || {};
  const tools = realtimeToolDefinitions(deployment);
  const session = {
    voice: xaiVoiceFor(agent),
    instructions: buildRealtimeInstructions(deployment, lead),
    turn_detection: { type: 'server_vad' },
    tools,
  };
  const effort = String(process.env.XAI_VOICE_REASONING_EFFORT || '').trim().toLowerCase();
  if (['none', 'low', 'medium', 'high'].includes(effort)) session.reasoning = { effort };
  return session;
}

export function buildXaiRealtimeConfig(deploymentId) {
  const deployment = typeof deploymentId === 'object' ? deploymentId : getDeployment(deploymentId);
  if (!deployment) return { ok: false, status: 404, error: 'Deployment not found' };
  if (!deployment.capabilities?.includes('voice')) return { ok: false, status: 409, error: 'xAI realtime voice configuration is only generated for voice-capable deployments.' };
  const lead = getLead(deployment.projectId);
  const session = buildXaiRealtimeSession(deployment, lead);
  const role = resolveAgentRole(deployment.config?.agent?.primaryNeed || deployment.config?.profile?.primaryNeed, deployment.capabilities);
  return {
    ok: true,
    provider: 'xai',
    configured: Boolean(process.env.XAI_API_KEY?.trim()),
    requiredSecrets: ['XAI_API_KEY', 'XAI_WEBHOOK_SECRET'],
    deploymentId: deployment.id,
    projectId: deployment.projectId,
    model: xaiVoiceModel(),
    voice: session.voice,
    role,
    transport: {
      production: 'sip',
      sipUri: 'sip:{number}@sip.voice.x.ai;transport=tls',
      incomingWebhookEvent: 'realtime.call.incoming',
      joinCall: { url: `${XAI_REALTIME_URL}?call_id={call_id}`, authentication: 'Bearer XAI_API_KEY', then: ['session.update', 'response.create'] },
      refer: 'POST /v1/realtime/calls/{call_id}/refer',
      hangup: 'POST /v1/realtime/calls/{call_id}/hangup',
      audio: 'G.711 μ-law/A-law handled by xAI SIP bridge (no Twilio Media Streams needed).',
    },
    acceptBody: { model: xaiVoiceModel(), session },
    safety: {
      secretValuesIncluded: false,
      failClosedTools: true,
      note: 'Configuration metadata only. Does not call xAI and contains no secret values.',
    },
  };
}
