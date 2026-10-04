import { getAgent, getLead } from '../engine.mjs';
import { getDeployment } from './deployment-core.mjs';
import { resolveInboundRouteFromSipHeaders } from './inbound-routing.mjs';
import { buildOpenAIRealtimeConfig } from './openai-realtime-config.mjs';
import { buildXaiRealtimeConfig } from './xai-realtime-config.mjs';

/**
 * Provider profiles. The ingress (routing, readiness, billing gate, sideband,
 * call-limit) is shared; only call-id shape, key, brain provider and session
 * config differ. Default stays 'openai' for this function; the xAI webhook
 * route passes provider: 'xai'.
 */
const PROVIDERS = {
  openai: {
    id: 'openai', label: 'OpenAI Realtime', ledger: 'openai-realtime', key: 'OPENAI_API_KEY',
    callId: /^rtc_[A-Za-z0-9_-]+$/, config: buildOpenAIRealtimeConfig,
  },
  xai: {
    id: 'xai', label: 'xAI Grok Voice', ledger: 'xai-realtime', key: 'XAI_API_KEY',
    callId: /^[A-Za-z0-9-]{8,128}$/, config: buildXaiRealtimeConfig,
  },
};

function providerProfile(options = {}) {
  return PROVIDERS[options.provider] || PROVIDERS.openai;
}
import {
  recordRealtimeCallIncoming,
  updateRealtimeCall,
} from './realtime-call-ledger.mjs';
import { realtimeUsageMeter } from './usage-meter.mjs';
import { normalizeE164 } from './inbound-routing.mjs';

/** SIP status used when the plan cap blocks AI (480 lets the trunk fail over / disaster-recovery URL). */
function capRejectStatus(options) {
  const n = Number(options.capRejectStatusCode || process.env.MERIDIAN_CAP_SIP_STATUS || 480);
  return Number.isInteger(n) && n >= 400 && n <= 699 ? n : 480;
}

function verifiedTransferUri(deploymentId) {
  const deployment = getDeployment(deploymentId);
  const destination = deployment?.integrations?.destination;
  const number = normalizeE164(deployment?.config?.agent?.humanTransfer || '');
  return number && destination?.status === 'verified' ? `tel:${number}` : '';
}

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

function integrationBlockers(deployment, environment, providerId = 'openai') {
  const blockers = [];
  const brain = deployment.integrations?.brain;
  const telephony = deployment.integrations?.telephony;

  if (!brain || brain.provider !== providerId) blockers.push(`integration.brain.provider.${providerId}`);
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
  const profile = providerProfile(options);
  const providerConfigured = options.providerConfigured
    ?? (profile.id === 'openai' ? options.openAIConfigured : undefined)
    ?? Boolean(process.env[profile.key]?.trim?.());
  if (!['staging', 'production'].includes(environment))
    return { ok: false, status: 400, error: 'environment must be staging or production.' };
  if (!event || event.type !== 'realtime.call.incoming')
    return { ok: false, status: 400, error: 'Expected realtime.call.incoming event.' };

  const callId = clean(event.data?.call_id, 200);
  if (!profile.callId.test(callId))
    return { ok: false, status: 400, error: 'Incoming event is missing a valid Realtime call_id.' };

  const routing = resolveInboundRouteFromSipHeaders(event.data?.sip_headers, { environment });
  if (!routing.ok) return { ...routing, callId };

  const deployment = getDeployment(routing.route.deploymentId);
  if (!deployment) return { ok: false, status: 404, error: 'Inbound route points to a missing deployment.', callId, route: routing.route };

  const blockers = [];
  if (!deployment.capabilities?.includes('voice')) blockers.push('deployment.voice_capability');
  if (['paused', 'failed'].includes(deployment.status)) blockers.push(`deployment.status.${deployment.status}`);
  if (environment === 'production' && deployment.status !== 'live') blockers.push('deployment.status.live');
  blockers.push(...integrationBlockers(deployment, environment, profile.id));

  const runtime = runtimeStatus(deployment);
  if (!runtime.active) blockers.push('managed_runtime.active');
  if (!providerConfigured) blockers.push(`runtime_environment.${profile.key}`);

  const realtime = profile.config(deployment);
  if (!realtime.ok) blockers.push(`${profile.id}_realtime.config`);

  return {
    ok: true,
    canAccept: blockers.length === 0,
    blockers: [...new Set(blockers)],
    environment,
    provider: profile.id,
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

async function bestEffortReject(options, plan, statusCode = 603, extra = {}) {
  if (!plan?.callId || typeof options.rejectCall !== 'function') return false;
  try {
    await options.rejectCall({
      callId: plan.callId,
      statusCode,
      ...(plan.deployment?.id ? { deploymentId: plan.deployment.id } : {}),
      ...extra,
    });
    return true;
  } catch {
    return false;
  }
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

/** Allowance spent mid-call: hand the caller to a verified human line, else hang up. */
export async function enforceCallLimit(options, plan) {
  const audit = ledger(options);
  const targetUri = verifiedTransferUri(plan.deployment.id);
  if (targetUri && typeof options.referCall === 'function') {
    try {
      await options.referCall({ callId: plan.callId, targetUri });
      audit.updateCall(plan.callId, { status: 'active', eventType: 'billing.limit_transfer', detail: 'AI allowance reached; caller transferred to the verified team line.' });
      return { ok: true, action: 'transferred' };
    } catch {}
  }
  const hungUp = await bestEffortHangup(options, plan);
  audit.updateCall(plan.callId, { status: 'active', eventType: 'billing.limit_hangup', detail: 'AI allowance reached; call ended after a polite notice.' });
  return { ok: hungUp, action: 'hangup' };
}

export async function processVerifiedOpenAIRealtimeWebhook(event, options = {}) {
  if (!event || event.type !== 'realtime.call.incoming') {
    return { ok: true, handled: false, type: clean(event?.type, 120) || 'unknown' };
  }

  const plan = planOpenAIRealtimeIncoming(event, options);
  if (!plan.ok) {
    const rejected = await bestEffortReject(options, plan);
    return { ...plan, handled: true, accepted: false, rejected };
  }

  const profile = providerProfile(options);
  const audit = ledger(options);
  const incoming = audit.recordIncoming({
    callId: plan.callId,
    deploymentId: plan.deployment.id,
    routeId: plan.route.id,
    dialedNumber: plan.dialedNumber,
    environment: plan.environment,
    provider: profile.ledger,
  });
  if (!incoming?.ok) {
    const rejected = await bestEffortReject(options, plan);
    return {
      ok: false,
      status: 500,
      error: 'Realtime call audit record could not be created.',
      handled: true,
      accepted: false,
      rejected,
      plan,
    };
  }

  if (!plan.canAccept) {
    const rejected = await bestEffortReject(options, plan);
    audit.updateCall(plan.callId, {
      status: 'blocked',
      blockerCodes: plan.blockers,
      detail: rejected
        ? `Inbound call was rejected at ${profile.label} after failing Meridian readiness gates.`
        : 'Inbound call failed Meridian readiness gates; provider rejection could not be confirmed.',
    });
    return {
      ok: false,
      status: 409,
      error: 'Incoming Realtime call is not authorized for acceptance.',
      handled: true,
      accepted: false,
      rejected,
      plan,
    };
  }

  // Usage metering (fail safe): no mapped billing account, no active plan/prepaid
  // balance, or plan cap reached → the AI is never engaged for this call.
  const meter = options.usageMeter || realtimeUsageMeter;
  let billing;
  try {
    billing = meter.beginCall({ deploymentId: plan.deployment.id, agentId: plan.runtime.agentId, callId: plan.callId });
  } catch (error) {
    billing = { ok: false, code: 'billing.meter_failed', error: clean(error?.message, 300) };
  }
  if (!billing?.ok) {
    const code = billing?.code || 'billing.meter_failed';
    const atCap = code === 'billing.voice_cap_reached';
    // xAI has no reject endpoint: hand the caller to the verified team line (if any), else hang up.
    const transferUri = profile.id === 'xai' ? verifiedTransferUri(plan.deployment.id) : '';
    const rejected = await bestEffortReject(options, plan, capRejectStatus(options), transferUri ? { transferUri } : {});
    audit.updateCall(plan.callId, {
      status: 'blocked',
      blockerCodes: [code],
      detail: atCap
        ? 'Plan AI-minute cap reached (stop at cap). Call declined before the AI answered so the trunk can route it to the team or voicemail.'
        : 'No active, mapped billing account for this deployment. Call declined before any AI usage (fail safe).',
    });
    return {
      ok: false,
      status: atCap ? 402 : 409,
      error: atCap ? 'Plan usage cap reached; AI not engaged.' : 'No active billing account is mapped to this deployment.',
      handled: true,
      accepted: false,
      rejected,
      billing: { code },
      plan: { ...plan, canAccept: false, blockers: [code] },
    };
  }
  const billingRef = { accountId: billing.accountId, callId: plan.callId };
  let billingClosed = false;
  const endBilling = async () => {
    if (billingClosed) return null;
    billingClosed = true;
    try { return await meter.endCall(billingRef); } catch { return null; }
  };
  const releaseBilling = () => {
    if (billingClosed) return;
    billingClosed = true;
    try { meter.releaseCall(billingRef); } catch {}
  };

  audit.updateCall(plan.callId, {
    status: 'authorized',
    blockerCodes: [],
    detail: 'Inbound call passed Meridian routing, runtime and provider configuration gates.',
  });

  if (typeof options.acceptCall !== 'function') {
    releaseBilling();
    const rejected = await bestEffortReject(options, plan);
    audit.updateCall(plan.callId, {
      status: 'failed',
      blockerCodes: ['provider.accept_adapter_missing'],
      lastError: `${profile.label} accept adapter is not installed.`,
      detail: rejected
        ? 'Call was declined because the provider accept adapter was unavailable.'
        : 'Call could not be accepted and provider rejection could not be confirmed.',
    });
    return {
      ok: false,
      status: 503,
      error: `${profile.label} accept adapter is not installed.`,
      handled: true,
      accepted: false,
      rejected,
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
      detail: `${profile.label} accepted the authorized SIP call.`,
    });
  } catch (error) {
    releaseBilling();
    const rejected = await bestEffortReject(options, plan);
    audit.updateCall(plan.callId, {
      status: 'failed',
      blockerCodes: ['provider.accept_failed'],
      lastError: clean(error?.message, 500),
      detail: rejected
        ? `${profile.label} call acceptance failed and Meridian declined the still-pending call.`
        : `${profile.label} call acceptance failed after Meridian authorization.`,
    });
    return {
      ok: false,
      status: 502,
      error: `${profile.label} call acceptance failed.`,
      handled: true,
      accepted: false,
      rejected,
      callId: plan.callId,
      deploymentId: plan.deployment.id,
      detail: clean(error?.message, 500),
    };
  }

  let sidebandAttached = false;
  if (options.requireSideband === true) {
    if (typeof options.attachSideband !== 'function') {
      const hungUp = await bestEffortHangup(options, plan);
      await endBilling();
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
        // Usage enforcement: warn, then transfer/hang up when the allowance
        // (min of 20-min per-call cap and remaining plan minutes) is spent.
        limitSeconds: billing.allowedSeconds,
        onLimit: () => enforceCallLimit(options, plan),
        onClosed: () => endBilling(),
      });
      if (!sideband?.ok) {
        const hungUp = await bestEffortHangup(options, plan);
        await endBilling();
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
      await endBilling();
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
    rejected: false,
    billing: { accountId: billing.accountId, allowedMinutes: billing.allowedMinutes },
    sidebandAttached,
    callId: plan.callId,
    deploymentId: plan.deployment.id,
    dialedNumber: plan.dialedNumber,
    environment: plan.environment,
  };
}

/** Provider-neutral aliases (xAI default path uses provider: 'xai'). */
export { planOpenAIRealtimeIncoming as planRealtimeIncoming, processVerifiedOpenAIRealtimeWebhook as processVerifiedRealtimeWebhook };
