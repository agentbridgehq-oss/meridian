import { getLead } from '../engine.mjs';
import { getDeployment } from './deployment-core.mjs';
import { realtimeToolDefinitions } from './realtime-tool-gateway.mjs';
import { buildProductionVoiceAudioProfile, normalizeRealtimeVoice, normalizeRealtimeSpeed } from './realtime-voice-profile.mjs';

const DEFAULT_REALTIME_MODEL = 'gpt-realtime-2.1';

function clean(value, max = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function businessInstructions(deployment, lead) {
  const profile = deployment.config?.profile || {};
  const agent = deployment.config?.agent || {};
  const business = clean(profile.businessName || deployment.businessName, 160) || 'the business';
  const hours = clean(profile.hours) || 'Not supplied. Do not invent hours.';
  const services = clean(profile.services) || 'Not supplied. Do not invent services.';
  const rules = clean(profile.rules) || 'No special workflow rules supplied.';
  const transfer = clean(agent.humanTransfer, 100);
  const tone = clean(agent.tone, 80) || 'professional';
  const greeting = clean(agent.greeting, 500);
  const owner = clean(profile.approvalOwner, 300) || 'the approved business owner';
  return [
    `You are the Meridian voice agent for ${business}.`,
    `Speak in a ${tone}, concise, natural style. Use short sentences and leave room for interruption.`,
    greeting ? `Approved opening greeting: ${greeting}` : 'Use a brief natural greeting that identifies the business and offers help.',
    `Approved business hours: ${hours}`,
    `Approved services: ${services}`,
    `Business rules: ${rules}`,
    `Approval owner: ${owner}.`,
    transfer ? `Approved human transfer destination: ${transfer}.` : 'No human transfer destination is approved yet. Do not invent one.',
    'Never invent prices, availability, policies, credentials, guarantees, medical/legal advice, or unsupported business facts.',
    'If a requested fact is not in the approved business information, say you do not have that confirmed information and offer the approved next step.',
    'For emergencies or immediate danger, instruct the caller to contact the appropriate emergency service; do not impersonate emergency dispatch.',
    'Only use tools that are present in this session. If a booking, CRM, transfer, or messaging tool is absent, say that action is not currently available and offer an approved callback or information-capture path.',
    'Never claim an operational action succeeded until its tool result explicitly confirms success.',
    'If the caller interrupts, stop speaking and respond to the new request rather than continuing the prior answer.',
    'If the caller uses keypad input, treat DTMF events only as user input; never infer a payment credential or authentication secret from keypad presses.',
    lead?.managedRuntime?.agentId ? `Meridian control-plane runtime: ${lead.managedRuntime.agentId}.` : 'Meridian control-plane runtime is not provisioned yet.',
  ].join('\n');
}

export function buildOpenAIRealtimeConfig(deploymentId) {
  const deployment = typeof deploymentId === 'object' ? deploymentId : getDeployment(deploymentId);
  if (!deployment) return { ok: false, status: 404, error: 'Deployment not found' };
  if (!deployment.capabilities?.includes('voice')) return { ok: false, status: 409, error: 'OpenAI Realtime voice configuration is only generated for voice-capable deployments.' };
  const lead = getLead(deployment.projectId);
  const tools = realtimeToolDefinitions(deployment);
  const model = process.env.OPENAI_REALTIME_MODEL || DEFAULT_REALTIME_MODEL;
  const agent = deployment.config?.agent || {};
  const voice = normalizeRealtimeVoice(agent.voice || process.env.MERIDIAN_VOICE_DEFAULT_VOICE || 'marin');
  const speed = normalizeRealtimeSpeed(agent.voiceSpeed ?? process.env.MERIDIAN_VOICE_DEFAULT_SPEED ?? 1);
  const language = clean(agent.language, 8) || 'en';
  return {
    ok: true,
    configured: Boolean(process.env.OPENAI_API_KEY),
    requiredSecrets: ['OPENAI_API_KEY','OPENAI_WEBHOOK_SECRET'],
    deploymentId: deployment.id,
    projectId: deployment.projectId,
    model,
    voice,
    transport: {
      production: 'sip',
      browserDemo: 'webrtc',
      incomingWebhookEvent: 'realtime.call.incoming',
      acceptCall: {
        method: 'POST',
        pathTemplate: '/realtime/calls/{call_id}/accept',
        authentication: 'Bearer OPENAI_API_KEY',
      },
      sideband: {
        required: tools.length > 0,
        purpose: 'Keep business tool execution, CRM/calendar access, and private credentials on the Meridian server rather than in the caller media path.',
        controlPlaneAgentId: lead?.managedRuntime?.agentId || null,
        controlPlaneEndpoints: lead?.managedRuntime?.endpoints || null,
      },
    },
    acceptBody: {
      type: 'realtime',
      model,
      output_modalities: ['audio'],
      audio: buildProductionVoiceAudioProfile({ voice, speed, language }),
      instructions: businessInstructions(deployment, lead),
      tools,
      tool_choice: tools.length ? 'auto' : 'none',
      parallel_tool_calls: false,
      max_output_tokens: 1024,
      tracing: 'auto',
    },
    verification: {
      providerConfigured: deployment.integrations?.brain?.credentialConfigured === true,
      providerVerified: deployment.integrations?.brain?.status === 'verified',
      requiredChecks: [
        'Verified OpenAI webhook signature before accepting an incoming SIP call.',
        'Accept call returns success for an authorized test call.',
        'Realtime audio responds with approved business facts only.',
        'Caller interruption cancels the active spoken response cleanly.',
        'DTMF events are observable and never interpreted as sensitive credentials.',
        'Every advertised function tool is executed through Meridian sideband and returns an explicit success/failure result.',
        'Unsupported or unverified customer-system actions are not advertised as tools.',
        'A failed tool never produces a spoken claim that the action succeeded.',
        'Hangup, provider failure, idle recovery, and human/fallback path are observable in operations.',
      ],
    },
    safety: {
      secretValuesIncluded: false,
      failClosedTools: true,
      note: 'This object is configuration metadata. It does not call OpenAI and does not contain provider secret values.',
    },
  };
}

export { DEFAULT_REALTIME_MODEL };
