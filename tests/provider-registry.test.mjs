import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeploymentManifest, providerCatalog, recommendedProvider, validateProvider } from '../lib/provider-registry.mjs';

test('voice provider defaults use OpenAI Realtime and Twilio SIP without exposing secret values', () => {
  const catalog = providerCatalog();
  assert.equal(catalog.openai.defaults.realtimeModel, 'gpt-realtime-2.1');
  assert.equal(recommendedProvider('brain').id, 'openai');
  assert.equal(recommendedProvider('telephony').id, 'twilio-sip');
  assert.deepEqual(catalog.openai.env.includes('OPENAI_API_KEY'), true);
  assert.deepEqual(catalog['twilio-sip'].env.includes('TWILIO_API_SECRET'), true);
  assert.equal(JSON.stringify(catalog).includes('sk-'), false);
});

test('provider validation rejects unsupported provider/kind combinations', () => {
  assert.equal(validateProvider('brain', 'openai').ok, true);
  assert.equal(validateProvider('telephony', 'twilio-sip').ok, true);
  assert.equal(validateProvider('brain', 'twilio-sip').ok, false);
  assert.equal(validateProvider('telephony', 'made-up-provider').ok, false);
});

test('voice deployment manifest separates OpenAI voice brain from Meridian control plane', () => {
  const deployment = {
    id: 'dep_test', projectId: 'lead_test', businessName: 'Test HVAC', service: 'voice', capabilities: ['voice'],
    integrations: {
      brain: { kind:'brain', required:true, provider:'', credentialConfigured:false, status:'pending', evidence:'' },
      telephony: { kind:'telephony', required:true, provider:'', credentialConfigured:false, status:'pending', evidence:'' },
      knowledge: { kind:'knowledge', required:true, provider:'', credentialConfigured:false, status:'pending', evidence:'' },
    },
    readiness: { canActivate:false }, blockers:['integration.brain.verified'], rollback:{documented:false}, clientAcceptance:{accepted:false},
  };
  const lead = { managedRuntime: { agentId:'agent_test', endpoints:{ agent:'/api/v1/agents/agent_test/agent' }, provisionedAt:'2026-09-05T00:00:00Z', role:'control-plane' } };
  const manifest = buildDeploymentManifest(deployment, lead);
  assert.match(manifest.architecture.inbound, /Twilio SIP -> OpenAI Realtime -> Meridian/);
  assert.equal(manifest.architecture.realtimeModel, 'gpt-realtime-2.1');
  assert.equal(manifest.controlPlane.agentId, 'agent_test');
  assert.equal(manifest.integrations.find(x => x.kind === 'brain').recommendedProvider, 'openai');
  assert.equal(manifest.integrations.find(x => x.kind === 'telephony').recommendedProvider, 'twilio-sip');
});
