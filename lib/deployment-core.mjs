import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export const DEPLOYMENT_STATES = Object.freeze([
  'draft',
  'integrating',
  'qa',
  'ready',
  'live',
  'paused',
  'failed',
]);

export const INTEGRATION_STATES = Object.freeze([
  'pending',
  'configured',
  'verified',
  'failed',
  'disabled',
]);

const SERVICE_INTEGRATIONS = Object.freeze({
  automation: ['workflow', 'source', 'destination', 'notifications'],
  'revenue-ops': ['brain', 'lead_capture', 'crm', 'messaging', 'calendar', 'notifications'],
  voice: ['brain', 'knowledge', 'telephony', 'destination', 'notifications'],
  sales: ['brain', 'lead_capture', 'crm', 'messaging', 'notifications'],
  booking: ['brain', 'calendar', 'confirmation', 'notifications'],
  search: ['cms', 'search_reporting', 'analytics'],
  web: ['hosting', 'forms', 'crm', 'analytics'],
});

const NO_CREDENTIAL_REQUIRED = new Set(['knowledge', 'source', 'destination']);
const FORBIDDEN_SECRET_KEYS = /(secret|password|api[_-]?key|token|private[_-]?key|authorization|credential)/i;

function deploymentFile() {
  return process.env.MERIDIAN_DEPLOYMENT_CORE_FILE ||
    path.join(process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(ROOT, 'data'), 'deployment-core.json');
}

function now() {
  return new Date().toISOString();
}

function clean(value, max = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function bool(value) {
  return value === true;
}

function loadStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(deploymentFile(), 'utf8'));
    if (parsed && Array.isArray(parsed.deployments)) return parsed;
  } catch {}
  return { version: 1, deployments: [] };
}

function saveStore(store) {
  const target = deploymentFile();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(temp, target);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function event(type, detail = '') {
  return { type, at: now(), detail: clean(detail, 2000) };
}

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_SECRET_KEYS.test(key)) continue;
    out[key] = redactSecrets(child);
  }
  return out;
}

function serviceCapabilities(service, agentNeed) {
  const capabilities = [];
  const need = String(agentNeed || '').toLowerCase();
  if (need === 'full') capabilities.push('voice', 'sales', 'booking');
  else if (['voice', 'sales', 'booking'].includes(need)) capabilities.push(need);
  if (service === 'automation') capabilities.push('automation');
  if (service === 'revenue-ops') capabilities.push('revenue-ops');
  if (service === 'search') capabilities.push('search');
  if (service === 'web') capabilities.push('web');
  return [...new Set(capabilities)];
}

export function requiredIntegrationKinds(service, agentNeed = '') {
  const base = SERVICE_INTEGRATIONS[service] || [];
  const extra = [];
  const need = String(agentNeed || '').toLowerCase();
  if (need === 'voice') extra.push('brain', 'knowledge', 'telephony', 'destination', 'notifications');
  if (need === 'sales') extra.push('brain', 'lead_capture', 'crm', 'messaging', 'notifications');
  if (need === 'booking') extra.push('brain', 'calendar', 'confirmation', 'notifications');
  if (need === 'full') extra.push('brain', 'knowledge', 'telephony', 'lead_capture', 'crm', 'messaging', 'calendar', 'confirmation', 'notifications');
  return [...new Set([...base, ...extra])];
}

function integrationRecord(kind) {
  return {
    kind,
    required: true,
    requiresCredential: !NO_CREDENTIAL_REQUIRED.has(kind),
    provider: '',
    status: 'pending',
    credentialConfigured: false,
    externalId: '',
    endpoint: '',
    evidence: '',
    lastCheckedAt: null,
    updatedAt: now(),
  };
}

function checkRecord(label, index) {
  return {
    id: `check_${index + 1}`,
    label: clean(label, 500),
    status: 'pending',
    evidence: '',
    checkedBy: '',
    checkedAt: null,
  };
}

function normalizeProfile(lead) {
  const agency = lead.agency || {};
  const input = agency.input || {};
  const intake = agency.intake || {};
  return {
    businessName: clean(lead.businessName || input.businessName, 160),
    hours: clean(intake.hours, 4000),
    services: clean(intake.services, 4000),
    rules: clean(intake.rules, 4000),
    approvalOwner: clean(intake.owner, 500),
    website: clean(input.businessWebsite, 1000),
    phone: clean(input.phone || lead.phone, 100),
    timezone: '',
    serviceArea: '',
  };
}

function computeBlockers(deployment) {
  const blockers = [];
  const p = deployment.config?.profile || {};
  if (!p.businessName) blockers.push('business_profile.businessName');
  if (!p.hours) blockers.push('business_profile.hours');
  if (!p.services) blockers.push('business_profile.services');
  if (!p.approvalOwner) blockers.push('business_profile.approvalOwner');

  for (const integration of Object.values(deployment.integrations || {})) {
    if (!integration.required) continue;
    if (integration.status !== 'verified') blockers.push(`integration.${integration.kind}.verified`);
    if (integration.requiresCredential && !integration.credentialConfigured)
      blockers.push(`integration.${integration.kind}.credentialConfigured`);
    if (!integration.evidence) blockers.push(`integration.${integration.kind}.evidence`);
  }

  for (const check of deployment.checks || []) {
    if (check.status !== 'passed') blockers.push(`qa.${check.id}`);
    if (!check.evidence) blockers.push(`qa.${check.id}.evidence`);
  }

  if (!deployment.rollback?.documented) blockers.push('rollback.documented');
  if (!deployment.rollback?.summary) blockers.push('rollback.summary');
  if (!deployment.clientAcceptance?.accepted) blockers.push('clientAcceptance.accepted');
  if (!deployment.clientAcceptance?.evidence) blockers.push('clientAcceptance.evidence');
  return blockers;
}

function evaluate(deployment) {
  const blockers = computeBlockers(deployment);
  const integrations = Object.values(deployment.integrations || {});
  const checks = deployment.checks || [];
  const failed = integrations.some((x) => x.status === 'failed') || checks.some((x) => x.status === 'failed');

  let status = deployment.status;
  if (status !== 'live' && status !== 'paused') {
    if (failed) status = 'failed';
    else if (!deployment.config?.profile?.businessName || !deployment.config?.profile?.hours || !deployment.config?.profile?.services || !deployment.config?.profile?.approvalOwner)
      status = 'draft';
    else if (integrations.some((x) => x.status !== 'verified')) status = 'integrating';
    else if (checks.some((x) => x.status !== 'passed')) status = 'qa';
    else status = 'ready';
  }

  const total = integrations.length + checks.length + 2;
  const complete = integrations.filter((x) => x.status === 'verified').length +
    checks.filter((x) => x.status === 'passed').length +
    (deployment.rollback?.documented ? 1 : 0) +
    (deployment.clientAcceptance?.accepted ? 1 : 0);

  deployment.status = status;
  deployment.blockers = blockers;
  deployment.readiness = {
    complete,
    total,
    percent: total ? Math.round((complete / total) * 100) : 0,
    canActivate: blockers.length === 0,
  };
  deployment.updatedAt = now();
  return deployment;
}

function mutate(id, mutator, expectedRevision = null) {
  const store = loadStore();
  const index = store.deployments.findIndex((x) => x.id === id);
  if (index < 0) return { ok: false, status: 404, error: 'Deployment not found' };
  const current = store.deployments[index];
  if (expectedRevision !== null && Number(expectedRevision) !== current.revision)
    return { ok: false, status: 409, error: 'Deployment changed. Reload before updating.', revision: current.revision };
  const next = clone(current);
  const result = mutator(next);
  if (result?.ok === false) return result;
  next.revision = current.revision + 1;
  evaluate(next);
  store.deployments[index] = next;
  saveStore(store);
  return { ok: true, deployment: clone(next) };
}

export function createDeploymentFromAgencyLead(lead) {
  if (!lead?.id || !lead?.agency) return { ok: false, status: 400, error: 'Agency project is required' };
  if (!lead.agency.intake) return { ok: false, status: 409, error: 'Client intake must be completed before deployment provisioning.' };

  const store = loadStore();
  const existing = store.deployments.find((x) => x.projectId === lead.id);
  if (existing) return { ok: true, created: false, deployment: clone(existing) };

  const proposal = lead.agency.proposal || {};
  const service = clean(proposal.service || lead.agency.input?.service || lead.primaryNeed, 60);
  const agentNeed = clean(proposal.agentNeed || '', 40);
  const kinds = requiredIntegrationKinds(service, agentNeed);
  const integrations = Object.fromEntries(kinds.map((kind) => [kind, integrationRecord(kind)]));
  const checks = (proposal.acceptanceChecks || []).map(checkRecord);
  const at = now();
  const deployment = evaluate({
    id: `dep_${crypto.randomBytes(10).toString('hex')}`,
    projectId: lead.id,
    leadId: lead.id,
    businessName: clean(lead.businessName, 160),
    service,
    tier: clean(lead.agency.input?.tier || proposal.tier, 40),
    capabilities: serviceCapabilities(service, agentNeed),
    status: 'draft',
    revision: 1,
    config: {
      profile: normalizeProfile(lead),
      agent: {
        need: agentNeed,
        tone: 'professional',
        language: 'en',
        greeting: '',
        humanTransfer: '',
      },
    },
    integrations,
    checks,
    rollback: { documented: false, summary: '', owner: '', updatedAt: null },
    clientAcceptance: { accepted: false, acceptedBy: '', evidence: '', acceptedAt: null },
    health: { status: 'unknown', lastProbeAt: null, detail: '' },
    liveAt: null,
    pausedAt: null,
    pauseReason: '',
    blockers: [],
    readiness: { complete: 0, total: 0, percent: 0, canActivate: false },
    events: [event('deployment.created', `Created from agency project ${lead.id}`)],
    createdAt: at,
    updatedAt: at,
  });

  store.deployments.push(deployment);
  saveStore(store);
  return { ok: true, created: true, deployment: clone(deployment) };
}

export function listDeployments() {
  return loadStore().deployments.map((d) => clone(evaluate(clone(d))));
}

export function getDeployment(id) {
  const found = loadStore().deployments.find((x) => x.id === id);
  return found ? clone(evaluate(clone(found))) : null;
}

export function updateDeploymentConfig(id, patch = {}, expectedRevision = null) {
  const safe = redactSecrets(patch || {});
  return mutate(id, (deployment) => {
    const profilePatch = safe.profile && typeof safe.profile === 'object' ? safe.profile : {};
    const agentPatch = safe.agent && typeof safe.agent === 'object' ? safe.agent : {};
    const allowedProfile = ['businessName', 'hours', 'services', 'rules', 'approvalOwner', 'website', 'phone', 'timezone', 'serviceArea'];
    const allowedAgent = ['tone', 'language', 'greeting', 'humanTransfer'];
    for (const key of allowedProfile) if (key in profilePatch) deployment.config.profile[key] = clean(profilePatch[key], 4000);
    for (const key of allowedAgent) if (key in agentPatch) deployment.config.agent[key] = clean(agentPatch[key], 4000);
    deployment.events.push(event('deployment.config_updated'));
    return { ok: true };
  }, expectedRevision);
}

export function updateIntegration(id, kind, patch = {}, expectedRevision = null) {
  const safe = redactSecrets(patch || {});
  return mutate(id, (deployment) => {
    const integration = deployment.integrations?.[kind];
    if (!integration) return { ok: false, status: 404, error: 'Integration is not required for this deployment' };
    const nextStatus = clean(safe.status, 40) || integration.status;
    if (!INTEGRATION_STATES.includes(nextStatus)) return { ok: false, status: 400, error: 'Invalid integration status' };
    integration.provider = clean(safe.provider, 120) || integration.provider;
    integration.status = nextStatus;
    if ('credentialConfigured' in safe) integration.credentialConfigured = bool(safe.credentialConfigured);
    integration.externalId = clean(safe.externalId, 500) || integration.externalId;
    integration.endpoint = clean(safe.endpoint, 1000) || integration.endpoint;
    integration.evidence = clean(safe.evidence, 4000) || integration.evidence;
    if (nextStatus === 'verified') {
      if (!integration.provider) return { ok: false, status: 400, error: 'Provider is required before verification' };
      if (integration.requiresCredential && !integration.credentialConfigured)
        return { ok: false, status: 400, error: 'Record credentialConfigured=true after the provider secret is stored outside the deployment ledger.' };
      if (integration.evidence.length < 8)
        return { ok: false, status: 400, error: 'Verification evidence is required.' };
      integration.lastCheckedAt = now();
    }
    integration.updatedAt = now();
    deployment.events.push(event('integration.updated', `${kind}:${nextStatus}`));
    return { ok: true };
  }, expectedRevision);
}

export function recordAcceptanceCheck(id, checkId, input = {}, expectedRevision = null) {
  return mutate(id, (deployment) => {
    const check = deployment.checks.find((x) => x.id === checkId);
    if (!check) return { ok: false, status: 404, error: 'Acceptance check not found' };
    const evidence = clean(input.evidence, 4000);
    if (evidence.length < 8) return { ok: false, status: 400, error: 'Record test evidence before changing QA status.' };
    check.status = input.passed === true ? 'passed' : 'failed';
    check.evidence = evidence;
    check.checkedBy = clean(input.checkedBy, 300);
    check.checkedAt = now();
    deployment.events.push(event('qa.recorded', `${check.id}:${check.status}`));
    return { ok: true };
  }, expectedRevision);
}

export function recordRollbackPlan(id, input = {}, expectedRevision = null) {
  return mutate(id, (deployment) => {
    const summary = clean(input.summary, 4000);
    const owner = clean(input.owner, 500);
    if (input.documented === true && (summary.length < 12 || !owner))
      return { ok: false, status: 400, error: 'A rollback summary and owner are required.' };
    deployment.rollback = {
      documented: input.documented === true,
      summary,
      owner,
      updatedAt: now(),
    };
    deployment.events.push(event('rollback.updated'));
    return { ok: true };
  }, expectedRevision);
}

export function recordClientAcceptance(id, input = {}, expectedRevision = null) {
  return mutate(id, (deployment) => {
    const accepted = input.accepted === true;
    const acceptedBy = clean(input.acceptedBy, 500);
    const evidence = clean(input.evidence, 4000);
    if (accepted && (!acceptedBy || evidence.length < 8))
      return { ok: false, status: 400, error: 'Accepted-by name and acceptance evidence are required.' };
    deployment.clientAcceptance = {
      accepted,
      acceptedBy,
      evidence,
      acceptedAt: accepted ? now() : null,
    };
    deployment.events.push(event('client_acceptance.updated', accepted ? 'accepted' : 'revoked'));
    return { ok: true };
  }, expectedRevision);
}

export function recordHealth(id, input = {}, expectedRevision = null) {
  return mutate(id, (deployment) => {
    const status = clean(input.status, 40);
    if (!['healthy', 'degraded', 'down', 'unknown'].includes(status))
      return { ok: false, status: 400, error: 'Health status must be healthy, degraded, down or unknown.' };
    deployment.health = {
      status,
      lastProbeAt: now(),
      detail: clean(input.detail, 4000),
    };
    deployment.events.push(event('health.recorded', status));
    return { ok: true };
  }, expectedRevision);
}

export function activateDeployment(id, input = {}, expectedRevision = null) {
  return mutate(id, (deployment) => {
    evaluate(deployment);
    if (deployment.blockers.length)
      return { ok: false, status: 409, error: 'Deployment is not ready for activation.', blockers: deployment.blockers };
    deployment.status = 'live';
    deployment.liveAt = deployment.liveAt || now();
    deployment.pausedAt = null;
    deployment.pauseReason = '';
    deployment.health = { status: 'unknown', lastProbeAt: null, detail: 'Awaiting first live health probe.' };
    deployment.events.push(event('deployment.activated', clean(input.evidence, 2000)));
    return { ok: true };
  }, expectedRevision);
}

export function pauseDeployment(id, input = {}, expectedRevision = null) {
  return mutate(id, (deployment) => {
    if (deployment.status !== 'live') return { ok: false, status: 409, error: 'Only a live deployment can be paused.' };
    const reason = clean(input.reason, 2000);
    if (reason.length < 8) return { ok: false, status: 400, error: 'Record why the deployment is being paused.' };
    deployment.status = 'paused';
    deployment.pausedAt = now();
    deployment.pauseReason = reason;
    deployment.events.push(event('deployment.paused', reason));
    return { ok: true };
  }, expectedRevision);
}

export function deploymentSummary(deployment) {
  if (!deployment) return null;
  const d = evaluate(clone(deployment));
  return {
    id: d.id,
    projectId: d.projectId,
    businessName: d.businessName,
    service: d.service,
    tier: d.tier,
    capabilities: d.capabilities,
    status: d.status,
    readiness: d.readiness,
    blockers: d.blockers,
    integrations: Object.values(d.integrations).map(({ kind, provider, status, credentialConfigured, lastCheckedAt }) => ({
      kind, provider, status, credentialConfigured, lastCheckedAt,
    })),
    health: d.health,
    liveAt: d.liveAt,
    updatedAt: d.updatedAt,
    revision: d.revision,
  };
}
