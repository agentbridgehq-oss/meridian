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

    assert.equal(deployment.integrations.calendar.required, false);

    const adapter = await import(`../lib/business-system-adapter.mjs?rt-gateway=${Date.now()}`);
    result = core.updateIntegration(deployment.id, 'calendar', {
      provider:'n8n', status:'verified', credentialConfigured:true,
      endpoint:'https://n8n.example.test/webhook/meridian-calendar',
      evidence:'Live book and cancel test wrote and removed a Google Calendar event.',
    }, deployment.revision);
    assert.equal(result.ok, true); deployment = result.deployment;
    const secretEnv = adapter.connectorSecretEnvName(deployment.id, 'calendar');
    process.env[secretEnv] = 'test-secret-value-12345';
    const names = gateway.realtimeToolDefinitions(deployment).map(x => x.name);
    assert.ok(names.includes('meridian_check_availability'));
    assert.ok(names.includes('meridian_book_appointment'));
    assert.ok(names.includes('meridian_cancel_appointment'));
    assert.ok(names.includes('meridian_reschedule_appointment'));

    const unconfirmed = await gateway.executeRealtimeTool({
      deploymentId: deployment.id,
      name: 'meridian_book_appointment',
      arguments: {
        caller_name:'Test Caller', service:'Tune-up', start_time:'2026-09-15T14:00:00-04:00',
        timezone:'America/Toronto', caller_confirmed_slot:false, consent_to_confirmation:true,
      },
    });
    assert.equal(unconfirmed.ok, false);
    assert.equal(unconfirmed.code, 'slot_not_confirmed');

    const previousFetch = global.fetch;
    global.fetch = async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({ ok:true, confirmed:true, bookingId:'evt_123', start:'2026-09-15T14:00:00-04:00' }),
    });
    try {
      const booked = await gateway.executeRealtimeTool({
        deploymentId: deployment.id,
        name: 'meridian_book_appointment',
        arguments: {
          caller_name:'Test Caller', service:'Tune-up', start_time:'2026-09-15T14:00:00-04:00',
          timezone:'America/Toronto', caller_confirmed_slot:true, consent_to_confirmation:true,
        },
      });
      assert.equal(booked.ok, true);
      assert.equal(booked.confirmed, true);
      assert.equal(booked.action, 'booking_confirmed');
      assert.equal(booked.bookingId, 'evt_123');
    } finally {
      global.fetch = previousFetch;
      delete process.env[secretEnv];
    }
  } finally {
    if (previousData === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previousData;
    if (previousLedger === undefined) delete process.env.MERIDIAN_DEPLOYMENT_CORE_FILE; else process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = previousLedger;
    rmSync(dir, { recursive:true, force:true });
  }
});
