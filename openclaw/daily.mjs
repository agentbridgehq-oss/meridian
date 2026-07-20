import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listLeads, runAgentOnLead, draftOutreach, listOutreachDrafts, funnelStats, BASE } from '../engine.mjs';
import { runOpenClawDeploy } from './deploy-agent.mjs';
import {
  containmentPreamble,
  containmentStatus,
  containedWriteFile,
  assertSafeText,
  withContainment,
} from '../lib/openclaw-containment.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

/**
 * Contained OpenClaw daily cycle.
 * Never banks, inboxes, personal files, account logins, money movement, or --deliver.
 */
async function runOpenClawInner() {
  // Hard policy stamp into every run
  assertSafeText(containmentPreamble(), 'preamble');

  const date = new Date().toISOString().slice(0, 10);
  const actions = [];
  for (const lead of listLeads()) {
    if (lead.unsubscribed || ['closed', 'lost'].includes(lead.stage)) continue;
    // Progress pipeline only — no inbox read, no bank, no external account login
    actions.push({ email: lead.email, ...runAgentOnLead(lead.id) });
  }
  if (listOutreachDrafts().length < 2) {
    // DRAFT only — CASL: never auto-send
    draftOutreach({
      businessName: 'Sample Local Biz',
      niche: 'home services',
      email: 'prospect@invalid.example',
    });
  }

  // Auto-deploy any jobs in data/deploy-queue.json (Claude Code / ops can enqueue)
  let deployReport = { processed: 0 };
  if (process.env.MERIDIAN_OPENCLAW_AUTO_DEPLOY !== '0') {
    try {
      deployReport = await runOpenClawDeploy({ max: Number(process.env.MERIDIAN_DEPLOY_MAX) || 5 });
    } catch (e) {
      deployReport = { ok: false, error: e.message, blocked: e.code === 'OPENCLAW_CONTAINMENT' };
    }
  }

  // Customer autonomous install packs (setup wizard → OpenClaw) — configs only
  let installReport = { processed: 0 };
  if (process.env.MERIDIAN_OPENCLAW_INSTALL !== '0') {
    try {
      const { processInstallQueue } = await import('../lib/customer-setup.mjs');
      installReport = await processInstallQueue({ max: 10 });
    } catch (e) {
      installReport = { ok: false, error: e.message, blocked: e.code === 'OPENCLAW_CONTAINMENT' };
    }
  }

  const stats = funnelStats();
  const cage = containmentStatus();
  const report = `# Meridian OpenClaw — ${date}

## CONTAINMENT (always on)
${JSON.stringify(cage, null, 2)}

## Stats
${JSON.stringify(stats, null, 2)}

## Lead actions
${actions.map((a) => `- ${a.email}: ${a.action || a.error}`).join('\n')}

## Auto-deploy queue
${JSON.stringify(deployReport, null, 2)}

## Customer install queue (setup wizard / OpenClaw)
${JSON.stringify(installReport, null, 2)}

## Content hooks (draft ideas only — human posts)
- After-hours phone is unpaid staff. Meridian Voice answers.
- Leads die in 5 minutes. Sales agent replies in one.
- No-shows empty calendars. Booking agent confirms twice.

## CTAs
- Site: ${BASE}
- Stack: ${BASE}/checkout/stack
- Why agents: ${BASE}/why-agents
- Deploy API: POST ${BASE}/api/ops/deploy-agent (OPS_TOKEN)

## Compliance / cage
- No cold blast without approved_send
- No banks, inboxes, personal files, account logins (Ken or customer)
- No money movement / refunds / --deliver
- Auto-deploy = Meridian agents + configs only; phone number attach is human

— Meridian Contained OpenClaw
`;
  // Operator daily brief (email if configured) — ops notify only, not customer inboxes scrape
  const leads = listLeads();
  const awaitingMoney = leads.filter((l) => l.stage === 'awaiting_money' || l.moneyStatus === 'pending');
  const delivered = leads.filter((l) => l.stage === 'delivered' || l.stage === 'verified');
  const brief = `# Meridian daily brief — ${date}

## Containment
OpenClaw is CAGED: no bank (yours or customers), no email inboxes, no personal files, no account logins, no money movement, no --deliver.

## Snapshot
- Site: ${BASE}
- Leads total: ${stats.totalLeads || 0}
- Agents live: ${stats.agentsLive || 0}
- Awaiting money decision: ${awaitingMoney.length}
- Delivered / verified: ${delivered.length}
- Outreach drafts: ${stats.outreachDrafts || 0} (approved unsent: ${stats.approvedUnsent || 0})
- OpenClaw lead actions today: ${actions.length}
- Auto-deploys processed: ${deployReport.processed || 0}

## Needs your money decision (human only)
${
  awaitingMoney.length
    ? awaitingMoney
        .slice(0, 15)
        .map((l) => `- ${l.businessName || l.email} · ${l.email} · lead ${l.id} · setup ~$${l.proposal?.setupUsd || '—'}`)
        .join('\n')
    : '- None'
}

## Lead pipeline actions
${actions.map((a) => `- ${a.email}: ${a.action || a.error}`).join('\n') || '- None'}

## Content / market hooks (you or social — OpenClaw does not post)
- After-hours phone is unpaid staff. Meridian Voice answers.
- Leads die in 5 minutes. Sales agent replies in one.
- No-shows empty calendars. Booking agent confirms twice.
- Article: ${BASE}/why-agents
- Stack checkout: ${BASE}/checkout/stack

## Compliance
- No cold blast without approved_send
- Funnel requires consent
- Auto-deploy marks agents sellable only after must-work verify
- Customer still attaches phone number in Retell/Vapi after guide
- OpenClaw never opens banks, inboxes, or personal files

## Full report
See attached daily file on server: daily-${date}.md

— Meridian autonomous ops (contained)
`;

  const reportPath = path.join(DATA, `daily-${date}.md`);
  const briefPath = path.join(DATA, `brief-${date}.md`);
  containedWriteFile(reportPath, report + '\n\n---\n\n' + brief);
  containedWriteFile(briefPath, brief);

  let emailed = false;
  const notify = process.env.SUPPORT_NOTIFY_EMAIL || process.env.OPS_NOTIFY_EMAIL || '';
  if (process.env.RESEND_API_KEY && notify) {
    try {
      const from = process.env.EMAIL_FROM || 'Meridian <onboarding@resend.dev>';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [notify],
          subject: `Meridian daily brief — ${date}`,
          text: brief,
        }),
      });
      emailed = res.ok;
    } catch {
      emailed = false;
    }
  }

  return {
    ok: true,
    date,
    stats,
    actions: actions.length,
    deploy: deployReport,
    install: installReport,
    awaitingMoney: awaitingMoney.length,
    reportPath,
    briefPath,
    emailed,
    containment: cage,
  };
}

export const runOpenClaw = withContainment('openclaw.daily', runOpenClawInner);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runOpenClaw().then((r) => {
    console.log(JSON.stringify(r, null, 2));
  });
}
