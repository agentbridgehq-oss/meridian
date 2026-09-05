import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenAIRealtimeConfig, DEFAULT_REALTIME_MODEL } from '../lib/openai-realtime-config.mjs';

function voiceDeployment(extra = {}) {
  return {
    id: 'dep_realtime_test',
    projectId: 'lead_missing_test_only',
    businessName: 'Realtime Test HVAC',
    capabilities: ['voice','sales','booking'],
    config: {
      profile: {
        businessName: 'Realtime Test HVAC',
        hours: 'Mon-Fri 8-6',
        services: 'Heating and cooling service',
        rules: 'Never quote unapproved pricing.',
        approvalOwner: 'Test Owner',
      },
      agent: { tone: 'professional', humanTransfer: '' },
    },
    integrations: {
      brain: { kind:'brain', status:'pending', credentialConfigured:false },
    },
    ...extra,
  };
}

test('Realtime config matches the SIP accept-call contract without making provider calls', () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const result = buildOpenAIRealtimeConfig(voiceDeployment());
    assert.equal(result.ok, true);
    assert.equal(result.configured, false);
    assert.equal(result.model, DEFAULT_REALTIME_MODEL);
    assert.equal(result.transport.production, 'sip');
    assert.equal(result.transport.browserDemo, 'webrtc');
    assert.equal(result.transport.incomingWebhookEvent, 'realtime.call.incoming');
    assert.equal(result.transport.acceptCall.method, 'POST');
    assert.equal(result.transport.acceptCall.pathTemplate, '/realtime/calls/{call_id}/accept');
    assert.equal(result.acceptBody.type, 'realtime');
    assert.deepEqual(result.acceptBody.output_modalities, ['audio']);
    assert.equal(result.acceptBody.tool_choice, 'auto');
    assert.equal(result.acceptBody.parallel_tool_calls, false);
  } finally {
    if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
  }
});

test('voice instructions are grounded in approved business facts and fail closed on missing transfer target', () => {
  const result = buildOpenAIRealtimeConfig(voiceDeployment());
  assert.match(result.acceptBody.instructions, /Mon-Fri 8-6/);
  assert.match(result.acceptBody.instructions, /Heating and cooling service/);
  assert.match(result.acceptBody.instructions, /No human transfer destination is approved yet/);
  assert.match(result.acceptBody.instructions, /Never invent prices/);
  assert.match(result.acceptBody.instructions, /Do not claim an appointment, transfer, lead update, or follow-up happened unless/);
});

test('Realtime tools cover voice outcome, handoff, booking and consent-aware sales actions', () => {
  const result = buildOpenAIRealtimeConfig(voiceDeployment());
  const names = result.acceptBody.tools.map(x => x.name);
  assert.deepEqual(names, [
    'meridian_record_call_outcome',
    'meridian_request_human_handoff',
    'meridian_request_booking',
    'meridian_capture_sales_lead',
  ]);
  const sales = result.acceptBody.tools.find(x => x.name === 'meridian_capture_sales_lead');
  assert.ok(sales.parameters.required.includes('consent'));
  for (const tool of result.acceptBody.tools) {
    assert.equal(tool.type, 'function');
    assert.equal(tool.parameters.type, 'object');
    assert.equal(tool.parameters.additionalProperties, false);
  }
});

test('generated config contains secret names only, never secret values', () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-value-that-must-not-appear';
  try {
    const result = buildOpenAIRealtimeConfig(voiceDeployment({ integrations:{brain:{kind:'brain',status:'verified',credentialConfigured:true}} }));
    const serialized = JSON.stringify(result);
    assert.equal(result.configured, true);
    assert.equal(result.verification.providerConfigured, true);
    assert.equal(result.verification.providerVerified, true);
    assert.ok(result.requiredSecrets.includes('OPENAI_API_KEY'));
    assert.ok(result.requiredSecrets.includes('OPENAI_WEBHOOK_SECRET'));
    assert.equal(serialized.includes('test-value-that-must-not-appear'), false);
    assert.equal(result.safety.secretValuesIncluded, false);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test('non-voice deployment refuses a Realtime voice config', () => {
  const result = buildOpenAIRealtimeConfig({ ...voiceDeployment(), capabilities:['sales'] });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});
