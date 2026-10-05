// Internal/demo plan seed + read-only billing gate check (the go-live step for the demo agent).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-internal-plan-'));
process.env.DATA_DIR = dir;
process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = path.join(dir, 'deployment-core.json');
process.env.MERIDIAN_INBOUND_ROUTE_FILE = path.join(dir, 'inbound-routes.json');
process.env.MERIDIAN_REALTIME_CALL_FILE = path.join(dir, 'realtime-calls.json');
for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'RESEND_API_KEY', 'XAI_API_KEY', 'OPENAI_API_KEY', 'MERIDIAN_INTERNAL_AGENT_IDS', 'MERIDIAN_OWNER_EMAIL', 'MERIDIAN_OWNER_PHONE', 'OWNER_EMAIL', 'OWNER_PHONE']) delete process.env[k];

const engine = await import('../engine.mjs');
const core = await import('../lib/deployment-core.mjs');
const { provisionManagedRuntime } = await import('../lib/managed-runtime.mjs');
const routing = await import('../lib/inbound-routing.mjs');
const ingress = await import('../lib/openai-realtime-ingress.mjs');
const billing = await import('../lib/usage-billing.mjs');
const internal = await import('../lib/internal-plans.mjs');
const { billingGateCheck } = await import('../lib/billing-gate-check.mjs');
const owner = await import('../lib/owner-alerts.mjs');

function xaiDeployment(number) {
  const lead = engine.upsertLead({
    email: `internal-${number.replace(/\D/g, '')}@example.invalid`, businessName: `Demo ${number}`, primaryNeed: 'voice', consent: true,
    agency: {
      input: { service: 'voice', tier: 'foundation', phone: number, businessWebsite: 'https://example.invalid' },
      intake: { hours: 'Mon-Fri 8-5', services: 'Demo', owner: 'Operations' },
      proposal: { status: 'approved', service: 'voice', tier: 'foundation', agentNeed: 'voice', acceptanceChecks: [] },
    },
  });
  let d = core.createDeploymentFromAgencyLead(lead).deployment;
  assert.equal(provisionManagedRuntime(d.id).ok, true);
  d = core.updateIntegration(d.id, 'brain', { provider: 'xai', status: 'configured', credentialConfigured: true }).deployment;
  d = core.updateIntegration(d.id, 'telephony', { provider: 'twilio-sip', status: 'configured', credentialConfigured: true }).deployment;
  const route = routing.upsertInboundRoute({ deploymentId: d.id, dialedNumber: number, environment: 'staging', provider: 'twilio-sip' }).route;
  assert.equal(routing.setInboundRouteEnabled(route.id, true, { evidence: 'Staging route (internal plan test).' }).ok, true);
  return { deployment: d, agentId: engine.getLead(d.projectId).managedRuntime.agentId };
}
const xaiEvent = (number, callId) => ({ type: 'realtime.call.incoming', data: { call_id: callId, sip_headers: [{ name: 'From', value: '+14165550100' }, { name: 'To', value: number }], metadata: {} } });

test('parseInternalAgents: ids + optional plan, junk ignored', () => {
  assert.deepEqual(internal.parseInternalAgents('agent_05f24ebc02d2b04c:pro, agent_abcd1234 nope'), [
    { agentId: 'agent_05f24ebc02d2b04c', plan: 'pro' },
    { agentId: 'agent_abcd1234', plan: 'pro' },
  ]);
  assert.deepEqual(internal.parseInternalAgents(''), []);
});

test('demo go-live: unseeded agent is refused on the xAI path; after the seed the same call is accepted and metered', async () => {
  const number = '+12895550111';
  const { agentId } = xaiDeployment(number);
  let check = billingGateCheck({ number });
  assert.equal(check.billingGate, 'billing.account_unmapped');
  assert.equal(check.runtimeAgentId, agentId);

  let accepted = 0;
  const opts = { provider: 'xai', providerConfigured: true, environment: 'staging', requireSideband: true,
    acceptCall: async () => { accepted += 1; }, rejectCall: async () => {}, hangupCall: async () => {},
    attachSideband: async (input) => { opts.lastAttach = input; return { ok: true }; } };
  const refused = await ingress.processVerifiedRealtimeWebhook(xaiEvent(number, '11111111-2222-3333-4444-555555555555'), opts);
  assert.equal(refused.ok, false);
  assert.equal(refused.billing.code, 'billing.account_unmapped');
  assert.equal(accepted, 0);

  const seeded = internal.seedInternalAgentsFromEnv({ MERIDIAN_INTERNAL_AGENT_IDS: `${agentId}:pro` }, null);
  assert.equal(seeded[0].ok, true);
  assert.equal(seeded[0].changed, true);
  check = billingGateCheck({ number });
  assert.equal(check.billingGate, 'ok');
  assert.equal(check.account.internal, true);
  assert.equal(check.account.plan, 'pro');

  const ok = await ingress.processVerifiedRealtimeWebhook(xaiEvent(number, '22222222-2222-3333-4444-555555555555'), opts);
  assert.equal(ok.ok, true, JSON.stringify(ok).slice(0, 600));
  assert.equal(accepted, 1);
  assert.equal(opts.lastAttach.limitSeconds, 60 * 60);
  await opts.lastAttach.onClosed();
  const acc = billing.getBillingByAgent(agentId);
  assert.ok(billing.usageState(acc).minutesUsed >= 1); // metered against the internal plan

  // Re-seeding (every boot) is a no-op and keeps this month's usage.
  const used = billing.usageState(acc).minutesUsed;
  const again = internal.ensureInternalPlan({ agentId, plan: 'pro' });
  assert.equal(again.changed, false);
  assert.equal(again.reason, 'already_internal');
  assert.equal(billing.usageState(acc.id).minutesUsed, used);
  // Internal accounts stay capped: no card → no PAYG, stop at cap.
  billing.updateBillingAccount(acc.id, { periodTurnsUsed: 600 });
  assert.equal(billingGateCheck({ number }).billingGate, 'billing.voice_cap_reached');
});

test('seed never overrides a paid plan and records CA$0 revenue', () => {
  const paid = billing.ensureBillingAccount({ agentId: 'agent_paid_0001' });
  billing.activateSubscription(paid.id, 'growth', { stripeSubscriptionId: 'sub_test_paid' });
  const r = internal.ensureInternalPlan({ agentId: 'agent_paid_0001', plan: 'pro' });
  assert.equal(r.changed, false);
  assert.equal(r.reason, 'paid_plan_present');
  assert.equal(billing.getBillingAccount(paid.id).plan, 'growth');
  assert.equal(billing.getBillingAccount(paid.id).internal, undefined);

  const demo = internal.ensureInternalPlan({ agentId: 'agent_demo_0002' });
  assert.equal(demo.plan, 'pro');
  const acc = billing.getBillingAccount(demo.accountId);
  assert.equal(acc.lifetimeRevenueCents || 0, 0);
  assert.equal(internal.ensureInternalPlan({ agentId: 'bad id' }).ok, false);
  assert.equal(internal.ensureInternalPlan({ agentId: 'agent_demo_0003', plan: 'nope' }).error, 'unknown_plan');
});

test('owner AI-cost snapshot counts internal plans as CA$0 revenue (cost still counted)', () => {
  const period = '2032-02';
  const { accountId } = internal.ensureInternalPlan({ agentId: 'agent_cost_0004' });
  billing.updateBillingAccount(accountId, { periodKey: period, periodAiCostCentsEst: 500 });
  const snap = owner.aiCostRevenueSnapshot({ period });
  assert.equal(snap.revenueCents, 0);
  assert.equal(snap.aiCostCents, 500);
});

test('gate check rejects malformed numbers and unknown routes without side effects', () => {
  assert.equal(billingGateCheck({ number: '2896707853' }).ok, false);
  const r = billingGateCheck({ number: '+19995550000' });
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'routing');
});
