import test from 'node:test';
import assert from 'node:assert/strict';
import { connectOpenAIRealtimeSideband } from '../lib/openai-realtime-sideband.mjs';

class FakeSocket {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  emit(type, value = {}) { for (const handler of this.listeners.get(type) || []) handler(value); }
}

class FakeRealtime {
  constructor() { this.socket = new FakeSocket(); this.listeners = new Map(); this.sent = []; this.closeCount = 0; }
  on(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  off(type, handler) { this.listeners.get(type)?.delete(handler); }
  emit(type, value) { for (const handler of this.listeners.get(type) || []) handler(value); }
  send(value) { this.sent.push(value); }
  close() { this.closeCount += 1; this.socket.emit('close'); }
}

function fakeController(log) {
  return {
    async handleServerEvent(event) {
      log.events.push(event);
      if (event.type === 'response.function_call_arguments.done') {
        return {
          ok: true,
          handled: true,
          clientEvents: [
            { type: 'conversation.item.create', item: { type: 'function_call_output', call_id: event.call_id, output: '{"ok":true}' } },
            { type: 'response.create' },
          ],
        };
      }
      return { ok: true, handled: true, clientEvents: [] };
    },
    markConnected(detail) { log.connected.push(detail); },
    markActive(detail) { log.active.push(detail); },
    markEnded(input) { log.ended.push(input); },
  };
}

async function flush() { await new Promise(resolve => setImmediate(resolve)); }

test('sideband adapter attaches by call ID and sends controller tool responses', async () => {
  const rt = new FakeRealtime();
  const log = { events: [], connected: [], active: [], ended: [] };
  let factoryCallId = '';
  const connection = await connectOpenAIRealtimeSideband({
    callId: 'rtc_sideband_123',
    deploymentId: 'dep_sideband_123',
    realtimeFactory: async callId => { factoryCallId = callId; return rt; },
    controllerFactory: () => fakeController(log),
  });
  assert.equal(connection.ok, true);
  assert.equal(factoryCallId, 'rtc_sideband_123');

  rt.socket.emit('open');
  assert.equal(log.connected.length, 1);

  rt.emit('session.updated', { type: 'session.updated' });
  assert.equal(connection.ready, true);
  assert.equal(log.active.length, 1);

  rt.emit('response.output_item.added', { type: 'response.output_item.added', item: { type: 'function_call', call_id: 'tool_1', name: 'meridian_record_call_outcome' } });
  rt.emit('response.function_call_arguments.done', { type: 'response.function_call_arguments.done', call_id: 'tool_1', arguments: '{}' });
  await flush();
  assert.equal(log.events.length, 2);
  assert.deepEqual(rt.sent.map(item => item.type), ['conversation.item.create', 'response.create']);

  connection.close();
  assert.equal(connection.closed, true);
  assert.equal(rt.closeCount, 1);
  assert.equal(log.ended.length, 1);
});

test('sideband adapter captures errors and marks abnormal socket close as failed', async () => {
  const rt = new FakeRealtime();
  const log = { events: [], connected: [], active: [], ended: [] };
  const connection = await connectOpenAIRealtimeSideband({
    callId: 'rtc_sideband_456',
    deploymentId: 'dep_sideband_456',
    realtimeFactory: async () => rt,
    controllerFactory: () => fakeController(log),
  });
  assert.equal(connection.ok, true);
  rt.emit('error', new Error('synthetic websocket failure'));
  rt.socket.emit('close');
  assert.equal(connection.closed, true);
  assert.match(connection.lastError, /synthetic websocket failure/);
  assert.equal(log.ended.length, 1);
  assert.equal(log.ended[0].failed, true);
});

test('sideband adapter validates identity and fails safely if runtime SDK factory fails', async () => {
  const invalid = await connectOpenAIRealtimeSideband({ callId: 'bad', deploymentId: 'dep' });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, 'invalid_call_id');

  const missing = await connectOpenAIRealtimeSideband({
    callId: 'rtc_sideband_789',
    deploymentId: 'dep_sideband_789',
    realtimeFactory: async () => { const error = new Error('not installed'); error.code = 'openai_realtime_sdk_missing'; throw error; },
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'openai_realtime_sdk_missing');
  assert.match(missing.error, /not installed/);
});
