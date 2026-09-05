import { getAgent, getLead } from '../engine.mjs';
import { getDeployment } from './deployment-core.mjs';
import { logInteraction } from './interactions.mjs';
import { businessAdapterStatus, executeBusinessSystemAction } from './business-system-adapter.mjs';

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

function adapterReady(deployment, kind) {
  return businessAdapterStatus(deployment, kind).ready === true;
}

function recordToolInteraction({ deployment, agentId, role, message, reply, meta = {}, ok = true }) {
  try {
    return logInteraction({
      agentId,
      businessName: deployment.businessName,
      channel: 'voice',
      role,
      message,
      reply,
      brainSource: 'openai-realtime-sideband',
      intent: { label: role, priority: 'normal', emergency: false, transferSuggested: false },
      meta: { deploymentId: deployment.id, ...meta },
      ok,
    });
  } catch { return null; }
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
        type: 'object', additionalProperties: false,
        properties: {
          reason: { type: 'string' }, urgency: { type: 'string', enum: ['normal','urgent'] }, callback_number: { type: 'string' },
        },
        required: ['reason','urgency'],
      },
    });
  }

  if (deployment.capabilities?.includes('sales') && adapterReady(deployment, 'crm')) {
    tools.push({
      type: 'function',
      name: 'meridian_upsert_lead',
      description: 'Create or update a lead in the verified customer CRM. Only report success when the customer system explicitly confirms the write.',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' },
          intent: { type: 'string' }, summary: { type: 'string' },
          consent_to_follow_up: { type: 'boolean' },
        },
        required: ['intent','summary','consent_to_follow_up'],
      },
    });
  }

  if (deployment.capabilities?.includes('booking') && adapterReady(deployment, 'calendar')) {
    tools.push({
      type: 'function',
      name: 'meridian_check_availability',
      description: 'Check real availability through the verified customer calendar adapter. Never invent slots.',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: {
          service: { type: 'string' }, preferred_date: { type: 'string' }, timezone: { type: 'string' }, duration_minutes: { type: 'integer' },
        },
        required: ['service','preferred_date','timezone'],
      },
    });
    tools.push({
      type: 'function',
      name: 'meridian_book_appointment',
      description: 'Create an appointment through the verified customer calendar adapter after the caller confirms the exact slot. Only report success when the customer system explicitly confirms the booking.',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: {
          caller_name: { type: 'string' }, callback_number: { type: 'string' }, email: { type: 'string' }, service: { type: 'string' },
          start_time: { type: 'string' }, end_time: { type: 'string' }, timezone: { type: 'string' }, notes: { type: 'string' },
          caller_confirmed_slot: { type: 'boolean' }, consent_to_confirmation: { type: 'boolean' },
        },
        required: ['caller_name','service','start_time','timezone','caller_confirmed_slot','consent_to_confirmation'],
      },
    });
  }

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
    const intent = clean(args.intent, 300), summary = clean(args.summary, 1500);
    const urgency = ['normal','urgent','emergency'].includes(args.urgency) ? args.urgency : 'normal';
    if (!intent || !summary) return { ok: false, code: 'invalid_arguments', message: 'Intent and summary are required.' };
    const interaction = logInteraction({
      agentId, businessName: deployment.businessName, channel: 'voice', role: 'call_outcome', message: summary,
      reply: 'Outcome recorded by Realtime sideband.', brainSource: 'openai-realtime-sideband',
      intent: { label: intent, priority: urgency, emergency: urgency === 'emergency', transferSuggested: false },
      meta: { callerName: clean(args.caller_name, 200), callbackNumber: clean(args.callback_number, 100), consentToFollowUp: args.consent_to_follow_up === true, deploymentId: deployment.id },
      ok: true,
    });
    return { ok: true, action: 'recorded', interactionId: interaction.id };
  }

  if (name === 'meridian_request_human_handoff') {
    const destination = clean(deployment.config?.agent?.humanTransfer, 100);
    if (!destination || !integrationVerified(deployment, 'destination')) return { ok: false, code: 'handoff_unverified', message: 'Human handoff is not currently verified.' };
    const reason = clean(args.reason, 1000);
    if (!reason) return { ok: false, code: 'invalid_arguments', message: 'Handoff reason is required.' };
    const interaction = logInteraction({
      agentId, businessName: deployment.businessName, channel: 'voice', role: 'handoff_request', message: reason,
      reply: 'Handoff authorization created; provider refer still required.', brainSource: 'openai-realtime-sideband',
      intent: { transferSuggested: true, priority: args.urgency === 'urgent' ? 'urgent' : 'normal' },
      meta: { callbackNumber: clean(args.callback_number, 100), deploymentId: deployment.id }, ok: true,
    });
    return { ok: true, action: 'provider_refer_required', destination, interactionId: interaction.id, instruction: 'The sideband adapter must execute the provider refer operation and return its result before the agent says the transfer succeeded.' };
  }

  if (name === 'meridian_upsert_lead') {
    if (!adapterReady(deployment, 'crm')) return { ok: false, code: 'crm_adapter_unavailable', message: 'CRM adapter is not ready.' };
    const intent = clean(args.intent, 300), summary = clean(args.summary, 1500);
    if (!intent || !summary) return { ok: false, code: 'invalid_arguments', message: 'Intent and summary are required.' };
    return executeBusinessSystemAction({ deployment, kind: 'crm', action: 'upsert_lead', data: {
      name: clean(args.name, 200), phone: clean(args.phone, 100), email: clean(args.email, 254), intent, summary,
      consentToFollowUp: args.consent_to_follow_up === true,
    }}).then(result => {
      const interaction = recordToolInteraction({ deployment, agentId, role: 'crm_upsert', message: summary,
        reply: result.ok ? 'Customer CRM confirmed the lead write.' : result.message,
        meta: { recordId: result.recordId || '', actionConfirmed: result.confirmed === true }, ok: result.ok });
      return { ...result, action: result.ok ? 'crm_upsert_confirmed' : undefined, interactionId: interaction?.id };
    });
  }

  if (name === 'meridian_check_availability') {
    if (!adapterReady(deployment, 'calendar')) return { ok: false, code: 'calendar_adapter_unavailable', message: 'Calendar adapter is not ready.' };
    const service = clean(args.service, 300), preferredDate = clean(args.preferred_date, 120), timezone = clean(args.timezone, 120);
    if (!service || !preferredDate || !timezone) return { ok: false, code: 'invalid_arguments', message: 'Service, preferred date and timezone are required.' };
    return executeBusinessSystemAction({ deployment, kind: 'calendar', action: 'check_availability', data: {
      service, preferredDate, timezone, durationMinutes: Math.max(0, Math.min(Number(args.duration_minutes) || 0, 480)),
    }}).then(result => ({ ...result, action: result.ok ? 'availability_confirmed' : undefined }));
  }

  if (name === 'meridian_book_appointment') {
    if (!adapterReady(deployment, 'calendar')) return { ok: false, code: 'calendar_adapter_unavailable', message: 'Calendar adapter is not ready.' };
    if (args.caller_confirmed_slot !== true) return { ok: false, code: 'slot_not_confirmed', message: 'Caller must confirm the exact slot before booking.' };
    const callerName = clean(args.caller_name, 200), service = clean(args.service, 300), startTime = clean(args.start_time, 120), timezone = clean(args.timezone, 120);
    if (!callerName || !service || !startTime || !timezone) return { ok: false, code: 'invalid_arguments', message: 'Caller name, service, start time and timezone are required.' };
    return executeBusinessSystemAction({ deployment, kind: 'calendar', action: 'book_appointment', data: {
      callerName, callbackNumber: clean(args.callback_number, 100), email: clean(args.email, 254), service,
      startTime, endTime: clean(args.end_time, 120), timezone, notes: clean(args.notes, 1000),
      callerConfirmedSlot: true, consentToConfirmation: args.consent_to_confirmation === true,
    }}).then(result => {
      const interaction = recordToolInteraction({ deployment, agentId, role: 'booking', message: `${service} at ${startTime}`,
        reply: result.ok ? 'Customer calendar confirmed the appointment.' : result.message,
        meta: { bookingId: result.bookingId || '', start: result.start || startTime, actionConfirmed: result.confirmed === true }, ok: result.ok });
      return { ...result, action: result.ok ? 'booking_confirmed' : undefined, interactionId: interaction?.id };
    });
  }

  return { ok: false, code: 'tool_not_implemented', message: 'Tool is not implemented.' };
}
