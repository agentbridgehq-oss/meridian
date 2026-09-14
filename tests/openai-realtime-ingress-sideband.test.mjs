import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-realtime-sideband-ingress-'));
process.env.DATA_DIR = dir;
process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = path.join(dir, 'deployment-core.json');
process.env.MERIDIAN_INBOUND_ROUTE_FILE = path.join(dir, 'inbound-routes.json');
process.env.MERIDIAN_REALTIME_CALL_FILE = path.join(dir, 'realtime-calls.json');

const { upsertLead } = await import('../engine.mjs');
const core = await import('../lib/deployment-core.mjs');
const { provisionManagedRuntime } = await import('../lib/managed-runtime.mjs');
const routing = await import('../lib/inbound-routing.mjs');
const ingress = await import('../lib/openai-realtime-ingress.mjs');
const ledger = await import('../lib/realtime-call-ledger.mjs');

function incoming(number, callId) {
  return {
    type: 'realtime.call.incoming',
    data: {
      call_id: callId,
      sip_headers: [
        { name: 'Diversion', value: `<sip:${number}@twilio.com>` },
        { name: 'To', value: '<sip:project@sip.api.openai.com>' },
      ],
    },
  };
}

function preparedDeployment(number) {
  const lead = upsertLead({
    email: `sideband-${number.replace(/\D/g, '')}@example.invalid`,
    businessName: `Sideband HVAC ${number}`,
    primaryNeed: 'voice', consent: true,
    agency: {
      input: { service: 'voice', tier: 'foundation', phone: number, businessWebsite: 'https://example.invalid' },
      intake: { hours: 'Mon-Fri 8-5', services: 'HVAC', owner: 'Operations' },
      proposal: { status: 'approved', service: 'voice', tier: 'foundation', agentNeed: 'voice', acceptanceChecks: [] },
    },
  });
  let deployment = core.createDeploymentFromAgencyLead(lead).deployment;
  assert.equal(provisionManagedRuntime(deployment.id).ok, true);
  deployment = core.updateIntegration(deployment.id, 'brain', { provider: 'openai', status: 'configured', credentialConfigured: true }).deployment;
  deployment = core.updateIntegration(deployment.id, 'telephony', { provider: 'twilio-sip', status: 'configured', credentialConfigured: true }).deployment;
  const route = routing.upsertInboundRoute({ deploymentId: deployment.id, dialedNumber: number, environment: 'staging', provider: 'twilio-sip' }).route;
  assert.equal(routing.setInboundRouteEnabled(route.id, true, { evidence: 'Staging SIP route verified for sideband failure test.' }).ok, true);
  return deployment;
}

test('required sideband failure hangs up the already accepted call and records failure', async () => {
  const number = '+17055550141';
  const callId = 'rtc_sideband_required_fail';
  const deployment = preparedDeployment(number);
  let acceptCount = 0;
  let attachCount = 0;
  let hangupCount = 0;

  const result = await ingress.processVerifiedOpenAIRealtimeWebhook(incoming(number, callId), {
    environment: 'staging',
    openAIConfigured: true,
    requireSideband: true,
    acceptCall: async () => { acceptCount += 1; },
    attachSideband: async () => { attachCount += 1; return { ok: false, error: 'Synthetic sideband attach failure.' }; },
    hangupCall: async () => { hangupCount += 1; },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.equal(result.accepted, true);
  assert.equal(result.sidebandAttached, false);
  assert.equal(acceptCount, 1);
  assert.equal(attachCount, 1);
  assert.equal(hangupCount, 1);

  const call = ledger.getRealtimeCall(callId);
  assert.equal(call.deploymentId, deployment.id);
  assert.equal(call.status, 'failed');
  assert.ok(call.blockerCodes.includes('sideband.attach_failed'));
  assert.match(call.lastError, /Synthetic sideband attach failure/);
});

test('required sideband success leaves the accepted call under sideband control', async () => {
  const number = '+17055550142';
  const callId = 'rtc_sideband_required_ok';
  const deployment = preparedDeployment(number);
  let hangupCount = 0;

  const result = await ingress.processVerifiedOpenAIRealtimeWebhook(incoming(number, callId), {
    environment: 'staging',
    openAIConfigured: true,
    requireSideband: true,
    acceptCall: async () => {},
    attachSideband: async input => {
      assert.equal(input.callId, callId);
      assert.equal(input.deploymentId, deployment.id);
      return { ok: true };
    },
    hangupCall: async () => { hangupCount += 1; },
  });

  assert.equal(result.ok, true);
  assert.equal(result.accepted, true);
  assert.equal(result.sidebandAttached, true);
  assert.equal(hangupCount, 0);
  assert.equal(ledger.getRealtimeCall(callId).status, 'accepted');
});
