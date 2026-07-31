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
import { withExpertAndContainment } from '../lib/openclaw-expert-gate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

/**
 * Contained OpenClaw daily cycle.
 * Expert training MD loaded EVERY run before work.
 * Never banks, inboxes, personal files, account logins, money movement, or --deliver.
 */
async function runOpenClawInner(expertCtx) {
  // Hard policy stamp into every run
  assertSafeText(containmentPreamble(), 'preamble');
  assertSafeText(expertCtx?.context?.slice(0, 2000) || 'expert', 'expert_context');

  const date = new Date().toISOString().slice(0, 10);
  const actions = [];
  for (const lead of listLeads()) {
    if (lead.unsubscribed || ['closed', 'lost'].includes(lead.stage)) continue;
    // Progress pipeline only — no inbox read, no bank, no external account login
    actions.push({ email: lead.email, ...runAgentOnLead(lead.id) });
  }
  // CASL outreach: process data/outreach-queue.json → drafts only (never send)
  let outreachReport = { skipped: true };
  try {
    const { processOutreachQueue, outreachCaslStatus } = await import('../lib/outreach-casl.mjs');
    outreachReport = {
      ...(await processOutreachQueue({ max: Number(process.env.MERIDIAN_OUTREACH_DRAFT_MAX) || 15 })),
      status: outreachCaslStatus(),
    };
  } catch (e) {
    outreachReport = { ok: false, error: e.message };
  }
  // Keep a single placeholder sample if queue empty and almost no drafts (dev hygiene only)
  if (listOutreachDrafts().length < 1) {
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

  // Insights articles — expert content-articles gate (draft→vet→fix→ready)
  // Enabled when MERIDIAN_ARTICLES=1 (same flag as server scheduler)
  let articlesReport = { skipped: true, reason: 'MERIDIAN_ARTICLES not 1' };
  if (process.env.MERIDIAN_ARTICLES === '1') {
    try {
      const { runOpenClawArticlesScheduled } = await import('../lib/openclaw-articles.mjs');
      articlesReport = await runOpenClawArticlesScheduled();
    } catch (e) {
      articlesReport = {
        ok: false,
        error: e.message,
        blocked: e.code === 'OPENCLAW_CONTAINMENT' || e.code === 'OPENCLAW_EXPERT_MISSING',
        code: e.code || null,
      };
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

## Content articles (expert: content-articles)
${JSON.stringify(articlesReport, null, 2)}

## CASL outreach (draft only — Ken approve before send)
${JSON.stringify(outreachReport, null, 2)}

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
- CASL queue drafted this run: ${outreachReport.drafted ?? '—'} (pending queue: ${outreachReport.pending ?? '—'})
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

## Needs your outreach decision (CASL human only)
- Review drafts: GET /api/outreach or npm run openclaw:outreach -- --list
- Approve: POST /api/outreach/:id/approve or npm run openclaw:outreach -- --approve <id>
- Send (only after review): set MERIDIAN_OUTREACH_SEND=1 then
  POST /api/outreach/send-approved { "confirm": "APPROVED_SEND" }
  or: npm run openclaw:outreach -- --send --confirm APPROVED_SEND
- OpenClaw never auto-sends cold email

## Compliance
- No cold blast without approved_send + confirm APPROVED_SEND
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
    articles: articlesReport,
    outreach: outreachReport,
    awaitingMoney: awaitingMoney.length,
    reportPath,
    briefPath,
    emailed,
    containment: cage,
    expert: expertCtx?.expert
      ? {
          path: expertCtx.expert.expertPath,
          hash: expertCtx.expert.expertHash,
          runId: expertCtx.runId,
        }
      : null,
  };
}

/**
 * Public entry: expert MD loaded every time, then containment cage, then work.
 */
export async function runOpenClaw() {
  const wrapped = await withExpertAndContainment(
    'daily-ops',
    'openclaw.daily',
    async (ctx) => runOpenClawInner(ctx),
    { taskBrief: 'Meridian daily ops cycle: funnel, drafts, deploy queue, install queue, brief.' },
  );
  // Flatten expert audit onto result for ops
  return {
    ...(wrapped.result || {}),
    ok: wrapped.ok !== false,
    expertGate: wrapped.expert,
    runId: wrapped.runId,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runOpenClaw()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
    })
    .catch((e) => {
      console.error(JSON.stringify({ ok: false, error: e.message, code: e.code }, null, 2));
      process.exit(1);
    });
}
