import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('managed runtime is idempotent and stored agent records contain hashes only', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'meridian-managed-runtime-'));
  const previousData = process.env.DATA_DIR;
  const previousLedger = process.env.MERIDIAN_DEPLOYMENT_CORE_FILE;
  process.env.DATA_DIR = dir;
  process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = join(dir, 'deployment-core.json');
  try {
    const { upsertLead, getLead } = await import(`../engine.mjs?managed-runtime-test=${Date.now()}`);
    const core = await import(`../lib/deployment-core.mjs?managed-runtime-test=${Date.now()}`);
    const runtime = await import(`../lib/managed-runtime.mjs?managed-runtime-test=${Date.now()}`);

    const lead = upsertLead({
      email: 'managed-runtime@example.invalid', businessName: 'Managed Runtime HVAC', primaryNeed: 'voice', consent: true,
      agency: {
        input: { service: 'voice', tier: 'growth', phone: '+17055550100', businessWebsite: 'https://example.invalid' },
        intake: { hours: 'Mon-Fri 8-6', services: 'HVAC service', rules: 'Escalate emergencies', owner: 'Owner' },
        proposal: { status: 'approved', service: 'voice', tier: 'growth', agentNeed: 'voice', acceptanceChecks: ['Hours are accurate'] },
      },
    });
    const created = core.createDeploymentFromAgencyLead(lead);
    assert.equal(created.ok, true);

    const first = runtime.provisionManagedRuntime(created.deployment.id);
    assert.equal(first.ok, true); assert.equal(first.created, true); assert.equal(first.runtime.secretAvailable, true);
    assert.ok(first.oneTimeSecret?.agentApiKey);

    const stored = JSON.parse(readFileSync(join(dir, 'agents.json'), 'utf8')).agents[0];
    assert.equal(stored.apiKey, undefined); assert.ok(stored.apiKeyHash);

    const second = runtime.provisionManagedRuntime(created.deployment.id);
    assert.equal(second.ok, true); assert.equal(second.created, false); assert.equal(second.runtime.agentId, first.runtime.agentId);
    assert.equal(second.runtime.secretAvailable, false); assert.equal(second.oneTimeSecret, undefined);

    const freshLead = getLead(lead.id);
    assert.equal(freshLead.managedRuntime.agentId, first.runtime.agentId);
    assert.equal(freshLead.managedRuntime.role, 'control-plane');

    const deployment = core.getDeployment(created.deployment.id);
    assert.equal(deployment.integrations.brain.status, 'pending');
    assert.equal(deployment.integrations.brain.credentialConfigured, false);
  } finally {
    if (previousData === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previousData;
    if (previousLedger === undefined) delete process.env.MERIDIAN_DEPLOYMENT_CORE_FILE; else process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = previousLedger;
    rmSync(dir, { recursive: true, force: true });
  }
});
