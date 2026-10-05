import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';

// Isolated data dir BEFORE importing usage-billing (it reads DATA_DIR at import time).
const dataDir = mkdtempSync(join(tmpdir(), 'meridian-pricing-test-'));
process.env.DATA_DIR = dataDir;

const pricing = await import('../lib/pricing.mjs');
const billing = await import('../lib/usage-billing.mjs');
const { buildPlanCheckoutSession, buildBlockCheckoutSession } = await import('../lib/checkout-sessions.mjs');
const { PLANS, BLOCKS, USAGE_POLICY, CURRENCY } = pricing;

let child, base;
before(() => {});
after(async () => {
  if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
  rmSync(dataDir, { recursive: true, force: true });
});

test('single currency is CAD', () => {
  assert.equal(CURRENCY, 'cad');
  assert.equal(pricing.CURRENCY_CODE, 'CAD');
});

test('approved CAD plans: prices, setup and caps', () => {
  assert.deepEqual([...pricing.PLAN_ORDER], ['rescue', 'pro', 'growth']);
  const expect = {
    rescue: { name: 'Missed-Call Rescue', monthlyCents: 19900, setupCents: 0, caps: { aiMinutes: 200, smsSegments: 300, numbers: 1, warmTransfers: 0 } },
    pro: { name: 'Front Desk Pro', monthlyCents: 49900, setupCents: 49900, caps: { aiMinutes: 600, smsSegments: 800, numbers: 1, warmTransfers: 150 } },
    growth: { name: 'Front Desk Growth', monthlyCents: 99900, setupCents: 99900, caps: { aiMinutes: 1200, smsSegments: 2000, numbers: 2, warmTransfers: 400 } },
  };
  for (const [id, e] of Object.entries(expect)) {
    const p = PLANS[id];
    assert.equal(p.name, e.name, id);
    assert.equal(p.monthlyCents, e.monthlyCents, id);
    assert.equal(p.setupCents, e.setupCents, id);
    assert.deepEqual({ ...p.caps }, e.caps, id);
  }
});

test('prepaid blocks: 100 min / $45 and 500 SMS / $35; overage derived from blocks', () => {
  assert.deepEqual({ units: BLOCKS.minutes_100.units, unit: BLOCKS.minutes_100.unit, amountCents: BLOCKS.minutes_100.amountCents }, { units: 100, unit: 'aiMinutes', amountCents: 4500 });
  assert.deepEqual({ units: BLOCKS.sms_500.units, unit: BLOCKS.sms_500.unit, amountCents: BLOCKS.sms_500.amountCents }, { units: 500, unit: 'smsSegments', amountCents: 3500 });
  assert.equal(pricing.OVERAGE.minuteCents, 45);
  assert.equal(pricing.OVERAGE.smsSegmentCents, 7);
});

test('usage policy: stop at cap (no card), PAYG metered overage (card), 80%/100% alerts, 20-min soft nudge, 60-min ceiling', () => {
  assert.equal(USAGE_POLICY.stopAtCap, true);
  assert.equal(USAGE_POLICY.paygOverage, true);
  assert.equal(USAGE_POLICY.legacyPostpaidInvoiceItems, false);
  assert.deepEqual([...USAGE_POLICY.alertThresholds], [0.8, 1.0]);
  assert.equal(USAGE_POLICY.perCallSoftWrapMinutes, 20);
  assert.equal(USAGE_POLICY.perCallAiMinuteCap, 60);
  assert.equal(USAGE_POLICY.overageCeilingMultiple, 1);
  assert.equal(billing.overageAllowed(), false);
});

test('worst-case cost never exceeds price — every plan, every block, every unit', () => {
  for (const id of pricing.PLAN_ORDER) {
    for (const clients of [1, 5, 50]) {
      const wc = pricing.worstCaseMonthlyCostCents(id, { clients });
      assert.ok(wc.total < PLANS[id].monthlyCents, `${id} clients=${clients}: cost ${wc.total} >= price`);
      assert.ok(wc.marginCents > 0);
    }
  }
  // Matches the proposal §8 (xAI, default 5-client hosting split), CAD cents.
  assert.equal(Math.round(pricing.worstCaseMonthlyCostCents('rescue').total), 9917);
  assert.equal(Math.round(pricing.worstCaseMonthlyCostCents('pro').total), 26796);
  assert.equal(Math.round(pricing.worstCaseMonthlyCostCents('growth').total), 55128);
  // Rollback profile still equals the originally approved proposal numbers.
  assert.equal(Math.round(pricing.worstCaseMonthlyCostCents('rescue', { profile: 'openai_legacy' }).total), 10919);
  assert.equal(Math.round(pricing.worstCaseMonthlyCostCents('pro', { profile: 'openai_legacy' }).total), 29849);
  assert.equal(Math.round(pricing.worstCaseMonthlyCostCents('growth', { profile: 'openai_legacy' }).total), 61053);
  for (const id of Object.keys(BLOCKS)) assert.ok(pricing.worstCaseBlockMarginCents(id).marginCents > 0, id);
  // Per-unit overage rates beat worst-case unit cost + Stripe %.
  const u = pricing.WORST_CASE_UNIT_COST_CENTS;
  assert.ok(pricing.OVERAGE.minuteCents - u.aiMinute - pricing.stripeFeeCentsWorst(pricing.OVERAGE.minuteCents, { fixed: false }) > 0);
  assert.ok(pricing.OVERAGE.smsSegmentCents - u.smsSegment - pricing.stripeFeeCentsWorst(pricing.OVERAGE.smsSegmentCents, { fixed: false }) > 0);
  // Worst case at the ceiling: plan fully used + 1x plan price of minute blocks still profitable.
  for (const id of pricing.PLAN_ORDER) {
    const blocks = Math.floor(PLANS[id].monthlyCents / BLOCKS.minutes_100.amountCents);
    const total = pricing.worstCaseMonthlyCostCents(id, { clients: 1 }).marginCents + blocks * pricing.worstCaseBlockMarginCents('minutes_100').marginCents;
    assert.ok(total > 0, id);
  }
  assert.equal(billing.pricingSnapshot().guaranteedProfit, true);
  assert.equal(billing.pricingSnapshot().currency, 'CAD');
});

test('Stripe plan checkout is CAD subscription with one-time setup; env price IDs honoured', () => {
  for (const id of pricing.PLAN_ORDER) {
    const s = buildPlanCheckoutSession({ planKey: id, base: 'http://x', env: {} });
    assert.equal(s.mode, 'subscription');
    assert.equal(s.currency, 'cad');
    assert.equal(s.metadata.kind, 'plan');
    assert.equal(s.metadata.plan, id);
    assert.ok(s.custom_fields.length <= 3);
    const [monthly, setup] = s.line_items;
    assert.equal(monthly.price_data.currency, 'cad');
    assert.equal(monthly.price_data.unit_amount, PLANS[id].monthlyCents);
    assert.deepEqual(monthly.price_data.recurring, { interval: 'month' });
    if (PLANS[id].setupCents) {
      assert.equal(setup.price_data.currency, 'cad');
      assert.equal(setup.price_data.unit_amount, PLANS[id].setupCents);
      assert.equal(setup.price_data.recurring, undefined);
    } else assert.equal(s.line_items.length, 1);
  }
  const env = { STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m', STRIPE_PRICE_PRO_SETUP: 'price_pro_s' };
  assert.deepEqual(buildPlanCheckoutSession({ planKey: 'pro', base: 'http://x', env }).line_items, [{ price: 'price_pro_m', quantity: 1 }, { price: 'price_pro_s', quantity: 1 }]);
  const names = pricing.stripePriceEnvStatus({}).map((x) => x.name).sort();
  assert.deepEqual(names, ['STRIPE_PRICE_BLOCK_MINUTES_100', 'STRIPE_PRICE_BLOCK_SMS_500', 'STRIPE_PRICE_GROWTH_MONTHLY', 'STRIPE_PRICE_GROWTH_SETUP', 'STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO_SETUP', 'STRIPE_PRICE_RESCUE_MONTHLY']);
});

test('Stripe block checkout is CAD one-time payment', () => {
  for (const id of Object.keys(BLOCKS)) {
    const s = buildBlockCheckoutSession({ blockKey: id, base: 'http://x', agentId: 'a1', env: {} });
    assert.equal(s.mode, 'payment');
    assert.equal(s.currency, 'cad');
    assert.equal(s.line_items[0].price_data.currency, 'cad');
    assert.equal(s.line_items[0].price_data.unit_amount, BLOCKS[id].amountCents);
    assert.equal(s.metadata.packId, id);
  }
  assert.deepEqual(buildBlockCheckoutSession({ blockKey: 'sms_500', base: 'http://x', env: { STRIPE_PRICE_BLOCK_SMS_500: 'price_sms' } }).line_items, [{ price: 'price_sms', quantity: 1 }]);
});

test('legacy USD product / pack / plan keys resolve to the CAD plans', () => {
  assert.equal(pricing.resolvePlanId('voice'), 'rescue');
  assert.equal(pricing.resolvePlanId('voice_monthly'), 'rescue');
  for (const k of ['sales', 'booking', 'auto_voice', 'voice_pro']) assert.equal(pricing.resolvePlanId(k), 'pro', k);
  for (const k of ['stack', 'auto', 'auto_stack']) assert.equal(pricing.resolvePlanId(k), 'growth', k);
  for (const k of ['starter', 'growth', 'scale']) assert.equal(pricing.resolveBlockId(k), 'minutes_100', k);
  assert.equal(pricing.resolvePlanId('nope'), null);
});

test('no USD left in the pricing module, usage billing, server or proposal engine', () => {
  for (const f of ['lib/pricing.mjs', 'lib/usage-billing.mjs', 'lib/checkout-sessions.mjs', 'server.mjs', 'engine.mjs', 'lib/expertise.mjs', 'lib/voice-minute-markup.mjs']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.equal(/currency:\s*['"]usd['"]/i.test(src), false, f);
    assert.equal(/setupUsd|monthlyUsd/.test(src), false, f);
  }
});

test('billing: alerts at 80%/100%, stop at cap, included minutes before prepaid, no reset on re-activation', () => {
  assert.deepEqual(billing.crossedAlertThresholds(159, 160, 200), [0.8]);
  assert.deepEqual(billing.crossedAlertThresholds(199, 200, 200), [1.0]);
  assert.deepEqual(billing.crossedAlertThresholds(10, 11, 200), []);

  const acc = billing.ensureBillingAccount({ agentId: 'agent-cap', email: 'cap@example.invalid' });
  assert.equal(billing.activateSubscription(acc.id, 'rescue').ok, true);
  let alerts = [];
  for (let i = 0; i < 200; i++) {
    const r = billing.reserveTurn(acc.id);
    assert.equal(r.ok, true, `turn ${i}`);
    assert.equal(r.mode, 'subscription_included');
    alerts = alerts.concat(r.alerts || []);
    billing.commitReservedTurn(acc.id, r.holdId);
  }
  assert.deepEqual(alerts, [0.8, 1.0]);
  const stop = billing.reserveTurn(acc.id);
  assert.equal(stop.ok, false);
  assert.equal(billing.canConsumeTurn(acc.id).reason, 'included_turns_exhausted');
  assert.equal(billing.canConsumeTurn(acc.id).stopAtCap, true);

  // Re-activation of the same plan in the same period must not reset usage (cap bypass).
  billing.activateSubscription(acc.id, 'rescue');
  assert.equal(billing.canConsumeTurn(acc.id).ok, false);

  // Prepaid block unlocks exactly 100 more minutes.
  billing.creditPrepaidBlock(acc.id, 'minutes_100');
  assert.equal(billing.canConsumeTurn(acc.id).mode, 'prepaid');
  assert.equal(billing.getBillingAccount(acc.id).prepaidTurns, 100);
  billing.creditPrepaidBlock(acc.id, 'sms_500');
  assert.equal(billing.getBillingAccount(acc.id).prepaidSmsSegments, 500);

  // Fresh plan with a prepaid block: included minutes are used first.
  const acc2 = billing.ensureBillingAccount({ agentId: 'agent-order', email: 'order@example.invalid' });
  billing.activateSubscription(acc2.id, 'pro');
  billing.creditPrepaidBlock(acc2.id, 'minutes_100');
  assert.equal(billing.canConsumeTurn(acc2.id).mode, 'subscription_included');
});

test('billing: prepaid blocks need an active plan and stop at the 1x overage ceiling', () => {
  const none = billing.ensureBillingAccount({ agentId: 'agent-none', email: 'none@example.invalid' });
  assert.equal(billing.canPurchaseBlock(none.id, 'minutes_100').reason, 'no_active_plan');

  const acc = billing.ensureBillingAccount({ agentId: 'agent-ceiling', email: 'ceiling@example.invalid' });
  billing.activateSubscription(acc.id, 'rescue');
  assert.equal(billing.overageCeilingCents(billing.getBillingAccount(acc.id)), 19900);
  let bought = 0;
  while (billing.canPurchaseBlock(acc.id, 'minutes_100').ok) { billing.creditPrepaidBlock(acc.id, 'minutes_100'); bought++; }
  assert.equal(bought, 4); // 4 x $45 = $180 <= $199; a 5th would be $225
  const blocked = billing.canPurchaseBlock(acc.id, 'minutes_100');
  assert.equal(blocked.reason, 'overage_ceiling_reached');
  assert.equal(billing.canPurchaseBlock(acc.id, 'sms_500').reason, 'overage_ceiling_reached'); // $180 + $35 > $199
});

test('per-call AI minute ceiling is 60 (20 is only a soft nudge now)', async () => {
  const markup = await import('../lib/voice-minute-markup.mjs');
  assert.equal(markup.billedAiMinutes(25 * 60), 25);
  assert.equal(markup.billedAiMinutes(90 * 60), 60);
  assert.equal(markup.billedAiMinutes(61), 2);
});

test('server: /api/pricing is CAD and plan checkout without Stripe returns 503 with CA$', async () => {
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port; await new Promise((r) => socket.close(r));
  base = `http://127.0.0.1:${port}`;
  const serverData = mkdtempSync(join(dataDir, 'srv-'));
  // Env allowlist: no Stripe key, no provider credentials.
  child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: {
    PATH: process.env.PATH, PORT: String(port), DATA_DIR: serverData, PUBLIC_BASE_URL: base,
    MERIDIAN_OPENCLAW_AUTO: '0', MERIDIAN_AUTOPILOT: '0', MERIDIAN_HEALTH_PROBE: '0', MERIDIAN_KNOWLEDGE_REFRESH: '0', MERIDIAN_ARTICLES: '0',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', (x) => (logs += x)); child.stderr.on('data', (x) => (logs += x));
  const deadline = Date.now() + 10000; let up = false;
  while (Date.now() < deadline && !up) {
    if (child.exitCode !== null) throw new Error(logs);
    try { up = (await fetch(base + '/healthz')).status === 200; } catch {}
    if (!up) await new Promise((r) => setTimeout(r, 70));
  }
  assert.ok(up, logs);
  const list = await (await fetch(base + '/api/pricing')).json();
  assert.equal(list.currency, 'CAD');
  assert.deepEqual(list.plans.map((p) => [p.id, p.monthlyCad, p.setupCad]), [['rescue', 199, 0], ['pro', 499, 499], ['growth', 999, 999]]);
  const voice = await (await fetch(base + '/api/pricing/voice')).json();
  assert.equal(JSON.stringify(voice).includes('"usd"'), false);
  for (const path of ['/checkout/pro', '/checkout/stack']) {
    const r = await fetch(base + path, { redirect: 'manual' });
    assert.equal(r.status, 503, path);
    assert.match(await r.text(), /CA\$/);
  }
  const legacy = await fetch(base + '/checkout/voice-sub', { redirect: 'manual' });
  assert.equal(legacy.status, 302);
  assert.match(legacy.headers.get('location'), /\/checkout\/rescue/);
  const pack = await fetch(base + '/checkout/voice-pack/minutes_100', { redirect: 'manual' });
  assert.ok([409, 503].includes(pack.status));
});

test('xAI cost model uses documented xAI + Twilio prices at FX 1.50 and no plan/block loses money (xAI and rollback)', () => {
  const X = pricing.VENDOR_PRICES_USD.xai;
  assert.equal(X.voiceS2sPerMin, 0.08);
  assert.equal(X.voiceTextInputEach, 0.004);
  assert.deepEqual({ ...X.textGrok43PerMTok }, { input: 1.25, cachedInput: 0.2, output: 2.5 });
  assert.equal(pricing.COST_MODEL.provider, 'xai');
  assert.equal(pricing.COST_MODEL.fxUsdToCadWorst, 1.5);
  // Worst case bills S2S audio both directions: 0.0045 + 0.0025 + 0.0015 + 0.2/60 + 2*0.08 + 0.004
  assert.ok(Math.abs(pricing.COST_MODEL.perAiMinuteUsdWorst - 0.175833) < 1e-5);
  assert.ok(Math.abs(pricing.WORST_CASE_UNIT_COST_CENTS.aiMinute - 26.375) < 1e-3);
  assert.ok(Math.abs(pricing.COST_MODEL.perSmsSegmentUsdWorst - 0.031) < 1e-9);
  assert.ok(pricing.COST_MODEL.perAiMinuteUsdExpected < pricing.COST_MODEL.perAiMinuteUsdWorst);
  // xAI is cheaper per minute than the old OpenAI worst case, so no cap change is needed.
  assert.ok(pricing.COST_PROFILES.xai.perAiMinuteUsdWorst < pricing.COST_PROFILES.openai_legacy.perAiMinuteUsdWorst);
  for (const profile of ['xai', 'openai_legacy']) {
    for (const id of pricing.PLAN_ORDER) {
      for (const clients of [1, 5, 50]) {
        const wc = pricing.worstCaseMonthlyCostCents(id, { clients, profile });
        assert.ok(wc.marginCents > 0, `${profile} ${id} clients=${clients} margin ${wc.marginCents}`);
      }
      const blocks = Math.floor(PLANS[id].monthlyCents / BLOCKS.minutes_100.amountCents);
      const ceiling = pricing.worstCaseMonthlyCostCents(id, { clients: 1, profile }).marginCents
        + blocks * pricing.worstCaseBlockMarginCents('minutes_100', { profile }).marginCents;
      assert.ok(ceiling > 0, `${profile} ${id} at overage ceiling`);
    }
    for (const id of Object.keys(BLOCKS)) assert.ok(pricing.worstCaseBlockMarginCents(id, { profile }).marginCents > 0, `${profile} ${id}`);
    const u = pricing.worstCaseUnitCostCents(profile);
    assert.ok(pricing.OVERAGE.minuteCents - u.aiMinute - pricing.stripeFeeCentsWorst(pricing.OVERAGE.minuteCents, { fixed: false }) > 0, profile);
    assert.ok(pricing.OVERAGE.smsSegmentCents - u.smsSegment - pricing.stripeFeeCentsWorst(pricing.OVERAGE.smsSegmentCents, { fixed: false }) > 0, profile);
  }
  // Approved prices and caps unchanged.
  assert.deepEqual(pricing.PLAN_ORDER.map(id => PLANS[id].monthlyCents), [19900, 49900, 99900]);
  assert.deepEqual(pricing.PLAN_ORDER.map(id => PLANS[id].caps.aiMinutes), [200, 600, 1200]);
});
