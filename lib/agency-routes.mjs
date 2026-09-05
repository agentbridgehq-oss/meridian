import crypto from 'node:crypto';
import { services, stages, stageGuidance, draftProposal } from './agency-catalog.mjs';
import { registerDeploymentCoreRoutes } from './deployment-routes.mjs';
import { listLeads, getLead, upsertLead } from '../engine.mjs';

const clean = (value, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
function publicProject(lead) {
  const p = lead.agency;
  return { id: lead.id, businessName: lead.businessName, proposal: p.proposal, stage: p.stage,
    stages, guidance: stageGuidance[p.stage], intakeReceived: Boolean(p.intake),
    history: p.history.map(({ stage, at }) => ({ stage, at })), updatedAt: lead.updatedAt || lead.createdAt };
}
function projectFor(req) {
  const token = clean(req.get('Authorization')).replace(/^Bearer /, '');
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  return listLeads().find(l => l.agency?.token && crypto.timingSafeEqual(Buffer.from(l.agency.token), Buffer.from(token))) || null;
}
export function registerAgencyRoutes(app, { admin, publicLimiter, checkFormBot, rejectObviousBots }) {
  // Deployment Core is intentionally registered through the agency router so
  // the existing server bootstrap stays stable while managed-service delivery
  // gains a hard, auditable go-live gate.
  registerDeploymentCoreRoutes(app, { admin });

  // New agency clients use the existing funnel URL with an explicit, versioned contract.
  // Legacy kit/agent submissions continue through the original handler below this one.
  app.post('/api/funnel', publicLimiter, rejectObviousBots, (req, res, next) => {
    if (req.body?.flow !== 'agency-v2') return next();
    res.set('Cache-Control', 'no-store');
    const b = req.body || {};
    if (!checkFormBot(b).ok) return res.status(400).json({ error: 'Please wait a moment and try again.' });
    const input = {
      email: clean(b.email, 254).toLowerCase(), businessName: clean(b.businessName, 160),
      name: clean(b.name, 160), service: clean(b.primaryNeed, 40), tier: clean(b.tier, 30) || 'foundation',
      businessWebsite: clean(b.businessWebsite, 1000), volume: clean(b.volume, 160),
      systems: clean(b.systems, 2000), goals: clean(b.goals, 4000), phone: clean(b.phone, 80),
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || !input.businessName || !input.name || b.consent !== true)
      return res.status(400).json({ error: 'Your name, business, valid email and consent are required.' });
    if (!Object.hasOwn(services, input.service) || !['foundation', 'growth', 'scale'].includes(input.tier))
      return res.status(400).json({ error: 'Choose a listed service and engagement.' });
    if (input.businessWebsite) {
      try { if (!['https:', 'http:'].includes(new URL(input.businessWebsite).protocol)) throw new Error(); }
      catch { return res.status(400).json({ error: 'Use a valid http or https business website.' }); }
    }
    // A repeated email must never disclose an existing private link or reset paid work.
    if (listLeads().some(l => l.email === input.email))
      return res.status(409).json({ error: 'Please use your existing Meridian link or contact Meridian to update this request. No existing work has been changed.' });
    const at = new Date().toISOString();
    const lead = upsertLead({ email: input.email, businessName: input.businessName, primaryNeed: input.service,
      phone: input.phone, source: 'agency-v2', consent: true, stage: 'agency_proposal',
      agency: { token: crypto.randomBytes(24).toString('hex'), input, proposal: draftProposal(input),
        stage: 'proposal', history: [{ stage: 'proposal', at }], consentAt: at } });
    return res.status(201).json({ ok: true, project: publicProject(lead),
      onboardingPath: `/meridian-onboarding.html#${lead.agency.token}` });
  });
  app.get('/api/agency/project', publicLimiter, (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    const lead = projectFor(req);
    if (!lead) return res.status(401).json({ error: 'Open your private onboarding link to view this project.' });
    res.json({ ok: true, project: publicProject(lead) });
  });
  app.put('/api/agency/project/intake', publicLimiter, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const lead = projectFor(req);
    if (!lead) return res.status(401).json({ error: 'Invalid project link.' });
    if (lead.agency.stage !== 'intake') return res.status(409).json({ error: 'Intake opens after the scope and commercial agreement are approved.' });
    const b = req.body || {};
    const intake = Object.fromEntries(['hours', 'services', 'rules', 'owner'].map(k => [k, clean(b[k], 4000)]));
    if (!intake.hours || !intake.services || !intake.owner) return res.status(400).json({ error: 'Hours, services and an approval owner are required.' });
    const agency = { ...lead.agency, intake: { ...intake, submittedAt: new Date().toISOString() } };
    upsertLead({ id: lead.id, agency });
    res.json({ ok: true, project: publicProject(getLead(lead.id)) });
  });
  app.get('/api/ops/agency/projects', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ ok: true, projects: listLeads().filter(l => l.agency).map(l => ({ ...publicProject(l),
      input: l.agency.input, intake: l.agency.intake || null, evidence: l.agency.history,
      onboardingPath: `/meridian-onboarding.html#${l.agency.token}` })) });
  });
  app.patch('/api/ops/agency/projects/:id', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const lead = getLead(req.params.id);
    if (!lead?.agency) return res.status(404).json({ error: 'Project not found' });
    const b = req.body || {}, current = lead.agency.stage;
    const target = stages[stages.indexOf(current) + 1];
    if (b.stage !== target || !target) return res.status(409).json({ error: 'Advance one stage at a time.' });
    const evidence = clean(b.evidence, 4000);
    if (evidence.length < 12) return res.status(400).json({ error: 'Record the completed work and evidence before advancing.' });
    if (current === 'approval' && b.commercialApproved !== true)
      return res.status(400).json({ error: 'Record the client-approved scope and commercial agreement first.' });
    let quote;
    if (current === 'approval') {
      const { setupFee, monthlyFee, currency } = b;
      const scopeNotes = clean(b.scopeNotes, 4000);
      if (typeof setupFee !== 'number' || !Number.isFinite(setupFee) || setupFee < 0 ||
          typeof monthlyFee !== 'number' || !Number.isFinite(monthlyFee) || monthlyFee < 0 ||
          !['CAD', 'USD'].includes(currency) || scopeNotes.length < 12)
        return res.status(400).json({ error: 'Record agreed setup and monthly fees, CAD or USD, and the final scope with provider costs and timing.' });
      quote = { setupFee, monthlyFee, currency, scopeNotes, approvedAt: new Date().toISOString() };
    }
    if (current === 'intake' && !lead.agency.intake)
      return res.status(409).json({ error: 'Client intake is still required.' });
    if (current === 'qa' && b.qaPassed !== true)
      return res.status(400).json({ error: 'Acceptance checks must pass before go-live preparation.' });
    if (current === 'go-live' && b.clientAccepted !== true)
      return res.status(400).json({ error: 'Client acceptance and the rollout/rollback plan are required.' });
    const agency = { ...lead.agency, ...(quote ? { proposal: { ...lead.agency.proposal, status: 'approved', quote, nextStep: 'Follow the current onboarding stage above.' } } : {}), stage: target, history: [...lead.agency.history,
      { stage: target, at: new Date().toISOString(), evidence,
        commercialApproved: b.commercialApproved === true, qaPassed: b.qaPassed === true, clientAccepted: b.clientAccepted === true }] };
    upsertLead({ id: lead.id, stage: `agency_${target}`, agency });
    res.json({ ok: true, project: publicProject(getLead(lead.id)) });
  });
}
