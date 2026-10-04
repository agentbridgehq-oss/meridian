/**
 * Read-only: would a call to this number reach the AI? Walks the same path as the live
 * xAI webhook (inbound route → deployment → managed runtime agent → billing account →
 * usage gate) without accepting, rejecting, holding minutes or calling any provider.
 */
import { planRealtimeIncoming } from './openai-realtime-ingress.mjs';
import { billingAccountForDeployment } from './usage-meter.mjs';
import { usageState } from './usage-billing.mjs';
import { paygState } from './payg-billing.mjs';

export function billingGateCheck({ number, provider = 'xai', environment = process.env.MERIDIAN_VOICE_ENVIRONMENT || 'staging' } = {}) {
  const dialed = String(number || '').trim();
  if (!/^\+\d{8,15}$/.test(dialed)) return { ok: false, error: 'number must be E.164, e.g. +12896707853' };
  const event = {
    type: 'realtime.call.incoming',
    data: { call_id: '00000000-0000-4000-8000-000000000000', sip_headers: [{ name: 'To', value: dialed }], metadata: {} },
  };
  const plan = planRealtimeIncoming(event, { provider, environment, providerConfigured: true });
  if (!plan.ok) return { ok: false, stage: 'routing', error: plan.error, status: plan.status };
  const acc = billingAccountForDeployment(plan.deployment.id, { agentId: plan.runtime.agentId });
  const st = acc ? usageState(acc) : null;
  const pg = acc ? paygState(acc) : null;
  let gate = 'ok';
  if (!acc) gate = 'billing.account_unmapped';
  else if (pg.blocked) gate = 'billing.payment_failed';
  else if (!st.active && st.prepaidMinutes <= 0) gate = 'billing.plan_inactive';
  else if (!pg.eligible && st.minutesAvailable < 1) gate = 'billing.voice_cap_reached';
  return {
    ok: gate === 'ok' && plan.canAccept,
    environment,
    provider,
    deploymentId: plan.deployment.id,
    runtimeAgentId: plan.runtime.agentId,
    readinessBlockers: plan.blockers,
    billingGate: gate,
    account: acc ? { id: acc.id, agentId: acc.agentId, internal: Boolean(acc.internal), plan: st.planId, minutesAvailable: st.minutesAvailable, payg: pg.reason } : null,
  };
}
