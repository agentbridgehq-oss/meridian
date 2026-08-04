/**
 * Automated Meridian agent deploy.
 * Callable by: CLI, OpenClaw, ops API, Claude Code, Grok.
 *
 * Flow: upsert lead → proposal → intake/provision → platform configs → webhook
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  upsertLead,
  runAgentOnLead,
  submitIntake,
  getLead,
  BASE,
  dispatchWebhook,
  listLeads,
} from '../engine.mjs';
import { buildVoiceInstallSpec, voiceStatus } from './voice-pipeline.mjs';
import { buildSystemPrompt as buildExpertSystemPrompt } from './agent-brain.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DEPLOY_DIR = process.env.MERIDIAN_DEPLOY_DIR || path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'deploys');

// NOTE: humanTransfer deliberately has no default value in any template below.
// It used to default to a descriptive placeholder ("Main line for emergencies",
// "Owner mobile for emergencies", etc.) — a label meant to prompt a human to
// fill in a real number, not real customer-facing text. But every consumer
// (the regex fallback brain, the Claude system prompt, the emergency-transfer
// hint injector) treats any truthy value as a real instruction and speaks or
// prints it verbatim, so a caller would literally hear "please call Main line
// for emergencies" instead of an actual number. All of those call sites
// already handle an empty humanTransfer correctly (falling back to "contact
// emergency services directly"), so the fix is simply: don't populate a fake
// value. Leave it unset in the template; intake/CLI/API can set a real one.
const TEMPLATES = {
  voice: {
    primaryNeed: 'voice',
    hours: 'Mon–Fri 8:00–18:00, Sat 9:00–13:00',
    services: 'Core services — confirm pricing on call',
    faqs: 'Do you offer free estimates? Yes for qualifying jobs in service area.',
    bookingRules: 'Minimum 24h notice. 30–60 min appointments.',
    tone: 'professional',
  },
  sales: {
    primaryNeed: 'sales',
    hours: 'Respond to leads within 60 seconds, business hours follow-up 8–20',
    services: 'Lead qualification and booking',
    faqs: 'What happens next? We book a short call or on-site estimate.',
    bookingRules: 'Offer two time options within 48 hours',
    tone: 'warm',
  },
  booking: {
    primaryNeed: 'booking',
    hours: 'Calendar open Mon–Fri 8–17',
    services: 'Appointment scheduling',
    faqs: 'Can I reschedule? Yes with 12h notice.',
    bookingRules: 'No double-booking. Buffer 15 min. Confirm T-24h and T-1h.',
    tone: 'professional',
  },
  full: {
    primaryNeed: 'full',
    hours: 'Mon–Fri 8:00–18:00',
    services: 'Full service menu — see intake',
    faqs: 'Hours, service area, estimates, reschedule policy',
    bookingRules: '24h notice, confirm twice, recover no-shows',
    tone: 'professional',
  },
};

function normalizeNeed(need) {
  const n = String(need || 'full').toLowerCase();
  if (n.includes('voice') || n.includes('call')) return 'voice';
  if (n.includes('sales') || n.includes('lead')) return 'sales';
  if (n.includes('book')) return 'booking';
  if (n === 'stack' || n === 'all') return 'full';
  return TEMPLATES[n] ? n : 'full';
}

function buildSystemPrompt(connection, intake) {
  // Delegates to the ONE shared prompt builder (business facts + expertise
  // layer) so every spawn path — manual, OpenClaw, chat concierge, Stripe
  // auto-provision — carries identical expert-level knowledge, always.
  const name = intake.businessName || connection.businessName || 'the business';
  return buildExpertSystemPrompt({ businessName: name, config: intake });
}

export function platformConfigs({ connection, intake, base }) {
  const id = connection.id;
  const key = connection.apiKey;
  const system = buildSystemPrompt(connection, intake);
  const voiceTurn = `${base}/api/v1/agents/${id}/voice-turn`;
  const chat = `${base}/api/v1/agents/${id}/chat`;
  const events = `${base}/api/v1/agents/${id}/events`;

  return {
    retell: {
      provider: 'retell',
      agent_name: `${intake.businessName || 'Client'} — Meridian`,
      general_prompt: system,
      begin_message: `Thanks for calling ${intake.businessName || 'us'}. How can I help you today?`,
      webhook_url: events,
      llm_websocket_url_note: 'On each user turn, call Meridian voice-turn and speak the reply field',
      meridian: {
        voiceTurn,
        chat,
        authorization: `Bearer ${key}`,
        example_body: { message: '{{user_transcript}}' },
      },
    },
    vapi: {
      provider: 'vapi',
      name: `${intake.businessName || 'Client'} Meridian`,
      model: {
        provider: 'custom-llm',
        url: voiceTurn,
        notes: 'Or use native Vapi model with tools that POST to Meridian chat',
      },
      firstMessage: `Thanks for calling ${intake.businessName || 'us'}. How can I help?`,
      serverUrl: events,
      meridian: {
        voiceTurn,
        chat,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        bodyTemplate: { message: '{{transcript}}' },
        speakField: 'reply',
      },
      systemPrompt: system,
    },
    bland: {
      provider: 'bland',
      task: system,
      voice: 'platform_default',
      webhook: events,
      meridian: { voiceTurn, chat, apiKey: key, speakField: 'reply' },
    },
    /** Sales / lead follow-up path (forms, CRM, SMS) */
    sales: {
      provider: 'meridian_sales',
      primaryNeed: intake.primaryNeed || 'sales',
      ingestUrl: `${base}/api/v1/agents/${id}/sales/lead`,
      turnUrl: `${base}/api/v1/agents/${id}/sales/turn`,
      listUrl: `${base}/api/v1/agents/${id}/sales/leads`,
      eventsShortcut: `${base}/api/v1/agents/${id}/events`,
      authorization: `Bearer ${key}`,
      exampleIngest: {
        name: 'Jane Doe',
        phone: '+15550100',
        message: 'Need a quote this week',
        source: 'website-form',
        consent: true,
      },
      flow: [
        '1. Form/CRM webhook → POST sales/lead (consent:true)',
        '2. Read reply field — send via Twilio/GHL/SMS (your account)',
        '3. On customer reply → POST sales/turn with leadId + message',
        '4. advanceSequence:true drafts +15m / +24h / +72h bumps (still you send)',
        '5. scoring.readyToBook → notify human sales owner',
      ],
      casl: 'Draft only. Never auto-blast. Opt-in or inbound only.',
    },
    curl_smoke: [
      `curl -s -X POST "${chat}" -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d "{\\"message\\":\\"What are your hours?\\"}"`,
      `curl -s -X POST "${voiceTurn}" -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d "{\\"message\\":\\"I need to book an appointment\\"}"`,
      `curl -s -X POST "${base}/api/v1/agents/${id}/sales/lead" -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d "{\\"name\\":\\"Test Lead\\",\\"phone\\":\\"+15550100\\",\\"message\\":\\"Need quote this week\\",\\"consent\\":true,\\"source\\":\\"test\\"}"`,
    ],
  };
}

/**
 * Deploy one or more Meridian agents for a client.
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function deployAgent(input = {}) {
  const email = String(input.email || `deploy+${Date.now()}@meridian.local`).trim().toLowerCase();
  const need = normalizeNeed(input.primaryNeed || input.agent || input.type || 'full');
  const tpl = TEMPLATES[need] || TEMPLATES.full;

  const intake = {
    businessName: input.businessName || input.name || 'Deployed Client',
    niche: input.niche || 'local service',
    hours: input.hours || tpl.hours,
    phone: input.phone || '',
    calendar: input.calendar || 'Google Calendar',
    crm: input.crm || '',
    services: input.services || tpl.services,
    faqs: input.faqs || tpl.faqs,
    bookingRules: input.bookingRules || tpl.bookingRules,
    humanTransfer: input.humanTransfer || tpl.humanTransfer,
    tone: input.tone || tpl.tone,
    primaryNeed: need,
    website: input.website || '',
    notes: input.notes || `auto-deploy ${new Date().toISOString()} via ${input.source || 'deploy-agent'}`,
    elevenlabsVoiceId: input.elevenlabsVoiceId || '',
  };

  // 1) Lead + proposal
  const lead = upsertLead({
    email,
    businessName: intake.businessName,
    niche: intake.niche,
    primaryNeed: need,
    phone: intake.phone,
    consent: true,
    source: input.source || 'auto_deploy',
    stage: 'new',
  });
  runAgentOnLead(lead.id);
  const withProp = getLead(lead.id);
  if (!withProp?.intakeToken) {
    return { ok: false, error: 'Failed to create lead intake token' };
  }

  // 2) Intake → provision API agent
  const result = submitIntake(withProp.intakeToken, intake);
  if (!result.ok) return result;

  const connection = result.connection;
  const base = (input.baseUrl || BASE || process.env.PUBLIC_BASE_URL || 'http://localhost:8891').replace(/\/$/, '');
  const absoluteEndpoints = {
    chat: `${base}${connection.endpoints.chat}`,
    speak: `${base}${connection.endpoints.speak}`,
    voiceTurn: `${base}${connection.endpoints.voiceTurn}`,
    config: `${base}${connection.endpoints.config}`,
    events: `${base}${connection.endpoints.events}`,
  };

  const platforms = platformConfigs({ connection, intake, base });
  const voiceSpec = buildVoiceInstallSpec(
    {
      id: connection.id,
      businessName: connection.businessName,
      config: connection.config,
      endpoints: connection.endpoints,
    },
    base,
  );

  const deployRecord = {
    ok: true,
    deployedAt: new Date().toISOString(),
    source: input.source || 'deploy-agent',
    mode: voiceStatus().mode,
    agentType: need,
    leadId: result.lead?.id,
    agentId: connection.id,
    apiKey: connection.apiKey,
    businessName: intake.businessName,
    baseUrl: base,
    endpoints: absoluteEndpoints,
    systemPrompt: buildSystemPrompt(connection, intake),
    voiceSpec,
    platforms: {
      retell: platforms.retell,
      vapi: platforms.vapi,
      bland: platforms.bland,
    },
    smoke: platforms.curl_smoke,
    nextSteps: [
      'Save apiKey once — it is not re-shown from storage as plaintext.',
      'Import platforms.retell or platforms.vapi into your phone AI provider.',
      'Point the assistant tool/webhook at voiceTurn and speak the reply field.',
      'Run smoke[0] curl to verify Meridian brain.',
      'Attach a phone number in Retell/Vapi and place a test call.',
    ],
  };

  // 3) Write deploy artifacts
  if (input.writeFiles !== false) {
    fs.mkdirSync(DEPLOY_DIR, { recursive: true });
    const safe = String(intake.businessName || 'client')
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(DEPLOY_DIR, `${stamp}_${safe}_${need}`);
    fs.mkdirSync(dir, { recursive: true });

    const secretPath = path.join(dir, 'connection.secret.json');
    const publicPath = path.join(dir, 'deploy-public.json');
    const retellPath = path.join(dir, 'retell-config.json');
    const vapiPath = path.join(dir, 'vapi-config.json');
    const readmePath = path.join(dir, 'DEPLOY.md');

    fs.writeFileSync(secretPath, JSON.stringify({
      agentId: connection.id,
      apiKey: connection.apiKey,
      endpoints: absoluteEndpoints,
      deployedAt: deployRecord.deployedAt,
    }, null, 2));

    const publicCopy = { ...deployRecord };
    delete publicCopy.apiKey;
    if (publicCopy.platforms?.retell?.meridian) {
      publicCopy.platforms = JSON.parse(JSON.stringify(deployRecord.platforms));
      // keep key only in secret file for safety in public export
      publicCopy.platforms.retell.meridian.authorization = 'Bearer <see connection.secret.json>';
      publicCopy.platforms.vapi.meridian.headers.Authorization = 'Bearer <see connection.secret.json>';
      publicCopy.platforms.bland.meridian.apiKey = '<see connection.secret.json>';
    }
    fs.writeFileSync(publicPath, JSON.stringify(publicCopy, null, 2));
    fs.writeFileSync(retellPath, JSON.stringify(platforms.retell, null, 2));
    fs.writeFileSync(vapiPath, JSON.stringify(platforms.vapi, null, 2));
    fs.writeFileSync(
      readmePath,
      `# Meridian auto-deploy — ${intake.businessName}

**Type:** ${need}  
**Agent ID:** ${connection.id}  
**Base:** ${base}

## Secrets
See \`connection.secret.json\` (do not commit).

## Smoke test
\`\`\`bash
${platforms.curl_smoke[0]}
\`\`\`

## Platforms
- \`retell-config.json\` — import / paste into Retell
- \`vapi-config.json\` — import / paste into Vapi
- Point speech to Meridian \`voiceTurn\` and speak the \`reply\` field

## OpenClaw / Claude Code
\`\`\`bash
npm run deploy:agent -- --email client@example.com --name "Acme HVAC" --type full
\`\`\`
`,
    );

    deployRecord.artifactDir = dir;
    deployRecord.files = {
      secret: secretPath,
      public: publicPath,
      retell: retellPath,
      vapi: vapiPath,
      readme: readmePath,
    };
  }

  await dispatchWebhook('agent.auto_deployed', {
    agentId: connection.id,
    businessName: intake.businessName,
    agentType: need,
    leadId: result.lead?.id,
    source: deployRecord.source,
    endpoints: absoluteEndpoints,
    connection: input.includeKeyInWebhook
      ? { id: connection.id, apiKey: connection.apiKey }
      : { id: connection.id },
  }).catch(() => {});

  // Must-work verification + customer guide (dynamic import avoids circular deps)
  const { finalizeDelivery } = await import('./onboard.mjs');
  const leadRow =
    getLead(result.lead?.id) ||
    listLeads().find((l) => l.email === email) ||
    result.lead;
  const delivery = await finalizeDelivery({
    lead: leadRow,
    connection,
    baseUrl: base,
  });
  deployRecord.verified = delivery.ok;
  deployRecord.mustWork = delivery.mustWork;
  deployRecord.verification = delivery.verification;
  deployRecord.guideUrl = delivery.guideUrl;
  deployRecord.deliveryToken = delivery.deliveryToken;
  deployRecord.readyToSell = delivery.ok === true;
  if (delivery.guideMarkdown && deployRecord.artifactDir) {
    try {
      fs.writeFileSync(path.join(deployRecord.artifactDir, 'CUSTOMER-GUIDE.md'), delivery.guideMarkdown);
    } catch {
      /* ignore */
    }
  }
  if (!delivery.ok) {
    deployRecord.ok = false;
    deployRecord.error = 'Agent failed must-work verification — not marked sellable';
  }

  return deployRecord;
}

export function listDeployTemplates() {
  return Object.keys(TEMPLATES).map((id) => ({
    id,
    primaryNeed: TEMPLATES[id].primaryNeed,
    summary: TEMPLATES[id].services,
  }));
}

export { TEMPLATES, DEPLOY_DIR };
