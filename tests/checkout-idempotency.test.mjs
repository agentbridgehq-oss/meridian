// Stripe checkout processing must be idempotent across the webhook, webhook
// replays/retries and the /api/checkout/confirm page. Boots server.mjs with a
// dummy, local-only Stripe key and NO webhook secret (raw JSON events) — the
// webhook path makes no Stripe API calls. Nothing leaves the machine.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';

const root = new URL('..', import.meta.url).pathname;
const dataDir = mkdtempSync(join(tmpdir(), 'meridian-checkout-idem-'));
process.env.DATA_DIR = dataDir;
const billing = await import('../lib/usage-billing.mjs');
let child, base, logs = '';

before(async () => {
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port; await new Promise((r) => socket.close(r));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: {
    PATH: process.env.PATH, PORT: String(port), DATA_DIR: dataDir, PUBLIC_BASE_URL: base,
    STRIPE_SECRET_KEY: 'sk_test_local_dummy_never_used',
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

const post = (event) => fetch(base + '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const completed = (eventId, session) => ({ id: eventId, type: 'checkout.session.completed', data: { object: session } });
const ledger = () => JSON.parse(readFileSync(join(dataDir, 'usage-ledger.json'), 'utf8'));
const entries = (type, accountId) => (Array.isArray(ledger()) ? ledger() : ledger().entries || ledger().events || []).filter((e) => e.type === type && e.accountId === accountId);

function planAccount(tag) {
  const acc = billing.ensureBillingAccount({ agentId: `agent_idem_${tag}`, email: `idem-${tag}@example.invalid` });
  billing.activateSubscription(acc.id, 'rescue');
  return acc;
}

test('prepaid block: webhook replay and a second path for the same session credit once', async () => {
  const acc = planAccount('block');
  const session = { id: 'cs_test_block_1', mode: 'payment', payment_status: 'paid', amount_total: 4500, metadata: { brand: 'meridian', kind: 'voice_pack', packId: 'minutes_100', billingAccountId: acc.id } };
  assert.equal((await post(completed('evt_block_1', session))).status, 200);
  const replay = await post(completed('evt_block_1', session));
  assert.equal(replay.body.duplicate, true);
  await post(completed('evt_block_1_redelivered_as_new_event', session)); // same session, different event (≈ confirm page)
  assert.equal(billing.getBillingAccount(acc.id).prepaidTurns, 100);
});

test('prepaid block: concurrent deliveries of one session credit once', async () => {
  const acc = planAccount('concurrent');
  const session = { id: 'cs_test_block_concurrent', mode: 'payment', payment_status: 'paid', amount_total: 3500, metadata: { kind: 'voice_pack', packId: 'sms_500', billingAccountId: acc.id } };
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => post(completed(`evt_conc_${i}`, session))));
  assert.ok(results.every((r) => r.status === 200));
  const fresh = billing.getBillingAccount(acc.id);
  assert.equal(fresh.prepaidSmsSegments, 500);
  assert.equal(fresh.periodOverageCents, 3500);
  // A different session is a different purchase and is credited.
  await post(completed('evt_conc_other', { ...session, id: 'cs_test_block_concurrent_2' }));
  assert.equal(billing.getBillingAccount(acc.id).prepaidSmsSegments, 1000);
});

test('plan checkout: activation and provisioning run once per session; usage is not reset by a replay', async () => {
  const acc = billing.ensureBillingAccount({ agentId: 'agent_idem_plan', email: 'idem-plan@example.invalid' });
  const session = { id: 'cs_test_plan_1', mode: 'subscription', status: 'complete', payment_status: 'paid', amount_total: 49900 + 49900, customer_details: { email: 'idem-plan@example.invalid', name: 'Idem Plan Co' }, metadata: { kind: 'plan', plan: 'pro', product: 'pro', fullAuto: '1', billingAccountId: acc.id } };
  assert.equal((await post(completed('evt_plan_1', session))).status, 200);
  assert.equal(billing.getBillingAccount(acc.id).plan, 'pro');
  billing.updateBillingAccount(acc.id, { periodTurnsUsed: 123 });
  await post(completed('evt_plan_1', session));
  await post(completed('evt_plan_2_same_session', session));
  const fresh = billing.getBillingAccount(acc.id);
  assert.equal(fresh.periodTurnsUsed, 123);
  assert.equal(entries('subscription_activate', acc.id).length, 1);
  const processed = JSON.parse(readFileSync(join(dataDir, 'processed-events.json'), 'utf8')).keys;
  assert.equal(processed['stripe_checkout_billing:cs_test_plan_1'].status, 'done');
  assert.equal(processed['stripe_checkout_paid:cs_test_plan_1'].status, 'done');
  assert.equal(processed['stripe_checkout_paid:cs_test_plan_1'].attempts, 1);
});

test('confirm page and webhook share the same idempotent processor', () => {
  const server = readFileSync(join(root, 'server.mjs'), 'utf8');
  const confirm = server.slice(server.indexOf("app.get('/api/checkout/confirm'"), server.indexOf("app.get('/kits/:which/:file'"));
  assert.match(confirm, /processCheckoutSession\(session, 'confirm'\)/);
  assert.doesNotMatch(confirm, /handleVoiceBillingCheckout\(|handlePaidCheckout\(/);
  const webhook = server.slice(server.indexOf("app.post('/api/stripe/webhook'"), server.indexOf('async function processCheckoutSession'));
  assert.match(webhook, /processCheckoutSession\(session, 'webhook'\)/);
  assert.match(webhook, /stripe_event:/);
});
