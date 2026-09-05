import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Realtime sideband gateway records outcomes and exposes handoff only after verification', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'meridian-realtime-gateway-'));
  const previousData = process.env.DATA_DIR;
  const previousLedger = process.env.MERIDIAN_DEPLOYMENT_CORE_FILE;
  process.env.DATA_DIR = dir;
  process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = join(dir, 'deployment-core.json');
  try {
    const engine = await import(`../engine.mjs?rt-gateway=${Date.now()}`);
    const core = await import(`../lib/deployment-core.mjs?rt-gateway=${Date.now()}`);
    const runtime = await import(`../lib/managed-runtime.mjs?rt-gateway=${Date.now()}`);
    const gateway = await import(`../lib/realtime-tool-gateway.mjs?rt-gateway=${Date.now()}`);

    const lead = engine.upsertLead({
      email: 'realtime-gateway@example.invalid', businessName: 'Realtime Gateway HVAC', primaryNeed: 'voice', consent: true,
      agency: {
        input: { service:'voice', tier:'growth', phone:'+17055550100' },
        intake: { hours:'Mon-Fri 8-6', services:'HVAC service', rules:'Escalate urgent calls', owner:'Owner' },
        proposal: { status:'approved', service:'voice', tier:'growth', agentNeed:'voice', acceptanceChecks:['Hours are accurate'] },
      },
    });
    const created = core.createDeploymentFromAgencyLead(lead);
    assert.equal(created.ok, true);
    assert.equal(runtime.provisionManagedRuntime(created.deployment.id).ok, true);

    let deployment = core.getDeployment(created.deployment.id);
    assert.deepEqual(gateway.realtimeToolDefinitions(deployment).map(x => x.name), ['meridian_record_call_outcome']);

    const outcome = gateway.executeRealtimeTool({
      deploymentId: deployment.id,
      name: 'meridian_record_call_outcome',
      arguments: { intent:'service_request', summary:'Caller requested an HVAC service estimate.', urgency:'normal', consent_to_follow_up:true, caller_name:'Test Caller', callback_number:'+17055550199' },
    });
    assert.equal(outcome.ok, true); assert.equal(outcome.action, 'recorded'); assert.match(outcome.interactionId, /^ix_/);

    const unavailableBooking = gateway.executeRealtimeTool({ deploymentId:deployment.id, name:'meridian_request_booking', arguments:{ service:'HVAC', requested_time:'tomorrow' } });
    assert.equal(unavailableBooking.ok, false); assert.equal(unavailableBooking.code, 'tool_not_available');

    let result = core.updateDeploymentConfig(deployment.id, { agent:{ humanTransfer:'+17055550123' } }, deployment.revision);
    assert.equal(result.ok, true); deployment = result.deployment;
    result = core.updateIntegration(deployment.id, 'destination', { provider:'meridian', status:'verified', evidence:'Approved destination routing test passed.' }, deployment.revision);
    assert.equal(result.ok, true); deployment = result.deployment;

    assert.deepEqual(gateway.realtimeToolDefinitions(deployment).map(x => x.name), ['meridian_record_call_outcome','meridian_request_human_handoff']);
    const handoff = gateway.executeRealtimeTool({ deploymentId:deployment.id, name:'meridian_request_human_handoff', arguments:{ reason:'Caller asked for a technician.', urgency:'normal', callback_number:'+17055550199' } });
    assert.equal(handoff.ok, true); assert.equal(handoff.action, 'provider_refer_required'); assert.equal(handoff.destination, '+17055550123');
    assert.match(handoff.instruction, /provider refer operation/);
  } finally {
    if (previousData === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previousData;
    if (previousLedger === undefined) delete process.env.MERIDIAN_DEPLOYMENT_CORE_FILE; else process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = previousLedger;
    rmSync(dir, { recursive:true, force:true });
  }
});
