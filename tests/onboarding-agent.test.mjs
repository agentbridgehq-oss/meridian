import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectOnboardNeed,
  generateCustomerPack,
  answerSetupQuestion,
  greetingScript,
} from '../lib/onboarding-agent.mjs';

test('detects receptionist booking and service needs', () => {
  assert.equal(detectOnboardNeed('missed calls after hours'), 'voice');
  assert.equal(detectOnboardNeed('I need dispatch and job status'), 'service');
  assert.equal(detectOnboardNeed('fill the calendar'), 'booking');
});

test('pack is incomplete until required facts exist', () => {
  const incomplete = generateCustomerPack({ need: 'voice' });
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.missing.includes('businessName'));
});

test('complete pack writes greeting, customer clicks, and no Kenny in the loop', () => {
  const pack = generateCustomerPack({
    need: 'voice',
    businessName: 'North York HVAC',
    hours: 'Mon-Fri 8-6',
    services: 'furnaces, AC, emergency heat',
    timezone: 'America/Toronto',
    transfer: '+14165550100',
  });
  assert.equal(pack.ok, true);
  assert.equal(pack.role, 'receptionist');
  assert.match(pack.scripts.greeting, /North York HVAC/);
  assert.match(pack.scripts.transferRule, /\+14165550100/);
  assert.equal(pack.commercial.setupUsd, 997);
  assert.ok(pack.meridianDoesWithoutKenny.length >= 4);
  assert.ok(pack.stillCustomerClick.includes('Payment'));
});

test('setup Q&A uses pack facts instead of inventing prices', () => {
  const pack = generateCustomerPack({
    need: 'booking',
    businessName: 'Clinic',
    hours: 'Tue-Sat 10-6',
    services: 'cleaning',
  });
  const price = answerSetupQuestion('how much per minute', pack);
  assert.match(price, /0\.20/);
  const hours = answerSetupQuestion('what are the hours', pack);
  assert.match(hours, /Tue-Sat 10-6/);
});

test('greeting stays role-specific', () => {
  assert.match(greetingScript({ businessName: 'Acme', role: 'service' }), /service desk/);
  assert.match(greetingScript({ businessName: 'Acme', role: 'booking' }), /booking desk/);
});
