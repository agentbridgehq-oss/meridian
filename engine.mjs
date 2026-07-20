/**
 * Meridian Agency engine — independent agency (not ClaudeCraft)
 * Pipeline: prospect → proposal → intake → provision agent API
 * Delivery: webhooks + email (consent / approved only)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(__dirname, 'data');
const LEADS = path.join(DATA_DIR, 'leads.json');
const AGENTS = path.join(DATA_DIR, 'agents.json');
const OUTREACH = path.join(DATA_DIR, 'outreach.json');
const WEBHOOK_LOG = path.join(DATA_DIR, 'webhook-log.json');
const BASE = (process.env.PUBLIC_BASE_URL || 'http://localhost:8891').replace(/\/$/, '');

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
function load(file, fb) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fb;
  }
}
function save(file, data) {
  ensure();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function rid(p = 'm') {
  return `${p}_${crypto.randomBytes(8).toString('hex')}`;
}
function tok() {
  return crypto.randomBytes(24).toString('hex');
}

export async function dispatchWebhook(event, payload = {}) {
  const urls = [process.env.MERIDIAN_WEBHOOK_URL, process.env.MERIDIAN_WEBHOOK_URL_2, payload.webhookUrl].filter(
    Boolean,
  );
  if (!urls.length) return { ok: true, skipped: true };
  const body = { event, ts: new Date().toISOString(), source: 'meridian', ...payload };
  if (body.connection?.apiKey && event !== 'agent.provisioned') delete body.connection.apiKey;
  const raw = JSON.stringify(body);
  const secret = process.env.MERIDIAN_WEBHOOK_SECRET || process.env.OPS_TOKEN || '';
  const sig = secret ? crypto.createHmac('sha256', secret).update(raw).digest('hex') : '';
  const results = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Meridian/1.0',
          'X-Meridian-Event': event,
          ...(sig ? { 'X-Meridian-Signature': sig } : {}),
        },
        body: raw,
        signal: AbortSignal.timeout(12000),
      });
      results.push({ url, status: res.status, ok: res.ok });
    } catch (e) {
      results.push({ url, ok: false, error: e.message });
    }
  }
  try {
    const log = load(WEBHOOK_LOG, { events: [] });
    log.events.unshift({ at: body.ts, event, results, leadId: payload.leadId });
    log.events = log.events.slice(0, 200);
    save(WEBHOOK_LOG, log);
  } catch { /* */ }
  return { ok: results.some((r) => r.ok), results };
}

export function listLeads() {
  return load(LEADS, { leads: [] }).leads;
}
export function getLead(id) {
  return listLeads().find((l) => l.id === id) || null;
}
export function getLeadByIntakeToken(t) {
  return listLeads().find((l) => l.intakeToken === t) || null;
}

export function upsertLead(partial) {
  const store = load(LEADS, { leads: [] });
  const email = (partial.email || '').trim().toLowerCase();
  let lead = store.leads.find((l) => l.id === partial.id || (email && l.email === email));
  if (!lead) {
    lead = {
      id: rid('lead'),
      createdAt: new Date().toISOString(),
      stage: 'new',
      source: 'funnel',
      consent: false,
      unsubscribed: false,
      intakeToken: tok(),
      ...partial,
      email,
    };
    store.leads.unshift(lead);
  } else {
    Object.assign(lead, partial, { email: email || lead.email, updatedAt: new Date().toISOString() });
  }
  save(LEADS, store);
  return lead;
}

export function setStage(leadId, stage, meta = {}) {
  const store = load(LEADS, { leads: [] });
  const lead = store.leads.find((l) => l.id === leadId);
  if (!lead) return null;
  const prev = lead.stage;
  lead.stage = stage;
  lead.updatedAt = new Date().toISOString();
  lead.history = lead.history || [];
  lead.history.push({ at: lead.updatedAt, stage, prev });
  Object.assign(lead, meta);
  save(LEADS, store);
  dispatchWebhook('lead.stage_changed', {
    leadId: lead.id,
    stage,
    prev,
    lead: { id: lead.id, email: lead.email, businessName: lead.businessName, stage, primaryNeed: lead.primaryNeed },
  }).catch(() => {});
  return lead;
}

export function generateProposal(lead) {
  const need = (lead.primaryNeed || 'full').toLowerCase();
  const agents = [];
  if (need.includes('voice') || need.includes('full') || need.includes('call')) agents.push('Voice Agent');
  if (need.includes('sales') || need.includes('lead') || need.includes('full')) agents.push('Sales Lead Agent');
  if (need.includes('book') || need.includes('appoint') || need.includes('full')) agents.push('Booking Agent');
  if (!agents.length) agents.push('Voice Agent', 'Sales Lead Agent', 'Booking Agent');
  const setup = agents.length >= 3 ? 2497 : agents.length === 2 ? 1797 : 997;
  const monthly = agents.length >= 3 ? 497 : agents.length === 2 ? 347 : 247;
  return {
    id: rid('prop'),
    createdAt: new Date().toISOString(),
    leadId: lead.id,
    businessName: lead.businessName || 'Your business',
    agents,
    setupUsd: setup,
    monthlyUsd: monthly,
    summary: `Meridian installs ${agents.join(', ')} so every call and lead is answered and booked.`,
    intakePath: `/intake/${lead.intakeToken}`,
    kitCheckout:
      agents.length >= 3 ? '/checkout/stack' : need.includes('voice') ? '/checkout/voice' : need.includes('sales') ? '/checkout/sales' : '/checkout/booking',
  };
}

export function attachProposal(leadId) {
  const lead = getLead(leadId);
  if (!lead) return null;
  return setStage(leadId, 'proposal_sent', { proposal: generateProposal(lead) });
}

export function provisionClientAgent(lead) {
  const store = load(AGENTS, { agents: [] });
  const apiKey = `mdn_${crypto.randomBytes(24).toString('hex')}`;
  const agentId = rid('agent');
  const record = {
    id: agentId,
    leadId: lead.id,
    businessName: lead.intake?.businessName || lead.businessName || 'Client',
    apiKey,
    apiKeyHash: crypto.createHash('sha256').update(apiKey).digest('hex'),
    createdAt: new Date().toISOString(),
    status: 'active',
    config: {
      tone: lead.intake?.tone || 'professional',
      hours: lead.intake?.hours || '',
      services: lead.intake?.services || '',
      faqs: lead.intake?.faqs || '',
      bookingRules: lead.intake?.bookingRules || '',
      humanTransfer: lead.intake?.humanTransfer || '',
      calendar: lead.intake?.calendar || '',
      primaryNeed: lead.intake?.primaryNeed || 'full',
      // Optional ElevenLabs plug-in (null = platform TTS)
      elevenlabsVoiceId: lead.intake?.elevenlabsVoiceId || process.env.ELEVENLABS_VOICE_ID || '',
    },
    // Public site token — safe to embed in customer web pages (chat only, rate-limited)
    widgetToken: `mdnw_${crypto.randomBytes(16).toString('hex')}`,
    endpoints: {
      agent: `/api/v1/agents/${agentId}/agent`,
      claude: `/api/v1/agents/${agentId}/claude`,
      chat: `/api/v1/agents/${agentId}/chat`,
      speak: `/api/v1/agents/${agentId}/speak`,
      voiceTurn: `/api/v1/agents/${agentId}/voice-turn`,
      config: `/api/v1/agents/${agentId}`,
      events: `/api/v1/agents/${agentId}/events`,
      widgetChat: `/api/v1/agents/${agentId}/widget-chat`,
      billing: `/api/v1/agents/${agentId}/billing`,
    },
  };
  const stored = { ...record };
  delete stored.apiKey;
  store.agents = store.agents.filter((a) => a.leadId !== lead.id);
  store.agents.push(stored);
  save(AGENTS, store);
  dispatchWebhook('agent.provisioned', {
    leadId: lead.id,
    agentId,
    businessName: record.businessName,
    endpoints: record.endpoints,
    connection: { id: agentId, apiKey, endpoints: record.endpoints },
    config: record.config,
  }).catch(() => {});
  return record;
}

export function submitIntake(intakeToken, body) {
  const lead = getLeadByIntakeToken(intakeToken);
  if (!lead) return { ok: false, error: 'Invalid intake link' };
  const intake = {
    submittedAt: new Date().toISOString(),
    businessName: body.businessName || lead.businessName,
    niche: body.niche || lead.niche,
    hours: body.hours || '',
    phone: body.phone || lead.phone || '',
    calendar: body.calendar || '',
    crm: body.crm || '',
    services: body.services || '',
    faqs: body.faqs || '',
    bookingRules: body.bookingRules || '',
    humanTransfer: body.humanTransfer || '',
    tone: body.tone || 'professional',
    primaryNeed: body.primaryNeed || lead.primaryNeed || 'full',
    website: body.website || '',
    notes: body.notes || '',
    elevenlabsVoiceId: body.elevenlabsVoiceId || body.voiceId || '',
  };
  setStage(lead.id, 'intake_received', { intake, consent: true });
  const connection = provisionClientAgent(getLead(lead.id));
  setStage(lead.id, 'agent_connected', {
    agentConnection: { id: connection.id, endpoints: connection.endpoints },
  });
  return { ok: true, lead: getLead(lead.id), connection };
}

export function verifyAgentKey(agentId, apiKey) {
  const agent = load(AGENTS, { agents: [] }).agents.find((a) => a.id === agentId);
  if (!agent || agent.status !== 'active') return null;
  const hash = crypto.createHash('sha256').update(apiKey || '').digest('hex');
  if (hash !== agent.apiKeyHash) return null;
  return agent;
}

export function listAgents() {
  return load(AGENTS, { agents: [] }).agents;
}

/** Get-or-create the public widget token for an agent (backfills pre-widget agents). */
export function ensureWidgetToken(agentId) {
  const store = load(AGENTS, { agents: [] });
  const agent = store.agents.find((a) => a.id === agentId);
  if (!agent) return null;
  if (!agent.widgetToken) {
    agent.widgetToken = `mdnw_${crypto.randomBytes(16).toString('hex')}`;
    agent.endpoints = agent.endpoints || {};
    agent.endpoints.widgetChat = `/api/v1/agents/${agentId}/widget-chat`;
    save(AGENTS, store);
  }
  return agent.widgetToken;
}

/** Widget auth — public token, chat-only surface. */
export function verifyWidgetToken(agentId, widgetToken) {
  const agent = load(AGENTS, { agents: [] }).agents.find((a) => a.id === agentId);
  if (!agent || agent.status !== 'active') return null;
  if (!widgetToken || !agent.widgetToken || widgetToken !== agent.widgetToken) return null;
  return agent;
}

export function agentChat(agent, message) {
  const cfg = agent.config || {};
  const name = agent.businessName || 'us';
  const msg = String(message || '').toLowerCase().trim();
  if (!msg) {
    return `Thanks for contacting ${name}. How can I help — hours, booking, or a quick question?`;
  }
  // Reliable intent routing (must always return a useful reply)
  if (/hour|open|close|when are you|what time/.test(msg)) {
    return cfg.hours
      ? `Our hours are: ${cfg.hours}. Want to book a time?`
      : `I can help with hours — want me to book a call?`;
  }
  if (/book|appoint|schedul|reserve|available|slot|come in/.test(msg)) {
    return `I can schedule that. ${cfg.bookingRules || 'What day works best for you?'}`;
  }
  if (/price|cost|how much|rate|fee|quote|estimate/.test(msg)) {
    return cfg.services
      ? `Here's what we offer: ${cfg.services}. Shall I book an estimate?`
      : `I'll confirm pricing on a short call. What time works?`;
  }
  if (/hello|hi\b|hey|good (morning|afternoon|evening)/.test(msg)) {
    return `Thanks for contacting ${name}. I'm your Meridian agent. Booking, hours, or a question?`;
  }
  if (/emergency|urgent|asap|now/.test(msg) && cfg.humanTransfer) {
    return `For urgent needs, please call ${cfg.humanTransfer}. I can also take your name and number.`;
  }
  if (/faq|question|where|service area|area do you/.test(msg) && cfg.faqs) {
    return `${cfg.faqs} Want me to book a time?`;
  }
  // Default — never empty
  const bits = [
    `Thanks for contacting ${name}.`,
    `I'm your Meridian agent.`,
    cfg.hours ? `Hours: ${cfg.hours}.` : '',
    `I can help with booking, hours, or services.`,
    cfg.humanTransfer ? `Urgent: ${cfg.humanTransfer}` : '',
  ].filter(Boolean);
  return bits.join(' ');
}

export function draftOutreach({ businessName, niche, contactName, email, website }) {
  const draft = {
    id: rid('out'),
    createdAt: new Date().toISOString(),
    approved_send: false,
    to: (email || '').toLowerCase(),
    businessName: businessName || 'there',
    niche: niche || 'local business',
    subject: `${businessName || 'Quick question'} — still missing after-hours calls?`,
    text: `Hi ${contactName || 'there'},

Meridian installs three agents for ${niche || 'local service'} businesses:
1) Voice — answers every call 24/7
2) Sales — follows up leads in under a minute  
3) Booking — fills the calendar, cuts no-shows

Reply YES for a 1-page proposal + intake link.

— Meridian
${BASE}
Unsubscribe: reply STOP`,
    website: website || '',
  };
  const store = load(OUTREACH, { drafts: [] });
  store.drafts.unshift(draft);
  save(OUTREACH, store);
  return draft;
}

export function listOutreachDrafts() {
  return load(OUTREACH, { drafts: [] }).drafts;
}
export function approveOutreach(draftId) {
  const store = load(OUTREACH, { drafts: [] });
  const d = store.drafts.find((x) => x.id === draftId);
  if (!d) return null;
  d.approved_send = true;
  d.approvedAt = new Date().toISOString();
  save(OUTREACH, store);
  return d;
}
export function markOutreachSent(draftId, meta = {}) {
  const store = load(OUTREACH, { drafts: [] });
  const d = store.drafts.find((x) => x.id === draftId);
  if (!d) return null;
  d.sentAt = new Date().toISOString();
  d.sentMeta = meta;
  save(OUTREACH, store);
  return d;
}
export function listApprovedUnsent() {
  return listOutreachDrafts().filter(
    (d) => d.approved_send && !d.sentAt && d.to && !String(d.to).includes('invalid.example'),
  );
}

export function runAgentOnLead(leadId) {
  const lead = getLead(leadId);
  if (!lead) return { ok: false, error: 'Lead not found' };
  if (lead.unsubscribed) return { ok: false, error: 'Unsubscribed' };
  if (lead.stage === 'new' || lead.stage === 'qualified') {
    const withProp = attachProposal(leadId);
    return { ok: true, action: 'proposal_generated', lead: withProp };
  }
  if (lead.stage === 'proposal_sent' && !lead.intake) {
    return {
      ok: true,
      action: 'awaiting_intake',
      lead,
      intakeUrl: `${BASE}/intake/${lead.intakeToken}`,
    };
  }
  if (lead.stage === 'intake_received' && !lead.agentConnection) {
    const connection = provisionClientAgent(lead);
    const updated = setStage(leadId, 'agent_connected', {
      agentConnection: { id: connection.id, endpoints: connection.endpoints },
    });
    return { ok: true, action: 'agent_provisioned', lead: updated, connection };
  }
  return { ok: true, action: 'noop', lead, stage: lead.stage };
}

export function funnelStats() {
  const leads = listLeads();
  const byStage = {};
  for (const l of leads) byStage[l.stage] = (byStage[l.stage] || 0) + 1;
  const agents = load(AGENTS, { agents: [] }).agents;
  return {
    totalLeads: leads.length,
    byStage,
    agentsLive: agents.filter((a) => a.status === 'active').length,
    outreachDrafts: listOutreachDrafts().length,
    approvedUnsent: listApprovedUnsent().length,
  };
}

export { BASE };
