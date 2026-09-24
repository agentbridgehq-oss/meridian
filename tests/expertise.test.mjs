import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expertiseFor, resolveAgentRole, VOICE_TRIO } from '../lib/expertise.mjs';
import { draftProposal, services } from '../lib/agency-catalog.mjs';
import { buildOpenAIRealtimeConfig } from '../lib/openai-realtime-config.mjs';

test('role resolver maps voice booking service aliases', () => {
  assert.equal(resolveAgentRole('voice'), 'receptionist');
  assert.equal(resolveAgentRole('missed calls'), 'receptionist');
  assert.equal(resolveAgentRole('booking'), 'booking');
  assert.equal(resolveAgentRole('service dispatch'), 'service');
  assert.equal(resolveAgentRole('warranty complaint'), 'service');
});

test('playbooks train receptionist booking and service without inventing facts', () => {
  const reception = expertiseFor('voice');
  assert.match(reception, /RECEPTIONIST/);
  assert.match(reception, /Never invent facts/);
  const booking = expertiseFor('booking');
  assert.match(booking, /BOOKING AGENT/);
  assert.match(booking, /TWO concrete slots/);
  const service = expertiseFor('service');
  assert.match(service, /SERVICE AGENT/);
  assert.match(service, /invent arrival/);
});

test('voice trio proposals carry the locked rate card', () => {
  assert.ok(services.service);
  const proposal = draftProposal({ service: 'voice', businessName: 'Acme HVAC', tier: 'growth' });
  assert.equal(proposal.voiceTrio.setupUsd, VOICE_TRIO.receptionist.setupUsd);
  assert.equal(proposal.voiceTrio.usageUsdPerMinute, 0.2);
  assert.match(proposal.commercialTerms, /997/);
});

test('Realtime instructions include the receptionist playbook', () => {
  const result = buildOpenAIRealtimeConfig({
    id: 'dep_expertise',
    projectId: 'lead_missing_test_only',
    businessName: 'Acme HVAC',
    capabilities: ['voice'],
    config: {
      profile: { businessName: 'Acme HVAC', hours: 'Mon-Fri 8-6', services: 'HVAC', rules: 'None', approvalOwner: 'Pat', primaryNeed: 'voice' },
      agent: { tone: 'professional', primaryNeed: 'voice' },
    },
    integrations: {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.role, 'receptionist');
  assert.match(result.acceptBody.instructions, /RECEPTIONIST/);
  assert.match(result.acceptBody.instructions, /Mon-Fri 8-6/);
});
