/**
 * Autonomous customer onboarding — start → sale (money is human-gated) → ready agents.
 * Agents MUST pass verification before marked sellable / delivered.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  upsertLead,
  getLead,
  setStage,
  runAgentOnLead,
  submitIntake,
  verifyAgentKey,
  listLeads,
  ensureWidgetToken,
  BASE,
  dispatchWebhook,
} from '../engine.mjs';
import { deployAgent } from './deploy-agent.mjs';
import { runVoiceTurn, voiceStatus } from './voice-pipeline.mjs';
import { smartAgentChat, brainStatus } from './agent-brain.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const DELIVERIES = path.join(DATA, 'deliveries');

/** Escape a value for safe use inside an HTML attribute (e.g. businessName in a widget snippet). */
function escAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Stages (money is the only hard human gate) */
export const STAGES = [
  'new',
  'proposal_sent',
  'awaiting_money', // human / Stripe decision
  'money_approved',
  'intake_received',
  'agent_connected',
  'verified', // smoke tests passed — sellable
  'delivered', // guide issued
  'closed',
  'lost',
];

/**
 * Must-work verification. Fails closed — agent is not "ready" unless all pass.
 * Tests through the SAME brain path (smartAgentChat) customers actually get —
 * Claude when configured, deterministic fallback otherwise — so "verified"
 * means the real product works, not just the safety net.
 */
export async function verifyAgentWorks(agent, apiKey) {
  const tests = [
    { id: 'hours', message: 'What are your hours?', expect: /hour|open|mon|am|pm|book|time/i },
    { id: 'booking', message: 'I need to book an appointment', expect: /book|schedule|day|time|appoint/i },
    { id: 'price', message: 'How much does it cost?', expect: /offer|price|cost|estimate|call|service/i },
    { id: 'greeting', message: 'Hello', expect: /meridian|help|book|hour|thank|contact|hi\b|hello/i },
  ];
  const results = [];
  let allOk = true;

  for (const t of tests) {
    const brain = await smartAgentChat(agent, t.message);
    const reply = brain.reply;
    const nonEmpty = Boolean(reply && String(reply).trim().length >= 8);
    const matched = t.expect.test(reply || '');
    const pass = nonEmpty && matched;
    if (!pass) allOk = false;
    results.push({
      id: t.id,
      message: t.message,
      reply: reply || '',
      pass,
      brainSource: brain.source,
      reason: !nonEmpty ? 'empty_reply' : !matched ? 'unexpected_reply' : 'ok',
    });
  }

  // Auth check
  const authOk = Boolean(verifyAgentKey(agent.id, apiKey));
  if (!authOk) {
    allOk = false;
    results.push({ id: 'auth', pass: false, reason: 'api_key_mismatch' });
  } else {
    results.push({ id: 'auth', pass: true, reason: 'ok' });
  }

  // "ok: true" only certifies the agent answers correctly — not that it's
  // running the real Claude brain. Surface that distinction explicitly so a
  // "verified" delivery never silently means "regex fallback only."
  const brainLive = results.some(r => r.brainSource === 'llm');

  return {
    ok: allOk,
    brainLive,
    verifiedAt: new Date().toISOString(),
    agentId: agent.id,
    results,
    mode: voiceStatus().mode,
    brain: brainStatus(),
  };
}

function buildCustomerGuideMarkdown({ base, connection, businessName, verification, widgetToken, deliveryToken }) {
  const id = connection.id;
  const key = connection.apiKey;
  const chat = `${base}/api/v1/agents/${id}/chat`;
  const voiceTurn = `${base}/api/v1/agents/${id}/voice-turn`;
  const events = `${base}/api/v1/agents/${id}/events`;
  const speak = `${base}/api/v1/agents/${id}/speak`;
  const widgetSnippet = `<script src="${base}/widget.js" data-agent="${id}" data-token="${widgetToken || ''}" data-name="${escAttr(businessName)}"></script>`;

  return `# Meridian — Customer connect guide (5 minutes)

**Business:** ${businessName}  
**Agent ID:** \`${id}\`  
**Verified:** ${verification.ok ? 'YES — ready for your systems' : 'NO — contact Meridian'}
**Base URL:** ${base}${verification.brainLive === false ? `

⚠️ **Claude is not configured for this agent.** It's currently answering with a basic rule-based fallback, not the full AI brain. It will still respond, but conversation quality will be noticeably more limited. Contact Meridian to get this switched on.` : ''}

---

## 1. Save your secret (once)

\`\`\`
API Key: ${key}
\`\`\`

Treat this like a password. Do not post it publicly.

---

## 2. Put your agent on your WEBSITE (1 line — do this first)

Paste this anywhere before \`</body>\` on your site (WordPress: Appearance → Theme Editor or a "Custom HTML" block; Wix/Squarespace: custom code embed; Shopify: theme.liquid):

\`\`\`html
${widgetSnippet}
\`\`\`

A branded chat bubble appears bottom-right and answers visitors with YOUR hours, services, and booking rules — live immediately. This uses a public widget token (safe for web pages). Your secret API key below never goes in a web page.

---

## 3. Chat API (works every time)

\`\`\`bash
curl -s -X POST "${chat}" \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d "{\\"message\\":\\"What are your hours?\\"}"
\`\`\`

You always get JSON: \`{ "reply": "..." }\`.

---

## 4. Put your agent on your PHONE LINE (Retell / Vapi / Bland)

Ready-made config downloads (token-gated, keep private):

- Retell: ${base}/guide/${deliveryToken}/retell.json
- Vapi: ${base}/guide/${deliveryToken}/vapi.json

**Retell, step by step:**
1. Sign up at retellai.com → Create Agent.
2. Paste the \`general_prompt\` from retell-config.json as the agent prompt.
3. Add a Custom Function/webhook that POSTs \`{"message": "{{user_transcript}}"}\` to \`${voiceTurn}\` with header \`Authorization: Bearer <your API key>\` — speak the \`reply\` field.
4. Buy/attach a phone number → place a real test call.

**Vapi, step by step:**
1. Sign up at vapi.ai → Create Assistant.
2. Use vapi-config.json: set the system prompt, set Server URL to \`${events}\`.
3. Add a tool that POSTs the transcript to \`${voiceTurn}\` (same auth header) — speak \`reply\`.
4. Attach a number → test call.

On **each caller message**, POST the transcript and speak \`reply\` with the platform's native voice:

\`\`\`bash
curl -s -X POST "${voiceTurn}" \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d "{\\"message\\":\\"I need to book an appointment\\"}"
\`\`\`

---

## 5. Webhooks (events into your CRM / n8n / Zapier / Make)

**Outbound from Meridian (optional):** set your webhook URL with Meridian ops.  
**Inbound to Meridian from your phone/CRM:**

\`\`\`bash
curl -s -X POST "${events}" \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d "{\\"type\\":\\"call.ended\\",\\"payload\\":{\\"duration\\":120}}"
\`\`\`

---

## 6. Wire checklist (customer system)

1. [ ] Paste the website widget line → confirm the bubble answers
2. [ ] Store API key in your secrets manager
3. [ ] Point phone assistant “brain” tool to **voice-turn**
4. [ ] On every user utterance → POST transcript → speak \`reply\`
5. [ ] Optional: POST call events to **events**
6. [ ] Optional: your CRM listens to Meridian outbound webhooks
7. [ ] Place a **real test call** after number is attached in Retell/Vapi

---

## 7. Reliability promise

This agent was **smoke-tested** before delivery:

${(verification.results || []).map((r) => `- ${r.id}: ${r.pass ? 'PASS' : 'FAIL'} ${r.reason || ''}`).join('\n')}

If a test fails after you change hours/FAQs, re-run intake with Meridian or ask ops to re-verify.

---

## Endpoints (bookmark)

| Use | Method | URL |
|-----|--------|-----|
| Chat | POST | ${chat} |
| Voice turn | POST | ${voiceTurn} |
| Speak text | POST | ${speak} |
| Events | POST | ${events} |
| Website widget chat | POST | ${base}/api/v1/agents/${id}/widget-chat (public widget token) |

Auth header on all: \`Authorization: Bearer ${key}\`

— Meridian Agency · ${base}
`;
}

function buildCustomerGuideHtml(mdMeta) {
  const { base, connection, businessName, verification, widgetToken, deliveryToken } = mdMeta;
  const id = connection.id;
  const key = connection.apiKey;
  const chat = `${base}/api/v1/agents/${id}/chat`;
  const voiceTurn = `${base}/api/v1/agents/${id}/voice-turn`;
  const events = `${base}/api/v1/agents/${id}/events`;
  const widgetSnippet = `<script src="${base}/widget.js" data-agent="${id}" data-token="${widgetToken || ''}" data-name="${escAttr(businessName)}"></script>`;
  const widgetEsc = widgetSnippet.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = (verification.results || [])
    .map(
      (r) =>
        `<tr><td>${r.id}</td><td class="${r.pass ? 'ok' : 'bad'}">${r.pass ? 'PASS' : 'FAIL'}</td></tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect guide — ${businessName} · Meridian</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#F7F6F3;--ink:#0C0C0B;--muted:#6B6A66;--line:rgba(12,12,11,.1);--good:#1F7A4C;--serif:'Instrument Serif',Georgia,serif;--sans:Inter,system-ui,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--sans);background:var(--bg);color:var(--ink);line-height:1.55;padding:32px 16px 64px}
.wrap{max-width:640px;margin:0 auto}
.brand{font-weight:600;margin-bottom:24px;display:flex;gap:10px;align-items:center;text-decoration:none;color:inherit}
.mark{width:28px;height:28px;border-radius:8px;background:var(--ink);display:grid;place-items:center}
.mark svg{width:14px;height:14px}
h1{font-family:var(--serif);font-weight:400;font-size:clamp(1.9rem,5vw,2.5rem);letter-spacing:-.02em;line-height:1.1;margin-bottom:8px}
.sub{color:var(--muted);margin-bottom:28px}
.badge{display:inline-block;font-size:.72rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:6px 10px;border-radius:999px;background:rgba(31,122,76,.12);color:var(--good);margin-bottom:16px}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:14px}
.card h2{font-family:var(--serif);font-weight:400;font-size:1.35rem;margin-bottom:10px}
.card p,.card li{color:#3F3F3A;font-size:.95rem}
.card ol{margin-left:1.2rem}
pre,code{font-family:ui-monospace,monospace;font-size:.78rem}
pre{background:#111;color:#F5F5F4;padding:14px;border-radius:12px;overflow:auto;margin-top:10px;white-space:pre-wrap;word-break:break-all}
.secret{background:#111;color:#FBBF24;padding:12px 14px;border-radius:12px;font-family:ui-monospace,monospace;font-size:.8rem;word-break:break-all}
table{width:100%;border-collapse:collapse;font-size:.88rem}
td{padding:8px 0;border-bottom:1px solid var(--line)}
.ok{color:var(--good);font-weight:600}.bad{color:#B91C1C;font-weight:600}
.copybtn{font:inherit;font-size:.82rem;font-weight:600;cursor:pointer;margin-top:10px;padding:9px 16px;border-radius:999px;border:1px solid var(--line);background:var(--ink);color:#fff}
.dlbtn{display:inline-block;font-size:.82rem;font-weight:600;padding:9px 16px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--ink);text-decoration:none;margin-right:8px}
.dlbtn:hover{background:#E8E6E1}
.foot{margin-top:28px;font-size:.8rem;color:var(--muted);text-align:center}
</style>
</head>
<body>
<div class="wrap">
  <a class="brand" href="/"><span class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M4 12h16M12 4v16"/></svg></span>Meridian</a>
  <div class="badge">${verification.ok ? 'Verified · ready for your systems' : 'Needs fix · contact Meridian'}</div>
  <h1>Connect your agent</h1>
  <p class="sub">${businessName} · short guide for API &amp; webhooks · ~5 minutes</p>
  ${verification.brainLive === false ? `<div class="card" style="border-color:#F5C842;background:#FFFBEB">
    <p style="color:#92400E;font-weight:600">⚠️ Claude is not configured for this agent. It's currently answering with a basic rule-based fallback, not the full AI brain — it will still respond, but conversation quality will be noticeably more limited. Contact Meridian to get this switched on.</p>
  </div>` : ''}
  <div class="card" style="border-color:rgba(12,12,11,.2);background:#0C0C0B;color:#F5F5F4">
    <h2 style="color:#fff">Start interactive setup</h2>
    <p style="color:#A1A1AA">Click through each block · Next · clear instructions · optional OpenClaw autonomous pack.</p>
    <p style="margin-top:14px">
      <a class="dlbtn" style="background:#fff;color:#0C0C0B" href="/setup/${deliveryToken}">Start setup wizard →</a>
      <a class="dlbtn" style="border-color:#444;color:#fff;background:transparent" href="/install">Full docs</a>
    </p>
    <p style="margin-top:12px;color:#A1A1AA;font-size:.88rem">Want Meridian to do almost everything next time?
      <a href="/checkout/auto" style="color:#fff;font-weight:600">Full Auto Install · $1,497</a></p>
  </div>

  <div class="card">
    <h2>1. API key (save once)</h2>
    <div class="secret">${key}</div>
    <p style="margin-top:10px">Agent ID: <code>${id}</code></p>
  </div>

  <div class="card">
    <h2>2. Put it on your website — 1 line</h2>
    <p>Paste before <code>&lt;/body&gt;</code> (WordPress custom-HTML block, Wix/Squarespace embed, Shopify theme.liquid). A branded chat bubble goes live instantly with your hours, services, and booking rules.</p>
    <pre id="mdn-widget-snippet">${widgetEsc}</pre>
    <button class="copybtn" onclick="navigator.clipboard.writeText(document.getElementById('mdn-widget-snippet').textContent).then(()=>{this.textContent='Copied ✓';setTimeout(()=>this.textContent='Copy snippet',1500)})">Copy snippet</button>
    <p style="margin-top:10px">Safe: this uses your <em>public</em> widget token. The secret key above never goes in a web page.</p>
  </div>

  <div class="card">
    <h2>3. Test chat (must work)</h2>
    <pre>curl -s -X POST "${chat}" \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d "{\\"message\\":\\"What are your hours?\\"}"</pre>
  </div>

  <div class="card">
    <h2>4. Put it on your phone line (Retell / Vapi)</h2>
    <p>Download your ready-made configs, then follow the steps:</p>
    <p style="margin:10px 0">
      <a class="dlbtn" href="/guide/${deliveryToken}/retell.json" download>⬇ Retell config</a>
      <a class="dlbtn" href="/guide/${deliveryToken}/vapi.json" download>⬇ Vapi config</a>
    </p>
    <ol>
      <li>Create an agent/assistant on retellai.com or vapi.ai</li>
      <li>Paste the system prompt from your config file</li>
      <li>Add a tool/webhook: POST the caller transcript to voice-turn (auth header from your config) and speak the <strong>reply</strong> field</li>
      <li>Attach a phone number → place a live test call</li>
    </ol>
    <pre>POST ${voiceTurn}
Authorization: Bearer ${key}
{"message":"{{caller text}}"}</pre>
  </div>

  <div class="card">
    <h2>5. Webhooks into Meridian (CRM / n8n / Zapier / Make)</h2>
    <p>Send call/CRM events from your stack:</p>
    <pre>POST ${events}
Authorization: Bearer ${key}
{"type":"call.ended","payload":{}}</pre>
    <p style="margin-top:10px">Outbound Meridian → your CRM: ask ops to set <code>MERIDIAN_WEBHOOK_URL</code>.</p>
  </div>

  <div class="card">
    <h2>6. Wire checklist</h2>
    <ol>
      <li>Paste the website widget line → confirm the bubble answers</li>
      <li>Store API key in secrets</li>
      <li>Point assistant tool to voice-turn</li>
      <li>Speak <code>reply</code> every turn</li>
      <li>Optional: post events + CRM webhook</li>
      <li>Attach phone number + place a live test call</li>
    </ol>
  </div>

  <div class="card">
    <h2>7. Verification (run before go-live)</h2>
    <table>${rows}</table>
  </div>

  <p class="foot">Meridian Agency · ${base} · Money decisions stay with you; this pack is your technical handoff.</p>
</div>
</body>
</html>`;
}

/**
 * After provision: verify + write customer delivery pack. Must pass to be sellable.
 */
export async function finalizeDelivery({ lead, connection, baseUrl }) {
  const base = (baseUrl || BASE).replace(/\/$/, '');
  const agent = verifyAgentKey(connection.id, connection.apiKey);
  if (!agent) {
    return { ok: false, error: 'Provisioned agent failed auth check' };
  }

  let verification = await verifyAgentWorks(agent, connection.apiKey);
  // One re-try with same key if flaky
  if (!verification.ok) {
    verification = await verifyAgentWorks(agent, connection.apiKey);
  }

  const deliveryToken = crypto.randomBytes(24).toString('hex');
  const businessName = lead.businessName || connection.businessName || 'Customer';

  const pack = {
    deliveryToken,
    createdAt: new Date().toISOString(),
    businessName,
    leadId: lead.id,
    agentId: connection.id,
    verified: verification.ok,
    verification,
    guidePath: `/guide/${deliveryToken}`,
    endpoints: {
      chat: `${base}${connection.endpoints.chat}`,
      voiceTurn: `${base}${connection.endpoints.voiceTurn}`,
      speak: `${base}${connection.endpoints.speak}`,
      events: `${base}${connection.endpoints.events}`,
    },
  };

  // Persist delivery (with key for guide page — token-gated)
  fs.mkdirSync(DELIVERIES, { recursive: true });
  const dir = path.join(DELIVERIES, deliveryToken);
  fs.mkdirSync(dir, { recursive: true });

  const meta = {
    base,
    connection: {
      id: connection.id,
      apiKey: connection.apiKey,
      endpoints: connection.endpoints,
      businessName,
    },
    businessName,
    verification,
    widgetToken: ensureWidgetToken(connection.id) || '',
    deliveryToken,
  };

  const md = buildCustomerGuideMarkdown(meta);
  const html = buildCustomerGuideHtml(meta);
  fs.writeFileSync(path.join(dir, 'CUSTOMER-GUIDE.md'), md);
  fs.writeFileSync(path.join(dir, 'guide.html'), html);
  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify(
      {
        ...pack,
        apiKey: connection.apiKey,
      },
      null,
      2,
    ),
  );

  const stage = verification.ok ? 'delivered' : 'agent_connected';
  setStage(lead.id, verification.ok ? 'verified' : 'agent_connected', {
    deliveryToken,
    verification,
    agentConnection: {
      id: connection.id,
      endpoints: connection.endpoints,
      verified: verification.ok,
    },
  });
  if (verification.ok) {
    setStage(lead.id, 'delivered', {
      deliveryToken,
      deliveredAt: new Date().toISOString(),
      guideUrl: `${base}/guide/${deliveryToken}`,
    });
  }

  dispatchWebhook(verification.ok ? 'onboard.delivered' : 'onboard.verify_failed', {
    leadId: lead.id,
    agentId: connection.id,
    businessName,
    verified: verification.ok,
    guideUrl: `${base}/guide/${deliveryToken}`,
  }).catch(() => {});

  return {
    ok: verification.ok,
    mustWork: verification.ok,
    verification,
    deliveryToken,
    guideUrl: `${base}/guide/${deliveryToken}`,
    setupWizardUrl: `${base}/setup/${deliveryToken}`,
    guideMarkdown: md,
    connection,
    pack,
    message: verification.ok
      ? 'Agent verified and ready for customer systems. Open the setup wizard for step-by-step Next blocks.'
      : 'Agent provisioned but verification failed — not marked sellable.',
  };
}

/**
 * Full autonomous onboard path.
 * moneyDecision: 'pending' | 'approved' | 'skip' (skip only for internal/test)
 * Human money: leave pending until ops approves.
 */
export async function runOnboardPipeline(input = {}) {
  const money = input.moneyDecision || input.money || 'pending';
  const email = String(input.email || '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'email required' };

  // 1) Capture + proposal (autonomous)
  let lead = upsertLead({
    email,
    businessName: input.businessName || '',
    niche: input.niche || '',
    primaryNeed: input.primaryNeed || 'full',
    phone: input.phone || '',
    consent: true,
    source: input.source || 'onboard_pipeline',
    stage: 'new',
  });
  runAgentOnLead(lead.id);
  lead = getLead(lead.id);
  setStage(lead.id, 'awaiting_money', {
    moneyStatus: money === 'approved' || money === 'skip' ? money : 'pending',
    proposal: lead.proposal,
  });
  lead = getLead(lead.id);

  const out = {
    ok: true,
    stage: lead.stage,
    leadId: lead.id,
    proposal: lead.proposal,
    intakeUrl: `${BASE}/intake/${lead.intakeToken}`,
    moneyStatus: lead.moneyStatus || 'pending',
    autonomous: true,
    humanGate: 'money',
  };

  // 2) Money gate
  if (money !== 'approved' && money !== 'skip') {
    out.message =
      'Proposal ready. Waiting on money decision (you approve price / Stripe). No agent provision until then.';
    out.next = ['approve_money', 'or_customer_checkout'];
    await dispatchWebhook('onboard.awaiting_money', {
      leadId: lead.id,
      email,
      proposal: lead.proposal,
      intakeUrl: out.intakeUrl,
    }).catch(() => {});
    return out;
  }

  setStage(lead.id, 'money_approved', {
    moneyStatus: 'approved',
    moneyApprovedAt: new Date().toISOString(),
    moneyNote: input.moneyNote || 'approved',
  });

  // 3) If intake fields provided, provision + verify now; else wait for customer intake form
  const hasIntake =
    input.hours || input.services || input.autoIntake === true || input.completeIntake === true;

  if (!hasIntake) {
    out.stage = 'money_approved';
    out.message = 'Money approved. Customer completes short intake form to provision agents.';
    out.next = ['customer_intake'];
    out.intakeUrl = `${BASE}/intake/${lead.intakeToken}`;
    return out;
  }

  // 4) Deploy path (auto) or intake body
  const deployed = await deployAgent({
    email,
    businessName: input.businessName || lead.businessName,
    primaryNeed: input.primaryNeed || lead.primaryNeed || 'full',
    niche: input.niche || lead.niche,
    hours: input.hours,
    services: input.services,
    faqs: input.faqs,
    bookingRules: input.bookingRules,
    humanTransfer: input.humanTransfer,
    tone: input.tone,
    phone: input.phone,
    website: input.website,
    source: input.source || 'onboard_pipeline',
    baseUrl: input.baseUrl || BASE,
  });

  if (!deployed.ok) return deployed;

  lead = getLead(lead.id) || lead;
  // deployAgent creates a NEW lead by email — get fresh
  const leads = listLeads().filter((l) => l.email === email);
  lead = leads[0] || lead;

  const connection = {
    id: deployed.agentId,
    apiKey: deployed.apiKey,
    businessName: deployed.businessName,
    endpoints: {
      chat: deployed.endpoints.chat.replace(deployed.baseUrl, '') || `/api/v1/agents/${deployed.agentId}/chat`,
      speak: `/api/v1/agents/${deployed.agentId}/speak`,
      voiceTurn: `/api/v1/agents/${deployed.agentId}/voice-turn`,
      config: `/api/v1/agents/${deployed.agentId}`,
      events: `/api/v1/agents/${deployed.agentId}/events`,
    },
    config: {},
  };
  // Fix endpoints to relative for finalize if absolute
  for (const k of Object.keys(connection.endpoints)) {
    const u = connection.endpoints[k];
    if (u.startsWith('http')) {
      try {
        connection.endpoints[k] = new URL(u).pathname;
      } catch {
        /* keep */
      }
    }
  }

  // Load agent from store for config
  const agent = verifyAgentKey(deployed.agentId, deployed.apiKey);
  if (agent) connection.config = agent.config;

  const delivery = await finalizeDelivery({
    lead: getLead(lead.id) || { id: lead.id, businessName: deployed.businessName, intakeToken: lead.intakeToken },
    connection: { ...connection, apiKey: deployed.apiKey },
    baseUrl: deployed.baseUrl || BASE,
  });

  return {
    ok: delivery.ok,
    mustWork: delivery.mustWork,
    stage: delivery.ok ? 'delivered' : 'agent_connected',
    leadId: lead.id,
    agentId: deployed.agentId,
    apiKey: deployed.apiKey,
    endpoints: deployed.endpoints,
    guideUrl: delivery.guideUrl,
    verification: delivery.verification,
    platforms: deployed.platforms,
    artifactDir: deployed.artifactDir,
    message: delivery.message,
    humanGate: null,
  };
}

/** Ops: approve money for a lead (human money decision) */
export function approveMoney(leadId, note = '') {
  const lead = getLead(leadId);
  if (!lead) return { ok: false, error: 'Lead not found' };
  setStage(leadId, 'money_approved', {
    moneyStatus: 'approved',
    moneyApprovedAt: new Date().toISOString(),
    moneyNote: note || 'ops_approved',
  });
  dispatchWebhook('onboard.money_approved', { leadId, email: lead.email }).catch(() => {});
  return {
    ok: true,
    lead: getLead(leadId),
    intakeUrl: `${BASE}/intake/${lead.intakeToken}`,
    next: 'customer_completes_intake',
  };
}

export function getDeliveryByToken(token) {
  if (!token || !/^[a-f0-9]{32,64}$/i.test(token)) return null;
  const metaPath = path.join(DELIVERIES, token, 'meta.json');
  const htmlPath = path.join(DELIVERIES, token, 'guide.html');
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : null;
    const md = fs.readFileSync(path.join(DELIVERIES, token, 'CUSTOMER-GUIDE.md'), 'utf8');
    return { meta, html, md };
  } catch {
    return null;
  }
}

export { DELIVERIES };
