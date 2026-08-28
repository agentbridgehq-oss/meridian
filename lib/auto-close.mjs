/**
 * Close-loop: proposal → customer response → facts lock → cash → AWAITING KEN → execute.
 * Default is STOP. Unknown is STOP. Finalize only after Ken phrase:
 *   "yes lets go ahead with this"
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getLead, setStage, runAgentOnLead, BASE, dispatchWebhook } from '../engine.mjs';
import { deployAgent } from './deploy-agent.mjs';
import { finalizeDelivery } from './onboard.mjs';
import { fetchWebsiteSummary } from './knowledge.mjs';
import { isKenGoAhead, GO_AHEAD_PHRASE } from './ken-gate.mjs';

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

function parkForKen(job, reason) {
  job.status = 'awaiting_ken';
  job.lastError = reason || 'awaiting_ken';
  job.goAhead = false;
  return {
    ok: false,
    error: 'awaiting_ken',
    default: 'stop',
    phrase: GO_AHEAD_PHRASE,
    hint: 'Ken must say exactly: yes lets go ahead with this',
    jobId: job.id,
  };
}

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
      goAhead: false, goAheadAt: null, goAheadPhrase: null,
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

export function grantKenGoAhead(jobId, { phrase, note } = {}) {
  if (!isKenGoAhead(phrase)) {
    return {
      ok: false,
      error: 'stop_default',
      default: 'stop',
      required: GO_AHEAD_PHRASE,
      got: String(phrase || ''),
    };
  }
  const store = loadStore();
  const job = store.jobs.find((j) => j.id === jobId);
  if (!job) return { ok: false, error: 'job_not_found', default: 'stop' };
  if (['declined', 'lost'].includes(job.status)) return { ok: false, error: 'job_closed', default: 'stop' };
  job.goAhead = true;
  job.goAheadAt = new Date().toISOString();
  job.goAheadPhrase = GO_AHEAD_PHRASE;
  job.goAheadNote = String(note || '').slice(0, 240);
  job.status = 'go_ahead';
  job.lastError = null;
  job.updatedAt = job.goAheadAt;
  saveStore(store);
  dispatchWebhook('close.ken_go_ahead', { jobId: job.id, leadId: job.leadId }).catch(() => {});
  return { ok: true, status: 'go_ahead', jobId: job.id, next: 'execute_when_money_and_facts_ready' };
}

export function revokeKenGoAhead(jobId, note = '') {
  const store = loadStore();
  const job = store.jobs.find((j) => j.id === jobId);
  if (!job) return { ok: false, error: 'job_not_found' };
  if (job.status === 'delivered') return { ok: false, error: 'already_delivered' };
  job.goAhead = false;
  job.goAheadRevokedAt = new Date().toISOString();
  job.goAheadNote = String(note || 'revoked').slice(0, 240);
  job.status = 'awaiting_ken';
  job.updatedAt = job.goAheadRevokedAt;
  saveStore(store);
  return { ok: true, status: 'awaiting_ken', default: 'stop' };
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
    job.status = 'declined'; job.declinedAt = job.updatedAt; job.goAhead = false;
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
  job.status = 'accepted'; job.acceptedAt = job.updatedAt; job.goAhead = false;
  setStage(lead.id, lead.moneyStatus === 'approved' ? 'money_approved' : 'awaiting_money', { closeStatus: 'accepted', chatIntake: job.facts });
  const paid = moneyReady(getLead(lead.id));
  if (paid.ok) {
    const parked = parkForKen(job, 'customer_accepted_paid_awaiting_ken');
    saveStore(store);
    await dispatchWebhook('close.awaiting_ken', { jobId: job.id, leadId: lead.id }).catch(() => {});
    return { ...parked, status: 'awaiting_ken', money: paid };
  }
  saveStore(store);
  await dispatchWebhook('close.accepted', { jobId: job.id, leadId: lead.id }).catch(() => {});
  return {
    ok: true, status: 'accepted', money: paid, default: 'stop',
    checkoutUrl: `${BASE}${lead.proposal?.kitCheckout || '/checkout/auto'}?lead=${lead.id}`,
    next: 'pay_then_awaiting_ken',
  };
}

export async function executeJob(id) {
  const store = loadStore();
  const job = store.jobs.find((j) => j.id === id);
  if (!job) return { ok: false, error: 'job_not_found', default: 'stop' };
  if (job.status === 'delivered') return { ok: true, skipped: true, status: 'delivered', job };
  if (job.status === 'executing') return { ok: false, error: 'already_executing' };
  if (job.goAhead !== true) {
    const parked = parkForKen(job, 'no_ken_go_ahead');
    saveStore(store);
    return parked;
  }
  if (!autoExecuteArmed()) {
    return { ok: false, error: 'auto_execute_off', default: 'stop', hint: 'Set MERIDIAN_AUTO_EXECUTE=1 after Ken go-ahead' };
  }
  const lead = getLead(job.leadId);
  if (!lead) return { ok: false, error: 'lead_missing', default: 'stop' };
  const paid = moneyReady(lead);
  if (!paid.ok) {
    job.status = 'accepted'; job.lastError = 'awaiting_money'; job.goAhead = job.goAhead; saveStore(store);
    return { ok: false, error: 'awaiting_money', default: 'stop', checkoutUrl: `${BASE}${lead.proposal?.kitCheckout || '/checkout/auto'}?lead=${lead.id}` };
  }
  const scored = scoreFacts(job.facts || lead.chatIntake || {});
  if (!scored.ok) {
    job.status = 'facts_blocked'; job.factsScore = scored; job.lastError = 'facts_incomplete'; saveStore(store);
    return { ok: false, error: 'facts_incomplete', default: 'stop', issues: scored.issues };
  }
  job.status = 'executing'; job.facts = scored.normalized; saveStore(store);
  let websiteSummary = '';
  if (scored.normalized.website) {
    try { const scraped = await fetchWebsiteSummary(scored.normalized.website); websiteSummary = scraped.summary || ''; } catch {}
  }
  const rescore = scoreFacts(scored.normalized, { websiteSummary });
  if (!rescore.ok) {
    job.status = 'facts_blocked'; job.factsScore = rescore; job.lastError = 'facts_failed_rescore'; saveStore(store);
    return { ok: false, error: 'facts_incomplete', default: 'stop', issues: rescore.issues };
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
      return { ok: false, error: job.lastError, default: 'stop', deployed };
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
      return { ok: false, error: 'verify_failed', default: 'stop', message: 'Built but smoke tests failed — not live.', guideUrl: delivery.guideUrl, verification: delivery.verification };
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
    return { ok: false, error: e.message, default: 'stop' };
  }
}

export async function tickCloseLoop({ max = 5 } = {}) {
  const store = loadStore();
  const ready = store.jobs.filter((j) => j.goAhead === true && ['go_ahead', 'execute_failed'].includes(j.status)).slice(0, max);
  const parked = store.jobs.filter((j) => j.status === 'accepted' || (['accepted', 'awaiting_ken'].includes(j.status) && j.goAhead !== true)).length;
  if (!ready.length) {
    return { ok: true, default: 'stop', processed: 0, parkedAwaitingKen: parked, note: 'No Ken go-ahead. Nothing finalized.' };
  }
  if (!autoExecuteArmed()) {
    return { ok: true, default: 'stop', processed: 0, armed: false, ready: ready.length, note: 'Go-ahead recorded but MERIDIAN_AUTO_EXECUTE is not 1' };
  }
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
    default: 'stop',
    kenPhrase: GO_AHEAD_PHRASE,
    armed: autoExecuteArmed(),
    jobs: store.jobs.length,
    byStatus: by,
    awaitingKen: store.jobs.filter((j) => j.status === 'awaiting_ken' || (j.goAhead !== true && !['delivered', 'declined', 'lost'].includes(j.status))).map((j) => ({ id: j.id, email: j.email, status: j.status })),
    recent: store.jobs.slice(0, 15).map((j) => ({ id: j.id, leadId: j.leadId, email: j.email, status: j.status, goAhead: j.goAhead === true, agentId: j.agentId || null, lastError: j.lastError, updatedAt: j.updatedAt })),
    gates: {
      money: 'stripe_or_ops_approve',
      facts: 'scoreFacts fail-closed',
      ken: 'yes lets go ahead with this',
      verify: 'finalizeDelivery',
      outreach: 'never_from_this_module',
      unknown: 'stop',
    },
  };
}

export function listCloseJobs(limit = 40) { return loadStore().jobs.slice(0, limit); }
export function ensureCloseJobForLead(leadId) {
  const lead = getLead(leadId);
  if (!lead) return { ok: false, error: 'lead_not_found' };
  if (!lead.proposal) runAgentOnLead(lead.id);
  return openCloseJob(getLead(lead.id));
}
export { GO_AHEAD_PHRASE };
