import { getLead } from '../engine.mjs';
import { getDeployment } from './deployment-core.mjs';
import { realtimeToolDefinitions } from './realtime-tool-gateway.mjs';

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
  const owner = clean(profile.approvalOwner, 300) || 'the approved business owner';
  return [
    `You are the Meridian voice agent for ${business}.`,
    `Speak in a ${tone}, concise, natural style.`,
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
  return {
    ok: true,
    configured: Boolean(process.env.OPENAI_API_KEY),
    requiredSecrets: ['OPENAI_API_KEY','OPENAI_WEBHOOK_SECRET'],
    deploymentId: deployment.id,
    projectId: deployment.projectId,
    model,
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
        'Every advertised function tool is executed through Meridian sideband and returns an explicit success/failure result.',
        'Unsupported or unverified customer-system actions are not advertised as tools.',
        'A failed tool never produces a spoken claim that the action succeeded.',
        'Hangup, provider failure, and human/fallback path are observable in operations.',
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
