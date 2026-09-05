import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export const DEPLOYMENT_STATES = Object.freeze(['draft','integrating','qa','ready','live','paused','failed']);
export const INTEGRATION_STATES = Object.freeze(['pending','configured','verified','failed','disabled']);

const SERVICE_INTEGRATIONS = Object.freeze({
  automation: ['workflow','source','destination','notifications'],
  'revenue-ops': ['brain','lead_capture','crm','messaging','calendar','notifications'],
  voice: ['brain','knowledge','telephony','destination','notifications'],
  sales: ['brain','lead_capture','crm','messaging','notifications'],
  booking: ['brain','calendar','confirmation','notifications'],
  search: ['cms','search_reporting','analytics'],
  web: ['hosting','forms','crm','analytics'],
});
const NO_CREDENTIAL_REQUIRED = new Set(['knowledge','source','destination']);
const SECRET_KEY = /(secret|password|api[_-]?key|(^|[_-])token($|[_-])|private[_-]?key|authorization|credentials?)/i;

const now = () => new Date().toISOString();
const clean = (v, max = 4000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const clone = (v) => JSON.parse(JSON.stringify(v));
const event = (type, detail = '') => ({ type, at: now(), detail: clean(detail, 2000) });
function file() {
  return process.env.MERIDIAN_DEPLOYMENT_CORE_FILE || path.join(process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(ROOT, 'data'), 'deployment-core.json');
}
function load() {
  try { const s = JSON.parse(fs.readFileSync(file(), 'utf8')); if (Array.isArray(s?.deployments)) return s; } catch {}
  return { version: 1, deployments: [] };
}
function save(store) {
  const target = file(); fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), { mode: 0o600 }); fs.renameSync(temp, target);
}
function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (!v || typeof v !== 'object') return v;
  const out = {};
  for (const [k, child] of Object.entries(v)) {
    if (k === 'credentialConfigured') { out[k] = child === true; continue; }
    if (SECRET_KEY.test(k)) continue;
    out[k] = scrub(child);
  }
  return out;
}
function capabilities(service, need) {
  const out = [];
  if (need === 'full') out.push('voice','sales','booking'); else if (['voice','sales','booking'].includes(need)) out.push(need);
  if (['automation','revenue-ops','search','web'].includes(service)) out.push(service);
  return [...new Set(out)];
}
export function requiredIntegrationKinds(service, agentNeed = '') {
  const need = String(agentNeed || '').toLowerCase(), extra = [];
  if (need === 'voice') extra.push('brain','knowledge','telephony','destination','notifications');
  if (need === 'sales') extra.push('brain','lead_capture','crm','messaging','notifications');
  if (need === 'booking') extra.push('brain','calendar','confirmation','notifications');
  if (need === 'full') extra.push('brain','knowledge','telephony','lead_capture','crm','messaging','calendar','confirmation','notifications');
  return [...new Set([...(SERVICE_INTEGRATIONS[service] || []), ...extra])];
}
function integration(kind) {
  return { kind, required: true, requiresCredential: !NO_CREDENTIAL_REQUIRED.has(kind), provider: '', status: 'pending', credentialConfigured: false, externalId: '', endpoint: '', evidence: '', lastCheckedAt: null, updatedAt: now() };
}
function profile(lead) {
  const a = lead.agency || {}, i = a.input || {}, x = a.intake || {};
  return { businessName: clean(lead.businessName || i.businessName,160), hours: clean(x.hours), services: clean(x.services), rules: clean(x.rules), approvalOwner: clean(x.owner,500), website: clean(i.businessWebsite,1000), phone: clean(i.phone || lead.phone,100), timezone: '', serviceArea: '' };
}
function blockers(d) {
  const out = [], p = d.config?.profile || {};
  for (const k of ['businessName','hours','services','approvalOwner']) if (!p[k]) out.push(`business_profile.${k}`);
  for (const x of Object.values(d.integrations || {})) {
    if (!x.required) continue;
    if (x.status !== 'verified') out.push(`integration.${x.kind}.verified`);
    if (x.requiresCredential && !x.credentialConfigured) out.push(`integration.${x.kind}.credentialConfigured`);
    if (!x.evidence) out.push(`integration.${x.kind}.evidence`);
  }
  for (const c of d.checks || []) { if (c.status !== 'passed') out.push(`qa.${c.id}`); if (!c.evidence) out.push(`qa.${c.id}.evidence`); }
  if (!d.rollback?.documented) out.push('rollback.documented'); if (!d.rollback?.summary) out.push('rollback.summary');
  if (!d.clientAcceptance?.accepted) out.push('clientAcceptance.accepted'); if (!d.clientAcceptance?.evidence) out.push('clientAcceptance.evidence');
  return out;
}
function evaluate(d) {
  const xs = Object.values(d.integrations || {}), cs = d.checks || [], b = blockers(d);
  if (!['live','paused'].includes(d.status)) {
    if (xs.some(x => x.status === 'failed') || cs.some(c => c.status === 'failed')) d.status = 'failed';
    else if (['businessName','hours','services','approvalOwner'].some(k => !d.config?.profile?.[k])) d.status = 'draft';
    else if (xs.some(x => x.status !== 'verified')) d.status = 'integrating';
    else if (cs.some(c => c.status !== 'passed')) d.status = 'qa'; else d.status = 'ready';
  }
  const total = xs.length + cs.length + 2;
  const complete = xs.filter(x => x.status === 'verified').length + cs.filter(c => c.status === 'passed').length + (d.rollback?.documented ? 1 : 0) + (d.clientAcceptance?.accepted ? 1 : 0);
  d.blockers = b; d.readiness = { complete, total, percent: total ? Math.round(complete / total * 100) : 0, canActivate: b.length === 0 }; d.updatedAt = now(); return d;
}
function mutate(id, fn, expected = null) {
  const s = load(), i = s.deployments.findIndex(x => x.id === id); if (i < 0) return { ok:false,status:404,error:'Deployment not found' };
  const current = s.deployments[i];
  if (expected !== null && Number(expected) !== current.revision) return { ok:false,status:409,error:'Deployment changed. Reload before updating.',revision:current.revision };
  const next = clone(current), result = fn(next); if (result?.ok === false) return result;
  next.revision = current.revision + 1; evaluate(next); s.deployments[i] = next; save(s); return { ok:true,deployment:clone(next) };
}

export function createDeploymentFromAgencyLead(lead) {
  if (!lead?.id || !lead?.agency) return { ok:false,status:400,error:'Agency project is required' };
  if (!lead.agency.intake) return { ok:false,status:409,error:'Client intake must be completed before deployment provisioning.' };
  const s = load(), existing = s.deployments.find(x => x.projectId === lead.id); if (existing) return { ok:true,created:false,deployment:clone(existing) };
  const p = lead.agency.proposal || {}, service = clean(p.service || lead.agency.input?.service || lead.primaryNeed,60), need = clean(p.agentNeed || '',40), kinds = requiredIntegrationKinds(service, need), at = now();
  const d = evaluate({ id:`dep_${crypto.randomBytes(10).toString('hex')}`, projectId:lead.id, leadId:lead.id, businessName:clean(lead.businessName,160), service, tier:clean(lead.agency.input?.tier || p.tier,40), capabilities:capabilities(service,need), status:'draft', revision:1,
    config:{ profile:profile(lead), agent:{ need, tone:'professional', language:'en', greeting:'', humanTransfer:'' } },
    integrations:Object.fromEntries(kinds.map(k => [k,integration(k)])), checks:(p.acceptanceChecks || []).map((label,i) => ({ id:`check_${i+1}`,label:clean(label,500),status:'pending',evidence:'',checkedBy:'',checkedAt:null })),
    rollback:{documented:false,summary:'',owner:'',updatedAt:null}, clientAcceptance:{accepted:false,acceptedBy:'',evidence:'',acceptedAt:null}, health:{status:'unknown',lastProbeAt:null,detail:''}, liveAt:null,pausedAt:null,pauseReason:'',blockers:[],readiness:{complete:0,total:0,percent:0,canActivate:false},events:[event('deployment.created',`Created from agency project ${lead.id}`)],createdAt:at,updatedAt:at });
  s.deployments.push(d); save(s); return { ok:true,created:true,deployment:clone(d) };
}
export const listDeployments = () => load().deployments.map(d => clone(evaluate(clone(d))));
export function getDeployment(id) { const d = load().deployments.find(x => x.id === id); return d ? clone(evaluate(clone(d))) : null; }

export function updateDeploymentConfig(id, patch = {}, expected = null) {
  const safe = scrub(patch);
  return mutate(id, d => { const pp = safe.profile && typeof safe.profile === 'object' ? safe.profile : {}, ap = safe.agent && typeof safe.agent === 'object' ? safe.agent : {};
    for (const k of ['businessName','hours','services','rules','approvalOwner','website','phone','timezone','serviceArea']) if (k in pp) d.config.profile[k] = clean(pp[k]);
    for (const k of ['tone','language','greeting','humanTransfer']) if (k in ap) d.config.agent[k] = clean(ap[k]); d.events.push(event('deployment.config_updated')); return {ok:true}; }, expected);
}
export function updateIntegration(id, kind, patch = {}, expected = null) {
  const safe = scrub(patch);
  return mutate(id, d => { const x = d.integrations?.[kind]; if (!x) return {ok:false,status:404,error:'Integration is not required for this deployment'};
    const status = clean(safe.status,40) || x.status; if (!INTEGRATION_STATES.includes(status)) return {ok:false,status:400,error:'Invalid integration status'};
    x.provider = clean(safe.provider,120) || x.provider; x.status = status; if ('credentialConfigured' in safe) x.credentialConfigured = safe.credentialConfigured === true;
    x.externalId = clean(safe.externalId,500) || x.externalId; x.endpoint = clean(safe.endpoint,1000) || x.endpoint; x.evidence = clean(safe.evidence) || x.evidence;
    if (status === 'verified') { if (!x.provider) return {ok:false,status:400,error:'Provider is required before verification'}; if (x.requiresCredential && !x.credentialConfigured) return {ok:false,status:400,error:'Record credentialConfigured=true after the provider secret is stored outside the deployment ledger.'}; if (x.evidence.length < 8) return {ok:false,status:400,error:'Verification evidence is required.'}; x.lastCheckedAt = now(); }
    x.updatedAt = now(); d.events.push(event('integration.updated',`${kind}:${status}`)); return {ok:true}; }, expected);
}
export function recordAcceptanceCheck(id, checkId, input = {}, expected = null) {
  return mutate(id, d => { const c = d.checks.find(x => x.id === checkId); if (!c) return {ok:false,status:404,error:'Acceptance check not found'}; const evidence = clean(input.evidence); if (evidence.length < 8) return {ok:false,status:400,error:'Record test evidence before changing QA status.'}; c.status = input.passed === true ? 'passed' : 'failed'; c.evidence=evidence;c.checkedBy=clean(input.checkedBy,300);c.checkedAt=now();d.events.push(event('qa.recorded',`${c.id}:${c.status}`));return {ok:true}; }, expected);
}
export function recordRollbackPlan(id, input = {}, expected = null) {
  return mutate(id, d => { const summary=clean(input.summary), owner=clean(input.owner,500); if (input.documented === true && (summary.length < 12 || !owner)) return {ok:false,status:400,error:'A rollback summary and owner are required.'}; d.rollback={documented:input.documented===true,summary,owner,updatedAt:now()};d.events.push(event('rollback.updated'));return {ok:true}; }, expected);
}
export function recordClientAcceptance(id, input = {}, expected = null) {
  return mutate(id, d => { const accepted=input.accepted===true, acceptedBy=clean(input.acceptedBy,500), evidence=clean(input.evidence); if (accepted && (!acceptedBy || evidence.length < 8)) return {ok:false,status:400,error:'Accepted-by name and acceptance evidence are required.'}; d.clientAcceptance={accepted,acceptedBy,evidence,acceptedAt:accepted?now():null};d.events.push(event('client_acceptance.updated',accepted?'accepted':'revoked'));return {ok:true}; }, expected);
}
export function recordHealth(id, input = {}, expected = null) {
  return mutate(id, d => { const status=clean(input.status,40); if (!['healthy','degraded','down','unknown'].includes(status)) return {ok:false,status:400,error:'Health status must be healthy, degraded, down or unknown.'}; d.health={status,lastProbeAt:now(),detail:clean(input.detail)};d.events.push(event('health.recorded',status));return {ok:true}; }, expected);
}
export function activateDeployment(id, input = {}, expected = null) {
  return mutate(id, d => { evaluate(d); if (d.blockers.length) return {ok:false,status:409,error:'Deployment is not ready for activation.',blockers:d.blockers}; d.status='live';d.liveAt=d.liveAt||now();d.pausedAt=null;d.pauseReason='';d.health={status:'unknown',lastProbeAt:null,detail:'Awaiting first live health probe.'};d.events.push(event('deployment.activated',clean(input.evidence,2000)));return {ok:true}; }, expected);
}
export function pauseDeployment(id, input = {}, expected = null) {
  return mutate(id, d => { if (d.status !== 'live') return {ok:false,status:409,error:'Only a live deployment can be paused.'}; const reason=clean(input.reason,2000); if (reason.length < 8) return {ok:false,status:400,error:'Record why the deployment is being paused.'}; d.status='paused';d.pausedAt=now();d.pauseReason=reason;d.events.push(event('deployment.paused',reason));return {ok:true}; }, expected);
}
export function deploymentSummary(d) {
  if (!d) return null; d=evaluate(clone(d)); return { id:d.id,projectId:d.projectId,businessName:d.businessName,service:d.service,tier:d.tier,capabilities:d.capabilities,status:d.status,readiness:d.readiness,blockers:d.blockers,integrations:Object.values(d.integrations).map(({kind,provider,status,credentialConfigured,lastCheckedAt})=>({kind,provider,status,credentialConfigured,lastCheckedAt})),health:d.health,liveAt:d.liveAt,updatedAt:d.updatedAt,revision:d.revision };
}
