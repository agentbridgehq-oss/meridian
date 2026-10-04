import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-sms-preferences-'));
process.env.DATA_DIR = dir;
for (const key of ['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_FROM_NUMBER','RESEND_API_KEY','XAI_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','GROQ_API_KEY']) delete process.env[key];
const preferences = await import('../lib/sms-preferences.mjs');
const { handleInboundSms } = await import('../lib/twilio-channel.mjs');
const { sendSms } = await import('../lib/notify.mjs');
const sender = '+16475550101', recipient = '+12895550102';
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('STOP survives module reloads and blocks ordinary inbound replies until START', async () => {
  const input = { agent: null, from: recipient, to: sender };
  await handleInboundSms({ ...input, body: 'STOP' });
  assert.equal(preferences.smsSuppressed(sender, recipient), true);
  const fresh = await import('../lib/sms-preferences.mjs?reload-proof');
  assert.equal(fresh.smsSuppressed(sender, recipient), true);
  assert.equal(await handleInboundSms({ ...input, body: 'hello' }), '<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  await handleInboundSms({ ...input, body: 'YES' });
  assert.equal(preferences.smsSuppressed(sender, recipient), true);
  await handleInboundSms({ ...input, body: 'START' });
  assert.equal(preferences.smsSuppressed(sender, recipient), false);
});
test('Advanced Opt-Out signals update suppression without duplicate confirmations', async () => {
  const input = { agent: null, from: recipient, to: sender, body: 'localized keyword' };
  assert.match(await handleInboundSms({ ...input, optOutType: 'STOP' }), /<Response><\/Response>/);
  assert.equal(preferences.smsSuppressed(sender, recipient), true);
  assert.match(await handleInboundSms({ ...input, optOutType: 'START' }), /<Response><\/Response>/);
  assert.equal(preferences.smsSuppressed(sender, recipient), false);
});
test('all outbound SMS transports refuse suppressed numbers before any vendor request', async () => {
  preferences.setSmsSuppressed(sender, recipient, true);
  process.env.TWILIO_ACCOUNT_SID = 'AC_local_test';
  process.env.TWILIO_AUTH_TOKEN = 'local_test_not_real';
  process.env.TWILIO_FROM_NUMBER = sender;
  const previous = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('must not contact Twilio'); };
  try { assert.equal((await sendSms({ to: recipient, body: 'must not send' })).reason, 'sms_opted_out'); }
  finally { globalThis.fetch = previous; }
  assert.equal(preferences.smsSuppressed('+16475550199', recipient), false);
  const stored = fs.readFileSync(path.join(dir, 'sms-preferences.json'), 'utf8');
  assert.equal(stored.includes(recipient), false);
  assert.equal(stored.includes(sender), false);
});
test('corrupt suppression storage fails closed instead of allowing sends', async () => {
  fs.writeFileSync(path.join(dir, 'sms-preferences.json'), '{broken');
  assert.throws(() => preferences.smsSuppressed(sender, recipient));
  assert.equal((await sendSms({ to: recipient, body: 'must not send' })).reason, 'sms_preferences_unavailable');
});
