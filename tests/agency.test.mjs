import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { services } from '../lib/agency-catalog.mjs';
import { renderServicePage } from '../lib/agency-pages.mjs';

const dataDir = mkdtempSync(join(tmpdir(), 'meridian-agency-test-'));
let child, base, port, logs = '', project, onboardingToken;
const opsToken = 'local-test-operations-token';
const body = (extra = {}) => ({ flow: 'agency-v2', name: 'Test Owner', email: 'agency@example.invalid', businessName: 'Test Business', primaryNeed: 'automation', tier: 'foundation', businessWebsite: 'https://example.invalid', goals: 'Reduce duplicate data entry', systems: 'Example CRM', volume: '40', website: '', consent: true, _formStartedAt: Date.now() - 5000, ...extra });
async function request(path, { method = 'GET', payload, token } = {}) {
  const response = await fetch(base + path, { method, headers: { 'User-Agent': 'MeridianLocalIntegration/1.0', ...(payload ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}
async function start() {
  // Deliberate env allowlist: never inherit provider credentials, webhooks or paid integrations.
  child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: {
    PATH: process.env.PATH, PORT: String(port), DATA_DIR: dataDir, PUBLIC_BASE_URL: base,
    OPS_TOKEN: opsToken, MERIDIAN_OPENCLAW_AUTO: '0', MERIDIAN_AUTOPILOT: '0', MERIDIAN_HEALTH_PROBE: '0', MERIDIAN_KNOWLEDGE_REFRESH: '0', MERIDIAN_ARTICLES: '0',
  }, stdio: ['ignore','pipe','pipe'] });
  logs = ''; child.stdout.on('data', x => logs += x); child.stderr.on('data', x => logs += x);
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(logs);
    try { if ((await request('/healthz')).status === 200) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 70));
  }
  throw new Error(`Startup failed: ${logs}`);
}
async function stop() { if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); } }
before(async () => {
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening'); port = socket.address().port; await new Promise(r => socket.close(r));
  base = `http://127.0.0.1:${port}`; await start();
});
after(async () => { await stop(); rmSync(dataDir, { recursive: true, force: true }); });

test('seven distinct service routes and existing agent pages resolve', async () => {
  for (const [slug, service] of Object.entries(services)) {
    const response = await request(`/go/${slug}`); assert.equal(response.status, 200); assert.ok(response.data.includes(service.headline)); assert.ok(response.data.includes(`?service=${slug}`));
  }
  assert.equal((await request('/go/missing')).status, 404);
  assert.equal(renderServicePage('constructor'), null);
  for (const path of ['/meridian-2.html','/meridian-offer.html','/meridian-proposal.html','/meridian-onboarding.html','/meridian-operations.html','/agent-voice.html','/agent-sales.html','/agent-booking.html','/setup','/css/agency.css','/js/agency.js']) assert.equal((await request(path)).status, 200, path);
});
test('invalid submissions cannot create or expose projects', async () => {
  for (const extra of [{ consent: false }, { consent: 'true' }, { email: {} }, { primaryNeed: 'constructor' }, { businessWebsite: 'javascript:alert(1)' }, { website: 'spam' }]) {
    const response = await request('/api/funnel', { method: 'POST', payload: body(extra) }); assert.equal(response.status, 400); assert.equal(response.data.onboardingPath, undefined);
  }
  assert.equal((await request('/api/agency/project')).status, 401);
  assert.equal((await request('/api/ops/agency/projects')).status, 401);
});
test('business website, goals and systems persist; real scope is returned', async () => {
  const response = await request('/api/funnel', { method: 'POST', payload: body() });
  assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
  project = response.data.project; onboardingToken = response.data.onboardingPath.split('#')[1];
  assert.equal(project.proposal.status, 'scope_required'); assert.equal(project.proposal.agentNeed, null);
  assert.equal(project.proposal.setupUsd, undefined); assert.equal(project.proposal.kitCheckout, undefined);
  assert.equal(project.stage, 'proposal');
  const stored = JSON.parse(readFileSync(join(dataDir, 'leads.json'))).leads[0];
  assert.equal(stored.agency.input.businessWebsite, 'https://example.invalid'); assert.equal(stored.agency.input.systems, 'Example CRM'); assert.equal(stored.agency.input.goals, 'Reduce duplicate data entry');
});
test('duplicate email never resets work or returns the private token', async () => {
  const r = await request('/api/funnel', { method: 'POST', payload: body({ goals: 'Overwrite attempt' }) });
  assert.equal(r.status, 409); assert.equal(r.data.onboardingPath, undefined);
  const legacy = await request('/api/funnel', { method:'POST', payload:{email:'agency@example.invalid', consent:true, primaryNeed:'voice'} }); assert.equal(legacy.status,409);
  const p = await request('/api/agency/project', { token: onboardingToken }); assert.equal(p.status, 200); assert.equal(p.data.project.stage, 'proposal');
  assert.equal(JSON.stringify(p.data).includes(onboardingToken), false);
});
test('custom onboarding cannot provision through legacy agent intake', async () => {
  const lead = JSON.parse(readFileSync(join(dataDir, 'leads.json'))).leads[0];
  const r = await request(`/api/intake/${lead.intakeToken}`, { method: 'POST', payload: { businessName: 'Test' } }); assert.equal(r.status, 400);
  const pending = await request('/api/agency/project/intake', { method: 'PUT', token: onboardingToken, payload: { hours:'9–5', services:'Test', owner:'Owner' } }); assert.equal(pending.status, 409);
});
test('stage transitions require authorization, order, intake and recorded acceptance', async () => {
  const path = `/api/ops/agency/projects/${project.id}`;
  const advance = (stage, extra = {}) => request(path, { method:'PATCH', token:opsToken, payload:{ stage, evidence:'Local test evidence: acceptance documented.', ...extra } });
  assert.equal((await request(path, { method:'PATCH', payload:{stage:'approval'} })).status, 401);
  assert.equal((await advance('operate')).status, 409);
  assert.equal((await advance('approval', { evidence:'' })).status, 400);
  assert.equal((await advance('approval')).status, 200);
  assert.equal((await advance('intake')).status, 400);
  assert.equal((await advance('intake', { commercialApproved:true })).status, 400);
  assert.equal((await advance('intake', { commercialApproved:true, setupFee:100, monthlyFee:50, currency:'CAD', scopeNotes:'TEST ONLY: one local workflow, no external provider usage, agreed test timeline.' })).status, 200);
  assert.equal((await advance('access')).status, 409);
  assert.equal((await request('/api/agency/project/intake', { method:'PUT', token:onboardingToken, payload:{ hours:'Mon–Fri 9–5', services:'Workflow automation', owner:'Test Owner', rules:'Escalate failures' } })).status, 200);
  for (const stage of ['access','design','build','qa']) assert.equal((await advance(stage)).status, 200);
  assert.equal((await advance('go-live')).status, 400);
  assert.equal((await advance('go-live', { qaPassed:true })).status, 200);
  assert.equal((await advance('operate')).status, 400);
  assert.equal((await advance('operate', { clientAccepted:true })).status, 200);
  assert.equal((await advance('improve')).status, 200);
  const projects = await request('/api/ops/agency/projects', { token:opsToken }); assert.equal(projects.data.projects[0].evidence.length, 10);
});
test('client state survives process restart using DATA_DIR', async () => {
  await stop(); await start(); const response = await request('/api/agency/project', { token:onboardingToken });
  assert.equal(response.status, 200); assert.equal(response.data.project.stage, 'improve'); assert.equal(response.data.project.intakeReceived, true); assert.equal(response.data.project.proposal.status, 'approved'); assert.equal(response.data.project.proposal.quote.currency, 'CAD');
});
test('telephony diagnostics handler never exposes a configured webhook token', async () => {
  const { registerTwilioRoutes } = await import('../lib/twilio-routes.mjs');
  const previous = process.env.TWILIO_WEBHOOK_TOKEN;
  process.env.TWILIO_WEBHOOK_TOKEN = 'local-test-webhook-secret';
  try {
    let handler, result;
    registerTwilioRoutes({ get(path, callback) { if (path === '/api/twilio/status') handler = callback; }, post() {} }, { BASE: base });
    handler({}, { json(value) { result = value; } });
    assert.equal(result.webhookTokenSet, true);
    assert.equal(JSON.stringify(result).includes('local-test-webhook-secret'), false);
  } finally {
    if (previous === undefined) delete process.env.TWILIO_WEBHOOK_TOKEN;
    else process.env.TWILIO_WEBHOOK_TOKEN = previous;
  }
});
test('legacy voice funnel still returns its existing agent proposal', async () => {
  const r = await request('/api/funnel', { method:'POST', payload:{ email:'voice@example.invalid', businessName:'Voice Regression', primaryNeed:'voice', consent:true, website:'' } });
  assert.equal(r.status, 200); assert.deepEqual(r.data.proposal.agents, ['Voice Agent']); assert.equal(r.data.stage, 'awaiting_money');
});
