import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeSidebandController } from '../lib/realtime-sideband-controller.mjs';

test('sideband maps function call name, executes once and returns function output plus response.create', async () => {
  const calls = [];
  const controller = createRealtimeSidebandController({
    deploymentId: 'dep_test',
    sessionCallId: 'rtc_session_123',
    executeTool: async input => { calls.push(input); return { ok: true, action: 'recorded', interactionId: 'ix_1' }; },
    referCall: async () => { throw new Error('not expected'); },
  });

  const added = await controller.handleServerEvent({
    type: 'response.output_item.added',
    item: { type: 'function_call', call_id: 'call_tool_1', name: 'meridian_record_call_outcome' },
  });
  assert.equal(added.ok, true);
  assert.deepEqual(added.clientEvents, []);

  const done = await controller.handleServerEvent({
    type: 'response.function_call_arguments.done',
    call_id: 'call_tool_1',
    arguments: '{"intent":"service","summary":"Caller requested service.","urgency":"normal","consent_to_follow_up":true}',
  });
  assert.equal(done.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].deploymentId, 'dep_test');
  assert.equal(calls[0].name, 'meridian_record_call_outcome');
  assert.equal(done.clientEvents[0].type, 'conversation.item.create');
  assert.equal(done.clientEvents[0].item.type, 'function_call_output');
  assert.equal(done.clientEvents[0].item.call_id, 'call_tool_1');
  assert.deepEqual(JSON.parse(done.clientEvents[0].item.output), { ok: true, action: 'recorded', interactionId: 'ix_1' });
  assert.equal(done.clientEvents[1].type, 'response.create');

  const duplicate = await controller.handleServerEvent({
    type: 'response.function_call_arguments.done', call_id: 'call_tool_1', arguments: '{}',
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(calls.length, 1);
});

test('sideband confirms handoff only after provider REFER succeeds', async () => {
  const refers = [];
  const controller = createRealtimeSidebandController({
    deploymentId: 'dep_test',
    sessionCallId: 'rtc_session_456',
    executeTool: async () => ({ ok: true, action: 'provider_refer_required', destination: '+17055550199', interactionId: 'ix_handoff' }),
    referCall: async input => { refers.push(input); return { ok: true }; },
  });
  const done = await controller.handleServerEvent({
    type: 'response.function_call_arguments.done',
    call_id: 'call_handoff',
    name: 'meridian_request_human_handoff',
    arguments: '{"reason":"Caller asked for the owner","urgency":"normal"}',
  });
  assert.equal(done.ok, true);
  assert.deepEqual(refers, [{ callId: 'rtc_session_456', targetUri: 'tel:+17055550199' }]);
  assert.equal(done.toolResult.action, 'transferred');
  assert.equal(done.toolResult.transferConfirmed, true);
  const output = JSON.parse(done.clientEvents[0].item.output);
  assert.equal(output.transferConfirmed, true);
});

test('sideband reports transfer failure instead of inventing success', async () => {
  const controller = createRealtimeSidebandController({
    deploymentId: 'dep_test',
    sessionCallId: 'rtc_session_789',
    executeTool: async () => ({ ok: true, action: 'provider_refer_required', destination: '+17055550198', interactionId: 'ix_handoff_fail' }),
    referCall: async () => { throw new Error('provider rejected transfer'); },
  });
  const done = await controller.handleServerEvent({
    type: 'response.function_call_arguments.done',
    call_id: 'call_handoff_fail',
    name: 'meridian_request_human_handoff',
    arguments: '{"reason":"Caller needs a human","urgency":"urgent"}',
  });
  assert.equal(done.ok, false);
  assert.equal(done.toolResult.code, 'provider_refer_failed');
  assert.equal(done.toolResult.transferConfirmed, false);
  assert.match(done.toolResult.message, /Do not tell the caller/);
});

test('sideband fails closed on missing tool name and malformed arguments', async () => {
  let executions = 0;
  const controller = createRealtimeSidebandController({
    deploymentId: 'dep_test', sessionCallId: 'rtc_test',
    executeTool: async () => { executions += 1; return { ok: true }; },
  });
  const unnamed = await controller.handleServerEvent({
    type: 'response.function_call_arguments.done', call_id: 'call_no_name', arguments: '{}',
  });
  assert.equal(unnamed.ok, false);
  assert.equal(unnamed.toolResult.code, 'tool_name_missing');

  const malformed = await controller.handleServerEvent({
    type: 'response.function_call_arguments.done', call_id: 'call_bad_json', name: 'meridian_record_call_outcome', arguments: '{bad json',
  });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.toolResult.code, 'invalid_arguments');
  assert.equal(executions, 0);
});

test('sideband reports connection, tool, transfer and end lifecycle through audit hooks', async () => {
  const callUpdates = [];
  const toolResults = [];
  const transfers = [];
  const controller = createRealtimeSidebandController({
    deploymentId: 'dep_audit',
    sessionCallId: 'rtc_audit_1',
    executeTool: async () => ({ ok: true, action: 'provider_refer_required', destination: '+17055550197', interactionId: 'ix_audit' }),
    referCall: async () => ({ ok: true }),
    updateCall: (callId, input) => { callUpdates.push({ callId, input }); return { ok: true }; },
    recordToolResult: (callId, input) => { toolResults.push({ callId, input }); return { ok: true }; },
    recordTransfer: (callId, input) => { transfers.push({ callId, input }); return { ok: true }; },
  });

  controller.markConnected();
  controller.markActive();
  const done = await controller.handleServerEvent({
    type: 'response.function_call_arguments.done',
    call_id: 'call_audit_handoff',
    name: 'meridian_request_human_handoff',
    arguments: '{"reason":"Needs owner","urgency":"normal"}',
  });
  controller.markEnded({ detail: 'Provider session closed normally.' });

  assert.equal(done.ok, true);
  assert.deepEqual(callUpdates.map(entry => entry.input.status), ['sideband_connected', 'active', 'completed']);
  assert.deepEqual(transfers, [
    { callId: 'rtc_audit_1', input: { target: 'tel:+17055550197', confirmed: false } },
    { callId: 'rtc_audit_1', input: { target: 'tel:+17055550197', confirmed: true } },
  ]);
  assert.equal(toolResults.length, 1);
  assert.equal(toolResults[0].input.toolName, 'meridian_request_human_handoff');
  assert.equal(toolResults[0].input.ok, true);
  assert.equal(toolResults[0].input.action, 'transferred');
});
