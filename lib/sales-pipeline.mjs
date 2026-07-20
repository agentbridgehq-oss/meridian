/**
 * Meridian Sales Agent pipeline
 *
 * Lead in → Claude sales brain → reply + score + sequence drafts
 * CASL: Meridian generates messages; customer sends via their SMS/CRM.
 * OpenClaw-contained: no bank, no inbox scrape, no auto-blast.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { smartAgentChat, buildSystemPrompt } from './agent-brain.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(__dirname, '..', 'data');
const LEADS_FILE = path.join(DATA_DIR, 'sales-leads.json');

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
function load() {
  try {
    return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  } catch {
    return { leads: [] };
  }
}
function save(data) {
  ensure();
  fs.writeFileSync(LEADS_FILE, JSON.stringify(data, null, 2));
}
function rid() {
  return `slead_${crypto.randomBytes(8).toString('hex')}`;
}

/** Sequence templates (customer sends — Meridian drafts) */
export const SALES_SEQUENCE = [
  {
    id: 'instant',
    delayMinutes: 0,
    label: 'Instant (0 min)',
    goal: 'Acknowledge + ask for best time',
  },
  {
    id: 'bump_15',
    delayMinutes: 15,
    label: '+15 min if no reply',
    goal: 'Offer two concrete time options',
  },
  {
    id: 'day1',
    delayMinutes: 24 * 60,
    label: '+24 h',
    goal: 'Soft bump — pricing or book',
  },
  {
    id: 'day3',
    delayMinutes: 72 * 60,
    label: '+72 h last soft',
    goal: 'Close file or keep open — CASL soft close',
  },
];

/**
 * Score a lead from fields + optional transcript.
 * Book if score >= 6 (kit scorecard).
 */
export function scoreLead(lead = {}) {
  let score = 0;
  const reasons = [];
  const blob = [
    lead.need,
    lead.message,
    lead.service,
    lead.timeline,
    lead.budget,
    lead.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (lead.service || lead.need || /repair|install|quote|estimate|service|job/.test(blob)) {
    score += 2;
    reasons.push('right_service');
  }
  if (
    lead.timeline ||
    /this week|asap|urgent|soon|tomorrow|today|within (a )?(week|month)|30 days/.test(blob)
  ) {
    score += 2;
    reasons.push('timeline');
  }
  if (lead.budget || /budget|afford|\$\d+|price range|how much/.test(blob)) {
    score += 2;
    reasons.push('budget_signal');
  }
  if (lead.decisionMaker || /i('m| am) the (owner|homeowner)|my house|we need/.test(blob)) {
    score += 2;
    reasons.push('decision_maker');
  }
  if (lead.phone || lead.email) {
    score += 1;
    reasons.push('contact');
  }

  return {
    score,
    max: 9,
    bookIf: 6,
    readyToBook: score >= 6,
    reasons,
  };
}

function salesSystemExtra(agent, lead) {
  const cfg = agent?.config || {};
  return `
You are the SALES follow-up agent for this business (SMS/chat length).
Lead context:
- Name: ${lead.name || 'friend'}
- Phone: ${lead.phone || 'unknown'}
- Email: ${lead.email || 'unknown'}
- Source: ${lead.source || 'web'}
- Need/message: ${lead.message || lead.need || 'general inquiry'}
- Timeline: ${lead.timeline || 'unknown'}
- Budget notes: ${lead.budget || 'unknown'}

Rules:
- One sharp question at a time when qualifying
- Short messages (1–3 sentences) suitable for SMS
- Drive to book a call/estimate — offer TWO concrete times when possible
- Never invent discounts or prices not in business facts
- CASL: only continue if this person opted in or initiated contact
- If not a fit: polite disqualify
- If hot (ready): ask to book directly
`.trim();
}

/**
 * Ingest a lead and generate instant follow-up reply via Claude sales brain.
 */
export async function ingestSalesLead(agent, raw = {}) {
  const lead = {
    id: rid(),
    agentId: agent.id,
    businessName: agent.businessName,
    createdAt: new Date().toISOString(),
    name: String(raw.name || raw.fullName || '').slice(0, 120),
    phone: String(raw.phone || raw.mobile || '').slice(0, 40),
    email: String(raw.email || '')
      .toLowerCase()
      .slice(0, 200),
    source: String(raw.source || 'api').slice(0, 80),
    need: String(raw.need || raw.service || '').slice(0, 200),
    message: String(raw.message || raw.notes || raw.comment || '').slice(0, 2000),
    timeline: String(raw.timeline || '').slice(0, 120),
    budget: String(raw.budget || '').slice(0, 120),
    decisionMaker: Boolean(raw.decisionMaker),
    consent: raw.consent !== false, // must be true for marketing; inbound form = true
    status: 'new',
    sequenceStep: 0,
    history: [],
    replies: [],
  };

  if (!lead.consent) {
    return {
      ok: false,
      error: 'consent_required',
      message: 'CASL: set consent:true only for opted-in or inbound leads. Meridian will not draft spam.',
    };
  }

  const scoring = scoreLead(lead);
  lead.scoring = scoring;

  const userMsg =
    lead.message ||
    `New lead ${lead.name || ''}. Need: ${lead.need || 'general'}. Source: ${lead.source}. Write the first SMS/chat follow-up.`;

  // Temporarily enrich agent config prompt via history-free call with sales primaryNeed
  const salesAgent = {
    ...agent,
    config: {
      ...(agent.config || {}),
      primaryNeed: agent.config?.primaryNeed || 'sales',
    },
  };

  const brain = await smartAgentChat(salesAgent, `${salesSystemExtra(agent, lead)}\n\nTask: ${userMsg}`, {
    history: [],
  });

  const reply = {
    at: new Date().toISOString(),
    step: 'instant',
    channel: raw.channel || 'sms',
    text: brain.reply,
    source: brain.source,
    model: brain.model,
    provider: brain.provider,
  };
  lead.replies.push(reply);
  lead.status = scoring.readyToBook ? 'hot' : 'working';
  lead.lastReplyAt = reply.at;
  lead.sequenceStep = 1;

  const store = load();
  store.leads.unshift(lead);
  store.leads = store.leads.slice(0, 2000);
  save(store);

  return {
    ok: true,
    leadId: lead.id,
    agentId: agent.id,
    status: lead.status,
    scoring,
    reply: reply.text,
    replyMeta: {
      source: reply.source,
      model: reply.model,
      step: reply.step,
    },
    nextSequence: SALES_SEQUENCE[1],
    sendHint:
      'Send `reply` via your SMS/CRM (Twilio, GHL, etc.). Meridian does not auto-text customers (containment + CASL).',
    events: {
      type: 'sales.lead_ingested',
      leadId: lead.id,
      score: scoring.score,
      readyToBook: scoring.readyToBook,
    },
  };
}

/**
 * Continue conversation or advance sequence draft.
 */
export async function salesTurn(agent, { leadId, message, advanceSequence } = {}) {
  const store = load();
  const lead = store.leads.find((l) => l.id === leadId && l.agentId === agent.id);
  if (!lead) return { ok: false, error: 'lead_not_found' };
  if (!lead.consent) return { ok: false, error: 'consent_required' };

  let task;
  if (advanceSequence) {
    const step = SALES_SEQUENCE[Math.min(lead.sequenceStep, SALES_SEQUENCE.length - 1)];
    task = `Draft the next follow-up (${step.label}). Goal: ${step.goal}. Lead still has not booked. Keep SMS-short. No spam pressure.`;
    lead.sequenceStep = Math.min(lead.sequenceStep + 1, SALES_SEQUENCE.length);
  } else {
    const msg = String(message || '').slice(0, 2000);
    if (!msg) return { ok: false, error: 'message_or_advanceSequence required' };
    lead.history.push({ role: 'user', content: msg, at: new Date().toISOString() });
    task = msg;
  }

  const salesAgent = {
    ...agent,
    config: { ...(agent.config || {}), primaryNeed: agent.config?.primaryNeed || 'sales' },
  };

  const history = (lead.history || [])
    .filter((h) => h.role && h.content)
    .slice(-8)
    .map((h) => ({ role: h.role, content: h.content }));

  // Include prior agent replies as assistant turns
  for (const r of (lead.replies || []).slice(-4)) {
    history.push({ role: 'assistant', content: r.text });
  }

  const brain = await smartAgentChat(
    salesAgent,
    `${salesSystemExtra(agent, lead)}\n\n${task}`,
    { history },
  );

  const reply = {
    at: new Date().toISOString(),
    step: advanceSequence ? SALES_SEQUENCE[Math.max(0, lead.sequenceStep - 1)]?.id : 'live',
    text: brain.reply,
    source: brain.source,
    model: brain.model,
  };
  lead.replies.push(reply);
  lead.history.push({ role: 'assistant', content: reply.text, at: reply.at });
  lead.lastReplyAt = reply.at;
  lead.scoring = scoreLead({
    ...lead,
    message: `${lead.message || ''} ${message || ''}`,
  });
  if (lead.scoring.readyToBook) lead.status = 'hot';

  save(store);

  return {
    ok: true,
    leadId: lead.id,
    status: lead.status,
    scoring: lead.scoring,
    reply: reply.text,
    sequenceStep: lead.sequenceStep,
    sendHint: 'Send via your CRM/SMS. Meridian drafts only.',
  };
}

export function getSalesLead(agentId, leadId) {
  return load().leads.find((l) => l.id === leadId && l.agentId === agentId) || null;
}

export function listSalesLeads(agentId, limit = 50) {
  return load()
    .leads.filter((l) => l.agentId === agentId)
    .slice(0, limit)
    .map(({ replies, history, ...rest }) => ({
      ...rest,
      replyCount: (replies || []).length,
      lastReply: replies?.[replies.length - 1]?.text?.slice(0, 160),
    }));
}

export function salesPipelineStatus() {
  const store = load();
  const leads = store.leads || [];
  return {
    pipeline: 'sales',
    totalLeads: leads.length,
    hot: leads.filter((l) => l.status === 'hot').length,
    working: leads.filter((l) => l.status === 'working').length,
    sequence: SALES_SEQUENCE,
    endpoints: {
      ingest: 'POST /api/v1/agents/:id/sales/lead',
      turn: 'POST /api/v1/agents/:id/sales/turn',
      list: 'GET /api/v1/agents/:id/sales/leads',
    },
    casl: 'Draft only — customer sends. consent:true required on ingest.',
    containment: 'No auto SMS blast, no inbox scrape, no bank access.',
  };
}

/** n8n-style recipe for sales */
export function buildSalesN8nRecipe({ agentId, apiKey, base }) {
  const b = (base || '').replace(/\/$/, '');
  return {
    name: 'Meridian Sales · form → draft SMS',
    steps: [
      'Webhook trigger (form / Meta / GHL)',
      `POST ${b}/api/v1/agents/${agentId}/sales/lead`,
      'Body: { name, phone, email, message, source, consent: true }',
      'Auth: Bearer mdn_…',
      'Map reply → Twilio SMS / GHL conversation (your keys)',
      'Optional: if scoring.readyToBook notify owner',
    ],
    exampleBody: {
      name: 'Jane Doe',
      phone: '+15550100',
      email: 'jane@example.com',
      message: 'Need furnace quote this week',
      source: 'website-form',
      consent: true,
      channel: 'sms',
    },
    note: 'Meridian returns draft text only. You send it — keeps CASL + containment clean.',
  };
}
