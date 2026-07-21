/**
 * Customer interactive setup + OpenClaw autonomous install queue.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { BASE, listAgents, ensureWidgetToken, verifyAgentKey, getAgent, setAgentVoice } from '../engine.mjs';
import { listVoices, previewVoice, resolveAgentVoiceId } from './voice-pipeline.mjs';
import { setKnowledge } from './knowledge.mjs';
import { withExpertAndContainment } from './openclaw-expert-gate.mjs';
import { smartAgentChat } from './agent-brain.mjs';
import { platformConfigs } from './deploy-agent.mjs';
import {
  sanitizeOpenClawJob,
  assertSafeText,
  containmentStatus,
} from './openclaw-containment.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(__dirname, '..', 'data');
const QUEUE = path.join(DATA_DIR, 'customer-install-queue.json');
const PROGRESS = path.join(DATA_DIR, 'customer-setup-progress.json');

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

export function buildSetupContext({ agentId, apiKey, businessName, base, deliveryToken, widgetToken }) {
  const b = (base || BASE).replace(/\/$/, '');
  const id = agentId;
  const wt = widgetToken || (id ? ensureWidgetToken(id) : '');
  const agent = id ? getAgent(id) : null;
  const selectedVoiceId = agent ? resolveAgentVoiceId(agent) : process.env.XAI_TTS_VOICE || 'eve';
  return {
    ok: true,
    businessName: businessName || agent?.businessName || 'Your business',
    agentId: id,
    apiKey: apiKey || null,
    deliveryToken: deliveryToken || null,
    base: b,
    widgetToken: wt,
    selectedVoiceId,
    xaiVoiceId: selectedVoiceId,
    widgetSnippet: id && wt
      ? `<script src="${b}/widget.js" data-agent="${id}" data-token="${wt}" data-name="${String(businessName || agent?.businessName || 'Assistant').replace(/"/g, '')}"></script>`
      : null,
    endpoints: id
      ? {
          agent: `${b}/api/v1/agents/${id}/agent`,
          chat: `${b}/api/v1/agents/${id}/chat`,
          voiceTurn: `${b}/api/v1/agents/${id}/voice-turn`,
          events: `${b}/api/v1/agents/${id}/events`,
          speak: `${b}/api/v1/agents/${id}/speak`,
          billing: `${b}/api/v1/agents/${id}/billing`,
          voiceSpec: `${b}/api/v1/agents/${id}/voice-spec`,
          voices: `${b}/api/v1/agents/${id}/voices`,
        }
      : null,
    steps: SETUP_STEPS,
    autonomous: {
      available: true,
      note: 'OpenClaw can queue full config packs, n8n workflow, and ops email. Phone number attach in Retell/Vapi remains yours (carrier rule).',
    },
  };
}

/** Ordered wizard steps — UI renders one block at a time */
export const SETUP_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome — you’re almost live',
    subtitle: 'We’ll wire your Meridian agent into your website, systems, and phone — one clear block at a time.',
  },
  {
    id: 'credentials',
    title: 'Step 1 · Your keys',
    subtitle: 'Save the secret key once. The widget uses a public token only.',
  },
  {
    id: 'path',
    title: 'Step 2 · How do you want to go live?',
    subtitle: 'Pick a path. You can still do the others later.',
  },
  {
    id: 'voice',
    title: 'Step 3 · Pick your voice',
    subtitle: 'Choose an xAI neural voice for Meridian-hosted speech. Preview samples, then save.',
  },
  {
    id: 'knowledge',
    title: 'Step 4 · Business truth & alerts',
    subtitle: 'Hours, FAQs, transfer number, owner email — so the agent never invents facts and you get urgent pings.',
  },
  {
    id: 'website',
    title: 'Step 5 · Website widget',
    subtitle: 'Fastest win: a chat bubble on your site in one paste.',
  },
  {
    id: 'api',
    title: 'Step 6 · API into your systems',
    subtitle: 'Connect your app, CRM backend, or server with copy-paste calls.',
  },
  {
    id: 'webhooks',
    title: 'Step 7 · Webhooks & automations',
    subtitle: 'n8n, Zapier, Make, or your CRM — events in and out.',
  },
  {
    id: 'phone',
    title: 'Step 8 · Phone (Retell / Vapi)',
    subtitle: 'Meridian is the brain. Your phone platform owns the number and platform TTS.',
  },
  {
    id: 'autonomous',
    title: 'Step 9 · Fully autonomous (OpenClaw)',
    subtitle: 'Queue Meridian OpenClaw to package everything and notify ops — hands-off where possible.',
  },
  {
    id: 'test',
    title: 'Step 10 · Prove it works',
    subtitle: 'Run the must-work tests. Don’t skip this.',
  },
  {
    id: 'done',
    title: 'You’re live',
    subtitle: 'Checklist complete. Your agent is on your systems.',
  },
];

export async function testAgentChat({ agentId, apiKey, message }) {
  const agent = verifyAgentKey(agentId, apiKey);
  if (!agent) return { ok: false, error: 'Invalid agent ID or API key' };
  const brain = await smartAgentChat(agent, message || 'What are your hours?');
  return {
    ok: true,
    reply: brain.reply,
    source: brain.source,
    provider: brain.provider,
    model: brain.model,
  };
}

/** Full voice catalog for setup wizard / public picker. */
export async function getVoiceCatalog() {
  return listVoices();
}

/** Save preferred voice (token-authenticated path uses agentId from guide). */
export function saveAgentVoicePreference(agentId, voiceId) {
  return setAgentVoice(agentId, voiceId);
}

/** Free short preview — not billed to customer packs. */
export async function previewAgentVoice(voiceId, text) {
  return previewVoice(voiceId, text);
}

/** Save knowledge from setup wizard. */
export function saveSetupKnowledge(agentId, body) {
  return setKnowledge(agentId, body || {});
}

export function saveProgress(tokenOrId, progress) {
  const store = load(PROGRESS, { byKey: {} });
  const key = String(tokenOrId || 'anon');
  store.byKey[key] = {
    ...store.byKey[key],
    ...progress,
    updatedAt: new Date().toISOString(),
  };
  save(PROGRESS, store);
  return store.byKey[key];
}

export function getProgress(tokenOrId) {
  return load(PROGRESS, { byKey: {} }).byKey[String(tokenOrId || 'anon')] || null;
}

/**
 * Queue autonomous install job for OpenClaw / ops.
 */
export function queueAutonomousInstall(input = {}) {
  const job = {
    id: `inst_${crypto.randomBytes(8).toString('hex')}`,
    createdAt: new Date().toISOString(),
    status: 'queued',
    agentId: input.agentId || null,
    apiKey: input.apiKey || null, // kept only in install queue on server volume — not public lists
    deliveryToken: input.deliveryToken || null,
    businessName: input.businessName || '',
    email: (input.email || '').toLowerCase(),
    websiteUrl: input.websiteUrl || '',
    phonePlatform: input.phonePlatform || 'retell', // retell | vapi | bland | later
    outboundWebhook: input.outboundWebhook || '',
    path: input.path || 'full', // website | api | webhooks | phone | full
    notes: input.notes || '',
    priority: input.priority || 'normal', // paid_dfy | normal
    openclaw: true,
    paidFullAuto: input.priority === 'paid_dfy' || input.notes === 'paid_full_auto_install',
  };
  const store = load(QUEUE, { jobs: [] });
  // Paid full-auto jobs jump the queue
  if (job.priority === 'paid_dfy') store.jobs.unshift(job);
  else store.jobs.push(job);
  store.jobs = store.jobs.slice(0, 200);
  save(QUEUE, store);
  return job;
}

export function listInstallJobs(limit = 50) {
  // Never leak apiKey in ops list responses
  return load(QUEUE, { jobs: [] })
    .jobs.slice(0, limit)
    .map(({ apiKey, pack, ...rest }) => ({
      ...rest,
      hasKey: Boolean(apiKey),
      packSummary: rest.packSummary || pack?.setupUrl ? { setupUrl: pack?.setupUrl, ...(rest.packSummary || {}) } : rest.packSummary,
    }));
}

export function markInstallJob(id, patch) {
  const store = load(QUEUE, { jobs: [] });
  const j = store.jobs.find((x) => x.id === id);
  if (!j) return null;
  Object.assign(j, patch, { updatedAt: new Date().toISOString() });
  save(QUEUE, store);
  return j;
}

/**
 * Build importable n8n workflow for customer (Webhook → Meridian agent → respond).
 */
export function buildN8nWorkflow({ agentId, apiKey, base, businessName }) {
  const b = (base || BASE).replace(/\/$/, '');
  const name = businessName || 'Meridian Agent';
  return {
    name: `Meridian · ${name} · lead follow-up`,
    nodes: [
      {
        parameters: {
          httpMethod: 'POST',
          path: `meridian-${(agentId || 'agent').slice(-8)}`,
          responseMode: 'lastNode',
          options: {},
        },
        id: 'webhook_in',
        name: 'Lead Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [0, 0],
        webhookId: crypto.randomBytes(8).toString('hex'),
      },
      {
        parameters: {
          method: 'POST',
          url: `${b}/api/v1/agents/${agentId}/agent`,
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'Authorization', value: `Bearer ${apiKey || 'mdn_YOUR_KEY'}` },
              { name: 'Content-Type', value: 'application/json' },
            ],
          },
          sendBody: true,
          specifyBody: 'json',
          jsonBody:
            '={{ JSON.stringify({ message: `New lead. Name: ${$json.name || $json.body?.name || "friend"}. Need: ${$json.need || $json.body?.need || $json.message || "general"}. Phone: ${$json.phone || $json.body?.phone || ""}. Write a short SMS follow-up.`, history: [] }) }}',
          options: { timeout: 20000 },
        },
        id: 'http_meridian',
        name: 'Meridian Claude Agent',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [280, 0],
      },
      {
        parameters: {
          respondWith: 'json',
          responseBody: '={{ { ok: true, reply: $json.reply, source: $json.source } }}',
        },
        id: 'respond',
        name: 'Respond',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1,
        position: [560, 0],
      },
    ],
    connections: {
      'Lead Webhook': { main: [[{ node: 'Meridian Claude Agent', type: 'main', index: 0 }]] },
      'Meridian Claude Agent': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] },
    },
    meta: {
      templateCredsSetupCompleted: true,
      meridian: {
        note: 'Import into n8n → activate → point forms/CRM to the Webhook URL. Optional: add Twilio SMS node after Meridian using {{$json.reply}}.',
        agentId,
        docs: `${b}/install`,
        setupWizard: `${b}/setup`,
      },
    },
    settings: { executionOrder: 'v1' },
  };
}

export function buildZapierRecipe({ agentId, base }) {
  const b = (base || BASE).replace(/\/$/, '');
  return {
    title: 'Form/CRM lead → Meridian agent reply → SMS/Email',
    steps: [
      'Trigger: New form submission or CRM lead',
      `Action: Webhooks by Zapier → Custom Request POST ${b}/api/v1/agents/${agentId}/agent`,
      'Header Authorization: Bearer mdn_…  Content-Type: application/json',
      'Body: {"message":"New lead from {{name}}: {{message}}"}',
      'Action: Twilio SMS / Email using field reply from previous step',
    ],
  };
}

/**
 * OpenClaw process: enrich job with configs and mark ready_for_customer.
 */
export async function processInstallJob(job, { sendEmail } = {}) {
  // Containment: install packs only — never bank/inbox/files/account login
  const sanitized = sanitizeOpenClawJob(job);
  if (!sanitized.ok) {
    return markInstallJob(job.id, {
      status: 'blocked',
      error: sanitized.reason,
      blocked: true,
      containment: containmentStatus(),
    });
  }
  job = { ...job, ...sanitized.job };

  if (!job?.agentId) {
    return markInstallJob(job.id, { status: 'failed', error: 'missing agentId' });
  }
  const agent = listAgents().find((a) => a.id === job.agentId);
  // api key only available if job was queued from delivery token context
  const apiKey = job.apiKey || null;
  const base = BASE.replace(/\/$/, '');
  const wt = ensureWidgetToken(job.agentId);
  const platforms = apiKey
    ? platformConfigs({
        connection: { id: job.agentId, apiKey, businessName: job.businessName },
        intake: { businessName: job.businessName, ...(agent?.config || {}) },
        base,
      })
    : null;
  const n8n = buildN8nWorkflow({
    agentId: job.agentId,
    apiKey: apiKey || 'mdn_SEE_CONNECT_GUIDE',
    base,
    businessName: job.businessName,
  });

  const pack = {
    widgetSnippet: wt
      ? `<script src="${base}/widget.js" data-agent="${job.agentId}" data-token="${wt}" data-name="${String(job.businessName || '').replace(/"/g, '')}"></script>`
      : null,
    platforms,
    n8nWorkflow: n8n,
    zapier: buildZapierRecipe({ agentId: job.agentId, base }),
    setupUrl: job.deliveryToken ? `${base}/setup/${job.deliveryToken}` : `${base}/setup`,
    guideUrl: job.deliveryToken ? `${base}/guide/${job.deliveryToken}` : null,
    stillHuman: [
      'Paste widget on production site (or ask web host)',
      'Attach phone number inside Retell/Vapi (carrier identity)',
      'Activate n8n workflow once after import',
    ],
  };

  if (job.email && sendEmail) {
    // Transactional product email only — never scrape inboxes or third-party accounts
    assertSafeText(job.email, 'install-email');
    await sendEmail(
      job.email,
      'Meridian OpenClaw — your autonomous install pack is ready',
      `Your install pack is ready for ${job.businessName || 'your business'}.\n\n` +
        `Interactive wizard (click Next through each block):\n${pack.setupUrl}\n\n` +
        (pack.guideUrl ? `Connect guide:\n${pack.guideUrl}\n\n` : '') +
        `Contained OpenClaw prepared widget, API, n8n, and phone configs only.\n` +
        `OpenClaw cannot access banks, email inboxes, personal files, or log into accounts.\n` +
        `Still human: attach phone number in Retell/Vapi + paste widget if not automated.\n\n` +
        `Meridian · ${base}`,
    );
  }

  return markInstallJob(job.id, {
    status: 'ready',
    processedAt: new Date().toISOString(),
    contained: true,
    packSummary: {
      hasWidget: Boolean(pack.widgetSnippet),
      hasPlatforms: Boolean(platforms),
      setupUrl: pack.setupUrl,
      stillHuman: pack.stillHuman,
      never: containmentStatus().never,
    },
    // Do not persist full pack.apiKey blobs in status beyond needed
    pack: {
      ...pack,
      platforms: platforms
        ? {
            retell: { ...platforms.retell, meridian: { ...platforms.retell?.meridian, authorization: 'Bearer [redacted in storage]' } },
            vapi: platforms.vapi,
            bland: platforms.bland,
          }
        : null,
    },
  });
}

export async function processInstallQueue({ sendEmail, max = 10 } = {}) {
  // Expert training (install-pack.md) loaded EVERY queue run before any job
  const wrapped = await withExpertAndContainment(
    'install-pack',
    'openclaw.install_queue',
    async (ctx) => {
      const jobs = listInstallJobs(100).filter((j) => j.status === 'queued').slice(0, max);
      const results = [];
      for (const j of jobs) {
        try {
          results.push(await processInstallJob(j, { sendEmail }));
        } catch (e) {
          results.push(markInstallJob(j.id, { status: 'failed', error: e.message }));
        }
      }
      return {
        processed: results.length,
        results,
        expert: {
          path: ctx.expert.expertPath,
          hash: ctx.expert.expertHash,
          runId: ctx.runId,
        },
        contained: true,
      };
    },
    {
      payload: { max },
      taskBrief: 'Process Meridian customer install queue — widget/API/n8n/phone packs only.',
    },
  );
  return wrapped.result || wrapped;
}
