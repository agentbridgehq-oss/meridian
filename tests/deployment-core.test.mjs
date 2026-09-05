import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  activateDeployment,
  createDeploymentFromAgencyLead,
  getDeployment,
  pauseDeployment,
  recordAcceptanceCheck,
  recordClientAcceptance,
  recordHealth,
  recordRollbackPlan,
  updateDeploymentConfig,
  updateIntegration,
} from '../lib/deployment-core.mjs';

const dir = mkdtempSync(join(tmpdir(), 'meridian-deployment-core-'));
const ledger = join(dir, 'deployment-core.json');
let deploymentId;

before(() => { process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = ledger; });
after(() => { delete process.env.MERIDIAN_DEPLOYMENT_CORE_FILE; rmSync(dir, { recursive: true, force: true }); });

function voiceProject() {
  return {
    id: 'lead_voice_core_test',
    businessName: 'Core Test HVAC',
    primaryNeed: 'voice',
    agency: {
      input: { service: 'voice', tier: 'growth', phone: '+17055550100', businessWebsite: 'https://example.invalid' },
      intake: { hours: 'Mon-Fri 8-6', services: 'Heating and cooling', rules: 'Escalate emergencies', owner: 'Test Owner' },
      proposal: {
        status: 'approved', service: 'voice', tier: 'growth', agentNeed: 'voice',
        acceptanceChecks: [
          'Business hours and approved answers are accurate',
          'Human-transfer and emergency paths behave as agreed',
          'Call outcomes reach the agreed destination',
        ],
      },
    },
  };
}

test('deployment is created once with required voice integrations and hard blockers', () => {
  const first = createDeploymentFromAgencyLead(voiceProject());
  assert.equal(first.ok, true); assert.equal(first.created, true); deploymentId = first.deployment.id;
  assert.equal(first.deployment.status, 'integrating');
  assert.deepEqual(first.deployment.capabilities, ['voice']);
  for (const kind of ['brain','knowledge','telephony','destination','notifications']) assert.ok(first.deployment.integrations[kind], kind);
  assert.equal(first.deployment.readiness.canActivate, false);
  assert.ok(first.deployment.blockers.includes('integration.telephony.credentialConfigured'));
  const again = createDeploymentFromAgencyLead(voiceProject());
  assert.equal(again.created, false); assert.equal(again.deployment.id, deploymentId);
});

test('raw secrets are discarded while credential presence can be recorded', () => {
  const denied = updateIntegration(deploymentId, 'brain', {
    provider: 'openai', status: 'verified', apiKey: 'SHOULD_NEVER_PERSIST', evidence: 'Brain test returned expected structured reply.'
  });
  assert.equal(denied.ok, false); assert.match(denied.error, /credentialConfigured/);

  const current = getDeployment(deploymentId);
  const ok = updateIntegration(deploymentId, 'brain', {
    provider: 'openai', status: 'verified', credentialConfigured: true,
    apiKey: 'SHOULD_NEVER_PERSIST', token: 'ALSO_NEVER_PERSIST',
    externalId: 'project_public_identifier', evidence: 'Brain test returned expected structured reply.'
  }, current.revision);
  assert.equal(ok.ok, true); assert.equal(ok.deployment.integrations.brain.credentialConfigured, true);
  const raw = readFileSync(ledger, 'utf8');
  assert.equal(raw.includes('SHOULD_NEVER_PERSIST'), false); assert.equal(raw.includes('ALSO_NEVER_PERSIST'), false);
});

test('optimistic revision guard rejects stale operator updates', () => {
  const current = getDeployment(deploymentId);
  const changed = updateDeploymentConfig(deploymentId, { profile: { timezone: 'America/Toronto' } }, current.revision);
  assert.equal(changed.ok, true);
  const stale = updateDeploymentConfig(deploymentId, { profile: { serviceArea: 'Sudbury' } }, current.revision);
  assert.equal(stale.ok, false); assert.equal(stale.status, 409);
});

test('activation remains blocked until every integration, QA check, rollback plan and client acceptance pass', () => {
  let attempt = activateDeployment(deploymentId, { evidence: 'premature activation attempt' });
  assert.equal(attempt.ok, false); assert.equal(attempt.status, 409); assert.ok(attempt.blockers.length > 0);

  for (const kind of ['knowledge','telephony','destination','notifications']) {
    const d = getDeployment(deploymentId), requiresCredential = d.integrations[kind].requiresCredential;
    const result = updateIntegration(deploymentId, kind, {
      provider: kind === 'telephony' ? 'twilio' : kind === 'notifications' ? 'resend' : 'meridian',
      status: 'verified', credentialConfigured: requiresCredential,
      evidence: `${kind} integration smoke test passed with expected result.`,
    }, d.revision);
    assert.equal(result.ok, true, kind);
  }

  for (const check of getDeployment(deploymentId).checks) {
    const d = getDeployment(deploymentId);
    const result = recordAcceptanceCheck(deploymentId, check.id, {
      passed: true, checkedBy: 'Meridian QA', evidence: `${check.label} — verified in isolated test.`,
    }, d.revision);
    assert.equal(result.ok, true, check.id);
  }

  let d = getDeployment(deploymentId);
  assert.equal(recordRollbackPlan(deploymentId, {
    documented: true, owner: 'Meridian Ops', summary: 'Disable the new call route and restore the previously verified destination configuration.'
  }, d.revision).ok, true);
  d = getDeployment(deploymentId);
  assert.equal(recordClientAcceptance(deploymentId, {
    accepted: true, acceptedBy: 'Test Owner', evidence: 'Client approved test-call results and scheduled production activation.'
  }, d.revision).ok, true);

  d = getDeployment(deploymentId);
  assert.equal(d.status, 'ready'); assert.equal(d.readiness.canActivate, true); assert.deepEqual(d.blockers, []);
  const live = activateDeployment(deploymentId, { evidence: 'Production route enabled after client approval.' }, d.revision);
  assert.equal(live.ok, true); assert.equal(live.deployment.status, 'live');
});

test('live deployment health is recorded and emergency pause requires a reason', () => {
  let d = getDeployment(deploymentId);
  const health = recordHealth(deploymentId, { status: 'healthy', detail: 'Synthetic call and callback route passed.' }, d.revision);
  assert.equal(health.ok, true); assert.equal(health.deployment.health.status, 'healthy');
  d = getDeployment(deploymentId);
  const badPause = pauseDeployment(deploymentId, { reason: 'bad' }, d.revision); assert.equal(badPause.ok, false);
  const paused = pauseDeployment(deploymentId, { reason: 'Provider incident: inbound calls are failing.' }, d.revision);
  assert.equal(paused.ok, true); assert.equal(paused.deployment.status, 'paused');
});
