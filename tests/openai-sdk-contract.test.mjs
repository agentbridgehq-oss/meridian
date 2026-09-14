import test from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';

test('installed OpenAI SDK exposes Meridian webhook and Realtime call-control APIs', () => {
  const client = new OpenAI({ apiKey: 'test-only-not-a-real-key', webhookSecret: 'test-webhook-secret' });

  assert.equal(typeof client.webhooks?.unwrap, 'function');
  assert.equal(typeof client.webhooks?.verifySignature, 'function');
  assert.equal(typeof client.realtime?.calls?.accept, 'function');
  assert.equal(typeof client.realtime?.calls?.reject, 'function');
  assert.equal(typeof client.realtime?.calls?.refer, 'function');
  assert.equal(typeof client.realtime?.calls?.hangup, 'function');
  assert.equal(typeof OpenAIRealtimeWebSocket, 'function');
});
