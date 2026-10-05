import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { openXaiRealtimeSocket, wrapXaiRealtimeSocket, verifyXaiWebhook, signXaiWebhook } from '../lib/xai-realtime-adapter.mjs';
import { guideChat } from '../lib/guide-chat.mjs';
import { inboundVoiceGatherTwiml, capVoiceTwiml } from '../lib/twilio-channel.mjs';

test('production xAI WebSocket client authenticates a real local handshake and carries events', { timeout: 5000 }, async t => {
  const previous = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = 'local-test-only';
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  let rt;
  t.after(async () => {
    rt?.close();
    for (const client of server.clients) client.terminate();
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = previous;
  });
  await once(server, 'listening');
  const accepted = once(server, 'connection');
  rt = openXaiRealtimeSocket('11111111-2222-3333-4444-555555555555', { url: `ws://127.0.0.1:${server.address().port}/realtime` });
  const [socket, request] = await accepted;
  assert.equal(request.headers.authorization, 'Bearer local-test-only');
  assert.equal(request.url, '/realtime?call_id=11111111-2222-3333-4444-555555555555');
  await rt.whenOpen(1000);
  const received = once(socket, 'message');
  rt.send({ type: 'session.update', session: { voice: 'eve' } });
  assert.equal(JSON.parse((await received)[0].toString()).session.voice, 'eve');
  const configured = new Promise(resolve => rt.on('session.updated', resolve));
  socket.send(JSON.stringify({ type: 'session.updated', session: { voice: 'eve' } }));
  assert.equal((await configured).session.voice, 'eve');
});

test('xAI socket closed before wait rejects immediately', async () => {
  const handlers = {};
  const rt = wrapXaiRealtimeSocket({ addEventListener: (type, fn) => { handlers[type] = fn; }, readyState: 3 });
  handlers.close();
  await assert.rejects(rt.whenOpen(), { code: 'xai_realtime_closed' });
});

test('xAI signature requires the supported v1 scheme', async () => {
  const body = JSON.stringify({ type: 'realtime.call.incoming' });
  const now = Date.now();
  const timestamp = String(Math.floor(now / 1000));
  const secret = 'local-secret-only';
  const signature = signXaiWebhook({ id: 'evt_test', timestamp, body, secret });
  const headers = { 'webhook-id': 'evt_test', 'webhook-timestamp': timestamp, 'webhook-signature': signature.replace('v1,', 'v2,') };
  await assert.rejects(verifyXaiWebhook(body, headers, { secret, now }), { code: 'xai_webhook_signature_invalid' });
  headers['webhook-signature'] = signature;
  assert.equal((await verifyXaiWebhook(body, headers, { secret, now })).type, 'realtime.call.incoming');
});

test('setup guide describes xAI/Twilio and requires real-call acceptance', () => {
  const install = guideChat('how does install work?').reply;
  assert.match(install, /xAI Grok Voice.*Twilio SIP/);
  assert.match(install, /before activation/);
  assert.doesNotMatch(install, /Retell|Vapi|Import config → live/);
  const afterPayment = guideChat('what happens next', [], { step: 'paid_wait' }).reply;
  assert.match(afterPayment, /does not activate a phone line/);
});

test('Gather and voicemail disclose AI and recording before capture', () => {
  const agent = { id: 'agent_test', businessName: 'Test Shop', config: {} };
  const gather = inboundVoiceGatherTwiml(agent, { actionUrl: '/turn' });
  assert.match(gather, /AI assistant.*This call may be recorded/);
  const voicemail = capVoiceTwiml(agent, 'billing.payment_failed');
  assert.ok(voicemail.includes('This call may be recorded'));
  assert.ok(voicemail.indexOf('This call may be recorded') < voicemail.indexOf('<Record'));
});
