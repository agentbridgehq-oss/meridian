/**
 * Live-channel usage meter: maps a call / number / agent to the client's billing
 * account and enforces the approved stop-at-cap policy on
 *  - OpenAI Realtime SIP calls (lib/openai-realtime-ingress.mjs)
 *  - Twilio <Gather> voice (lib/twilio-routes.mjs)
 *  - Twilio inbound SMS + customer-facing outbound SMS.
 *
 * Fail safe: no mapped billing account, or no active plan / prepaid balance,
 * means NO AI usage (the call/text is handled without the model).
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

export { smsSegmentCount };

/** Deps for alert delivery; tests swap `notify` to mock the transport. */
export const meterDeps = { notify: undefined, getAgent: undefined };

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
    return { ...reserveVoiceCall(acc.id, callId, { channel: 'openai_realtime' }), accountId: acc.id };
  },
  releaseCall({ accountId, callId }) {
    return accountId ? releaseVoiceCall(accountId, callId) : { ok: false };
  },
  async endCall({ accountId, callId, durationSeconds }) {
    if (!accountId) return { ok: false };
    const settled = settleVoiceCall(accountId, callId, { durationSeconds });
    await alerts(accountId);
    return settled;
  },
};

// ── Twilio <Gather> voice ───────────────────────────────────────────────────

export function beginTwilioVoiceCall(agent, callSid) {
  const acc = billingAccountForAgent(agent);
  if (!acc) return { ok: false, code: 'billing.account_unmapped' };
  return { ...reserveVoiceCall(acc.id, `twilio:${callSid}`, { channel: 'twilio_gather' }), accountId: acc.id };
}

/** Before each AI turn: is there a live allowance for this call? */
export function checkTwilioVoiceTurn(agent, callSid) {
  const acc = billingAccountForAgent(agent);
  if (!acc) return { ok: false, code: 'billing.account_unmapped' };
  const callId = `twilio:${callSid}`;
  let touch = touchVoiceCall(acc.id, callId);
  if (!touch.ok) {
    // First webhook went to another worker or was missed — reserve now (same rules).
    const begun = reserveVoiceCall(acc.id, callId, { channel: 'twilio_gather' });
    if (!begun.ok) return { ...begun, accountId: acc.id };
    touch = touchVoiceCall(acc.id, callId);
  }
  if (touch.overLimit) return { ok: false, code: 'billing.call_limit_reached', accountId: acc.id, callId };
  return { ok: true, accountId: acc.id, callId, ...touch };
}

export async function endTwilioVoiceCall(agent, callSid, { durationSeconds } = {}) {
  const acc = billingAccountForAgent(agent);
  if (!acc) return { ok: false, code: 'billing.account_unmapped' };
  const settled = settleVoiceCall(acc.id, `twilio:${callSid}`, { durationSeconds });
  await alerts(acc.id);
  return settled;
}

// ── SMS ─────────────────────────────────────────────────────────────────────

/** Can this agent's number spend AI on SMS right now? (needs >= `segments` available) */
export function smsGate(agent, segments = 1) {
  const acc = billingAccountForAgent(agent);
  if (!acc) return { ok: false, code: 'billing.account_unmapped' };
  const st = usageState(acc);
  if (!st.active && st.prepaidSms <= 0) return { ok: false, code: 'billing.plan_inactive', accountId: acc.id, usage: st };
  if (st.smsAvailable < segments) return { ok: false, code: 'billing.sms_cap_reached', accountId: acc.id, usage: st };
  return { ok: true, accountId: acc.id, available: st.smsAvailable, usage: st };
}

export async function meterSms(accountId, segments, opts = {}) {
  if (!accountId) return { ok: false, code: 'billing.account_unmapped' };
  const r = consumeSmsSegments(accountId, segments, opts);
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
