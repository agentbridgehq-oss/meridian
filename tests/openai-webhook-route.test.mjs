import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { registerOpenAIRealtimeWebhookRoute } from '../lib/openai-webhook-route.mjs';

async function withServer(configure, run) {
  const app = express();
  configure(app);
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('OpenAI webhook verifier receives exact raw JSON before global JSON parsing', async () => {
  const payload = '{"type":"realtime.call.incoming","data":{"call_id":"rtc_raw_test","sip_headers":[]}}';
  let verifiedBody = null;
  let accepted = null;

  await withServer(app => {
    registerOpenAIRealtimeWebhookRoute(app, {
      environment: 'staging',
      verifyWebhook: async (rawBody, headers) => {
        verifiedBody = rawBody;
        assert.equal(headers['content-type'], 'application/json');
        return JSON.parse(rawBody);
      },
      processWebhook: async (event, options) => {
        assert.equal(event.type, 'realtime.call.incoming');
        accepted = await options.acceptCall({ callId: event.data.call_id, body: { type: 'realtime' } });
        return { ok: true, handled: true, accepted: true, callId: event.data.call_id, deploymentId: 'dep_test' };
      },
      acceptCall: async request => ({ ok: true, request }),
    });
    // This intentionally comes after the OpenAI route. If the route is moved
    // below this parser later, the Buffer/raw-body assertion will fail.
    app.use(express.json());
  }, async base => {
    const response = await fetch(`${base}/api/openai/webhooks/realtime`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, {
      ok: true,
      handled: true,
      accepted: true,
      callId: 'rtc_raw_test',
      deploymentId: 'dep_test',
    });
  });

  assert.equal(verifiedBody, payload);
  assert.equal(accepted.ok, true);
});

test('invalid OpenAI signature fails closed and never reaches the processor', async () => {
  let processed = false;
  await withServer(app => {
    registerOpenAIRealtimeWebhookRoute(app, {
      verifyWebhook: async () => { throw new Error('bad signature'); },
      processWebhook: async () => { processed = true; return { ok: true }; },
    });
    app.use(express.json());
  }, async base => {
    const response = await fetch(`${base}/api/openai/webhooks/realtime`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"type":"realtime.call.incoming"}',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { ok: false, error: 'invalid_openai_webhook' });
  });
  assert.equal(processed, false);
});

test('webhook route refuses a body that was already parsed', async () => {
  await withServer(app => {
    app.use(express.json());
    registerOpenAIRealtimeWebhookRoute(app, {
      verifyWebhook: async () => ({ type: 'realtime.call.incoming' }),
    });
  }, async base => {
    const response = await fetch(`${base}/api/openai/webhooks/realtime`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"type":"realtime.call.incoming"}',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { ok: false, error: 'raw_webhook_body_required' });
  });
});
