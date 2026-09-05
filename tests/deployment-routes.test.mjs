import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';

const dataDir = mkdtempSync(join(tmpdir(), 'meridian-deployment-routes-'));
const opsToken = 'deployment-route-test-token';
let child, base, port, projectId, clientToken, deploymentId;

async function req(path, { method = 'GET', payload, token } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'User-Agent': 'MeridianDeploymentRouteTest/1.0',
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}

before(async () => {
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  port = socket.address().port; await new Promise(r => socket.close(r)); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      PATH: process.env.PATH, PORT: String(port), DATA_DIR: dataDir, PUBLIC_BASE_URL: base, OPS_TOKEN: opsToken,
      MERIDIAN_OPENCLAW_AUTO:'0', MERIDIAN_AUTOPILOT:'0', MERIDIAN_HEALTH_PROBE:'0', MERIDIAN_KNOWLEDGE_REFRESH:'0', MERIDIAN_ARTICLES:'0',
    }, stdio: ['ignore','pipe','pipe'],
  });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Server exited before test startup');
    try { if ((await req('/healthz')).status === 200) return; } catch {}
    await new Promise(r => setTimeout(r, 60));
  }
  throw new Error('Server startup timed out');
});
after(async () => {
  if (child?.exitCode === null) { child.kill(); await once(child, 'exit'); }
  rmSync(dataDir, { recursive: true, force: true });
});

test('agency build stage automatically creates one durable deployment', async () => {
  const created = await req('/api/funnel', { method:'POST', payload:{
    flow:'agency-v2', name:'Voice Owner', email:'deploy-route@example.invalid', businessName:'Deployment Route HVAC',
    primaryNeed:'voice', tier:'growth', businessWebsite:'https://example.invalid', goals:'Never miss a qualified call', systems:'CRM and calendar', volume:'25 calls/day', phone:'+17055550100', consent:true, _formStartedAt:Date.now()-5000,
  }});
  assert.equal(created.status, 201); projectId = created.data.project.id; clientToken = created.data.onboardingPath.split('#')[1];
  const stagePath = `/api/ops/agency/projects/${projectId}`;
  const advance = (stage, extra={}) => req(stagePath, { method:'PATCH', token:opsToken, payload:{ stage, evidence:'Deployment route integration test evidence.', ...extra } });
  assert.equal((await advance('approval')).status, 200);
  assert.equal((await advance('intake', { commercialApproved:true, setupFee:1200, monthlyFee:497, currency:'CAD', scopeNotes:'Voice deployment with telephony, approved business knowledge and call outcome routing.' })).status, 200);
  assert.equal((await req('/api/agency/project/intake', { method:'PUT', token:clientToken, payload:{ hours:'Mon-Fri 8-6', services:'HVAC service and estimates', owner:'Voice Owner', rules:'Transfer emergencies to the approved owner number.' } })).status, 200);
  assert.equal((await advance('access')).status, 200);
  assert.equal((await advance('design')).status, 200);
  const build = await advance('build');
  assert.equal(build.status, 200); assert.equal(build.data.deployment.service, 'voice'); assert.equal(build.data.deployment.status, 'integrating');
  deploymentId = build.data.deployment.id;

  const list = await req('/api/ops/deployments', { token:opsToken });
  assert.equal(list.status, 200); assert.equal(list.data.deployments.length, 1); assert.equal(list.data.deployments[0].id, deploymentId);
  assert.equal(list.data.deployments[0].readiness.canActivate, false);
});

test('deployment ops endpoints are private, idempotent and cannot bypass readiness', async () => {
  assert.equal((await req('/api/ops/deployments')).status, 401);
  assert.equal((await req(`/api/ops/deployments/${deploymentId}`)).status, 401);
  const duplicate = await req(`/api/ops/deployments/from-project/${projectId}`, { method:'POST', token:opsToken, payload:{} });
  assert.equal(duplicate.status, 201); assert.equal(duplicate.data.created, false); assert.equal(duplicate.data.deployment.id, deploymentId);
  const activate = await req(`/api/ops/deployments/${deploymentId}/activate`, { method:'POST', token:opsToken, payload:{ evidence:'Attempted before integrations and QA were complete.' } });
  assert.equal(activate.status, 409); assert.ok(activate.data.blockers.some(x => x.startsWith('integration.'))); assert.ok(activate.data.blockers.some(x => x.startsWith('qa.')));
});
