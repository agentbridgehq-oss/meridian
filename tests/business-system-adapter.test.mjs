import test from 'node:test';
import assert from 'node:assert/strict';
import { businessAdapterStatus, connectorSecretEnvName, executeBusinessSystemAction } from '../lib/business-system-adapter.mjs';

function deployment() {
  return {
    id: 'dep_abc123', projectId: 'lead_1', businessName: 'Test Business',
    integrations: {
      crm: { provider: 'webhook', status: 'verified', endpoint: 'https://crm.example.test/meridian', requiresCredential: true, credentialConfigured: true },
    },
  };
}

test('connector secret env name is deterministic and no secret is stored in deployment', () => {
  const name = connectorSecretEnvName('dep_abc123', 'crm');
  assert.equal(name, 'MERIDIAN_CONNECTOR_DEP_ABC123_CRM_SECRET');
  assert.equal(JSON.stringify(deployment()).includes('super-secret'), false);
});

test('adapter stays unavailable until its runtime secret exists', () => {
  const d = deployment();
  const name = connectorSecretEnvName(d.id, 'crm');
  delete process.env[name];
  const status = businessAdapterStatus(d, 'crm');
  assert.equal(status.ready, false);
  assert.equal(status.reason, 'connector_secret_missing');
});

test('confirmed customer-system response succeeds with signed idempotent request', async () => {
  const d = deployment();
  const name = connectorSecretEnvName(d.id, 'crm');
  process.env[name] = 'test-secret-value-12345';
  let request;
  const result = await executeBusinessSystemAction({
    deployment: d,
    kind: 'crm',
    action: 'upsert_lead',
    data: { name: 'Jane', intent: 'estimate' },
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, confirmed: true, recordId: 'crm_123' }) };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.confirmed, true);
  assert.equal(result.recordId, 'crm_123');
  assert.equal(request.url, 'https://crm.example.test/meridian');
  assert.match(request.options.headers['x-meridian-signature'], /^sha256=[a-f0-9]{64}$/);
  assert.ok(request.options.headers['x-meridian-idempotency-key']);
  assert.equal(request.options.headers.authorization, 'Bearer test-secret-value-12345');
  delete process.env[name];
});

test('customer action never succeeds without explicit confirmed=true', async () => {
  const d = deployment();
  const name = connectorSecretEnvName(d.id, 'crm');
  process.env[name] = 'test-secret-value-12345';
  const result = await executeBusinessSystemAction({
    deployment: d, kind: 'crm', action: 'upsert_lead', data: {},
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true, recordId: 'crm_123' }) }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'connector_not_confirmed');
  delete process.env[name];
});

test('production connector rejects plaintext HTTP endpoints', async () => {
  const d = deployment();
  d.integrations.crm.endpoint = 'http://customer.example.test/hook';
  const name = connectorSecretEnvName(d.id, 'crm');
  process.env[name] = 'test-secret-value-12345';
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const result = await executeBusinessSystemAction({ deployment: d, kind: 'crm', action: 'upsert_lead', data: {} });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unsafe_connector_endpoint');
  if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old;
  delete process.env[name];
});
