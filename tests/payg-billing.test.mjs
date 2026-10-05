// Pay-as-you-go metered overage (Stripe Billing Meters), payment-failure voicemail fallback,
// soft wrap-up nudge, owner alerts. Stripe, Twilio, email and xAI are all mocked; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-payg-'));
process.env.DATA_DIR = dir;
process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = path.join(dir, 'deployment-core.json');
process.env.MERIDIAN_INBOUND_ROUTE_FILE = path.join(dir, 'inbound-routes.json');
process.env.MERIDIAN_REALTIME_CALL_FILE = path.join(dir, 'realtime-calls.json');
for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'TWILIO_WEBHOOK_TOKEN', 'RESEND_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY', 'MERIDIAN_WEBHOOK_URL', 'TWILIO_AGENT_MAP', 'STRIPE_SECRET_KEY', 'MERIDIAN_VOICEMAIL_SIP_URI', 'MERIDIAN_PAYG_THRESHOLD_CENTS', 'MERIDIAN_AI_COST_ALERT_PCT', 'OWNER_EMAIL', 'OWNER_PHONE']) delete process.env[k];
process.env.MERIDIAN_OWNER_EMAIL = 'kenny@example.invalid';
process.env.MERIDIAN_OWNER_PHONE = '+15555550100';
process.env.STRIPE_PRICE_OVERAGE_MINUTE = 'price_test_minute';
process.env.STRIPE_PRICE_OVERAGE_SMS = 'price_test_sms';

const engine = await import('../engine.mjs');
const core = await import('../lib/deployment-core.mjs');
const { provisionManagedRuntime } = await import('../lib/managed-runtime.mjs');
const routing = await import('../lib/inbound-routing.mjs');
const ingress = await import('../lib/openai-realtime-ingress.mjs');
const billing = await import('../lib/usage-billing.mjs');
const meter = await import('../lib/usage-meter.mjs');
const payg = await import('../lib/payg-billing.mjs');
const owner = await import('../lib/owner-alerts.mjs');
const pricing = await import('../lib/pricing.mjs');
const { usageAlertMessage } = await import('../lib/usage-alerts.mjs');
const { buildPlanCheckoutSession } = await import('../lib/checkout-sessions.mjs');
const { connectOpenAIRealtimeSideband, SOFT_WRAP_NUDGE, CALL_LIMIT_NOTICE } = await import('../lib/openai-realtime-sideband.mjs');
const { capVoiceTwiml } = await import('../lib/twilio-channel.mjs');
const { registerTwilioRoutes } = await import('../lib/twilio-routes.mjs');

// ── Mock transports ─────────────────────────────────────────────────────────
const kenny = [];
const clientMsgs = [];
const usageAlerts = [];
meter.meterDeps.ownerSend = async (to, msg) => { kenny.push({ to, msg }); return { ok: true }; };
meter.meterDeps.notifyClient = async (acc, msg) => { clientMsgs.push({ acc: acc.id, msg }); return { ok: true }; };
meter.meterDeps.notify = async (target, msg) => { usageAlerts.push({ target, msg }); return { ok: true, results: { email: { ok: true } } }; };
const paygDeps = { send: meter.meterDeps.ownerSend, notifyClientFn: meter.meterDeps.notifyClient };

function mockStripe({ fail } = {}) {
  const calls = { meter: [], update: [] };
  return {
    calls,
    billing: { meterEvents: { create: async (params, opts) => {
      calls.meter.push({ params, opts });
      if (fail) { const e = new Error(`mock ${fail}`); e.statusCode = fail; throw e; }
      return { object: 'billing.meter_event', identifier: params.identifier };
    } } },
    subscriptions: {
      retrieve: async (id) => ({ id, customer: 'cus_test_checkout', default_payment_method: 'pm_test_card', items: { data: [
        { id: 'si_plan', price: { id: 'price_test_plan' } },
        { id: 'si_min', price: { id: 'price_test_minute' } },
        { id: 'si_sms', price: { id: 'price_test_sms' } },
      ] } }),
      update: async (id, params, opts) => { calls.update.push({ id, params, opts }); return { id }; },
    },
  };
}

let seq = 0;
function incoming(number, callId) {
  return { type: 'realtime.call.incoming', data: { call_id: callId, sip_headers: [{ name: 'Diversion', value: `<sip:${number}@twilio.com>` }, { name: 'To', value: '<sip:project@sip.api.openai.com>' }] } };
}
function voiceDeployment(number) {
  seq += 1;
  const lead = engine.upsertLead({
    email: `payg-${seq}@example.invalid`, businessName: `PAYG HVAC ${seq}`, primaryNeed: 'voice', consent: true,
    agency: {
      input: { service: 'voice', tier: 'foundation', phone: number, businessWebsite: 'https://example.invalid' },
      intake: { hours: 'Mon-Fri 8-5', services: 'HVAC', owner: 'Operations' },
      proposal: { status: 'approved', service: 'voice', tier: 'foundation', agentNeed: 'voice', acceptanceChecks: [] },
    },
  });
  let d = core.createDeploymentFromAgencyLead(lead).deployment;
  assert.equal(provisionManagedRuntime(d.id).ok, true);
  d = core.updateIntegration(d.id, 'brain', { provider: 'openai', status: 'configured', credentialConfigured: true }).deployment;
  d = core.updateIntegration(d.id, 'telephony', { provider: 'twilio-sip', status: 'configured', credentialConfigured: true }).deployment;
  const route = routing.upsertInboundRoute({ deploymentId: d.id, dialedNumber: number, environment: 'staging', provider: 'twilio-sip' }).route;
  assert.equal(routing.setInboundRouteEnabled(route.id, true, { evidence: 'Staging route for PAYG test.' }).ok, true);
  return { deployment: d, agentId: engine.getLead(d.projectId).managedRuntime.agentId };
}
function account(agentId, plan = 'rescue', patch = {}) {
  const acc = billing.ensureBillingAccount({ agentId, email: `${agentId}@example.invalid` });
  if (plan) assert.equal(billing.activateSubscription(acc.id, plan).ok, true);
  if (Object.keys(patch).length) billing.updateBillingAccount(acc.id, patch);
  return billing.getBillingAccount(acc.id);
}
function paygAccount(agentId, plan = 'rescue', patch = {}) {
  const acc = account(agentId, plan, patch);
  payg.enablePayg(acc.id, { stripeCustomerId: `cus_test_${acc.id}`, stripeSubscriptionId: `sub_test_${acc.id}`, paymentMethodOk: true });
  return billing.getBillingAccount(acc.id);
}
function backdateHold(accountId, callId, seconds) {
  const acc = billing.getBillingAccount(accountId);
  const hold = acc.voiceHolds[callId];
  billing.updateBillingAccount(accountId, { voiceHolds: { ...acc.voiceHolds, [callId]: { ...hold, startedAt: new Date(Date.now() - seconds * 1000).toISOString() } } });
}
function rtOptions() {
  const calls = { accept: 0, reject: [], hangup: 0, refer: [], attach: [] };
  return {
    calls,
    options: {
      environment: 'staging', openAIConfigured: true, requireSideband: true,
      acceptCall: async () => { calls.accept += 1; },
      rejectCall: async (r) => { calls.reject.push(r); },
      hangupCall: async () => { calls.hangup += 1; },
      referCall: async (r) => { calls.refer.push(r); },
      attachSideband: async (input) => { calls.attach.push(input); return { ok: true }; },
    },
  };
}
const outboxFor = (accountId) => payg.listMeterOutbox().filter((e) => e.accountId === accountId);

// ── Pricing / margins ───────────────────────────────────────────────────────

test('metered PAYG rates are CA$0.45/min and CA$0.07/SMS (block-equivalent)', () => {
  assert.equal(pricing.METERED_OVERAGE.minuteCents, 45);
  assert.equal(pricing.METERED_OVERAGE.smsSegmentCents, 7);
  assert.equal(pricing.METERED_OVERAGE.minuteCents, pricing.OVERAGE.minuteCents);
  assert.equal(pricing.METERED_OVERAGE.smsSegmentCents, pricing.OVERAGE.smsSegmentCents);
});

test('metered margins stay positive over worst-case xAI+Twilio(+Stripe) cost, both AI profiles', () => {
  for (const profile of ['xai', 'openai_legacy']) {
    for (const unit of ['minute', 'sms']) {
      const m = pricing.worstCaseMeteredUnitMarginCents(unit, { profile });
      assert.ok(m > 1, `${profile} ${unit} unit margin ${m}`);
      // A CA$50 threshold charge made only of overage, and a heavy month (2,000 min / 10,000 SMS).
      const unitPrice = unit === 'sms' ? 7 : 45;
      const thresholdUnits = Math.ceil(5000 / unitPrice);
      assert.ok(pricing.worstCaseMeteredInvoiceMarginCents(unit, thresholdUnits, { profile }) > 1000, `${profile} ${unit} threshold invoice`);
      assert.ok(pricing.worstCaseMeteredInvoiceMarginCents(unit, unit === 'sms' ? 10000 : 2000, { profile }) > 0);
      // Margin as a share of price: xAI ≥ 28%, legacy rollback ≥ 20%.
      assert.ok(m / unitPrice > (profile === 'xai' ? 0.28 : 0.2), `${profile} ${unit} margin pct ${(m / unitPrice).toFixed(3)}`);
    }
  }
  assert.ok(pricing.worstCaseMeteredUnitMarginCents('minute') > 16);
  assert.equal(pricing.meteredBreakEvenUnits('minute'), 2);
  assert.equal(pricing.meteredBreakEvenUnits('sms'), 16);
  // The AI-vendor share alone is below the price (owner cost alert basis).
  assert.ok(pricing.aiVendorUnitCostCents('worst').aiMinute < 45);
  assert.ok(pricing.aiVendorUnitCostCents('worst').smsSegment < 7);
});

test('usage policy: PAYG on, 20-min soft nudge, 60-min ceiling, CA$50 default threshold', () => {
  assert.equal(pricing.USAGE_POLICY.paygOverage, true);
  assert.equal(pricing.USAGE_POLICY.perCallSoftWrapMinutes, 20);
  assert.equal(pricing.USAGE_POLICY.perCallAiMinuteCap, 60);
  assert.equal(pricing.USAGE_POLICY.paygBillingThresholdCents, 5000);
  assert.equal(payg.paygConfig({}).thresholdCents, 5000);
  assert.equal(payg.paygConfig({ MERIDIAN_PAYG_THRESHOLD_CENTS: '10' }).thresholdCents, 50); // Stripe minimum
  assert.equal(payg.paygConfig({ MERIDIAN_PAYG_THRESHOLD_CENTS: '0' }).thresholdCents, 0); // off
  assert.equal(payg.paygConfig({}).configured, false);
  assert.equal(payg.paygConfig(process.env).configured, true);
});

// ── Voice: PAYG never stops at cap ──────────────────────────────────────────

test('PAYG client at cap: call is accepted (no stop), gets 60-min ceiling + 20-min nudge, overage metered once', async () => {
  const { agentId } = voiceDeployment('+17055550301');
  const acc = paygAccount(agentId, 'rescue', { periodTurnsUsed: 200 }); // all 200 included minutes used
  const { options, calls } = rtOptions();
  const r = await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550301', 'rtc_payg_1'), options);
  assert.equal(r.ok, true);
  assert.equal(calls.accept, 1);
  assert.equal(calls.attach[0].limitSeconds, 60 * 60);
  assert.equal(calls.attach[0].nudgeSeconds, 20 * 60);
  backdateHold(acc.id, 'rtc_payg_1', 7 * 60 + 5); // 8 billed minutes, all beyond the cap
  await Promise.all([calls.attach[0].onClosed(), calls.attach[0].onClosed()]); // duplicate close
  const after = billing.getBillingAccount(acc.id);
  assert.equal(after.periodPaygMinutes, 8);
  assert.equal(after.periodPaygCents, 8 * 45);
  const ev = outboxFor(acc.id);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].identifier, 'voice_rtc_payg_1');
  assert.equal(ev[0].value, 8);
  assert.equal(ev[0].eventName, 'meridian_ai_minutes');
  assert.equal(ev[0].customerId, `cus_test_${acc.id}`);
  // A replayed settle can never queue a second event.
  assert.equal(payg.recordMeteredUsage(acc.id, { metric: 'minutes', units: 8, identifier: 'voice_rtc_payg_1' }).duplicate, true);
  assert.equal(outboxFor(acc.id).length, 1);
});

test('PAYG call that straddles the cap: included minutes first, only the excess is metered', async () => {
  const { agentId } = voiceDeployment('+17055550302');
  const acc = paygAccount(agentId, 'rescue', { periodTurnsUsed: 195 });
  const { options, calls } = rtOptions();
  await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550302', 'rtc_payg_2'), options);
  backdateHold(acc.id, 'rtc_payg_2', 9 * 60 + 30); // 10 billed: 5 included + 5 PAYG
  await calls.attach[0].onClosed();
  const st = billing.usageState(acc.id);
  assert.equal(st.minutesUsed, 200);
  assert.equal(outboxFor(acc.id)[0].value, 5);
});

test('stale-hold sweeper also meters PAYG minutes (lost end-of-call webhook)', () => {
  const { agentId } = { agentId: `agent_stale_${Date.now()}` };
  const acc = paygAccount(agentId, 'rescue', { periodTurnsUsed: 200 });
  assert.equal(billing.reserveVoiceCall(acc.id, 'rtc_stale', { payg: true }).ok, true);
  backdateHold(acc.id, 'rtc_stale', 70 * 60); // past 60-min hold + 5-min grace
  billing.settleStaleVoiceHolds(acc.id);
  const ev = outboxFor(acc.id);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].identifier, 'voice_rtc_stale');
  assert.ok(ev[0].value >= 1 && ev[0].value <= 60);
});

test('client WITHOUT a valid card keeps the hard stop at cap', async () => {
  const { agentId } = voiceDeployment('+17055550303');
  const acc = account(agentId, 'rescue', { periodTurnsUsed: 200, stripeCustomerId: 'cus_test_nocard' });
  payg.enablePayg(acc.id, { paymentMethodOk: false }); // opted in, but no usable card
  assert.equal(payg.paygState(acc.id).reason, 'no_valid_card');
  const { options, calls } = rtOptions();
  const r = await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550303', 'rtc_nocard'), options);
  assert.equal(r.ok, false);
  assert.equal(r.status, 402);
  assert.deepEqual(r.plan.blockers, ['billing.voice_cap_reached']);
  assert.equal(calls.accept, 0);
  assert.equal(outboxFor(acc.id).length, 0);
});

// ── Outbox flush to Stripe (mocked) ─────────────────────────────────────────

test('outbox flush sends identifier + Idempotency-Key; 5xx retries; 4xx fails and alerts Kenny', async () => {
  const acc = paygAccount(`agent_flush_${Date.now()}`);
  payg.recordMeteredUsage(acc.id, { metric: 'minutes', units: 3, identifier: 'voice_flush_a' });
  const down = mockStripe({ fail: 503 });
  let r = await payg.flushMeterOutbox({ stripe: down, notify: meter.meterDeps.ownerSend });
  assert.ok(r.retry.includes('voice_flush_a'));
  assert.equal(payg.listMeterOutbox().find((e) => e.identifier === 'voice_flush_a').status, 'pending');

  const ok = mockStripe();
  r = await payg.flushMeterOutbox({ stripe: ok });
  assert.ok(r.sent.includes('voice_flush_a'));
  const sent = ok.calls.meter.find((c) => c.params.identifier === 'voice_flush_a');
  assert.equal(sent.params.event_name, 'meridian_ai_minutes');
  assert.equal(sent.params.payload.stripe_customer_id, `cus_test_${acc.id}`);
  assert.equal(sent.params.payload.value, '3');
  assert.equal(sent.opts.idempotencyKey, 'meridian_meter_voice_flush_a');
  // Sent events are not re-sent.
  const again = mockStripe();
  await payg.flushMeterOutbox({ stripe: again });
  assert.equal(again.calls.meter.filter((c) => c.params.identifier === 'voice_flush_a').length, 0);

  payg.recordMeteredUsage(acc.id, { metric: 'sms', units: 4, identifier: 'sms_flush_b' });
  const before = kenny.length;
  r = await payg.flushMeterOutbox({ stripe: mockStripe({ fail: 400 }), notify: meter.meterDeps.ownerSend });
  assert.ok(r.failed.includes('sms_flush_b'));
  assert.equal(payg.listMeterOutbox().find((e) => e.identifier === 'sms_flush_b').status, 'failed');
  assert.ok(kenny.slice(before).some((k) => /could not be billed/.test(k.msg.subject)));
});

test('events older than Stripe\'s window expire and alert instead of being sent', async () => {
  const acc = paygAccount(`agent_old_${Date.now()}`);
  payg.recordMeteredUsage(acc.id, { metric: 'minutes', units: 2, identifier: 'voice_old', timestamp: Math.floor(Date.now() / 1000) - 40 * 86400 });
  const s = mockStripe();
  const r = await payg.flushMeterOutbox({ stripe: s, notify: meter.meterDeps.ownerSend });
  assert.ok(r.failed.includes('voice_old'));
  assert.equal(s.calls.meter.filter((c) => c.params.identifier === 'voice_old').length, 0);
});

// ── Payment failure → voicemail; live calls finish; restore on invoice.paid ──

test('payment failed: live call finishes and is metered; new calls go to voicemail; both parties alerted once; invoice.paid restores', async () => {
  const { agentId } = voiceDeployment('+17055550304');
  const acc = paygAccount(agentId, 'rescue', { periodTurnsUsed: 200 });
  const { options, calls } = rtOptions();
  assert.equal((await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550304', 'rtc_live'), options)).ok, true);

  const failedEvt = { type: 'invoice.payment_failed', data: { object: { id: 'in_test_1', customer: `cus_test_${acc.id}`, billing_reason: 'subscription_threshold' } } };
  const k0 = kenny.length, c0 = clientMsgs.length;
  assert.equal((await payg.handlePaygStripeEvent(failedEvt, paygDeps)).handled, true);
  await payg.handlePaygStripeEvent(failedEvt, paygDeps); // webhook replay
  assert.equal(kenny.slice(k0).filter((k) => /payment failed/.test(k.msg.subject)).length, 1);
  assert.equal(clientMsgs.slice(c0).filter((c) => /payment failed/.test(c.msg.subject)).length, 1);
  assert.equal(payg.paygState(acc.id).blocked, true);

  // The live call is NOT cut: no hangup/refer, and it still settles + meters.
  assert.equal(calls.hangup, 0);
  assert.equal(calls.refer.length, 0);
  backdateHold(acc.id, 'rtc_live', 4 * 60 + 1);
  await calls.attach[0].onClosed();
  assert.equal(outboxFor(acc.id).find((e) => e.identifier === 'voice_rtc_live').value, 5);

  // New call: no AI, routed to voicemail.
  const r = await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550304', 'rtc_after_fail'), options);
  assert.equal(r.ok, false);
  assert.equal(r.status, 402);
  assert.equal(r.billing.code, 'billing.payment_failed');
  assert.equal(r.billing.fallback, 'voicemail');
  assert.equal(calls.accept, 1); // only the original live call was ever accepted

  // Paying an unrelated invoice does not unblock; paying the failed one does.
  await payg.handlePaygStripeEvent({ type: 'invoice.paid', data: { object: { id: 'in_test_other', customer: `cus_test_${acc.id}` } } }, paygDeps);
  assert.equal(payg.paygState(acc.id).blocked, true);
  await payg.handlePaygStripeEvent({ type: 'invoice.paid', data: { object: { id: 'in_test_1', customer: `cus_test_${acc.id}` } } }, paygDeps);
  assert.equal(payg.paygState(acc.id).blocked, false);
  assert.equal(payg.paygState(acc.id).eligible, true);
  assert.ok(kenny.some((k) => /payment restored/.test(k.msg.subject)));
  assert.equal((await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550304', 'rtc_restored'), options)).ok, true);
});

test('payment failed on xAI: caller is transferred to MERIDIAN_VOICEMAIL_SIP_URI (no AI)', async () => {
  const number = '+17055550305';
  const { deployment, agentId } = voiceDeployment(number);
  core.updateIntegration(deployment.id, 'brain', { provider: 'xai', status: 'configured', credentialConfigured: true });
  const acc = paygAccount(agentId);
  await payg.markPaymentFailed(acc.id, { invoiceId: 'in_test_x', deps: paygDeps });
  process.env.MERIDIAN_VOICEMAIL_SIP_URI = 'sip:voicemail@example.invalid';
  try {
    const rejects = [];
    let accepted = 0;
    const evt = { type: 'realtime.call.incoming', data: { call_id: '99999999-2222-3333-4444-555555555555', sip_headers: [{ name: 'From', value: '+14165550100' }, { name: 'To', value: number }], metadata: {} } };
    const r = await ingress.processVerifiedRealtimeWebhook(evt, {
      provider: 'xai', providerConfigured: true, environment: 'staging',
      rejectCall: async (x) => { rejects.push(x); }, acceptCall: async () => { accepted += 1; },
    });
    assert.equal(r.billing?.code, 'billing.payment_failed', JSON.stringify(r.plan?.blockers || r.error));
    assert.equal(r.billing.fallback, 'voicemail');
    assert.equal(accepted, 0);
    assert.equal(rejects[0].transferUri, 'sip:voicemail@example.invalid');
  } finally { delete process.env.MERIDIAN_VOICEMAIL_SIP_URI; }
});

test('Twilio voice: payment failed → <Record> voicemail (or team line); voicemail-done notifies the owner', async () => {
  const agent = { id: 'agent_vm', businessName: 'VM Plumbing', config: {} };
  const xml = capVoiceTwiml(agent, 'billing.payment_failed');
  assert.match(xml, /<Record maxLength="120" playBeep="true" action="\/api\/twilio\/voice\/agent_vm\/voicemail-done"/);
  assert.doesNotMatch(xml, /<Gather/);
  const team = capVoiceTwiml({ ...agent, config: { humanTransfer: '+17055550999' } }, 'billing.payment_failed');
  assert.match(team, /<Dial>\+17055550999<\/Dial>/);

  const table = {};
  registerTwilioRoutes({ get() {}, post(p, h) { table[p] = h; } }, { BASE: 'https://meridian.example.invalid' });
  assert.ok(table['/api/twilio/voice/:agentId/voicemail-done']);
  process.env.TWILIO_SKIP_SIGNATURE = '1';
  try {
    let out = '';
    const res = { type() { return res; }, status() { return res; }, send(v) { out = v; return res; }, end() { return res; } };
    await table['/api/twilio/voice/:agentId/voicemail-done']({ query: {}, get: () => '', params: { agentId: 'nope' }, body: {} }, res);
    assert.match(out, /message has been recorded/);
    assert.match(out, /<Hangup\/>/);
  } finally { delete process.env.TWILIO_SKIP_SIGNATURE; }
});

test('card detached → back to stop at cap; re-saved card re-arms PAYG; subscription deleted disables it', async () => {
  const acc = paygAccount(`agent_card_${Date.now()}`);
  const cus = `cus_test_${acc.id}`;
  await payg.handlePaygStripeEvent({ type: 'payment_method.detached', data: { object: { id: 'pm_x', customer: null }, previous_attributes: { customer: cus } } }, paygDeps);
  assert.equal(payg.paygState(acc.id).reason, 'no_valid_card');
  await payg.handlePaygStripeEvent({ type: 'customer.subscription.updated', data: { object: { id: 'sub_x', customer: cus, default_payment_method: 'pm_new' } } }, paygDeps);
  assert.equal(payg.paygState(acc.id).eligible, true);
  await payg.handlePaygStripeEvent({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_x', customer: cus } } }, paygDeps);
  assert.equal(payg.paygState(acc.id).reason, 'payg_off');
});

// ── SMS ─────────────────────────────────────────────────────────────────────

test('SMS: PAYG never refuses at cap; segments beyond plan are metered with the message identifier', async () => {
  const agentId = `agent_sms_${Date.now()}`;
  const acc = paygAccount(agentId);
  const st = billing.usageState(acc.id);
  billing.updateBillingAccount(acc.id, { periodSmsUsed: st.smsIncluded }); // cap reached
  const gate = meter.smsGate({ id: agentId }, 3);
  assert.equal(gate.ok, true);
  assert.equal(gate.payg, true);
  const r = await meter.meterSms(acc.id, 3, { direction: 'outbound', identifier: 'out_SM123' });
  assert.equal(r.ok, true);
  assert.equal(r.paygSegments, 3);
  await meter.meterSms(acc.id, 3, { direction: 'outbound', identifier: 'out_SM123' }); // Twilio retry
  const ev = outboxFor(acc.id).filter((e) => e.metric === 'sms');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].identifier, 'sms_out_SM123');
  assert.equal(ev[0].eventName, 'meridian_sms_segments');
  assert.equal(ev[0].amountCents, 21);
  // No-card client is still refused at cap.
  const noCard = account(`agent_sms_nc_${Date.now()}`);
  billing.updateBillingAccount(noCard.id, { periodSmsUsed: billing.usageState(noCard.id).smsIncluded });
  assert.equal(meter.smsGate({ id: noCard.agentId }, 1).code, 'billing.sms_cap_reached');
});

// ── Checkout + threshold ────────────────────────────────────────────────────

test('PAYG checkout adds metered items, always collects a card, and the threshold is set on the subscription', async () => {
  const params = buildPlanCheckoutSession({ planKey: 'pro', base: 'https://m.example.invalid', billingAccountId: 'acct_x', payg: true });
  assert.deepEqual(params.line_items.slice(-2), [{ price: 'price_test_minute' }, { price: 'price_test_sms' }]);
  assert.equal(params.payment_method_collection, 'always');
  assert.equal(params.metadata.payg, '1');
  assert.equal(params.subscription_data.metadata.payg, '1');
  const plain = buildPlanCheckoutSession({ planKey: 'pro', base: 'https://m.example.invalid', billingAccountId: 'acct_x' });
  assert.equal(plain.metadata.payg, undefined);
  assert.equal(plain.line_items.some((i) => i.price === 'price_test_minute'), false);

  const acc = account(`agent_co_${Date.now()}`, 'pro');
  const stripe = mockStripe();
  const r = await payg.enablePaygFromCheckout({ id: 'cs_test_1', subscription: 'sub_test_co', customer: 'cus_test_checkout', metadata: { payg: '1' } }, { stripe, accountId: acc.id });
  assert.equal(r.enabled, true);
  assert.equal(r.thresholdCents, 5000);
  assert.deepEqual(stripe.calls.update[0].params, { billing_thresholds: { amount_gte: 5000, reset_billing_cycle_anchor: false } });
  assert.match(stripe.calls.update[0].opts.idempotencyKey, /^meridian_threshold_sub_test_co_5000$/);
  assert.equal(payg.paygState(acc.id).eligible, true);
  assert.equal((await payg.enablePaygFromCheckout({ metadata: {} }, { stripe, accountId: acc.id })).reason, 'not_opted_in');
});

// ── Alerts ──────────────────────────────────────────────────────────────────

test('80/100% alerts are informational for PAYG clients ("calls keep working")', () => {
  const acc = paygAccount(`agent_alert_${Date.now()}`);
  const msg = usageAlertMessage(acc, 'minutes', 1);
  assert.match(msg.text, /keep working/);
  assert.match(msg.text, /CA\$0\.45\/min/);
  assert.doesNotMatch(msg.text, /paused/);
  const plain = usageAlertMessage(account(`agent_alert_nc_${Date.now()}`), 'minutes', 1);
  assert.match(plain.text, /paused/);
});

test('PAYG spend alert is informational and sent once per period per limit', async () => {
  const acc = paygAccount(`agent_spend_${Date.now()}`);
  payg.setPaygAlertCents(acc.id, 1000);
  billing.updateBillingAccount(acc.id, { periodPaygCents: 1200, periodPaygMinutes: 26 });
  const c0 = clientMsgs.length;
  assert.equal((await payg.maybeAlertPaygSpend(acc.id, paygDeps)).alerted, true);
  assert.equal((await payg.maybeAlertPaygSpend(acc.id, paygDeps)).alerted, false);
  assert.equal(clientMsgs.length - c0, 1);
  assert.match(clientMsgs.at(-1).msg.text, /Calls keep working/);
});

test('owner contacts + AI-cost-vs-revenue alert fires once per month above 35%', async () => {
  assert.deepEqual(owner.ownerContacts({ OWNER_EMAIL: 'a@x.invalid', MERIDIAN_OWNER_PHONE: '+1555' }), { email: 'a@x.invalid', phone: '+1555' });
  assert.equal(owner.aiCostAlertPct({}), 35);
  assert.equal(owner.aiCostAlertPct({ MERIDIAN_AI_COST_ALERT_PCT: '20' }), 20);
  const period = '2031-01';
  const acc = account(`agent_aicost_${Date.now()}`, 'rescue');
  billing.updateBillingAccount(acc.id, { periodKey: period, periodAiCostCentsEst: 1_000_000 });
  const sends = [];
  const send = async (to, msg) => { sends.push(msg); return { ok: true }; };
  const a = await owner.maybeAlertAiCostRatio({ period, send });
  assert.equal(a.alerted, true);
  assert.ok(a.ratio > 0.35);
  assert.equal((await owner.maybeAlertAiCostRatio({ period, send })).alerted, false);
  assert.equal(sends.length, 1);
  assert.match(sends[0].subject, /AI vendor cost/);
});

// ── Sideband soft nudge ─────────────────────────────────────────────────────

test('sideband: soft wrap-up nudge at 20 min never ends the call; hard notice only at the 60-min ceiling', async () => {
  const timers = [];
  const fakeTimers = { setTimeout: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimeout: () => {} };
  const sent = [];
  let limits = 0;
  const rt = { send: (e) => sent.push(e), on() {}, off() {}, socket: null, close() {} };
  const sb = await connectOpenAIRealtimeSideband({
    callId: 'rtc_nudge', deploymentId: 'dep_fake', realtimeFactory: async () => rt,
    controllerFactory: () => ({ handleServerEvent: async () => ({}), markActive() {}, markConnected() {}, markEnded() {} }),
    limitSeconds: 3600, nudgeSeconds: 1200, timers: fakeTimers, onLimit: () => { limits += 1; },
  });
  assert.equal(sb.ok, true);
  const nudge = timers.find((t) => t.ms === 1200 * 1000);
  assert.ok(nudge, 'nudge timer at 20 min');
  nudge.fn();
  assert.equal(sent.at(-1).response.instructions, SOFT_WRAP_NUDGE);
  assert.match(SOFT_WRAP_NUDGE, /Do not end the call/);
  assert.equal(limits, 0);
  const warn = timers.find((t) => t.ms === 3600 * 1000 - 30 * 1000);
  warn.fn();
  assert.equal(sent.at(-1).response.instructions, CALL_LIMIT_NOTICE);
});
