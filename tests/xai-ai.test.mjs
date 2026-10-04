/**
 * xAI switch (Kenny 2026-10-04: all Meridian AI on xAI). Everything is mocked —
 * no test ever reaches api.x.ai (the box key has no credits / returns 403).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-xai-'));
process.env.DATA_DIR = dir;
process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = path.join(dir, 'deployment-core.json');
process.env.MERIDIAN_INBOUND_ROUTE_FILE = path.join(dir, 'inbound-routes.json');
process.env.MERIDIAN_REALTIME_CALL_FILE = path.join(dir, 'realtime-calls.json');
delete process.env.MERIDIAN_AI_PROVIDER;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.XAI_TEXT_MODEL;
delete process.env.XAI_MODEL;
delete process.env.XAI_VOICE_MODEL;

const FAKE_KEY = 'xai-test-key-not-real';
const realFetch = globalThis.fetch;

const xaiLlm = await import('../lib/xai-llm.mjs');
const aiProvider = await import('../lib/ai-provider.mjs');
const brain = await import('../lib/agent-brain.mjs');
const adapter = await import('../lib/xai-realtime-adapter.mjs');
const xaiConfig = await import('../lib/xai-realtime-config.mjs');
const { upsertLead, getLead } = await import('../engine.mjs');
const core = await import('../lib/deployment-core.mjs');
const { provisionManagedRuntime } = await import('../lib/managed-runtime.mjs');
const routing = await import('../lib/inbound-routing.mjs');
const ingress = await import('../lib/openai-realtime-ingress.mjs');
const ledger = await import('../lib/realtime-call-ledger.mjs');
const billing = await import('../lib/usage-billing.mjs');

function withEnv(patch, fn) {
  const prev = {};
  for (const k of Object.keys(patch)) { prev[k] = process.env[k]; if (patch[k] === undefined) delete process.env[k]; else process.env[k] = patch[k]; }
  const restore = () => { for (const k of Object.keys(patch)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } };
  try {
    const out = fn();
    if (out && typeof out.then === 'function') return out.finally(restore);
    restore();
    return out;
  } catch (e) { restore(); throw e; }
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/* ---------------- text brain ---------------- */

test('xAI text brain: default model grok-4.3, Bearer XAI_API_KEY, chat completions endpoint (mock fetch)', async () => {
  await withEnv({ XAI_API_KEY: FAKE_KEY }, async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse(200, { id: 'x1', model: 'grok-4.3', choices: [{ message: { content: 'We open at 8.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
    };
    const r = await xaiLlm.callXaiAgent({ system: 'sys', message: 'hours?', history: [{ role: 'assistant', content: 'hi' }], fetchImpl });
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'xai');
    assert.equal(r.reply, 'We open at 8.');
    assert.deepEqual(r.usage, { inputTokens: 100, outputTokens: 20, reasoningTokens: 0 });
    assert.equal(calls[0].url, 'https://api.x.ai/v1/chat/completions');
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${FAKE_KEY}`);
    assert.equal(calls[0].body.model, 'grok-4.3');
    assert.deepEqual(calls[0].body.messages.map(m => m.role), ['system', 'assistant', 'user']);
  });
  assert.equal(xaiLlm.xaiTextModel(), 'grok-4.3');
  await withEnv({ XAI_TEXT_MODEL: 'grok-4.7' }, () => assert.equal(xaiLlm.xaiTextModel(), 'grok-4.7'));
});

test('xAI text brain: 403 (no credits) and missing key fail closed without throwing', async () => {
  await withEnv({ XAI_API_KEY: FAKE_KEY }, async () => {
    const r = await xaiLlm.callXaiAgent({ message: 'hi', fetchImpl: async () => jsonResponse(403, { error: 'no credits' }) });
    assert.equal(r.ok, false);
    assert.equal(r.httpStatus, 403);
    const t = await xaiLlm.callXaiAgent({ message: 'hi', fetchImpl: async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); } });
    assert.equal(t.error, 'timeout');
  });
  await withEnv({ XAI_API_KEY: undefined }, async () => {
    const r = await xaiLlm.callXaiAgent({ message: 'hi', fetchImpl: async () => { throw new Error('must not be called'); } });
    assert.equal(r.error, 'XAI_API_KEY_missing');
  });
});

test('agent brain: xAI is the default provider, falls back to regex on 403, legacy never calls xAI', async () => {
  const agent = { id: 'agent_xai_brain', name: 'Test HVAC', businessName: 'Test HVAC', config: {}, knowledge: {} };
  assert.equal(aiProvider.aiProvider(), 'xai');
  assert.equal(aiProvider.voiceProvider(), 'xai');
  let hits = 0;
  globalThis.fetch = async (url) => { hits += 1; assert.match(String(url), /api\.x\.ai/); return jsonResponse(403, { error: 'Forbidden: no credits' }); };
  try {
    await withEnv({ XAI_API_KEY: FAKE_KEY }, async () => {
      assert.equal(brain.brainStatus().provider, 'xai');
      assert.equal(brain.brainStatus().model, 'grok-4.3');
      const r = await brain.smartAgentChat(agent, 'What are your hours?');
      assert.equal(r.source, 'fallback');
      assert.equal(r.provider, 'regex');
      assert.match(r.llmError, /no credits/);
      assert.equal(hits, 1);
    });
    globalThis.fetch = async () => jsonResponse(200, { model: 'grok-4.3', choices: [{ message: { content: 'Mon-Fri 8-5.' } }] });
    await withEnv({ XAI_API_KEY: FAKE_KEY }, async () => {
      const r = await brain.smartAgentChat(agent, 'What are your hours?');
      assert.equal(r.source, 'llm');
      assert.equal(r.provider, 'xai');
    });
    hits = 0;
    globalThis.fetch = async () => { hits += 1; throw new Error('legacy must not call xAI'); };
    await withEnv({ XAI_API_KEY: FAKE_KEY, MERIDIAN_AI_PROVIDER: 'legacy' }, async () => {
      assert.equal(aiProvider.voiceProvider(), 'openai');
      const r = await brain.smartAgentChat(agent, 'What are your hours?');
      assert.equal(r.provider, 'regex');
      assert.equal(hits, 0);
      assert.equal(brain.brainStatus().aiProvider, 'legacy');
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('callTextModel ignores Anthropic model names when routing to xAI', async () => {
  await withEnv({ XAI_API_KEY: FAKE_KEY }, async () => {
    let body;
    globalThis.fetch = async (_u, init) => { body = JSON.parse(init.body); return jsonResponse(200, { choices: [{ message: { content: 'ok' } }] }); };
    try {
      const r = await aiProvider.callTextModel({ system: 's', message: 'm', model: 'claude-haiku-4-5' });
      assert.equal(r.ok, true);
      assert.equal(body.model, 'grok-4.3');
    } finally { globalThis.fetch = realFetch; }
  });
});

/* ---------------- webhook signature ---------------- */

test('xAI webhook verification: Standard-Webhooks HMAC, rejects tamper / stale / missing secret', async () => {
  const secret = 'whsec_' + Buffer.from('meridian-test-secret').toString('base64');
  const body = JSON.stringify({ type: 'realtime.call.incoming', data: { call_id: '00000000-0000-0000-0000-000000000001' } });
  const now = Date.now();
  const ts = String(Math.floor(now / 1000));
  const sig = adapter.signXaiWebhook({ id: 'evt_1', timestamp: ts, body, secret });
  const headers = { 'webhook-id': 'evt_1', 'webhook-timestamp': ts, 'webhook-signature': `v1,bogus ${sig}` };
  const event = await adapter.verifyXaiWebhook(body, headers, { secret, now });
  assert.equal(event.type, 'realtime.call.incoming');
  await assert.rejects(adapter.verifyXaiWebhook(body.replace('0001', '0002'), headers, { secret, now }), { code: 'xai_webhook_signature_invalid' });
  await assert.rejects(adapter.verifyXaiWebhook(body, headers, { secret, now: now + 3600_000 }), { code: 'xai_webhook_timestamp_invalid' });
  await assert.rejects(adapter.verifyXaiWebhook(body, { ...headers, 'webhook-id': '' }, { secret, now }), { code: 'xai_webhook_headers_missing' });
  await assert.rejects(adapter.verifyXaiWebhook(body, headers, { secret: '', now }), { code: 'xai_webhook_secret_missing' });
  // Plain (non-whsec_) secret also supported.
  const plain = 'plain-secret-value';
  const sig2 = adapter.signXaiWebhook({ id: 'evt_2', timestamp: ts, body, secret: plain });
  assert.equal((await adapter.verifyXaiWebhook(body, { 'webhook-id': 'evt_2', 'webhook-timestamp': ts, 'webhook-signature': sig2 }, { secret: plain, now })).type, 'realtime.call.incoming');
});

/* ---------------- call control ---------------- */

test('xAI call control: refer/hangup hit documented REST paths; reject = refer to team line else hangup', async () => {
  const callId = '11111111-2222-3333-4444-555555555555';
  await withEnv({ XAI_API_KEY: FAKE_KEY }, async () => {
    const seen = [];
    const ok = async (url, init) => { seen.push({ url, body: JSON.parse(init.body || '{}'), auth: init.headers.Authorization }); return jsonResponse(200, {}); };
    await adapter.referXaiRealtimeCall({ callId, targetUri: 'tel:+17055550999', fetchImpl: ok });
    await adapter.hangupXaiRealtimeCall({ callId, fetchImpl: ok });
    assert.equal(seen[0].url, `https://api.x.ai/v1/realtime/calls/${callId}/refer`);
    assert.deepEqual(seen[0].body, { target_uri: 'tel:+17055550999' });
    assert.equal(seen[0].auth, `Bearer ${FAKE_KEY}`);
    assert.equal(seen[1].url, `https://api.x.ai/v1/realtime/calls/${callId}/hangup`);

    await assert.rejects(adapter.referXaiRealtimeCall({ callId, targetUri: 'tel:+1', fetchImpl: async () => jsonResponse(502, { error: 'transfer rejected by downstream: SIP 486 Busy' }) }), e => e.httpStatus === 502 && /486/.test(e.message));
    await assert.rejects(adapter.referXaiRealtimeCall({ callId, targetUri: 'https://x', fetchImpl: ok }), { code: 'xai_refer_target_invalid' });
    await assert.rejects(adapter.hangupXaiRealtimeCall({ callId: '../../etc', fetchImpl: ok }), { code: 'xai_call_id_invalid' });

    const actions = [];
    const failRefer = async (url) => { actions.push(url.split('/').pop()); return url.endsWith('/refer') ? jsonResponse(502, { error: 'busy' }) : jsonResponse(200, {}); };
    assert.equal((await adapter.rejectXaiRealtimeCall({ callId, statusCode: 480, transferUri: 'tel:+17055550999', fetchImpl: ok })).action, 'transferred');
    assert.equal((await adapter.rejectXaiRealtimeCall({ callId, statusCode: 480, transferUri: 'tel:+17055550999', fetchImpl: failRefer })).action, 'hangup');
    assert.deepEqual(actions, ['refer', 'hangup']);
    assert.equal((await adapter.rejectXaiRealtimeCall({ callId, fetchImpl: ok })).action, 'hangup');
  });
});

/* ---------------- realtime WebSocket (fake) ---------------- */

class FakeWS {
  static last = null;
  constructor(url, opts) {
    this.url = url; this.opts = opts; this.sent = []; this.listeners = {}; this.readyState = 0;
    FakeWS.last = this;
    queueMicrotask(() => { this.readyState = 1; this.emit('open', {}); });
  }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter(f => f !== fn); }
  emit(t, e) { for (const fn of this.listeners[t] || []) fn(e); }
  send(s) { this.sent.push(JSON.parse(s)); }
  server(event) { this.emit('message', { data: JSON.stringify(event) }); }
  close() { this.readyState = 3; this.emit('close', {}); }
}

test('xAI accept joins wss://api.x.ai/v1/realtime?call_id=… with Bearer key, sends session.update then response.create; sideband reuses it', async () => {
  const callId = '22222222-2222-3333-4444-555555555555';
  await withEnv({ XAI_API_KEY: FAKE_KEY }, async () => {
    const session = { voice: 'eve', instructions: 'Be brief.', turn_detection: { type: 'server_vad' }, tools: [] };
    const r = await adapter.acceptXaiRealtimeCall({ callId, body: { model: 'grok-voice-think-fast-2.0', session }, WebSocketImpl: FakeWS });
    assert.equal(r.ok, true);
    const ws = FakeWS.last;
    assert.equal(ws.url, `wss://api.x.ai/v1/realtime?call_id=${callId}`);
    assert.equal(ws.opts.headers.Authorization, `Bearer ${FAKE_KEY}`);
    assert.deepEqual(ws.sent.map(e => e.type), ['session.update', 'response.create']);
    assert.deepEqual(ws.sent[0].session, session);

    // session.updated arrives BEFORE the sideband attaches — must not be lost.
    ws.server({ type: 'session.updated', session: {} });
    const sb = await adapter.connectXaiRealtimeSideband({
      callId, deploymentId: 'dep_fake',
      controllerFactory: () => ({ markConnected() {}, markActive() {}, markEnded() {}, handleServerEvent: async () => ({ clientEvents: [] }) }),
    });
    assert.equal(sb.ok, true);
    await new Promise(r => setTimeout(r, 5));
    assert.equal(sb.ready, true);
    ws.close();
    await new Promise(r => setTimeout(r, 5));
    assert.equal(sb.closed, true);
    assert.equal(adapter._xaiConnectionsForTest().has(callId), false);
  });
  await withEnv({ XAI_API_KEY: FAKE_KEY }, async () => {
    const sb = await adapter.connectXaiRealtimeSideband({ callId: '33333333-2222-3333-4444-555555555555', deploymentId: 'dep_fake' });
    assert.equal(sb.ok, false);
    assert.equal(sb.code, 'xai_realtime_not_accepted');
  });
});

test('xAI sideband forwards tool calls through the Meridian controller and returns function_call_output', async () => {
  const callId = '44444444-2222-3333-4444-555555555555';
  await withEnv({ XAI_API_KEY: FAKE_KEY }, async () => {
    await adapter.acceptXaiRealtimeCall({ callId, body: { session: {} }, WebSocketImpl: FakeWS });
    const ws = FakeWS.last;
    const handled = [];
    const sb = await adapter.connectXaiRealtimeSideband({
      callId, deploymentId: 'dep_fake',
      controllerFactory: () => ({
        markConnected() {}, markActive() {}, markEnded() {},
        handleServerEvent: async e => { handled.push(e.type); return { clientEvents: [{ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: e.call_id, output: '{"ok":true}' } }, { type: 'response.create' }] }; },
      }),
    });
    assert.equal(sb.ok, true);
    await new Promise(r => setTimeout(r, 1));
    ws.server({ type: 'response.function_call_arguments.done', call_id: 'fc_1', name: 'capture_lead', arguments: '{}' });
    await new Promise(r => setTimeout(r, 5));
    assert.deepEqual(handled, ['response.function_call_arguments.done']);
    assert.deepEqual(ws.sent.slice(-2).map(e => e.type), ['conversation.item.create', 'response.create']);
    sb.close();
  });
});

/* ---------------- ingress with provider xai (caps / metering intact) ---------------- */

function xaiIncoming(number, callId) {
  return { type: 'realtime.call.incoming', data: { call_id: callId, sip_headers: [{ name: 'From', value: '+14165550100' }, { name: 'To', value: number }], metadata: {} } };
}

function xaiDeployment(number, { transfer = false } = {}) {
  const lead = upsertLead({
    email: `xai-${number.replace(/\D/g, '')}@example.invalid`, businessName: `xAI HVAC ${number}`, primaryNeed: 'voice', consent: true,
    agency: {
      input: { service: 'voice', tier: 'foundation', phone: number, businessWebsite: 'https://example.invalid' },
      intake: { hours: 'Mon-Fri 8-5', services: 'HVAC', owner: 'Operations' },
      proposal: { status: 'approved', service: 'voice', tier: 'foundation', agentNeed: 'voice', acceptanceChecks: [] },
    },
  });
  let deployment = core.createDeploymentFromAgencyLead(lead).deployment;
  assert.equal(provisionManagedRuntime(deployment.id).ok, true);
  deployment = core.updateIntegration(deployment.id, 'brain', { provider: 'xai', status: 'configured', credentialConfigured: true }).deployment;
  deployment = core.updateIntegration(deployment.id, 'telephony', { provider: 'twilio-sip', status: 'configured', credentialConfigured: true }).deployment;
  if (transfer) {
    core.updateDeploymentConfig(deployment.id, { agent: { ...(core.getDeployment(deployment.id).config?.agent || {}), humanTransfer: '+17055550999' } });
    core.updateIntegration(deployment.id, 'destination', { provider: 'twilio', status: 'verified', credentialConfigured: true, evidence: 'Owner line answered a test transfer.' });
  }
  const route = routing.upsertInboundRoute({ deploymentId: deployment.id, dialedNumber: number, environment: 'staging', provider: 'twilio-sip' }).route;
  assert.equal(routing.setInboundRouteEnabled(route.id, true, { evidence: 'Staging SIP route verified (xAI test).' }).ok, true);
  return deployment;
}

function activate(deploymentId, plan = 'rescue') {
  const agentId = getLead(core.getDeployment(deploymentId).projectId).managedRuntime.agentId;
  const acc = billing.ensureBillingAccount({ agentId, email: `${agentId}@example.invalid` });
  assert.equal(billing.activateSubscription(acc.id, plan).ok, true);
  return acc;
}

test('ingress provider xai: UUID call id, XAI key + brain.provider xai gates, xAI session body', async () => {
  const number = '+17055550161';
  const deployment = xaiDeployment(number);
  assert.ok(deployment.id);
  const callId2 = '66666666-2222-3333-4444-555555555555';
  let acceptBody = null, attachInput = null;
  const result = await ingress.processVerifiedRealtimeWebhook(xaiIncoming(number, callId2), {
    provider: 'xai', providerConfigured: true, environment: 'staging', requireSideband: true,
    acceptCall: async ({ body }) => { acceptBody = body; },
    attachSideband: async input => { attachInput = input; return { ok: true }; },
    rejectCall: async () => { throw new Error('should not reject'); },
    hangupCall: async () => {},
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.accepted, true);
  assert.equal(acceptBody.model, 'grok-voice-think-fast-2.0');
  assert.equal(acceptBody.session.voice, 'eve');
  assert.deepEqual(acceptBody.session.turn_detection, { type: 'server_vad' });
  assert.match(acceptBody.session.instructions, /Never invent prices/);
  assert.equal(attachInput.callId, callId2);
  assert.equal(ledger.getRealtimeCall(callId2).provider, 'xai-realtime');

  // Missing XAI key / wrong brain provider are blockers.
  const plan = ingress.planRealtimeIncoming(xaiIncoming(number, '77777777-2222-3333-4444-555555555555'), { provider: 'xai', providerConfigured: false, environment: 'staging' });
  assert.ok(plan.blockers.includes('runtime_environment.XAI_API_KEY'));
  const asOpenAI = ingress.planRealtimeIncoming(xaiIncoming(number, 'rtc_test_123'), { openAIConfigured: true, environment: 'staging' });
  assert.ok(asOpenAI.blockers.includes('integration.brain.provider.openai'));
  const badId = ingress.planRealtimeIncoming(xaiIncoming(number, 'bad id!'), { provider: 'xai', providerConfigured: true });
  assert.equal(badId.ok, false);
});

/* ---------------- HTTP route end to end (signed webhook, mocked provider) ---------------- */

test('POST /api/xai/webhooks/realtime verifies the signature on the raw body and runs the shared ingress', async () => {
  const express = (await import('express')).default;
  const { registerXaiRealtimeWebhookRoute, XAI_WEBHOOK_PATH } = await import('../lib/xai-webhook-route.mjs');
  const secret = 'whsec_' + Buffer.from('route-secret').toString('base64');
  const seen = [];
  const app = express();
  registerXaiRealtimeWebhookRoute(app, {
    verifyWebhook: (raw, headers) => adapter.verifyXaiWebhook(raw, headers, { secret }),
    processWebhook: async (event, opts) => { seen.push({ event, provider: opts.provider }); return { ok: true, handled: true, accepted: true, callId: event.data.call_id }; },
  });
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}${XAI_WEBHOOK_PATH}`;
  try {
    const body = JSON.stringify(xaiIncoming('+17055550163', '99999999-2222-3333-4444-555555555555'));
    const ts = String(Math.floor(Date.now() / 1000));
    const good = await realFetch(base, { method: 'POST', headers: { 'content-type': 'application/json', 'webhook-id': 'evt_r', 'webhook-timestamp': ts, 'webhook-signature': adapter.signXaiWebhook({ id: 'evt_r', timestamp: ts, body, secret }) }, body });
    assert.equal(good.status, 200);
    assert.equal((await good.json()).accepted, true);
    assert.equal(seen[0].provider, 'xai');
    const bad = await realFetch(base, { method: 'POST', headers: { 'content-type': 'application/json', 'webhook-id': 'evt_r', 'webhook-timestamp': ts, 'webhook-signature': 'v1,AAAA' }, body });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error, 'invalid_xai_webhook');
    assert.equal(seen.length, 1);
  } finally {
    await new Promise(r => server.close(r));
  }
});

test('xAI realtime config: pinned voice model, eve default, OpenAI voice names not leaked to xAI', () => {
  assert.equal(xaiConfig.xaiVoiceModel(), 'grok-voice-think-fast-2.0');
  assert.equal(xaiConfig.xaiVoiceFor({ voice: 'marin' }), 'eve');
  assert.equal(xaiConfig.xaiVoiceFor({ xaiVoice: 'Ara' }), 'ara');
  withEnv({ XAI_VOICE_MODEL: 'grok-voice-latest' }, () => assert.equal(xaiConfig.xaiVoiceModel(), 'grok-voice-latest'));
});
