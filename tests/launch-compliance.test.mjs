import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SMS_START, SMS_STOP, spokenDisclosure, stampCustomerSms } from '../lib/compliance.mjs';
import { capVoiceTwiml, handleInboundSms, inboundVoiceGatherTwiml } from '../lib/twilio-channel.mjs';
import { buildOpenAIRealtimeConfig } from '../lib/openai-realtime-config.mjs';
import { analyzeIntent } from '../lib/knowledge.mjs';
import { createContactRequest } from '../lib/contact-intake.mjs';

const agent = { id: 'agent_launch', businessName: 'North HVAC', config: { humanTransfer: '+17055550111' } };

test('fixed disclosure names the business, says AI, and states recording', () => {
  const line = spokenDisclosure('North HVAC');
  assert.equal(line, "You are speaking with North HVAC's AI assistant. This call may be recorded for quality, training, and customer support.");
  assert.doesNotMatch(line, /I am a human/i);
});

test('gather and fallback speak the disclosure before the business line', () => {
  const gather = inboundVoiceGatherTwiml(agent, { actionUrl: '/turn' });
  assert.match(gather, /North HVAC/);
  assert.match(gather, /AI assistant/);
  assert.match(gather, /This call may be recorded for quality, training, and customer support/);
  assert.match(gather, /ask to speak with a person/);
  const down = capVoiceTwiml(agent, 'fallback');
  assert.match(down, /Our virtual receptionist is not available right now/);
  assert.match(down, /<Dial>\+17055550111<\/Dial>/);
  const quiet = capVoiceTwiml({ businessName: 'North HVAC', config: {} }, 'fallback');
  assert.match(quiet, /<Hangup\/>/);
  assert.doesNotMatch(quiet, /<Dial>/);
});

test('SMS STOP, START, and HELP use the compliance lines', async () => {
  const stop = await handleInboundSms({ agent, body: 'STOP', from: '+15195550100', to: '+12896707853' });
  assert.match(stop, /unsubscribed/);
  assert.match(stop, /Reply START to opt back in/);
  const start = await handleInboundSms({ agent, body: 'START', from: '+15195550100', to: '+12896707853' });
  assert.match(start, /opted in/);
  assert.match(start, /How can we help/);
  const help = await handleInboundSms({ agent, body: 'HELP', from: '+15195550100', to: '+12896707853' });
  assert.match(help, /This is a Meridian AI service for North HVAC/);
  assert.match(help, /Reply STOP to unsubscribe/);
  const blocked = await handleInboundSms({ agent, body: 'Hi, I need a quote', from: '+447700900123', to: '+12896707853' });
  assert.equal(blocked, '<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
});

test('customer SMS carries the business name and STOP', () => {
  const text = stampCustomerSms('We can book Tuesday at 9:00 AM.', 'North HVAC');
  assert.match(text, /North HVAC/);
  assert.match(text, /Reply STOP to unsubscribe/);
});

test('a caller asking for a person is a human-transfer intent', () => {
  assert.equal(analyzeIntent('Can you transfer me to a person?').wantHuman, true);
  assert.equal(analyzeIntent('agent').wantHuman, true);
  assert.equal(analyzeIntent('What are your hours?').wantHuman, false);
});

test('realtime instructions pin the exact first utterance', () => {
  const deployment = {
    id: 'dep_launch',
    projectId: 'missing',
    businessName: 'North HVAC',
    capabilities: ['voice'],
    config: { profile: { businessName: 'North HVAC', hours: 'Mon-Fri 8-6', services: 'HVAC' }, agent: { humanTransfer: '' } },
  };
  const result = buildOpenAIRealtimeConfig(deployment);
  assert.match(result.acceptBody.instructions, /You are speaking with North HVAC's AI assistant/);
  assert.match(result.acceptBody.instructions, /This call may be recorded for quality, training, and customer support/);
  assert.match(result.acceptBody.instructions, /Never claim to be human/);
});

test('contact intake stores a message and does not invent a monitored mailbox', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meridian-contact-'));
  const prev = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  try {
    const bad = createContactRequest({ email: 'nope', message: 'hello there friend' });
    assert.equal(bad.ok, false);
    const ok = createContactRequest({ email: 'owner@example.com', name: 'Pat', message: 'Need a receptionist for HVAC.' });
    assert.equal(ok.ok, true);
    assert.match(ok.message, /three business days/);
    assert.match(ok.message, /once the dedicated support mailbox is monitored/);
  } finally {
    if (prev === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});
