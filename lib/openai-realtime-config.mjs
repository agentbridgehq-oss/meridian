import { getLead } from '../engine.mjs';
import { getDeployment } from './deployment-core.mjs';

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
    'Use tools for operational actions. Do not claim an appointment, transfer, lead update, or follow-up happened unless the corresponding tool succeeds.',
    lead?.managedRuntime?.agentId ? `Meridian control-plane runtime: ${lead.managedRuntime.agentId}.` : 'Meridian control-plane runtime is not provisioned yet.',
  ].join('\n');
}

function functionTools(deployment) {
  const tools = [];
  if (deployment.capabilities?.includes('voice')) {
    tools.push({
      type: 'function',
      name: 'meridian_record_call_outcome',
      description: 'Record the caller intent and next-step outcome in Meridian after enough information is known. Sideband execution is required.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          caller_name: { type: 'string', description: 'Caller name if provided.' },
          callback_number: { type: 'string', description: 'Callback number if provided or confirmed.' },
          intent: { type: 'string', description: 'Short normalized caller intent.' },
          summary: { type: 'string', description: 'Concise factual summary of the call.' },
          urgency: { type: 'string', enum: ['normal','urgent','emergency'] },
          consent_to_follow_up: { type: 'boolean', description: 'Whether the caller explicitly agreed to follow-up.' },
        },
        required: ['intent','summary','urgency','consent_to_follow_up'],
      },
    });
    tools.push({
      type: 'function',
      name: 'meridian_request_human_handoff',
      description: 'Request a handoff or callback through the Meridian control plane. Never claim transfer success until the tool result confirms it.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reason: { type: 'string' },
          urgency: { type: 'string', enum: ['normal','urgent'] },
          callback_number: { type: 'string' },
        },
        required: ['reason','urgency'],
      },
    });
  }
  if (deployment.capabilities?.includes('booking')) {
    tools.push({
      type: 'function',
      name: 'meridian_request_booking',
      description: 'Ask Meridian to check or create a booking through the verified calendar integration. Do not claim a booking exists until the tool confirms it.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          service: { type: 'string' },
          requested_time: { type: 'string', description: 'Caller-provided time or date wording; Meridian resolves it against the configured timezone.' },
          contact_name: { type: 'string' },
          contact_phone: { type: 'string' },
        },
        required: ['service','requested_time'],
      },
    });
  }
  if (deployment.capabilities?.includes('sales')) {
    tools.push({
      type: 'function',
      name: 'meridian_capture_sales_lead',
      description: 'Capture a consent-aware sales lead through Meridian. Use only for inbound or explicitly consented follow-up.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          need: { type: 'string' },
          consent: { type: 'boolean' },
        },
        required: ['need','consent'],
      },
    });
  }
  return tools;
}

export function buildOpenAIRealtimeConfig(deploymentId) {
  const deployment = typeof deploymentId === 'object' ? deploymentId : getDeployment(deploymentId);
  if (!deployment) return { ok: false, status: 404, error: 'Deployment not found' };
  if (!deployment.capabilities?.includes('voice')) return { ok: false, status: 409, error: 'OpenAI Realtime voice configuration is only generated for voice-capable deployments.' };
  const lead = getLead(deployment.projectId);
  const tools = functionTools(deployment);
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
        'Every function tool is executed through Meridian sideband and returns an explicit success/failure result.',
        'A failed tool never produces a spoken claim that the action succeeded.',
        'Hangup, provider failure, and human/fallback path are observable in operations.',
      ],
    },
    safety: {
      secretValuesIncluded: false,
      note: 'This object is configuration metadata. It does not call OpenAI and does not contain provider secret values.',
    },
  };
}

export { DEFAULT_REALTIME_MODEL };
