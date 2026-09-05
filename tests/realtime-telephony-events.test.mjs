import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeSidebandController } from '../lib/realtime-sideband-controller.mjs';

function controllerWithAudit(events) {
  return createRealtimeSidebandController({
    deploymentId: 'dep_test',
    sessionCallId: 'rtc_test_1',
    executeTool: async () => ({ ok: false }),
    referCall: async () => ({ ok: true }),
    recordToolResult: () => {},
    recordTransfer: () => {},
    updateCall: (_id, input) => events.push(input),
  });
}

test('DTMF is observed without persisting the keypad digit', async () => {
  const events = [];
  const controller = controllerWithAudit(events);
  const result = await controller.handleServerEvent({ type: 'input_audio_buffer.dtmf_event_received', event: '9', received_at: 123 });
  assert.equal(result.ok, true);
  assert.equal(result.capability, 'dtmf');
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, 'dtmf.received');
  assert.equal(JSON.stringify(events[0]).includes('9'), false);
});

test('idle recovery and caller interruption are auditable', async () => {
  const events = [];
  const controller = controllerWithAudit(events);
  await controller.handleServerEvent({ type: 'input_audio_buffer.timeout_triggered' });
  await controller.handleServerEvent({ type: 'output_audio_buffer.cleared', response_id: 'resp_1' });
  assert.equal(events[0].eventType, 'call.idle_timeout');
  assert.equal(events[1].eventType, 'call.interrupted');
  assert.equal(events.every(event => event.status === 'active'), true);
});
