// Twilio inbound webhook routes must be reachable on the real server.
// Boots server.mjs with dummy, local-only Twilio values (no real account, no
// network calls to Twilio) and signs requests exactly like Twilio does.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import crypto from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const dataDir = mkdtempSync(join(tmpdir(), 'meridian-twilio-test-'));
const authToken = 'local-dummy-twilio-auth-token';
const webhookToken = 'local-dummy-webhook-token';
let child, base, logs = '';

function sign(url, params) {
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + String(params[k] ?? '');
  return crypto.createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}

async function twilioPost(path, params, { signature, badSignature = false } = {}) {
  const url = base + path;
  const sig = signature ?? (badSignature ? 'AAAA' + sign(url, params).slice(4) : sign(url, params));
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'TwilioProxy/1.1' };
  if (sig) headers['X-Twilio-Signature'] = sig;
  const response = await fetch(url, { method: 'POST', headers, body: new URLSearchParams(params).toString() });
  return { status: response.status, type: response.headers.get('content-type') || '', text: await response.text() };
}

before(async () => {
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port; await new Promise((r) => socket.close(r));
  base = `http://127.0.0.1:${port}`;
  // Env allowlist: never inherit real provider credentials.
  child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: {
    PATH: process.env.PATH, PORT: String(port), DATA_DIR: dataDir, PUBLIC_BASE_URL: base,
    TWILIO_AUTH_TOKEN: authToken, TWILIO_WEBHOOK_TOKEN: webhookToken,
    MERIDIAN_OPENCLAW_AUTO: '0', MERIDIAN_AUTOPILOT: '0', MERIDIAN_HEALTH_PROBE: '0', MERIDIAN_KNOWLEDGE_REFRESH: '0', MERIDIAN_ARTICLES: '0',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (x) => (logs += x)); child.stderr.on('data', (x) => (logs += x));
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(logs);
    try { if ((await fetch(base + '/healthz')).status === 200) return; } catch {}
    await new Promise((r) => setTimeout(r, 70));
  }
  throw new Error(`Startup failed: ${logs}`);
});

after(async () => {
  if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
  rmSync(dataDir, { recursive: true, force: true });
});

test('server.mjs mounts Twilio routes after body parsing and before the static/404 fallback', () => {
  const server = readFileSync(join(root, 'server.mjs'), 'utf8');
  assert.ok(server.includes("import { registerTwilioRoutes } from './lib/twilio-routes.mjs';"));
  const mount = server.indexOf('registerTwilioRoutes(app, { BASE });');
  assert.ok(mount > 0, 'registerTwilioRoutes call missing');
  assert.ok(mount > server.indexOf('app.use(express.urlencoded({ extended: true }));'));
  assert.ok(mount < server.indexOf('app.use(express.static('));
  assert.ok(mount < server.indexOf("app.get('*'"));
});

test('GET /api/twilio/status is mounted and never leaks the webhook token', async () => {
  const response = await fetch(base + '/api/twilio/status');
  assert.equal(response.status, 200);
  const text = await response.text();
  const body = JSON.parse(text);
  assert.equal(body.ok, true);
  assert.equal(body.webhookTokenSet, true);
  assert.equal(text.includes(webhookToken), false);
  assert.equal(text.includes(authToken), false);
});

test('private delivery, setup and checkout responses prohibit caching and referrer leakage', async () => {
  for (const route of ['/guide/not-a-real-token','/setup/not-a-real-token','/api/setup/blank','/checkout/not-a-plan']) {
    const response = await fetch(base + route, { redirect: 'manual' });
    assert.equal(response.headers.get('cache-control'), 'private, no-store', route);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer', route);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow', route);
  }
});
test('an ordinary agent credential cannot authorize arbitrary SMS sends', async () => {
  const response = await fetch(base + '/api/v1/agents/agent_missing/sms', {
    method: 'POST', headers: {'Content-Type':'application/json', Authorization:'Bearer widget_key'},
    body: JSON.stringify({to:'+12895550102',body:'do not send'}),
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'Operator authorization required');
});

test('signed inbound SMS returns TwiML <Message> instead of 404', async () => {
  const path = `/api/twilio/sms/agent_missing?token=${webhookToken}`;
  const r = await twilioPost(path, { From: '+15555550100', To: '+15555550199', Body: 'Hi' });
  assert.equal(r.status, 200, r.text);
  assert.match(r.type, /xml/);
  assert.match(r.text, /^<\?xml version="1\.0" encoding="UTF-8"\?><Response><Message>/);
  assert.match(r.text, /isn&apos;t assigned yet/);
});

test('signed number-mapped SMS route is mounted', async () => {
  const r = await twilioPost(`/api/twilio/sms?token=${webhookToken}`, { From: '+15555550100', To: '+15555550199', Body: 'Hello' });
  assert.equal(r.status, 200, r.text);
  assert.match(r.text, /<Response><Message>/);
});

test('signed inbound voice returns <Gather> with a same-host turn callback', async () => {
  const r = await twilioPost(`/api/twilio/voice/agent_missing?token=${webhookToken}`, { From: '+15555550100', To: '+15555550199', CallSid: 'CA_local_test' });
  assert.equal(r.status, 200, r.text);
  assert.match(r.type, /xml/);
  assert.match(r.text, /<Gather input="speech dtmf" action="\/api\/twilio\/voice\/agent_missing\/turn\?token=/);
  assert.match(r.text, /<Say voice="Polly\.Joanna">/);
  assert.match(r.text, /AI assistant/);
  assert.match(r.text, /This call may be recorded for quality, training, and customer support/);
  assert.equal(r.text.includes('localhost:8891'), false);
});

test('signed voice turn for an unassigned line hangs up cleanly', async () => {
  const r = await twilioPost(`/api/twilio/voice/agent_missing/turn?token=${webhookToken}`, { SpeechResult: 'hello', CallSid: 'CA_local_test' });
  assert.equal(r.status, 200, r.text);
  assert.match(r.text, /<Say>This line is not assigned\. Goodbye\.<\/Say><Hangup\/>/);
});

test('unsigned, forged and wrong-token webhooks are rejected', async () => {
  const params = { From: '+15555550100', To: '+15555550199', Body: 'Hi' };
  assert.equal((await twilioPost(`/api/twilio/sms/agent_missing?token=${webhookToken}`, params, { signature: '' })).status, 403);
  assert.equal((await twilioPost(`/api/twilio/sms/agent_missing?token=${webhookToken}`, params, { badSignature: true })).status, 403);
  assert.equal((await twilioPost('/api/twilio/sms/agent_missing?token=wrong-token-value', params)).status, 401);
  assert.equal((await twilioPost('/api/twilio/voice/agent_missing', params)).status, 401);
});

test('voice turn callback uses the absolute public base when one is configured', async () => {
  const { registerTwilioRoutes } = await import('../lib/twilio-routes.mjs');
  const routes = {};
  registerTwilioRoutes({ get() {}, post(p, h) { routes[p] = h; } }, { BASE: 'https://meridian.example.invalid/' });
  const prev = { ...process.env };
  process.env.TWILIO_SKIP_SIGNATURE = '1';
  delete process.env.TWILIO_WEBHOOK_TOKEN;
  try {
    let xml = '';
    const req = { params: { agentId: 'agent_x' }, query: {}, body: {}, get: () => '' };
    routes['/api/twilio/voice/:agentId'](req, { type() { return this; }, status() { return this; }, send(v) { xml = v; } });
    assert.match(xml, /action="https:\/\/meridian\.example\.invalid\/api\/twilio\/voice\/agent_x\/turn"/);
  } finally {
    for (const k of ['TWILIO_SKIP_SIGNATURE', 'TWILIO_WEBHOOK_TOKEN']) {
      if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k];
    }
  }
});
