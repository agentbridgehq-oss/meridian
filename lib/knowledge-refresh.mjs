/**
 * Meridian weekly knowledge self-update (Approve / Reject)
 *
 * Flow:
 *  1. Fetch public website (SSRF-safe) when agent has website / websiteUrl
 *  2. Diff against current truth layer
 *  3. Create pending proposals (never auto-apply facts)
 *  4. Owner approves in dashboard or email CTA
 *  5. Only then update agent config
 *
 * Never invents prices. Never touches banks/inboxes.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getAgent, listAgents, updateAgentConfig } from '../engine.mjs';
import { fetchWebsiteSummary, setKnowledge } from './knowledge.mjs';
import { sendOwnerEmail, notifyOwner } from './notify.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(__dirname, '..', 'data');
const STORE = path.join(DATA_DIR, 'knowledge-proposals.json');
const BASE = (process.env.PUBLIC_BASE_URL || 'http://localhost:8891').replace(/\/$/, '');

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE, 'utf8'));
  } catch {
    return { proposals: [] };
  }
}
function save(data) {
  ensure();
  fs.writeFileSync(STORE, JSON.stringify(data, null, 2));
}

function rid() {
  return `kp_${crypto.randomBytes(6).toString('hex')}`;
}

function normalizeText(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function sentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 400);
}

/** Pull rough hour-like lines from scrape */
function extractHourCandidates(text) {
  const lines = String(text || '').split(/\n|(?<=\.)\s+/);
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.length < 12 || t.length > 180) continue;
    if (/\b(mon|tue|wed|thu|fri|sat|sun|monday|hours|open|closed|\d{1,2}\s*([ap]m|:)\b)/i.test(t)) {
      out.push(t);
    }
  }
  return [...new Set(out)].slice(0, 5);
}

/**
 * Build proposals by comparing scrape → current knowledge.
 * Conservative: only surface diffs for human approval.
 */
export function buildProposalsFromScrape(agent, scraped) {
  const cfg = agent.config || {};
  const currentSummary = String(cfg.websiteSummary || '');
  const currentKb = String(cfg.knowledgeBase || '');
  const currentFaqs = String(cfg.faqs || '');
  const currentHours = String(cfg.hours || '');
  const scrapeText = String(scraped.summary || scraped.text || '');
  const proposals = [];
  const now = new Date().toISOString();

  // 1) Website summary refresh if substantially different
  if (scrapeText.length > 80) {
    const a = normalizeText(currentSummary).slice(0, 1500);
    const b = normalizeText(scrapeText).slice(0, 1500);
    if (!a || (b && a !== b && !a.includes(b.slice(0, 200)) && !b.includes(a.slice(0, 200)))) {
      proposals.push({
        id: rid(),
        type: 'websiteSummary',
        title: 'Update website summary',
        reason: currentSummary
          ? 'Public website text differs from the summary stored on your agent.'
          : 'No website summary on agent yet — draft from your public site.',
        before: currentSummary.slice(0, 2000),
        after: scrapeText.slice(0, 3500),
        field: 'websiteSummary',
        value: scrapeText.slice(0, 3500),
      });
    }
  }

  // 2) Hours candidates
  const hourCands = extractHourCandidates(scrapeText);
  if (hourCands.length && currentHours) {
    const joined = hourCands.join(' · ');
    if (!normalizeText(currentHours).includes(normalizeText(hourCands[0]).slice(0, 20))) {
      proposals.push({
        id: rid(),
        type: 'hours_suggestion',
        title: 'Possible hours update (review carefully)',
        reason: 'Found hour-like text on the website that may not match saved hours. Confirm before applying.',
        before: currentHours,
        after: joined,
        field: 'hours',
        value: joined.slice(0, 500),
        caution: true,
      });
    }
  } else if (hourCands.length && !currentHours) {
    proposals.push({
      id: rid(),
      type: 'hours_suggestion',
      title: 'Add hours from website',
      reason: 'No hours saved on agent; website may contain hours.',
      before: '',
      after: hourCands.join(' · '),
      field: 'hours',
      value: hourCands.join(' · ').slice(0, 500),
      caution: true,
    });
  }

  // 3) New sentences for knowledge base / FAQ (not already present)
  const known = normalizeText(currentSummary + ' ' + currentKb + ' ' + currentFaqs);
  const fresh = sentences(scrapeText)
    .filter((s) => {
      const n = normalizeText(s);
      if (n.length < 40) return false;
      if (known.includes(n.slice(0, 50))) return false;
      // skip junk
      if (/\bcookie|privacy policy|copyright|all rights reserved|javascript\b/i.test(s)) return false;
      return true;
    })
    .slice(0, 5);

  for (const s of fresh) {
    proposals.push({
      id: rid(),
      type: 'knowledge_append',
      title: 'Add fact to knowledge base',
      reason: 'New sentence found on website that is not in your saved FAQs/knowledge.',
      before: '(not in agent)',
      after: s,
      field: 'knowledgeBaseAppend',
      value: s,
    });
  }

  // Cap proposals per refresh
  return proposals.slice(0, 8).map((p) => ({
    ...p,
    agentId: agent.id,
    businessName: agent.businessName,
    status: 'pending',
    sourceUrl: scraped.url || null,
    createdAt: now,
  }));
}

/**
 * Run refresh for one agent → store pending proposals.
 */
export async function refreshAgentKnowledge(agentId, { force = false } = {}) {
  const agent = getAgent(agentId);
  if (!agent) return { ok: false, error: 'Agent not found' };

  const cfg = agent.config || {};
  const url = cfg.website || cfg.websiteUrl || cfg.siteUrl || '';
  if (!url) {
    return {
      ok: false,
      error: 'No website URL on agent. Set config.website or websiteUrl in dashboard knowledge.',
      agentId,
    };
  }

  // Throttle: skip if refreshed < 6 days ago unless force
  const last = cfg.knowledgeRefreshAt ? new Date(cfg.knowledgeRefreshAt).getTime() : 0;
  if (!force && last && Date.now() - last < 6 * 24 * 3600 * 1000) {
    return {
      ok: true,
      skipped: true,
      reason: 'Refreshed recently (use force=true to re-run)',
      agentId,
      lastRefreshAt: cfg.knowledgeRefreshAt,
    };
  }

  const scraped = await fetchWebsiteSummary(url);
  if (!scraped.ok) {
    return { ok: false, error: scraped.error || 'scrape failed', agentId, url };
  }

  const proposals = buildProposalsFromScrape(agent, scraped);
  const store = load();

  // Expire old pending for this agent (replace batch)
  store.proposals = (store.proposals || []).filter(
    (p) => !(p.agentId === agentId && p.status === 'pending'),
  );
  store.proposals.unshift(...proposals);
  store.proposals = store.proposals.slice(0, 500);
  save(store);

  updateAgentConfig(agentId, {
    knowledgeRefreshAt: new Date().toISOString(),
    knowledgeRefreshUrl: scraped.url,
  });

  return {
    ok: true,
    agentId,
    businessName: agent.businessName,
    url: scraped.url,
    proposed: proposals.length,
    proposals,
  };
}

export function listProposals(agentId, { status = 'pending', limit = 50 } = {}) {
  const all = load().proposals || [];
  return all
    .filter((p) => (!agentId || p.agentId === agentId) && (!status || p.status === status))
    .slice(0, limit);
}

export function getProposal(proposalId) {
  return (load().proposals || []).find((p) => p.id === proposalId) || null;
}

/**
 * Apply one proposal to agent config.
 */
export function approveProposal(agentId, proposalId) {
  const store = load();
  const p = store.proposals.find((x) => x.id === proposalId && x.agentId === agentId);
  if (!p) return { ok: false, error: 'Proposal not found' };
  if (p.status !== 'pending') return { ok: false, error: `Already ${p.status}` };

  const agent = getAgent(agentId);
  if (!agent) return { ok: false, error: 'Agent not found' };

  if (p.field === 'websiteSummary') {
    setKnowledge(agentId, { websiteSummary: p.value });
  } else if (p.field === 'hours') {
    setKnowledge(agentId, { hours: p.value });
  } else if (p.field === 'knowledgeBaseAppend') {
    const prev = String(agent.config?.knowledgeBase || '');
    const next = (prev ? prev + '\n\n' : '') + `• ${p.value}`;
    setKnowledge(agentId, { knowledgeBase: next.slice(0, 20000) });
  } else if (p.field === 'faqs') {
    setKnowledge(agentId, { faqs: p.value });
  } else if (p.field === 'services') {
    setKnowledge(agentId, { services: p.value });
  } else {
    return { ok: false, error: `Unknown field ${p.field}` };
  }

  p.status = 'approved';
  p.resolvedAt = new Date().toISOString();
  save(store);

  return { ok: true, proposal: p, agentId };
}

export function rejectProposal(agentId, proposalId, reason = '') {
  const store = load();
  const p = store.proposals.find((x) => x.id === proposalId && x.agentId === agentId);
  if (!p) return { ok: false, error: 'Proposal not found' };
  if (p.status !== 'pending') return { ok: false, error: `Already ${p.status}` };
  p.status = 'rejected';
  p.resolvedAt = new Date().toISOString();
  p.rejectReason = String(reason || '').slice(0, 300);
  save(store);
  return { ok: true, proposal: p };
}

export function approveAll(agentId) {
  const pending = listProposals(agentId, { status: 'pending', limit: 100 });
  const results = pending.map((p) => approveProposal(agentId, p.id));
  return { ok: true, count: results.filter((r) => r.ok).length, results };
}

export function rejectAll(agentId) {
  const pending = listProposals(agentId, { status: 'pending', limit: 100 });
  const results = pending.map((p) => rejectProposal(agentId, p.id, 'bulk_reject'));
  return { ok: true, count: results.filter((r) => r.ok).length, results };
}

/**
 * Weekly job: refresh agents that have website URLs; email owners with pending counts.
 */
export async function runWeeklyKnowledgeRefresh({ force = false, maxAgents = 40, notify = true } = {}) {
  const agents = listAgents()
    .filter((a) => a.status === 'active')
    .filter((a) => a.config?.website || a.config?.websiteUrl || a.config?.siteUrl)
    .slice(0, maxAgents);

  const results = [];
  for (const a of agents) {
    try {
      results.push(await refreshAgentKnowledge(a.id, { force }));
    } catch (e) {
      results.push({ ok: false, agentId: a.id, error: e.message });
    }
  }

  const emails = [];
  if (notify) {
    for (const r of results) {
      if (!r.ok || r.skipped || !r.proposed) continue;
      const agent = getAgent(r.agentId);
      const email = agent?.config?.ownerNotifyEmail;
      if (!email) continue;
      const pending = listProposals(r.agentId, { status: 'pending', limit: 10 });
      const lines = pending
        .map((p, i) => `${i + 1}. ${p.title}\n   ${p.reason}\n   → ${(p.after || '').slice(0, 120)}`)
        .join('\n\n');
      const text =
        `Meridian found ${pending.length} knowledge update(s) for ${agent.businessName}.\n\n` +
        `Nothing was applied yet — you must Approve or Reject.\n\n` +
        `${lines}\n\n` +
        `Open dashboard: ${BASE}/dashboard\n` +
        `(Sign in with your Agent ID + secret key, then review Knowledge updates.)\n\n` +
        `Meridian self-update never changes facts without your approval.`;
      const sent = await sendOwnerEmail({
        to: email,
        subject: `Meridian · ${pending.length} knowledge update(s) to approve · ${agent.businessName}`,
        text,
      });
      emails.push({ agentId: r.agentId, email, sent });
    }
  }

  return {
    ok: true,
    ranAt: new Date().toISOString(),
    agentsConsidered: agents.length,
    results,
    emails,
    pendingTotal: listProposals(null, { status: 'pending', limit: 500 }).length,
  };
}

export function knowledgeRefreshStatus() {
  const store = load();
  const pending = (store.proposals || []).filter((p) => p.status === 'pending');
  return {
    pending: pending.length,
    byAgent: pending.reduce((acc, p) => {
      acc[p.agentId] = (acc[p.agentId] || 0) + 1;
      return acc;
    }, {}),
    lastProposals: (store.proposals || []).slice(0, 10).map((p) => ({
      id: p.id,
      agentId: p.agentId,
      title: p.title,
      status: p.status,
      createdAt: p.createdAt,
    })),
  };
}
