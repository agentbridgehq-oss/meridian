import { getAgent, getLead } from '../engine.mjs';
import { getDeployment } from './deployment-core.mjs';
import { resolveInboundRouteFromSipHeaders } from './inbound-routing.mjs';
import { buildOpenAIRealtimeConfig } from './openai-realtime-config.mjs';
import {
  recordRealtimeCallIncoming,
  updateRealtimeCall,
} from './realtime-call-ledger.mjs';

function clean(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function runtimeStatus(deployment) {
  const lead = getLead(deployment.projectId);
  const agentId = lead?.managedRuntime?.agentId || '';
  const agent = agentId ? getAgent(agentId) : null;
  return {
    lead,
    agentId,
    active: Boolean(agentId && agent?.status === 'active'),
  };
}

function integrationBlockers(deployment, environment) {
  const blockers = [];
  const brain = deployment.integrations?.brain;
  const telephony = deployment.integrations?.telephony;

  if (!brain || brain.provider !== 'openai') blockers.push('integration.brain.provider.openai');
  if (!brain?.credentialConfigured) blockers.push('integration.brain.credentialConfigured');
  if (!telephony || telephony.provider !== 'twilio-sip') blockers.push('integration.telephony.provider.twilio-sip');
  if (!telephony?.credentialConfigured) blockers.push('integration.telephony.credentialConfigured');

  if (environment === 'production') {
    if (brain?.status !== 'verified') blockers.push('integration.brain.verified');
    if (telephony?.status !== 'verified') blockers.push('integration.telephony.verified');
  }
  return blockers;
}

export function planOpenAIRealtimeIncoming(event, options = {}) {
  const environment = clean(options.environment, 40) || 'staging';
  const openAIConfigured = options.openAIConfigured ?? Boolean(process.env.OPENAI_API_KEY);
  if (!['staging', 'production'].includes(environment))
    return { ok: false, status: 400, error: 'environment must be staging or production.' };
  if (!event || event.type !== 'realtime.call.incoming')
    return { ok: false, status: 400, error: 'Expected realtime.call.incoming event.' };

  const callId = clean(event.data?.call_id, 200);
  if (!/^rtc_[A-Za-z0-9_-]+$/.test(callId))
    return { ok: false, status: 400, error: 'Incoming event is missing a valid Realtime call_id.' };

  const routing = resolveInboundRouteFromSipHeaders(event.data?.sip_headers, { environment });
  if (!routing.ok) return { ...routing, callId };

  const deployment = getDeployment(routing.route.deploymentId);
  if (!deployment) return { ok: false, status: 404, error: 'Inbound route points to a missing deployment.', callId, route: routing.route };

  const blockers = [];
  if (!deployment.capabilities?.includes('voice')) blockers.push('deployment.voice_capability');
  if (['paused', 'failed'].includes(deployment.status)) blockers.push(`deployment.status.${deployment.status}`);
  if (environment === 'production' && deployment.status !== 'live') blockers.push('deployment.status.live');
  blockers.push(...integrationBlockers(deployment, environment));

  const runtime = runtimeStatus(deployment);
  if (!runtime.active) blockers.push('managed_runtime.active');
  if (!openAIConfigured) blockers.push('runtime_environment.OPENAI_API_KEY');

  const realtime = buildOpenAIRealtimeConfig(deployment);
  if (!realtime.ok) blockers.push('openai_realtime.config');

  return {
    ok: true,
    canAccept: blockers.length === 0,
    blockers: [...new Set(blockers)],
    environment,
    callId,
    dialedNumber: routing.dialed.number,
    route: routing.route,
    deployment: {
      id: deployment.id,
      projectId: deployment.projectId,
      businessName: deployment.businessName,
      status: deployment.status,
      revision: deployment.revision,
    },
    runtime: { agentId: runtime.agentId, active: runtime.active },
    acceptBody: realtime.ok ? realtime.acceptBody : null,
  };
}

function ledger(options = {}) {
  return {
    recordIncoming: options.recordIncoming || recordRealtimeCallIncoming,
    updateCall: options.updateCall || updateRealtimeCall,
  };
}

async function bestEffortHangup(options, plan) {
  if (typeof options.hangupCall !== 'function') return false;
  try {
    await options.hangupCall({ callId: plan.callId, deploymentId: plan.deployment.id });
    return true;
  } catch {
    return false;
  }
}

export async function processVerifiedOpenAIRealtimeWebhook(event, options = {}) {
  if (!event || event.type !== 'realtime.call.incoming') {
    return { ok: true, handled: false, type: clean(event?.type, 120) || 'unknown' };
  }

  const plan = planOpenAIRealtimeIncoming(event, options);
  if (!plan.ok) return { ...plan, handled: true, accepted: false };

  const audit = ledger(options);
  const incoming = audit.recordIncoming({
    callId: plan.callId,
    deploymentId: plan.deployment.id,
    routeId: plan.route.id,
    dialedNumber: plan.dialedNumber,
    environment: plan.environment,
    provider: 'openai-realtime',
  });
  if (!incoming?.ok) {
    return {
      ok: false,
      status: 500,
      error: 'Realtime call audit record could not be created.',
      handled: true,
      accepted: false,
      plan,
    };
  }

  if (!plan.canAccept) {
    audit.updateCall(plan.callId, {
      status: 'blocked',
      blockerCodes: plan.blockers,
      detail: 'Inbound call was rejected by Meridian readiness gates before provider acceptance.',
    });
    return {
      ok: false,
      status: 409,
      error: 'Incoming Realtime call is not authorized for acceptance.',
      handled: true,
      accepted: false,
      plan,
    };
  }

  audit.updateCall(plan.callId, {
    status: 'authorized',
    blockerCodes: [],
    detail: 'Inbound call passed Meridian routing, runtime and provider configuration gates.',
  });

  if (typeof options.acceptCall !== 'function') {
    audit.updateCall(plan.callId, {
      status: 'failed',
      blockerCodes: ['provider.accept_adapter_missing'],
      lastError: 'OpenAI Realtime accept adapter is not installed.',
      detail: 'Call could not be accepted because the provider accept adapter was unavailable.',
    });
    return {
      ok: false,
      status: 503,
      error: 'OpenAI Realtime accept adapter is not installed.',
      handled: true,
      accepted: false,
      plan,
    };
  }

  try {
    await options.acceptCall({
      callId: plan.callId,
      body: plan.acceptBody,
      deploymentId: plan.deployment.id,
      route: plan.route,
    });
    audit.updateCall(plan.callId, {
      status: 'accepted',
      detail: 'OpenAI Realtime accepted the authorized SIP call.',
    });
  } catch (error) {
    audit.updateCall(plan.callId, {
      status: 'failed',
      blockerCodes: ['provider.accept_failed'],
      lastError: clean(error?.message, 500),
      detail: 'OpenAI Realtime call acceptance failed after Meridian authorization.',
    });
    return {
      ok: false,
      status: 502,
      error: 'OpenAI Realtime call acceptance failed.',
      handled: true,
      accepted: false,
      callId: plan.callId,
      deploymentId: plan.deployment.id,
      detail: clean(error?.message, 500),
    };
  }

  let sidebandAttached = false;
  if (options.requireSideband === true) {
    if (typeof options.attachSideband !== 'function') {
      const hungUp = await bestEffortHangup(options, plan);
      audit.updateCall(plan.callId, {
        status: 'failed',
        blockerCodes: ['sideband.adapter_missing'],
        lastError: 'Realtime sideband adapter is not installed.',
        detail: hungUp
          ? 'Accepted call was hung up because required Meridian sideband control was unavailable.'
          : 'Required Meridian sideband control was unavailable after provider acceptance.',
      });
      return {
        ok: false,
        status: 503,
        error: 'Required Realtime sideband control is unavailable.',
        handled: true,
        accepted: true,
        sidebandAttached: false,
        callId: plan.callId,
        deploymentId: plan.deployment.id,
      };
    }

    try {
      const sideband = await options.attachSideband({
        callId: plan.callId,
        deploymentId: plan.deployment.id,
      });
      if (!sideband?.ok) {
        const hungUp = await bestEffortHangup(options, plan);
        const detail = clean(sideband?.error, 500) || 'Realtime sideband adapter could not attach.';
        audit.updateCall(plan.callId, {
          status: 'failed',
          blockerCodes: ['sideband.attach_failed'],
          lastError: detail,
          detail: hungUp
            ? 'Accepted call was hung up because required Meridian sideband attachment failed.'
            : 'Required Meridian sideband attachment failed after provider acceptance.',
        });
        return {
          ok: false,
          status: 502,
          error: 'Required Realtime sideband attachment failed.',
          handled: true,
          accepted: true,
          sidebandAttached: false,
          callId: plan.callId,
          deploymentId: plan.deployment.id,
        };
      }
      sidebandAttached = true;
    } catch (error) {
      const hungUp = await bestEffortHangup(options, plan);
      audit.updateCall(plan.callId, {
        status: 'failed',
        blockerCodes: ['sideband.attach_failed'],
        lastError: clean(error?.message, 500),
        detail: hungUp
          ? 'Accepted call was hung up after a required sideband attachment exception.'
          : 'Required sideband attachment raised an exception after provider acceptance.',
      });
      return {
        ok: false,
        status: 502,
        error: 'Required Realtime sideband attachment failed.',
        handled: true,
        accepted: true,
        sidebandAttached: false,
        callId: plan.callId,
        deploymentId: plan.deployment.id,
      };
    }
  }

  return {
    ok: true,
    handled: true,
    accepted: true,
    sidebandAttached,
    callId: plan.callId,
    deploymentId: plan.deployment.id,
    dialedNumber: plan.dialedNumber,
    environment: plan.environment,
  };
}
