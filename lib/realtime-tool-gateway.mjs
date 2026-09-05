import { getAgent, getLead } from '../engine.mjs';
import { getDeployment } from './deployment-core.mjs';
import { logInteraction } from './interactions.mjs';

function clean(value, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function runtimeFor(deployment) {
  const lead = getLead(deployment.projectId);
  const agentId = lead?.managedRuntime?.agentId;
  const agent = agentId ? getAgent(agentId) : null;
  return { lead, agentId, agent };
}

function integrationVerified(deployment, kind) {
  return deployment.integrations?.[kind]?.status === 'verified';
}

export function realtimeToolDefinitions(deployment) {
  if (!deployment?.capabilities?.includes('voice')) return [];
  const tools = [{
    type: 'function',
    name: 'meridian_record_call_outcome',
    description: 'Record a factual call outcome in Meridian after enough information is known. This does not book, transfer, or message anyone.',
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
  }];

  const transfer = clean(deployment.config?.agent?.humanTransfer, 100);
  if (transfer && integrationVerified(deployment, 'destination')) {
    tools.push({
      type: 'function',
      name: 'meridian_request_human_handoff',
      description: 'Request a human handoff. The result only authorizes a refer action; the caller must not be told the transfer succeeded until the provider confirms it.',
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

  // Booking and CRM tools are deliberately not advertised yet. A provider can
  // be marked verified only after its adapter exists and passes acceptance QA;
  // until then Realtime must fail closed rather than simulate success.
  return tools;
}

export function executeRealtimeTool({ deploymentId, name, arguments: args = {} } = {}) {
  const deployment = getDeployment(deploymentId);
  if (!deployment) return { ok: false, code: 'deployment_not_found', message: 'Deployment not found.' };
  if (deployment.status === 'paused') return { ok: false, code: 'deployment_paused', message: 'Deployment is paused.' };
  const { agentId, agent } = runtimeFor(deployment);
  if (!agentId || !agent || agent.status !== 'active')
    return { ok: false, code: 'runtime_unavailable', message: 'Managed runtime is not active.' };

  const allowed = new Set(realtimeToolDefinitions(deployment).map(tool => tool.name));
  if (!allowed.has(name)) return { ok: false, code: 'tool_not_available', message: 'This tool is not enabled for the current verified deployment.' };

  if (name === 'meridian_record_call_outcome') {
    const intent = clean(args.intent, 300);
    const summary = clean(args.summary, 1500);
    const urgency = ['normal','urgent','emergency'].includes(args.urgency) ? args.urgency : 'normal';
    if (!intent || !summary) return { ok: false, code: 'invalid_arguments', message: 'Intent and summary are required.' };
    const interaction = logInteraction({
      agentId,
      businessName: deployment.businessName,
      channel: 'voice',
      role: 'call_outcome',
      message: summary,
      reply: 'Outcome recorded by Realtime sideband.',
      brainSource: 'openai-realtime-sideband',
      intent: {
        label: intent,
        priority: urgency,
        emergency: urgency === 'emergency',
        transferSuggested: false,
      },
      meta: {
        callerName: clean(args.caller_name, 200),
        callbackNumber: clean(args.callback_number, 100),
        consentToFollowUp: args.consent_to_follow_up === true,
        deploymentId: deployment.id,
      },
      ok: true,
    });
    return { ok: true, action: 'recorded', interactionId: interaction.id };
  }

  if (name === 'meridian_request_human_handoff') {
    const destination = clean(deployment.config?.agent?.humanTransfer, 100);
    if (!destination || !integrationVerified(deployment, 'destination'))
      return { ok: false, code: 'handoff_unverified', message: 'Human handoff is not currently verified.' };
    const reason = clean(args.reason, 1000);
    if (!reason) return { ok: false, code: 'invalid_arguments', message: 'Handoff reason is required.' };
    const interaction = logInteraction({
      agentId,
      businessName: deployment.businessName,
      channel: 'voice',
      role: 'handoff_request',
      message: reason,
      reply: 'Handoff authorization created; provider refer still required.',
      brainSource: 'openai-realtime-sideband',
      intent: { transferSuggested: true, priority: args.urgency === 'urgent' ? 'urgent' : 'normal' },
      meta: { callbackNumber: clean(args.callback_number, 100), deploymentId: deployment.id },
      ok: true,
    });
    return {
      ok: true,
      action: 'provider_refer_required',
      destination,
      interactionId: interaction.id,
      instruction: 'The sideband adapter must execute the provider refer operation and return its result before the agent says the transfer succeeded.',
    };
  }

  return { ok: false, code: 'tool_not_implemented', message: 'Tool is not implemented.' };
}
