import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-realtime-call-ledger-'));
process.env.MERIDIAN_REALTIME_CALL_FILE = path.join(dir, 'realtime-calls.json');

const ledger = await import('../lib/realtime-call-ledger.mjs');

test('records a durable call lifecycle without raw credential fields', () => {
  const incoming = ledger.recordRealtimeCallIncoming({
    callId: 'rtc_ledger_1',
    deploymentId: 'dep_ledger_1',
    routeId: 'route_ledger_1',
    dialedNumber: '+17055550123',
    environment: 'staging',
    apiKey: 'must-never-persist',
  });
  assert.equal(incoming.ok, true);
  assert.equal(incoming.created, true);
  assert.equal(incoming.call.status, 'incoming');

  const authorized = ledger.updateRealtimeCall('rtc_ledger_1', {
    status: 'authorized',
    eventType: 'call.authorized',
    detail: 'All staging ingress gates passed.',
    meta: { authorization: 'must-never-persist', route: 'verified' },
  });
  assert.equal(authorized.ok, true);
  assert.equal(authorized.call.status, 'authorized');

  const accepted = ledger.updateRealtimeCall('rtc_ledger_1', {
    status: 'accepted',
    detail: 'OpenAI accepted the SIP call.',
  });
  assert.ok(accepted.call.acceptedAt);

  const sideband = ledger.updateRealtimeCall('rtc_ledger_1', {
    status: 'sideband_connected',
    detail: 'Meridian sideband connected.',
  });
  assert.ok(sideband.call.sidebandConnectedAt);

  const tool = ledger.recordRealtimeToolResult('rtc_ledger_1', {
    toolName: 'meridian_record_call_outcome',
    ok: true,
    action: 'recorded',
    api_key: 'must-never-persist',
  });
  assert.equal(tool.call.toolCounts.meridian_record_call_outcome, 1);

  const transfer = ledger.recordRealtimeTransfer('rtc_ledger_1', {
    target: 'tel:+17055550199',
    confirmed: true,
  });
  assert.equal(transfer.call.status, 'transferred');
  assert.equal(transfer.call.transfer.confirmed, true);

  const complete = ledger.updateRealtimeCall('rtc_ledger_1', {
    status: 'completed',
    detail: 'Call ended normally.',
  });
  assert.ok(complete.call.endedAt);

  const storedText = fs.readFileSync(process.env.MERIDIAN_REALTIME_CALL_FILE, 'utf8');
  assert.equal(storedText.includes('must-never-persist'), false);
  const reloaded = ledger.getRealtimeCall('rtc_ledger_1');
  assert.equal(reloaded.status, 'completed');
  assert.equal(reloaded.toolCounts.meridian_record_call_outcome, 1);
});

test('incoming call creation is idempotent and terminal failures are auditable', () => {
  const first = ledger.recordRealtimeCallIncoming({
    callId: 'rtc_ledger_2', deploymentId: 'dep_ledger_2', dialedNumber: '+17055550124', environment: 'production',
  });
  const second = ledger.recordRealtimeCallIncoming({
    callId: 'rtc_ledger_2', deploymentId: 'dep_other', dialedNumber: '+17055550125', environment: 'staging',
  });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.call.deploymentId, 'dep_ledger_2');

  const failed = ledger.updateRealtimeCall('rtc_ledger_2', {
    status: 'failed',
    blockerCodes: ['provider.accept_failed'],
    lastError: 'OpenAI provider call failed.',
    detail: 'Provider accept adapter returned an error.',
  });
  assert.equal(failed.call.status, 'failed');
  assert.deepEqual(failed.call.blockerCodes, ['provider.accept_failed']);
  assert.equal(failed.call.lastError, 'OpenAI provider call failed.');
  assert.ok(failed.call.endedAt);
});

test('listing can filter by deployment and summary excludes event history', () => {
  const calls = ledger.listRealtimeCalls({ deploymentId: 'dep_ledger_1', limit: 10 });
  assert.ok(calls.some(call => call.callId === 'rtc_ledger_1'));
  assert.ok(calls.every(call => call.deploymentId === 'dep_ledger_1'));
  const summary = ledger.realtimeCallSummary(calls.find(call => call.callId === 'rtc_ledger_1'));
  assert.equal(summary.callId, 'rtc_ledger_1');
  assert.equal('events' in summary, false);
});

test('rejects malformed call IDs and invalid states', () => {
  const bad = ledger.recordRealtimeCallIncoming({ callId: 'not-a-call', deploymentId: 'dep_x' });
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 400);
  const invalidState = ledger.updateRealtimeCall('rtc_ledger_1', { status: 'invented_state' });
  assert.equal(invalidState.ok, false);
  assert.equal(invalidState.status, 400);
});
