/**
 * Meridian Autopilot — keeps the pipeline moving without a human.
 *
 * Every cycle (hourly by default):
 *   1. Re-verify every live agent (chat smoke tests) — self-heal signal, never silent.
 *   2. Drain the OpenClaw deploy queue.
 *   3. Leads stuck at awaiting_money > 24h → draft a follow-up (DRAFT ONLY — approve-gated, CASL).
 *   4. Leads money_approved but no intake > 6h → re-send intake link (transactional email).
 *   5. Log the cycle to data/autopilot-log.json + webhook.
 *
 * Money stays human-gated. Outreach sending stays approve-gated. Everything else runs itself.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  listLeads,
  listAgents,
  draftOutreach,
  listOutreachDrafts,
  dispatchWebhook,
  BASE,
} from '../engine.mjs';
import { runOpenClawDeploy } from '../openclaw/deploy-agent.mjs';
import { smartAgentChat } from './agent-brain.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const LOG = path.join(DATA, 'autopilot-log.json');

const SMOKE = [
  { id: 'hours', message: 'What are your hours?', expect: /hour|open|mon|am|pm|book|time/i },
  { id: 'booking', message: 'I need to book an appointment', expect: /book|schedule|day|time|appoint/i },
  { id: 'price', message: 'How much does it cost?', expect: /offer|price|cost|estimate|call|service/i },
  { id: 'greeting', message: 'Hello', expect: /meridian|help|book|hour|thank|contact/i },
];

function hoursSince(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (Date.now() - t) / 36e5 : Infinity;
}

/** Chat-only smoke test (no key needed — reads agent from store). Tests the
 *  same brain path (Claude when configured, fallback otherwise) customers get. */
export async function smokeTestAgent(agent) {
  const results = [];
  for (const t of SMOKE) {
    const brain = await smartAgentChat(agent, t.message);
    const reply = brain.reply || '';
    const pass = reply.trim().length >= 8 && t.expect.test(reply);
    results.push({ id: t.id, pass, brainSource: brain.source });
  }
  return { ok: results.every((r) => r.pass), results };
}

export async function runAutopilot({ sendEmail } = {}) {
  const startedAt = new Date().toISOString();
  const report = {
    startedAt,
    agentsChecked: 0,
    agentsHealthy: 0,
    agentsFailing: [],
    queueProcessed: 0,
    followupsDrafted: 0,
    intakeReminders: 0,
    errors: [],
  };

  // 1) Re-verify live agents
  for (const agent of listAgents().filter((a) => a.status === 'active')) {
    report.agentsChecked++;
    const smoke = await smokeTestAgent(agent);
    if (smoke.ok) {
      report.agentsHealthy++;
    } else {
      report.agentsFailing.push({ agentId: agent.id, businessName: agent.businessName, results: smoke.results });
      await dispatchWebhook('autopilot.agent_unhealthy', {
        agentId: agent.id,
        businessName: agent.businessName,
        results: smoke.results,
      }).catch(() => {});
    }
  }

  // 2) Drain deploy queue
  try {
    const q = await runOpenClawDeploy({ max: 10 });
    report.queueProcessed = q?.processed ?? q?.results?.length ?? 0;
  } catch (e) {
    report.errors.push(`deploy-queue: ${e.message}`);
  }

  // 3) Money follow-up drafts (approve-gated — never auto-sent)
  const drafts = listOutreachDrafts();
  for (const lead of listLeads()) {
    if (lead.unsubscribed || !lead.email) continue;

    if (lead.stage === 'awaiting_money' && hoursSince(lead.updatedAt || lead.createdAt) > 24) {
      const already = drafts.some((d) => d.to === lead.email && d.followupFor === lead.id);
      if (!already) {
        const d = draftOutreach({
          businessName: lead.businessName,
          niche: lead.niche,
          email: lead.email,
        });
        // Tag so we never double-draft for the same lead
        try {
          const store = JSON.parse(fs.readFileSync(path.join(DATA, 'outreach.json'), 'utf8'));
          const row = store.drafts.find((x) => x.id === d.id);
          if (row) {
            row.followupFor = lead.id;
            row.subject = `${lead.businessName || 'Your'} Meridian proposal — ready when you are`;
            row.text = `Hi,\n\nYour Meridian proposal is ready (${(lead.proposal?.agents || []).join(', ') || 'Voice + Sales + Booking'} — setup ~$${lead.proposal?.setupUsd || 2497}).\n\nWhen you approve, intake takes 5 minutes and your agent goes live the same day, verified:\n${BASE}/intake/${lead.intakeToken}\n\n— Meridian\nReply STOP to unsubscribe`;
            fs.writeFileSync(path.join(DATA, 'outreach.json'), JSON.stringify(store, null, 2));
          }
        } catch { /* tag best-effort */ }
        report.followupsDrafted++;
      }
    }

    // 4) Paid but never finished intake → transactional reminder (they're a customer)
    if (lead.stage === 'money_approved' && !lead.intake && hoursSince(lead.updatedAt) > 6 && !lead.intakeRemindedAt) {
      if (typeof sendEmail === 'function') {
        const url = `${BASE}/intake/${lead.intakeToken}`;
        const ok = await sendEmail(
          lead.email,
          'Finish your Meridian setup (5 minutes) — your agent is waiting',
          `You're approved. Complete this short intake and your agent goes live, verified, today:\n${url}\n\nMeridian Agency`,
        ).catch(() => false);
        if (ok) {
          try {
            const store = JSON.parse(fs.readFileSync(path.join(DATA, 'leads.json'), 'utf8'));
            const row = store.leads.find((l) => l.id === lead.id);
            if (row) {
              row.intakeRemindedAt = new Date().toISOString();
              fs.writeFileSync(path.join(DATA, 'leads.json'), JSON.stringify(store, null, 2));
            }
          } catch { /* */ }
          report.intakeReminders++;
        }
      }
    }
  }

  report.finishedAt = new Date().toISOString();

  // 5) Persist + webhook
  try {
    let log = { cycles: [] };
    try { log = JSON.parse(fs.readFileSync(LOG, 'utf8')); } catch { /* fresh */ }
    log.cycles.unshift(report);
    log.cycles = log.cycles.slice(0, 100);
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(LOG, JSON.stringify(log, null, 2));
  } catch (e) {
    report.errors.push(`log: ${e.message}`);
  }
  await dispatchWebhook('autopilot.cycle', report).catch(() => {});
  return report;
}

export function lastAutopilotReport() {
  try {
    return JSON.parse(fs.readFileSync(LOG, 'utf8')).cycles?.[0] || null;
  } catch {
    return null;
  }
}
