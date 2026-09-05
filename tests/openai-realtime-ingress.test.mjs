import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-realtime-ingress-'));
process.env.DATA_DIR = dir;
process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = path.join(dir, 'deployment-core.json');
process.env.MERIDIAN_INBOUND_ROUTE_FILE = path.join(dir, 'inbound-routes.json');

const { upsertLead } = await import('../engine.mjs');
const core = await import('../lib/deployment-core.mjs');
const { provisionManagedRuntime } = await import('../lib/managed-runtime.mjs');
const routing = await import('../lib/inbound-routing.mjs');
const ingress = await import('../lib/openai-realtime-ingress.mjs');

function incoming(number) {
  return {
    id: 'evt_test_realtime_incoming',
    type: 'realtime.call.incoming',
    data: {
      call_id: 'rtc_test_call_123',
      sip_headers: [
        { name: 'From', value: '<sip:+17055550999@pstn.twilio.com>' },
        { name: 'Diversion', value: `<sip:${number}@twilio.com>` },
        { name: 'To', value: '<sip:project@sip.api.openai.com>' },
      ],
    },
  };
}

function createVoiceDeployment() {
  const lead = upsertLead({
    email: 'realtime-ingress@example.invalid',
    businessName: 'Realtime Test HVAC',
    primaryNeed: 'voice',
    consent: true,
    agency: {
      input: { service: 'voice', tier: 'foundation', phone: '+17055550130', businessWebsite: 'https://example.invalid' },
      intake: { hours: 'Mon-Fri 8-5', services: 'HVAC service', rules: 'Capture caller intent', owner: 'Operations owner' },
      proposal: { status: 'approved', service: 'voice', tier: 'foundation', agentNeed: 'voice', acceptanceChecks: [] },
    },
  });
  return core.createDeploymentFromAgencyLead(lead).deployment;
}

function configureProvider(deploymentId, kind, provider) {
  const result = core.updateIntegration(deploymentId, kind, {
    provider,
    status: 'configured',
    credentialConfigured: true,
  });
  assert.equal(result.ok, true);
  return result.deployment;
}

test('staging ingress resolves the Twilio DID and only accepts a prepared deployment', async () => {
  let deployment = createVoiceDeployment();
  assert.equal(provisionManagedRuntime(deployment.id).ok, true);
  deployment = configureProvider(deployment.id, 'brain', 'openai');
  deployment = configureProvider(deployment.id, 'telephony', 'twilio-sip');

  const route = routing.upsertInboundRoute({
    deploymentId: deployment.id,
    dialedNumber: '+17055550130',
    environment: 'staging',
    provider: 'twilio-sip',
  }).route;
  assert.equal(routing.setInboundRouteEnabled(route.id, true, { evidence: 'Staging Twilio number is assigned to this deployment.' }).ok, true);

  const plan = ingress.planOpenAIRealtimeIncoming(incoming('+17055550130'), {
    environment: 'staging',
    openAIConfigured: true,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.canAccept, true);
  assert.equal(plan.dialedNumber, '+17055550130');
  assert.equal(plan.deployment.id, deployment.id);
  assert.equal(plan.acceptBody.type, 'realtime');
  assert.equal(plan.acceptBody.model, 'gpt-realtime-2.1');

  let accepted = null;
  const result = await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550130'), {
    environment: 'staging',
    openAIConfigured: true,
    acceptCall: async request => { accepted = request; },
  });
  assert.equal(result.ok, true);
  assert.equal(result.accepted, true);
  assert.equal(accepted.callId, 'rtc_test_call_123');
  assert.equal(accepted.deploymentId, deployment.id);
  assert.equal(accepted.body.type, 'realtime');
});

test('ingress fails closed when runtime OpenAI configuration is absent', () => {
  const deployment = createVoiceDeployment();
  const route = routing.upsertInboundRoute({ deploymentId: deployment.id, dialedNumber: '+17055550131', environment: 'staging' }).route;
  routing.setInboundRouteEnabled(route.id, true, { evidence: 'Staging DID assignment recorded for negative test.' });

  const plan = ingress.planOpenAIRealtimeIncoming(incoming('+17055550131'), {
    environment: 'staging',
    openAIConfigured: false,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.canAccept, false);
  assert.ok(plan.blockers.includes('runtime_environment.OPENAI_API_KEY'));
  assert.ok(plan.blockers.includes('managed_runtime.active'));
  assert.ok(plan.blockers.includes('integration.brain.provider.openai'));
  assert.ok(plan.blockers.includes('integration.telephony.provider.twilio-sip'));
});

test('production ingress additionally requires a live deployment and verified providers', () => {
  let deployment = createVoiceDeployment();
  assert.equal(provisionManagedRuntime(deployment.id).ok, true);
  deployment = configureProvider(deployment.id, 'brain', 'openai');
  deployment = configureProvider(deployment.id, 'telephony', 'twilio-sip');
  const route = routing.upsertInboundRoute({ deploymentId: deployment.id, dialedNumber: '+17055550132', environment: 'production' }).route;
  routing.setInboundRouteEnabled(route.id, true, { evidence: 'Production route ownership recorded, activation still blocked.' });

  const plan = ingress.planOpenAIRealtimeIncoming(incoming('+17055550132'), {
    environment: 'production',
    openAIConfigured: true,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.canAccept, false);
  assert.ok(plan.blockers.includes('deployment.status.live'));
  assert.ok(plan.blockers.includes('integration.brain.verified'));
  assert.ok(plan.blockers.includes('integration.telephony.verified'));
});

test('unrelated verified webhook types are ignored instead of treated as calls', async () => {
  const result = await ingress.processVerifiedOpenAIRealtimeWebhook({ type: 'response.completed', data: {} }, {});
  assert.deepEqual(result, { ok: true, handled: false, type: 'response.completed' });
});
