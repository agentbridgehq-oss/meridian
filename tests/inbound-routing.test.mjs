import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-inbound-routing-'));
process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = path.join(temp, 'deployments.json');
process.env.MERIDIAN_INBOUND_ROUTE_FILE = path.join(temp, 'routes.json');

const { createDeploymentFromAgencyLead } = await import('../lib/deployment-core.mjs');
const {
  dialedNumberFromSipHeaders,
  normalizeE164,
  resolveInboundRouteByNumber,
  resolveInboundRouteFromSipHeaders,
  setInboundRouteEnabled,
  upsertInboundRoute,
} = await import('../lib/inbound-routing.mjs');

function voiceLead(id, name = 'Test HVAC') {
  return {
    id,
    businessName: name,
    phone: '+17055550100',
    agency: {
      input: { businessName: name, businessWebsite: 'https://example.test', service: 'voice', tier: 'foundation' },
      intake: { hours: 'Mon-Fri 8-5', services: 'Heating and cooling', owner: 'Operations owner' },
      proposal: { service: 'voice', agentNeed: 'voice', tier: 'foundation', acceptanceChecks: [] },
    },
  };
}

test('normalizes only explicit E.164 numbers and extracts Twilio Diversion DID', () => {
  assert.equal(normalizeE164('tel:+17055550123'), '+17055550123');
  assert.equal(normalizeE164('7055550123'), '');
  const result = dialedNumberFromSipHeaders([
    { name: 'From', value: '<sip:+17055550999@pstn.twilio.com>' },
    { name: 'Diversion', value: '<sip:+17055550123@twilio.com>' },
    { name: 'To', value: '<sip:project@sip.api.openai.com>' },
  ]);
  assert.deepEqual(result, { number: '+17055550123', sourceHeader: 'Diversion' });
});

test('routes a Twilio SIP call only after explicit verified enablement', () => {
  const deployment = createDeploymentFromAgencyLead(voiceLead('lead_route_1')).deployment;
  const created = upsertInboundRoute({
    deploymentId: deployment.id,
    dialedNumber: '+17055550123',
    provider: 'twilio-sip',
    environment: 'staging',
  });
  assert.equal(created.ok, true);
  assert.equal(created.route.enabled, false);
  assert.equal(resolveInboundRouteByNumber('+17055550123', { environment: 'staging' }), null);

  const blocked = setInboundRouteEnabled(created.route.id, true, { evidence: 'short' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 400);

  const enabled = setInboundRouteEnabled(created.route.id, true, { evidence: 'Twilio staging DID linked to the Meridian SIP trunk.' });
  assert.equal(enabled.ok, true);
  assert.equal(enabled.route.enabled, true);

  const resolved = resolveInboundRouteFromSipHeaders([
    { name: 'Diversion', value: '<sip:+17055550123@twilio.com>' },
    { name: 'To', value: '<sip:project@sip.api.openai.com>' },
  ], { environment: 'staging' });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.route.deploymentId, deployment.id);
  assert.equal(resolved.dialed.sourceHeader, 'Diversion');
});

test('prevents an enabled number from silently switching deployments', () => {
  const first = createDeploymentFromAgencyLead(voiceLead('lead_route_2', 'First Business')).deployment;
  const second = createDeploymentFromAgencyLead(voiceLead('lead_route_3', 'Second Business')).deployment;
  const created = upsertInboundRoute({ deploymentId: first.id, dialedNumber: '+17055550124', environment: 'staging' });
  assert.equal(setInboundRouteEnabled(created.route.id, true, { evidence: 'Verified routing ownership for first deployment.' }).ok, true);

  const collision = upsertInboundRoute({ deploymentId: second.id, dialedNumber: '+17055550124', environment: 'staging' });
  assert.equal(collision.ok, false);
  assert.equal(collision.status, 409);
});
