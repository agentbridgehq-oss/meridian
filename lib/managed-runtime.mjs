import { getAgent, getLead, provisionClientAgent, upsertLead } from '../engine.mjs';
import { getDeployment } from './deployment-core.mjs';

function clean(value, max = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function managedIntake(lead, deployment) {
  const agency = lead.agency || {};
  const intake = agency.intake || {};
  const input = agency.input || {};
  const agent = deployment.config?.agent || {};
  const need = clean(agency.proposal?.agentNeed || agent.need || '', 40);
  return {
    businessName: clean(lead.businessName || input.businessName, 160),
    niche: clean(input.service || lead.primaryNeed, 120),
    hours: clean(intake.hours),
    phone: clean(input.phone || lead.phone, 100),
    calendar: '',
    crm: '',
    services: clean(intake.services),
    faqs: '',
    bookingRules: clean(intake.rules),
    // Never assume the public/business number is an approved human-transfer target.
    humanTransfer: clean(agent.humanTransfer, 100),
    tone: clean(agent.tone || 'professional', 80),
    primaryNeed: need,
    website: clean(input.businessWebsite, 1000),
    notes: `managed-service runtime for deployment ${deployment.id}`,
    elevenlabsVoiceId: '',
  };
}

export function provisionManagedRuntime(deploymentId) {
  const deployment = getDeployment(deploymentId);
  if (!deployment) return { ok: false, status: 404, error: 'Deployment not found' };
  if (!deployment.capabilities.some((x) => ['voice','sales','booking'].includes(x)))
    return { ok: false, status: 409, error: 'This service does not require a Meridian conversational runtime.' };

  const lead = getLead(deployment.projectId);
  if (!lead?.agency) return { ok: false, status: 404, error: 'Agency project not found' };
  if (lead.agency.proposal?.status !== 'approved' || !lead.agency.intake)
    return { ok: false, status: 409, error: 'Approved scope and client intake are required before runtime provisioning.' };

  const existingId = lead.managedRuntime?.agentId;
  if (existingId) {
    const existing = getAgent(existingId);
    if (existing?.status === 'active') {
      return {
        ok: true,
        created: false,
        runtime: {
          agentId: existing.id,
          businessName: existing.businessName,
          endpoints: existing.endpoints,
          provisionedAt: lead.managedRuntime.provisionedAt || existing.createdAt,
          secretAvailable: false,
        },
        note: 'Runtime already exists. The one-time agent key is not recoverable from Meridian storage; rotate deliberately if it was lost.',
      };
    }
  }

  const connection = provisionClientAgent({ ...lead, intake: managedIntake(lead, deployment) });
  const runtime = {
    agentId: connection.id,
    endpoints: connection.endpoints,
    provisionedAt: new Date().toISOString(),
    deploymentId: deployment.id,
    role: 'control-plane',
  };
  upsertLead({ id: lead.id, managedRuntime: runtime, agentConnection: { id: connection.id, endpoints: connection.endpoints } });

  return {
    ok: true,
    created: true,
    runtime: {
      agentId: connection.id,
      businessName: connection.businessName,
      endpoints: connection.endpoints,
      provisionedAt: runtime.provisionedAt,
      secretAvailable: true,
    },
    oneTimeSecret: {
      agentApiKey: connection.apiKey,
      handling: 'Store this immediately in the selected provider secret store. Meridian persists only its hash and cannot reveal it again.',
    },
    note: 'The managed runtime is Meridian’s control plane. Configure and verify the selected model/voice provider separately before go-live.',
  };
}
