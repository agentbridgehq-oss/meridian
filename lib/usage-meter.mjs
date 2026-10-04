/**
 * Live-channel usage meter: maps a call / number / agent to the client's billing
 * account and enforces the usage policy on
 *  - OpenAI Realtime SIP calls (lib/openai-realtime-ingress.mjs)
 *  - Twilio <Gather> voice (lib/twilio-routes.mjs)
 *  - Twilio inbound SMS + customer-facing outbound SMS.
 *
 * Fail safe: no mapped billing account, or no active plan / prepaid balance,
 * means NO AI usage (the call/text is handled without the model).
 *
 * PAYG (lib/payg-billing.mjs): clients with a valid card and PAYG on never stop at
 * cap; minutes/segments beyond plan + prepaid are queued as Stripe meter events
 * (one identifier per call / per message). Payment failed → new calls go to
 * voicemail (code billing.payment_failed); live calls are never cut.
 */
import { getAgent, getLead } from '../engine.mjs';
import { getDeployment } from './deployment-core.mjs';
import {
  consumeSmsSegments,
  getBillingAccount,
  getBillingByAgent,
  releaseVoiceCall,
  reserveVoiceCall,
  settleVoiceCall,
  smsSegmentCount,
  touchVoiceCall,
  usageState,
} from './usage-billing.mjs';
import { deliverUsageAlerts } from './usage-alerts.mjs';
import { claimOnce } from './processed-events.mjs';
import { flushMeterOutbox, maybeAlertPaygSpend, paygState, recordMeteredUsage } from './payg-billing.mjs';
import { maybeAlertAiCostRatio } from './owner-alerts.mjs';
import { USAGE_POLICY } from './pricing.mjs';

export { smsSegmentCount };

/**
 * Deps; tests swap them. `stripe` = Stripe client for flushing meter events (server sets it);
 * `ownerSend` = transport for Kenny alerts; `notifyClient` = client PAYG notices.
 */
export const meterDeps = { notify: undefined, getAgent: undefined, stripe: undefined, ownerSend: undefined, notifyClient: undefined };

function paygDeps() {
  const deps = {};
  if (meterDeps.ownerSend) deps.send = meterDeps.ownerSend;
  if (meterDeps.notifyClient) deps.notifyClientFn = meterDeps.notifyClient;
  return deps;
}

/**
 * After usage is settled: queue metered overage (sync; voice settles already queued it via
 * the usage-billing sink, so `preQueued` is passed and nothing is queued twice), then
 * best-effort flush + alerts.
 */
async function afterUsage(accountId, { metric, units, identifier, preQueued } = {}) {
  let queued = preQueued || null;
  if (!queued && units > 0) queued = recordMeteredUsage(accountId, { metric, units, identifier });
  try {
    if (queued?.queued && meterDeps.stripe) await flushMeterOutbox({ stripe: meterDeps.stripe, notify: meterDeps.ownerSend });
    if (units > 0) await maybeAlertPaygSpend(accountId, paygDeps());
    await maybeAlertAiCostRatio(meterDeps.ownerSend ? { send: meterDeps.ownerSend } : {});
  } catch {}
  return queued;
}

/** Gate shared by every voice entry point. */
function beginVoice(acc, callId, channel) {
  const state = paygState(acc);
  if (state.blocked) return { ok: false, code: 'billing.payment_failed', fallback: 'voicemail', accountId: acc.id };
  return {
    ...reserveVoiceCall(acc.id, callId, { channel, payg: state.eligible }),
    accountId: acc.id,
    softWrapSeconds: USAGE_POLICY.perCallSoftWrapMinutes * 60,
  };
}

async function alerts(accountId) {
  try {
    const deps = {};
    if (meterDeps.notify) deps.notify = meterDeps.notify;
    if (meterDeps.getAgent) deps.getAgent = meterDeps.getAgent;
    return await deliverUsageAlerts(accountId, deps);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function billingAccountForAgent(agentOrId) {
  const agentId = typeof agentOrId === 'string' ? agentOrId : agentOrId?.id;
  if (!agentId) return null;
  const agent = typeof agentOrId === 'string' ? null : agentOrId;
  if (agent?.billingAccountId) return getBillingAccount(agent.billingAccountId);
  return getBillingByAgent(agentId);
}

export function billingAccountForDeployment(deploymentId, { agentId = '' } = {}) {
  const deployment = deploymentId ? getDeployment(deploymentId) : null;
  if (deployment?.billingAccountId) {
    const acc = getBillingAccount(deployment.billingAccountId);
    if (acc) return acc;
  }
  const runtimeAgentId = agentId || (deployment ? getLead(deployment.projectId)?.managedRuntime?.agentId : '') || '';
  return runtimeAgentId ? getBillingByAgent(runtimeAgentId) : null;
}

// ── OpenAI Realtime (SIP) ───────────────────────────────────────────────────

export const realtimeUsageMeter = {
  beginCall({ deploymentId, agentId, callId }) {
    const acc = billingAccountForDeployment(deploymentId, { agentId });
    if (!acc) return { ok: false, code: 'billing.account_unmapped' };
    return beginVoice(acc, callId, 'realtime_sip');
  },
  releaseCall({ accountId, callId }) {
    return accountId ? releaseVoiceCall(accountId, callId) : { ok: false };
  },
  async endCall({ accountId, callId, durationSeconds }) {
    if (!accountId) return { ok: false };
    const settled = settleVoiceCall(accountId, callId, { durationSeconds });
    const metered = await afterUsage(accountId, { metric: 'minutes', units: settled.paygMinutes || 0, identifier: `voice_${callId}`, preQueued: settled.metered });
    await alerts(accountId);
    return { ...settled, metered };
  },
};

// ── Twilio <Gather> voice ───────────────────────────────────────────────────

export function beginTwilioVoiceCall(agent, callSid) {
  const acc = billingAccountForAgent(agent);
  if (!acc) return { ok: false, code: 'billing.account_unmapped' };
  return beginVoice(acc, `twilio:${callSid}`, 'twilio_gather');
}

/** Before each AI turn: is there a live allowance for this call? */
export function checkTwilioVoiceTurn(agent, callSid) {
  const acc = billingAccountForAgent(agent);
  if (!acc) return { ok: false, code: 'billing.account_unmapped' };
  const callId = `twilio:${callSid}`;
  let touch = touchVoiceCall(acc.id, callId);
  if (!touch.ok) {
    // First webhook went to another worker or was missed — reserve now (same rules).
    const begun = beginVoice(acc, callId, 'twilio_gather');
    if (!begun.ok) return begun;
    touch = touchVoiceCall(acc.id, callId);
  }
  if (touch.overLimit) return { ok: false, code: 'billing.call_limit_reached', accountId: acc.id, callId };
  return { ok: true, accountId: acc.id, callId, ...touch };
}

export async function endTwilioVoiceCall(agent, callSid, { durationSeconds } = {}) {
  const acc = billingAccountForAgent(agent);
  if (!acc) return { ok: false, code: 'billing.account_unmapped' };
  const settled = settleVoiceCall(acc.id, `twilio:${callSid}`, { durationSeconds });
  const metered = await afterUsage(acc.id, { metric: 'minutes', units: settled.paygMinutes || 0, identifier: `voice_twilio:${callSid}`, preQueued: settled.metered });
  await alerts(acc.id);
  return { ...settled, metered };
}

// ── SMS ─────────────────────────────────────────────────────────────────────

/** Can this agent's number spend AI on SMS right now? (needs >= `segments` available) */
export function smsGate(agent, segments = 1) {
  const acc = billingAccountForAgent(agent);
  if (!acc) return { ok: false, code: 'billing.account_unmapped' };
  const st = usageState(acc);
  const state = paygState(acc);
  if (state.blocked) return { ok: false, code: 'billing.payment_failed', accountId: acc.id, usage: st };
  if (!st.active && st.prepaidSms <= 0) return { ok: false, code: 'billing.plan_inactive', accountId: acc.id, usage: st };
  if (state.eligible) return { ok: true, accountId: acc.id, available: Math.max(st.smsAvailable, 10), payg: true, usage: st };
  if (st.smsAvailable < segments) return { ok: false, code: 'billing.sms_cap_reached', accountId: acc.id, usage: st };
  return { ok: true, accountId: acc.id, available: st.smsAvailable, usage: st };
}

/**
 * Debit SMS segments. PAYG accounts meter segments beyond plan + prepaid to Stripe
 * (identifier = opts.identifier, e.g. the Twilio MessageSid, else a fresh UUID per message).
 */
export async function meterSms(accountId, segments, opts = {}) {
  if (!accountId) return { ok: false, code: 'billing.account_unmapped' };
  const state = paygState(accountId);
  const { identifier, ...rest } = opts;
  const r = consumeSmsSegments(accountId, segments, { ...rest, payg: state.eligible });
  if (r.ok && r.paygSegments > 0) {
    r.metered = await afterUsage(accountId, { metric: 'sms', units: r.paygSegments, identifier: identifier ? `sms_${identifier}` : undefined });
  }
  if (r.ok && r.alerts?.length) await alerts(accountId);
  return r;
}

/** Trim a reply so it fits in `maxSegments` SMS segments. */
export function fitSmsSegments(text, maxSegments) {
  let out = String(text || '');
  if (maxSegments < 1) return '';
  while (out && smsSegmentCount(out) > maxSegments) {
    out = out.slice(0, Math.max(0, out.length - Math.max(1, Math.ceil(out.length * 0.05)))).trimEnd();
  }
  return out;
}

/** Once per customer number per billing period: may we send the at-cap notice? */
export function claimCapNotice(accountId, period, from) {
  return claimOnce(`sms_cap_notice:${accountId}:${period}:${String(from || '').replace(/[^\d+]/g, '')}`).claimed;
}

/**
 * Customer-facing outbound SMS sent on a client's behalf (confirmations, missed-call
 * text-back, owner tooling). Metered against the client's plan; refused at cap.
 */
export async function sendMeteredCustomerSms(agent, { to, body }, { send } = {}) {
  const segments = Math.max(1, smsSegmentCount(body));
  const gate = smsGate(agent, segments);
  if (!gate.ok) return { ok: false, skipped: true, reason: gate.code };
  const sender = send || (await import('./notify.mjs')).sendSms;
  const result = await sender({ to, body });
  if (result?.ok) await meterSms(gate.accountId, segments, { direction: 'outbound', reason: 'customer_sms', force: true });
  return result;
}

export function agentById(id) {
  return id ? getAgent(id) : null;
}
