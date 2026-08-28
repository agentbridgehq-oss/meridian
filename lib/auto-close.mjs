/**
 * Close-loop: proposal → customer response → facts lock → cash → execute.
 * Not zero humans. Zero idle humans.
 * Gates: money, facts score, smoke verify, no cold outreach, OpenClaw cage.
 * Arm drain with MERIDIAN_AUTO_EXECUTE=1
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getLead, setStage, runAgentOnLead, BASE, dispatchWebhook } from '../engine.mjs';
import { deployAgent } from './deploy-agent.mjs';
import { finalizeDelivery } from './onboard.mjs';
import { fetchWebsiteSummary } from './knowledge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const STORE = path.join(DATA, 'close-loop.json');
export const REQUIRED = ['businessName', 'hours', 'services'];

export function autoExecuteArmed() {
  return process.env.MERIDIAN_AUTO_EXECUTE === '1';
}
function loadStore() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); }
  catch { return { jobs: [], events: [] }; }
}
function saveStore(data) {
  fs.mkdirSync(DATA, { recursive: true });
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(STORE, JSON.stringify(data, null, 2));
}
const jobId = () => `close_${crypto.randomBytes(6).toString('hex')}`;
const token = () => crypto.randomBytes(18).toString('hex');

export function getJob(id) { return loadStore().jobs.find((j) => j.id === id) || null; }
export function getJobByToken(t) {
  const tok = String(t || '');
  return loadStore().jobs.find((j) => j.acceptToken === tok || j.reviseToken === tok) || null;
}
export function getJobByLead(leadId) { return loadStore().jobs.find((j) => j.leadId === leadId) || null; }

export function scoreFacts(facts = {}, { websiteSummary } = {}) {
  const f = facts || {};
  const issues = [];
  const name = String(f.businessName || '').trim();
  const hours = String(f.hours || '').trim();
  const services = String(f.services || '').trim();
  const phone = String(f.phone || f.humanTransfer || '').trim();
  const website = String(f.website || '').trim();
  if (name.length < 2) issues.push({ field: 'businessName', reason: 'missing_name' });
  if (hours.length < 6 || /see (the )?website|tbd|n\/a|unknown/i.test(hours)) issues.push({ field: 'hours', reason: 'hours_unusable' });
  if (!/\d|am|pm|open|close|mon|tue|wed|thu|fri|sat|sun|24/i.test(hours)) issues.push({ field: 'hours', reason: 'hours_no_schedule_signal' });
  if (services.length < 8) issues.push({ field: 'services', reason: 'services_too_thin' });
  if (/lorem|placeholder|todo|xxx/i.test(`${name} ${hours} ${services}`)) issues.push({ field: 'facts', reason: 'placeholder_detected' });
  if (!phone && process.env.MERIDIAN_REQUIRE_TRANSFER === '1') issues.push({ field: 'humanTransfer', reason: 'no_escalation_number' });
  if (websiteSummary && /closed|by appointment only/i.test(String(websiteSummary)) && /24\s*\/\s*7|always open/i.test(hours)) {
    issues.push({ field: 'hours', reason: 'possible_website_conflict', blocking: false });
  }
  const blocking = issues.filter((i) => i.blocking !== false);
  return {
    ok: blocking.length === 0,
    score: Math.max(0, 100 - blocking.length * 25),
    issues,
    normalized: {
      businessName: name.slice(0, 80),
      hours: hours.slice(0, 240),
      services: services.slice(0, 800),
      faqs: String(f.faqs || '').slice(0, 1200),
      bookingRules: String(f.bookingRules || 'Offer two concrete times. Never invent an unconfirmed appointment.').slice(0, 400),
      humanTransfer: String(f.humanTransfer || f.phone || '').slice(0, 40),
      phone: String(f.phone || '').slice(0, 40),
      website,
      tone: String(f.tone || 'professional').slice(0, 40),
      primaryNeed: String(f.primaryNeed || 'full').slice(0, 24),
      neverInventPrices: true,
    },
  };
}

export function moneyReady(lead) {
  if (!lead) return { ok: false, reason: 'no_lead' };
  if (lead.moneyStatus === 'approved') return { ok: true, via: 'ops_or_stripe' };
  if (lead.stripeSessionId && (lead.amountPaid || lead.stage === 'money_approved')) return { ok: true, via: 'stripe' };
  if (['money_approved', 'intake_received', 'agent_connected', 'verified', 'delivered'].includes(lead.stage)) return { ok: true, via: 'stage' };
  return { ok: false, reason: 'awaiting_money' };
}

export function openCloseJob(lead) {
  if (!lead?.id) return { ok: false, error: 'lead required' };
  const store = loadStore();
  let job = store.jobs.find((j) => j.leadId === lead.id);
  if (!job) {
    job = {
      id: jobId(), leadId: lead.id, email: lead.email, businessName: lead.businessName || '',
      acceptToken: token(), reviseToken: token(), status: 'proposal_ready',
      facts: {}, factsScore: null, acceptedAt: null, declinedAt: null, executedAt: null, lastError: null,
      createdAt: new Date().toISOString(),
    };
    store.jobs.unshift(job);
  } else if (['declined', 'lost'].includes(job.status)) {
    return { ok: false, error: 'job_closed', job };
  }
  job.proposal = lead.proposal || job.proposal;
  job.updatedAt = new Date().toISOString();
  store.events.unshift({ at: job.updatedAt, jobId: job.id, type: 'opened', email: lead.email });
  store.events = store.events.slice(0, 500);
  saveStore(store);
  return {
    ok: true, job,
    acceptUrl: `${BASE}/accept/${job.acceptToken}`,
    reviseUrl: `${BASE}/accept/${job.reviseToken}?mode=revise`,
    checkoutUrl: `${BASE}${lead.proposal?.kitCheckout || '/checkout/stack'}?lead=${lead.id}`,
  };
}

export function parseCustomerReply(text) {
  const t = String(text || '').trim();
  if (!t) return { action: 'unknown' };
  if (/^(stop|unsubscribe|cancel|end)$/i.test(t)) return { action: 'stop' };
  if (/\b(no|nope|not interested|decline|pass)\b/i.test(t) && !/\byes\b/i.test(t)) return { action: 'decline' };
  if (/\b(change|wrong hours|incorrect|update facts|revise)\b/i.test(t)) return { action: 'revise' };
  if (/\b(yes|accept|approved|let'?s go|go ahead|book it|i agree)\b/i.test(t)) return { action: 'accept' };
  return { action: 'unknown' };
}

export async function customerRespond({ token: tok, action, facts, message } = {}) {
  const store = loadStore();
  const job = store.jobs.find((j) => j.acceptToken === tok || j.reviseToken === tok);
  if (!job) return { ok: false, error: 'invalid_token' };
  const lead = getLead(job.leadId);
  if (!lead) return { ok: false, error: 'lead_missing' };
  if (lead.unsubscribed) return { ok: false, error: 'unsubscribed' };
  const inferred = action || parseCustomerReply(message).action;
  job.lastMessage = String(message || '').slice(0, 500);
  job.updatedAt = new Date().toISOString();

  if (inferred === 'stop' || inferred === 'decline') {
    job.status = 'declined'; job.declinedAt = job.updatedAt;
    setStage(lead.id, 'lost', { closeStatus: 'declined' });
    saveStore(store);
    await dispatchWebhook('close.declined', { jobId: job.id, leadId: lead.id }).catch(() => {});
    return { ok: true, status: 'declined', job };
  }
  if (inferred === 'revise' || inferred === 'unknown') {
    job.status = 'revise_facts';
    if (facts && typeof facts === 'object') job.facts = { ...job.facts, ...facts };
    saveStore(store);
    return { ok: true, status: 'revise_facts', intakeUrl: `${BASE}/intake/${lead.intakeToken}`, acceptUrl: `${BASE}/accept/${job.acceptToken}` };
  }

  const merged = { ...job.facts, ...facts, businessName: facts?.businessName || lead.businessName || job.businessName };
  const scored = scoreFacts(merged);
  job.facts = scored.normalized; job.factsScore = scored;
  if (!scored.ok) {
    job.status = 'facts_blocked'; saveStore(store);
    return { ok: false, error: 'facts_incomplete', issues: scored.issues, intakeUrl: `${BASE}/intake/${lead.intakeToken}` };
  }
  job.status = 'accepted'; job.acceptedAt = job.updatedAt;
  setStage(lead.id, lead.moneyStatus === 'approved' ? 'money_approved' : 'awaiting_money', { closeStatus: 'accepted', chatIntake: job.facts });
  saveStore(store);
  await dispatchWebhook('close.accepted', { jobId: job.id, leadId: lead.id }).catch(() => {});
  const paid = moneyReady(getLead(lead.id));
  if (paid.ok && autoExecuteArmed()) return executeJob(job.id);
  return {
    ok: true, status: 'accepted', money: paid,
    checkoutUrl: `${BASE}${lead.proposal?.kitCheckout || '/checkout/auto'}?lead=${lead.id}`,
    next: paid.ok ? 'ready_to_execute' : 'pay_then_execute',
    autoExecuteArmed: autoExecuteArmed(),
  };
}

export async function executeJob(id) {
  if (!autoExecuteArmed()) return { ok: false, error: 'auto_execute_off', hint: 'Set MERIDIAN_AUTO_EXECUTE=1' };
  const store = loadStore();
  const job = store.jobs.find((j) => j.id === id);
  if (!job) return { ok: false, error: 'job_not_found' };
  if (job.status === 'delivered') return { ok: true, skipped: true, status: 'delivered', job };
  if (job.status === 'executing') return { ok: false, error: 'already_executing' };
  const lead = getLead(job.leadId);
  if (!lead) return { ok: false, error: 'lead_missing' };
  const paid = moneyReady(lead);
  if (!paid.ok) {
    job.status = 'accepted'; job.lastError = 'awaiting_money'; saveStore(store);
    return { ok: false, error: 'awaiting_money', checkoutUrl: `${BASE}${lead.proposal?.kitCheckout || '/checkout/auto'}?lead=${lead.id}` };
  }
  const scored = scoreFacts(job.facts || lead.chatIntake || {});
  if (!scored.ok) {
    job.status = 'facts_blocked'; job.factsScore = scored; job.lastError = 'facts_incomplete'; saveStore(store);
    return { ok: false, error: 'facts_incomplete', issues: scored.issues };
  }
  job.status = 'executing'; job.facts = scored.normalized; saveStore(store);
  let websiteSummary = '';
  if (scored.normalized.website) {
    try { const scraped = await fetchWebsiteSummary(scored.normalized.website); websiteSummary = scraped.summary || ''; } catch {}
  }
  const rescore = scoreFacts(scored.normalized, { websiteSummary });
  if (!rescore.ok) {
    job.status = 'facts_blocked'; job.factsScore = rescore; job.lastError = 'facts_failed_rescore'; saveStore(store);
    return { ok: false, error: 'facts_incomplete', issues: rescore.issues };
  }
  try {
    const deployed = await deployAgent({
      email: lead.email,
      businessName: rescore.normalized.businessName,
      primaryNeed: rescore.normalized.primaryNeed || lead.primaryNeed || 'full',
      hours: rescore.normalized.hours,
      services: rescore.normalized.services,
      faqs: rescore.normalized.faqs || (websiteSummary ? `Website notes:\n${websiteSummary.slice(0, 600)}` : ''),
      bookingRules: rescore.normalized.bookingRules,
      humanTransfer: rescore.normalized.humanTransfer,
      tone: rescore.normalized.tone,
      phone: rescore.normalized.phone,
      website: rescore.normalized.website,
      source: 'auto_close',
      baseUrl: BASE,
    });
    if (!deployed.ok) {
      job.status = 'execute_failed'; job.lastError = deployed.error || 'deploy_failed'; saveStore(store);
      await dispatchWebhook('close.execute_failed', { jobId: job.id, error: job.lastError }).catch(() => {});
      return { ok: false, error: job.lastError, deployed };
    }
    const connection = {
      id: deployed.agentId, apiKey: deployed.apiKey, businessName: deployed.businessName,
      endpoints: {
        chat: `/api/v1/agents/${deployed.agentId}/chat`,
        speak: `/api/v1/agents/${deployed.agentId}/speak`,
        voiceTurn: `/api/v1/agents/${deployed.agentId}/voice-turn`,
        config: `/api/v1/agents/${deployed.agentId}`,
        events: `/api/v1/agents/${deployed.agentId}/events`,
      },
    };
    const delivery = await finalizeDelivery({ lead: getLead(lead.id) || lead, connection, baseUrl: BASE });
    if (!delivery.ok) {
      job.status = 'execute_failed'; job.lastError = 'verify_failed'; job.verification = delivery.verification; job.guideUrl = delivery.guideUrl; saveStore(store);
      await dispatchWebhook('close.verify_failed', { jobId: job.id, agentId: deployed.agentId }).catch(() => {});
      return { ok: false, error: 'verify_failed', message: 'Built but smoke tests failed — not live.', guideUrl: delivery.guideUrl, verification: delivery.verification };
    }
    job.status = 'delivered'; job.executedAt = new Date().toISOString(); job.agentId = deployed.agentId;
    job.guideUrl = delivery.guideUrl; job.setupWizardUrl = delivery.setupWizardUrl; job.lastError = null; saveStore(store);
    await dispatchWebhook('close.delivered', { jobId: job.id, leadId: lead.id, agentId: deployed.agentId, guideUrl: delivery.guideUrl }).catch(() => {});
    return {
      ok: true, status: 'delivered', agentId: deployed.agentId, guideUrl: delivery.guideUrl,
      setupWizardUrl: delivery.setupWizardUrl, verification: delivery.verification,
      humanRemaining: ['attach_phone_number_in_retell_or_twilio', 'paste_widget_if_they_want_site_chat'],
    };
  } catch (e) {
    job.status = 'execute_failed'; job.lastError = e.message; saveStore(store);
    return { ok: false, error: e.message };
  }
}

export async function tickCloseLoop({ max = 5 } = {}) {
  if (!autoExecuteArmed()) return { ok: true, armed: false, processed: 0, note: 'MERIDIAN_AUTO_EXECUTE is not 1' };
  const store = loadStore();
  const ready = store.jobs.filter((j) => ['accepted', 'execute_failed', 'ready'].includes(j.status)).slice(0, max);
  const results = [];
  for (const job of ready) {
    const lead = getLead(job.leadId);
    if (!lead || lead.unsubscribed) { results.push({ id: job.id, skipped: true, reason: 'lead_gone' }); continue; }
    if (!moneyReady(lead).ok) { results.push({ id: job.id, skipped: true, reason: 'awaiting_money' }); continue; }
    results.push(await executeJob(job.id));
  }
  return { ok: true, armed: true, processed: results.length, results };
}

export function closeLoopStatus() {
  const store = loadStore();
  const by = {};
  for (const j of store.jobs) by[j.status] = (by[j.status] || 0) + 1;
  return {
    armed: autoExecuteArmed(), jobs: store.jobs.length, byStatus: by,
    recent: store.jobs.slice(0, 15).map((j) => ({ id: j.id, leadId: j.leadId, email: j.email, status: j.status, agentId: j.agentId || null, lastError: j.lastError, updatedAt: j.updatedAt })),
    gates: { money: 'stripe_or_ops_approve', facts: 'scoreFacts fail-closed', verify: 'finalizeDelivery', outreach: 'never_from_this_module', phoneAttach: 'customer_or_ops' },
  };
}

export function listCloseJobs(limit = 40) { return loadStore().jobs.slice(0, limit); }
export function ensureCloseJobForLead(leadId) {
  const lead = getLead(leadId);
  if (!lead) return { ok: false, error: 'lead_not_found' };
  if (!lead.proposal) runAgentOnLead(lead.id);
  return openCloseJob(getLead(lead.id));
}
