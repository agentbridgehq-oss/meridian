import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-realtime-reject-'));
process.env.DATA_DIR = dir;
process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = path.join(dir, 'deployment-core.json');
process.env.MERIDIAN_INBOUND_ROUTE_FILE = path.join(dir, 'inbound-routes.json');
process.env.MERIDIAN_REALTIME_CALL_FILE = path.join(dir, 'realtime-calls.json');

const ingress = await import('../lib/openai-realtime-ingress.mjs');

function incoming(number = '+17055550998') {
  return {
    id: 'evt_reject_test',
    type: 'realtime.call.incoming',
    data: {
      call_id: 'rtc_reject_test_123',
      sip_headers: [
        { name: 'Diversion', value: `<sip:${number}@twilio.com>` },
        { name: 'To', value: '<sip:project@sip.api.openai.com>' },
      ],
    },
  };
}

test('unknown inbound DID is actively declined through the OpenAI reject adapter', async () => {
  let rejected = null;
  const result = await ingress.processVerifiedOpenAIRealtimeWebhook(incoming(), {
    environment: 'staging',
    openAIConfigured: true,
    rejectCall: async request => { rejected = request; return { ok: true }; },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.accepted, false);
  assert.equal(result.rejected, true);
  assert.equal(result.callId, 'rtc_reject_test_123');
  assert.deepEqual(rejected, {
    callId: 'rtc_reject_test_123',
    statusCode: 603,
  });
});

test('reject adapter failure stays fail-closed and never becomes an accepted call', async () => {
  const result = await ingress.processVerifiedOpenAIRealtimeWebhook(incoming('+17055550997'), {
    environment: 'staging',
    openAIConfigured: true,
    rejectCall: async () => { throw new Error('provider unavailable'); },
  });

  assert.equal(result.ok, false);
  assert.equal(result.accepted, false);
  assert.equal(result.rejected, false);
});
