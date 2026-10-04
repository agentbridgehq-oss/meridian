// Live-channel metering: OpenAI Realtime voice, Twilio <Gather> voice, Twilio SMS,
// alert delivery + dedupe. All transports are mocked; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-usage-metering-'));
process.env.DATA_DIR = dir;
process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = path.join(dir, 'deployment-core.json');
process.env.MERIDIAN_INBOUND_ROUTE_FILE = path.join(dir, 'inbound-routes.json');
process.env.MERIDIAN_REALTIME_CALL_FILE = path.join(dir, 'realtime-calls.json');
// Never inherit live provider credentials.
for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'TWILIO_WEBHOOK_TOKEN', 'RESEND_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY', 'MERIDIAN_WEBHOOK_URL', 'TWILIO_AGENT_MAP']) delete process.env[k];

const engine = await import('../engine.mjs');
const core = await import('../lib/deployment-core.mjs');
const { provisionManagedRuntime } = await import('../lib/managed-runtime.mjs');
const routing = await import('../lib/inbound-routing.mjs');
const ingress = await import('../lib/openai-realtime-ingress.mjs');
const billing = await import('../lib/usage-billing.mjs');
const meter = await import('../lib/usage-meter.mjs');
const alertsMod = await import('../lib/usage-alerts.mjs');
const events = await import('../lib/processed-events.mjs');
const { connectOpenAIRealtimeSideband, CALL_LIMIT_NOTICE } = await import('../lib/openai-realtime-sideband.mjs');
const { handleInboundSms } = await import('../lib/twilio-channel.mjs');
const { registerTwilioRoutes } = await import('../lib/twilio-routes.mjs');

// Mock alert transport for every metering call in this file.
const sentAlerts = [];
let notifyImpl = async () => ({ ok: true, results: { email: { ok: true } } });
meter.meterDeps.notify = async (target, msg) => { sentAlerts.push({ target, msg }); return notifyImpl(target, msg); };

let seq = 0;
function incoming(number, callId) {
  return { type: 'realtime.call.incoming', data: { call_id: callId, sip_headers: [{ name: 'Diversion', value: `<sip:${number}@twilio.com>` }, { name: 'To', value: '<sip:project@sip.api.openai.com>' }] } };
}
function voiceDeployment(number) {
  seq += 1;
  const lead = engine.upsertLead({
    email: `metering-${seq}@example.invalid`, businessName: `Metering HVAC ${seq}`, primaryNeed: 'voice', consent: true,
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
  assert.equal(routing.setInboundRouteEnabled(route.id, true, { evidence: 'Staging route for metering test.' }).ok, true);
  const agentId = engine.getLead(d.projectId).managedRuntime.agentId;
  return { deployment: d, agentId };
}
function account(agentId, plan = 'rescue', patch = {}) {
  const acc = billing.ensureBillingAccount({ agentId, email: `${agentId}@example.invalid` });
  if (plan) assert.equal(billing.activateSubscription(acc.id, plan).ok, true);
  if (Object.keys(patch).length) billing.updateBillingAccount(acc.id, patch);
  return billing.getBillingAccount(acc.id);
}
function backdateHold(accountId, callId, seconds) {
  const acc = billing.getBillingAccount(accountId);
  const hold = acc.voiceHolds[callId];
  billing.updateBillingAccount(accountId, { voiceHolds: { ...acc.voiceHolds, [callId]: { ...hold, startedAt: new Date(Date.now() - seconds * 1000).toISOString() } } });
}
function rtOptions(extra = {}) {
  const calls = { accept: 0, reject: [], hangup: 0, refer: [], attach: [] };
  const options = {
    environment: 'staging', openAIConfigured: true, requireSideband: true,
    acceptCall: async () => { calls.accept += 1; },
    rejectCall: async (r) => { calls.reject.push(r); },
    hangupCall: async () => { calls.hangup += 1; },
    referCall: async (r) => { calls.refer.push(r); },
    attachSideband: async (input) => { calls.attach.push(input); return { ok: true }; },
    ...extra,
  };
  return { options, calls };
}
const counts = (id) => billing.usageState(id);

// ── OpenAI Realtime voice ───────────────────────────────────────────────────

test('realtime: unmapped deployment fails safe — rejected before accept, no AI', async () => {
  const { deployment } = voiceDeployment('+17055550201');
  const { options, calls } = rtOptions();
  const r = await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550201', 'rtc_meter_unmapped'), options);
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
  assert.deepEqual(r.plan.blockers, ['billing.account_unmapped']);
  assert.equal(calls.accept, 0);
  assert.equal(calls.reject.length, 1);
  assert.equal(calls.reject[0].statusCode, 480);
  assert.equal(r.plan.deployment.id, deployment.id);
});

test('realtime: account without active plan or prepaid fails safe', async () => {
  const { agentId } = voiceDeployment('+17055550202');
  account(agentId, null);
  const { options, calls } = rtOptions();
  const r = await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550202', 'rtc_meter_noplan'), options);
  assert.deepEqual(r.plan.blockers, ['billing.plan_inactive']);
  assert.equal(calls.accept, 0);
});

test('realtime: active plan accepts with a 20-min per-call allowance and settles minutes on close', async () => {
  const { agentId } = voiceDeployment('+17055550203');
  const acc = account(agentId, 'rescue');
  const { options, calls } = rtOptions();
  const r = await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550203', 'rtc_meter_ok'), options);
  assert.equal(r.ok, true);
  assert.equal(calls.accept, 1);
  assert.equal(calls.attach[0].limitSeconds, 20 * 60);
  assert.equal(counts(acc.id).heldMinutes, 20);
  backdateHold(acc.id, 'rtc_meter_ok', 5 * 60 + 10); // 5m10s → 6 billed minutes
  await calls.attach[0].onClosed();
  await calls.attach[0].onClosed(); // idempotent
  const st = counts(acc.id);
  assert.equal(st.minutesUsed, 6);
  assert.equal(st.heldMinutes, 0);
});

test('realtime: per-call cap — a 45-minute call bills at most 20 minutes', async () => {
  const { agentId } = voiceDeployment('+17055550204');
  const acc = account(agentId, 'pro');
  const { options, calls } = rtOptions();
  await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550204', 'rtc_meter_long'), options);
  backdateHold(acc.id, 'rtc_meter_long', 45 * 60);
  await calls.attach[0].onClosed();
  assert.equal(counts(acc.id).minutesUsed, 20);
});

test('realtime: at cap the call is declined before the AI answers (stop at cap)', async () => {
  const { agentId } = voiceDeployment('+17055550205');
  const acc = account(agentId, 'rescue', { periodTurnsUsed: 200 });
  const { options, calls } = rtOptions();
  const r = await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550205', 'rtc_meter_cap'), options);
  assert.equal(r.ok, false);
  assert.equal(r.status, 402);
  assert.deepEqual(r.plan.blockers, ['billing.voice_cap_reached']);
  assert.equal(calls.accept, 0);
  assert.equal(calls.reject[0].statusCode, 480);
  assert.equal(counts(acc.id).minutesUsed, 200);
});

test('realtime: allowance shrinks to remaining minutes; included used before prepaid', async () => {
  const { agentId } = voiceDeployment('+17055550206');
  const acc = account(agentId, 'rescue', { periodTurnsUsed: 198, prepaidTurns: 3 });
  const { options, calls } = rtOptions();
  await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550206', 'rtc_meter_tail'), options);
  assert.equal(calls.attach[0].limitSeconds, 5 * 60); // 2 included + 3 prepaid
  // A concurrent call cannot double-spend the held minutes.
  const { options: o2, calls: c2 } = rtOptions();
  const r2 = await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550206', 'rtc_meter_tail2'), o2);
  assert.deepEqual(r2.plan.blockers, ['billing.voice_cap_reached']);
  assert.equal(c2.accept, 0);
  backdateHold(acc.id, 'rtc_meter_tail', 4 * 60 + 1); // 5 billed
  await calls.attach[0].onClosed();
  const st = counts(acc.id);
  assert.equal(st.minutesUsed, 200);
  assert.equal(st.prepaidMinutes, 0);
});

test('realtime: allowance spent mid-call → transfer to verified human line, else hang up', async () => {
  const { deployment, agentId } = voiceDeployment('+17055550207');
  account(agentId, 'pro');
  const { options, calls } = rtOptions();
  await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550207', 'rtc_meter_limit'), options);
  const res = await calls.attach[0].onLimit();
  assert.equal(res.action, 'hangup');
  assert.equal(calls.hangup, 1);

  core.updateDeploymentConfig(deployment.id, { agent: { ...(core.getDeployment(deployment.id).config?.agent || {}), humanTransfer: '+17055550999' } });
  assert.equal(core.updateIntegration(deployment.id, 'destination', { provider: 'twilio', status: 'verified', credentialConfigured: true, evidence: 'Owner line answered a test transfer.' }).ok, true);
  const r2 = await ingress.enforceCallLimit(options, { callId: 'rtc_meter_limit', deployment: { id: deployment.id } });
  assert.equal(r2.action, 'transferred');
  assert.equal(calls.refer[0].targetUri, 'tel:+17055550999');
  assert.equal(calls.hangup, 1);
});

test('realtime: provider accept failure releases the hold without billing', async () => {
  const { agentId } = voiceDeployment('+17055550208');
  const acc = account(agentId, 'rescue');
  const { options } = rtOptions({ acceptCall: async () => { throw new Error('synthetic accept failure'); } });
  const r = await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550208', 'rtc_meter_fail'), options);
  assert.equal(r.ok, false);
  const st = counts(acc.id);
  assert.equal(st.heldMinutes, 0);
  assert.equal(st.minutesUsed, 0);
});

test('sideband: polite wrap-up notice, then onLimit; onClosed fires once', async () => {
  const pending = [];
  const timers = { setTimeout: (fn, ms) => { const t = { fn, ms }; pending.push(t); return t; }, clearTimeout: (t) => { t.cleared = true; } };
  const sent = [];
  let limits = 0, closes = 0;
  const rt = { send: (e) => sent.push(e), on() {}, off() {}, close() {} };
  const conn = await connectOpenAIRealtimeSideband({
    callId: 'rtc_sideband_limit', deploymentId: 'dep_x', limitSeconds: 300, warnSeconds: 30,
    realtimeFactory: async () => rt,
    controllerFactory: () => ({ handleServerEvent: async () => ({ clientEvents: [] }), markActive() {}, markConnected() {}, markEnded() {} }),
    onLimit: async () => { limits += 1; }, onClosed: async () => { closes += 1; }, timers,
  });
  assert.equal(conn.ok, true);
  assert.deepEqual(pending.map((t) => t.ms), [270000, 300000]);
  pending[0].fn();
  assert.equal(sent[0].type, 'response.create');
  assert.equal(sent[0].response.instructions, CALL_LIMIT_NOTICE);
  pending[1].fn();
  await new Promise((r) => setImmediate(r));
  assert.equal(limits, 1);
  conn.close(); conn.close();
  await new Promise((r) => setImmediate(r));
  assert.equal(closes, 1);
  assert.ok(pending.every((t) => t.cleared));
});

// ── Twilio <Gather> voice ───────────────────────────────────────────────────

function twilioAgent({ humanTransfer = '' } = {}) {
  seq += 1;
  const lead = engine.upsertLead({ email: `twilio-meter-${seq}@example.invalid`, businessName: `Twilio Meter ${seq}`, primaryNeed: 'voice', consent: true });
  const agent = engine.provisionClientAgent({ ...lead, intake: { businessName: `Twilio Meter ${seq}`, humanTransfer } });
  return engine.getAgent(agent.id || agent.agentId || agent.agent?.id);
}
function routes() {
  const table = {};
  registerTwilioRoutes({ get() {}, post(p, h) { table[p] = h; } }, { BASE: 'https://meridian.example.invalid' });
  return table;
}
async function call(handler, req) {
  let out = { status: 200, body: '' };
  const res = { type() { return res; }, status(c) { out.status = c; return res; }, send(v) { out.body = v; return res; }, end() { return res; } };
  await handler({ query: {}, get: () => '', ...req }, res);
  return out;
}
const withSkippedSignature = async (fn) => { process.env.TWILIO_SKIP_SIGNATURE = '1'; try { return await fn(); } finally { delete process.env.TWILIO_SKIP_SIGNATURE; } };

test('twilio voice: unmapped agent gets no-AI TwiML; mapped gets <Gather>; at cap transfers to the team', async () => {
  await withSkippedSignature(async () => {
    const t = routes();
    const agent = twilioAgent({ humanTransfer: '+17055550888' });
    let r = await call(t['/api/twilio/voice/:agentId'], { params: { agentId: agent.id }, body: { CallSid: 'CA_unmapped' } });
    assert.doesNotMatch(r.body, /<Gather/);
    assert.match(r.body, /<Dial>\+17055550888<\/Dial>/);

    const acc = account(agent.id, 'rescue');
    r = await call(t['/api/twilio/voice/:agentId'], { params: { agentId: agent.id }, body: { CallSid: 'CA_ok' } });
    assert.match(r.body, /<Gather/);
    assert.equal(counts(acc.id).heldMinutes, 20);

    billing.updateBillingAccount(acc.id, { periodTurnsUsed: 200, voiceHolds: {} });
    r = await call(t['/api/twilio/voice/:agentId'], { params: { agentId: agent.id }, body: { CallSid: 'CA_cap' } });
    assert.doesNotMatch(r.body, /<Gather/);
    assert.match(r.body, /not available right now/);
    assert.match(r.body, /<Dial>/);
  });
});

test('twilio voice: turn after the allowance is spent stops the AI and bills the 20-min cap; status callback settles', async () => {
  await withSkippedSignature(async () => {
    const t = routes();
    const agent = twilioAgent();
    const acc = account(agent.id, 'pro');
    await call(t['/api/twilio/voice/:agentId'], { params: { agentId: agent.id }, body: { CallSid: 'CA_long' } });
    backdateHold(acc.id, 'twilio:CA_long', 21 * 60);
    const r = await call(t['/api/twilio/voice/:agentId/turn'], { params: { agentId: agent.id }, body: { CallSid: 'CA_long', SpeechResult: 'still there?' } });
    assert.match(r.body, /<Hangup\/>/);
    assert.doesNotMatch(r.body, /<Gather/);
    assert.equal(counts(acc.id).minutesUsed, 20);

    await call(t['/api/twilio/voice/:agentId'], { params: { agentId: agent.id }, body: { CallSid: 'CA_short' } });
    const s = await call(t['/api/twilio/voice/:agentId/status'], { params: { agentId: agent.id }, body: { CallSid: 'CA_short', CallStatus: 'completed', CallDuration: '95' } });
    assert.equal(s.status, 204);
    assert.equal(counts(acc.id).minutesUsed, 22);
    assert.equal(counts(acc.id).heldMinutes, 0);
    const f = await call(t['/api/twilio/voice/:agentId/fallback'], { params: { agentId: agent.id }, body: {} });
    assert.match(f.body, /not available right now/);
  });
});

test('twilio routes still reject unsigned requests on the new status/fallback routes', async () => {
  const t = routes();
  process.env.TWILIO_AUTH_TOKEN = 'dummy-local-token';
  try {
    for (const p of ['/api/twilio/voice/:agentId/status', '/api/twilio/voice/:agentId/fallback']) {
      const r = await call(t[p], { params: { agentId: 'x' }, body: {}, originalUrl: '/x', protocol: 'https' });
      assert.equal(r.status, 403, p);
    }
  } finally { delete process.env.TWILIO_AUTH_TOKEN; }
});

// ── Twilio SMS ──────────────────────────────────────────────────────────────

test('sms: unmapped number → no AI reply (empty TwiML)', async () => {
  const agent = twilioAgent();
  const xml = await handleInboundSms({ agent, body: 'Do you fix furnaces?', from: '+17055550100', to: '+17055550199' });
  assert.equal(xml, '<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
});

test('sms: active plan → AI reply; inbound + reply segments metered (included first, then prepaid)', async () => {
  const agent = twilioAgent();
  const acc = account(agent.id, 'rescue', { periodSmsUsed: 299, prepaidSmsSegments: 10 });
  const xml = await handleInboundSms({ agent, body: 'What are your hours?', from: '+17055550101', to: '+17055550199' });
  assert.match(xml, /<Message>.+<\/Message>/);
  const st = counts(acc.id);
  assert.equal(st.smsUsed, 300); // 1 included left → inbound
  assert.ok(st.prepaidSms < 10); // reply came from prepaid
});

test('sms: at cap → no AI reply, single notice per customer per period; STOP still answered', async () => {
  const agent = twilioAgent();
  const acc = account(agent.id, 'rescue', { periodSmsUsed: 300 });
  const first = await handleInboundSms({ agent, body: 'Can someone come today?', from: '+17055550102', to: '+17055550199' });
  assert.match(first, /Our team will reply to you personally/);
  const second = await handleInboundSms({ agent, body: 'Hello?', from: '+17055550102', to: '+17055550199' });
  assert.equal(second, '<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  const stop = await handleInboundSms({ agent, body: 'STOP', from: '+17055550102', to: '+17055550199' });
  assert.match(stop, /unsubscribed/);
  assert.ok(billing.getBillingAccount(acc.id).periodSmsOverflow >= 1);
});

test('sms: outbound customer SMS is metered and refused at cap', async () => {
  const agent = twilioAgent();
  const acc = account(agent.id, 'rescue', { periodSmsUsed: 299 });
  let sends = 0;
  const send = async () => { sends += 1; return { ok: true }; };
  assert.equal((await meter.sendMeteredCustomerSms(agent, { to: '+17055550103', body: 'Your booking is confirmed.' }, { send })).ok, true);
  assert.equal(counts(acc.id).smsUsed, 300);
  const refused = await meter.sendMeteredCustomerSms(agent, { to: '+17055550103', body: 'Reminder.' }, { send });
  assert.equal(refused.skipped, true);
  assert.equal(refused.reason, 'billing.sms_cap_reached');
  assert.equal(sends, 1);
  const unmapped = await meter.sendMeteredCustomerSms(twilioAgent(), { to: '+17055550103', body: 'Hi' }, { send });
  assert.equal(unmapped.reason, 'billing.account_unmapped');
  assert.equal(sends, 1);
});

test('sms: segment counting follows GSM-7 / UCS-2 rules', () => {
  assert.equal(billing.smsSegmentCount('a'.repeat(160)), 1);
  assert.equal(billing.smsSegmentCount('a'.repeat(161)), 2);
  assert.equal(billing.smsSegmentCount('é'.repeat(70) + 'ж'), 2);
  assert.equal(billing.smsSegmentCount('€'.repeat(80)), 1);
  assert.equal(billing.smsSegmentCount('€'.repeat(81)), 2);
});

// ── Usage alerts ────────────────────────────────────────────────────────────

test('alerts: 80% and 100% delivered to the owner once per threshold per period (voice + sms)', async () => {
  sentAlerts.length = 0;
  notifyImpl = async () => ({ ok: true, results: { email: { ok: true } } });
  const agent = twilioAgent();
  engine.updateAgentConfig(agent.id, { ownerNotifyEmail: 'owner@example.invalid', ownerNotifyPhone: '+17055550777' });
  const acc = account(agent.id, 'rescue', { periodTurnsUsed: 150 });
  const run = async (callId, seconds) => {
    billing.reserveVoiceCall(acc.id, callId);
    await meter.realtimeUsageMeter.endCall({ accountId: acc.id, callId, durationSeconds: seconds });
  };
  await run('rtc_alert_1', 10 * 60); // 160 / 200 = 80%
  assert.equal(sentAlerts.length, 1);
  assert.match(sentAlerts[0].msg.subject, /80%/);
  assert.equal(sentAlerts[0].target.config.ownerNotifyEmail, 'owner@example.invalid');
  assert.equal(sentAlerts[0].msg.forceSms, true);
  await run('rtc_alert_2', 5 * 60); // 165 — no new threshold
  await alertsMod.deliverUsageAlerts(acc.id, { notify: meter.meterDeps.notify });
  assert.equal(sentAlerts.length, 1);
  await run('rtc_alert_3', 20 * 60); // 185
  await run('rtc_alert_4', 20 * 60); // 200 = 100%
  assert.equal(sentAlerts.length, 2);
  assert.match(sentAlerts[1].msg.subject, /100%/);
  assert.match(sentAlerts[1].msg.text, /paused/);

  await meter.meterSms(acc.id, 240, { direction: 'outbound' }); // 240/300 = 80% sms
  assert.equal(sentAlerts.length, 3);
  assert.match(sentAlerts[2].msg.subject, /SMS segments/);
  await alertsMod.deliverUsageAlerts(acc.id, { notify: meter.meterDeps.notify });
  assert.equal(sentAlerts.length, 3);

  const period = billing.getBillingAccount(acc.id).periodKey;
  assert.equal(events.getClaim(alertsMod.usageAlertKey(acc.id, period, 'minutes', 0.8)).status, 'done');
  assert.equal(events.getClaim(alertsMod.usageAlertKey(acc.id, period, 'minutes', 1)).status, 'done');
});

test('alerts: failed delivery is retried on the next metering event, then sent once', async () => {
  sentAlerts.length = 0;
  let fail = true;
  notifyImpl = async () => (fail ? { ok: false, error: 'synthetic transport failure' } : { ok: true, results: { sms: { ok: true } } });
  const agent = twilioAgent();
  const acc = account(agent.id, 'rescue', { periodSmsUsed: 239 });
  await meter.meterSms(acc.id, 1); // 80%
  assert.equal(sentAlerts.length, 1);
  fail = false;
  await alertsMod.deliverUsageAlerts(acc.id, { notify: meter.meterDeps.notify });
  assert.equal(sentAlerts.length, 2);
  await alertsMod.deliverUsageAlerts(acc.id, { notify: meter.meterDeps.notify });
  assert.equal(sentAlerts.length, 2);
  notifyImpl = async () => ({ ok: true, results: { email: { ok: true } } });
});

test('alerts: account email is used when the agent has no owner contact', async () => {
  sentAlerts.length = 0;
  const agent = twilioAgent();
  const acc = account(agent.id, 'rescue', { periodSmsUsed: 239 });
  await meter.meterSms(acc.id, 1);
  assert.equal(sentAlerts[0].target.config.ownerNotifyEmail, `${agent.id}@example.invalid`);
});

// ── Idempotency primitives ──────────────────────────────────────────────────

test('processed events: concurrent processOnce runs the side effect once; failure releases for retry', async () => {
  let runs = 0;
  const fn = async () => { runs += 1; await new Promise((r) => setTimeout(r, 20)); return { lead: { intakeToken: 't1' } }; };
  const [a, b, c] = await Promise.all([events.processOnce('k:concurrent', fn), events.processOnce('k:concurrent', fn), events.processOnce('k:concurrent', fn)]);
  assert.equal(runs, 1);
  assert.equal([a, b, c].filter((x) => !x.duplicate).length, 1);
  const later = await events.processOnce('k:concurrent', fn);
  assert.equal(later.duplicate, true);
  assert.deepEqual(later.result, { lead: { intakeToken: 't1' } });

  let attempts = 0;
  await assert.rejects(events.processOnce('k:fail', async () => { attempts += 1; throw new Error('boom'); }));
  const retry = await events.processOnce('k:fail', async () => { attempts += 1; return 'ok'; });
  assert.equal(retry.duplicate, false);
  assert.equal(attempts, 2);
  assert.equal(events.claimOnce('k:fail').claimed, false);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
