/**
 * Meridian Agency — independent AI agency platform
 * Not ClaudeCraft. Own brand, billing, data, deploy.
 */

import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';
import {
  upsertLead,
  listLeads,
  getLead,
  runAgentOnLead,
  submitIntake,
  verifyAgentKey,
  listOutreachDrafts,
  approveOutreach,
  draftOutreach,
  funnelStats,
  dispatchWebhook,
  listApprovedUnsent,
  markOutreachSent,
  setStage,
  ensureWidgetToken,
  verifyWidgetToken,
  listAgents,
  getAgent,
  setAgentVoice,
  BASE,
} from './engine.mjs';
import { runAutopilot, lastAutopilotReport } from './lib/autopilot.mjs';
import { platformConfigs } from './lib/deploy-agent.mjs';
import { smartAgentChat, brainStatus, buildSystemPrompt } from './lib/agent-brain.mjs';
import {
  claudeAgentStatus,
  claudeConfigured,
  claudeUsageSummary,
  callClaudeAgent,
  callClaudeGuide,
} from './lib/claude-agent-api.mjs';
import { runOpenClaw } from './openclaw/daily.mjs';
import { containmentStatus, buildContainmentReport } from './lib/openclaw-containment.mjs';
import { expertGateStatus, withExpertAndContainment } from './lib/openclaw-expert-gate.mjs';
import {
  voiceStatus,
  listVoices,
  textToSpeech,
  runVoiceTurn,
  buildVoiceInstallSpec,
  elevenlabsConfigured,
  buildPlatformPayload,
  preferredHostedTts,
  hostedTextToSpeech,
  previewVoice,
  resolveAgentVoiceId,
  buildPreviewCallScript,
  runPreviewAgentTurn,
} from './lib/voice-pipeline.mjs';
import { deployAgent, listDeployTemplates } from './lib/deploy-agent.mjs';
import { runOpenClawDeploy } from './openclaw/deploy-agent.mjs';
import {
  runOnboardPipeline,
  approveMoney,
  finalizeDelivery,
  getDeliveryByToken,
  verifyAgentWorks,
} from './lib/onboard.mjs';
import { guideChat } from './lib/guide-chat.mjs';
import { webSearch, formatSearchForPrompt, wantsWebSearch } from './lib/web-search.mjs';
import { callXaiGuide, xaiGuideConfigured } from './lib/xai-guide.mjs';
import {
  buildSetupContext,
  testAgentChat,
  saveProgress,
  getProgress,
  queueAutonomousInstall,
  processInstallQueue,
  processInstallJob,
  buildN8nWorkflow,
  listInstallJobs,
  SETUP_STEPS,
  getVoiceCatalog,
  saveAgentVoicePreference,
  saveSetupKnowledge,
} from './lib/customer-setup.mjs';
import {
  TOPUP_PACKS,
  SUBSCRIPTION_PLANS,
  pricingSnapshot,
  ensureBillingAccount,
  getBillingByAgent,
  getBillingAccount,
  creditPrepaidTurns,
  activateSubscription,
  canConsumeTurn,
  consumeTurn,
  reserveTurn,
  releaseReservedTurn,
  commitReservedTurn,
  cashFlowPolicy,
  overageAllowed,
  attachAgentBilling,
  listBillingAccounts,
  roiSummary,
  usageForAccount,
  listUsage,
  clearUnbilledOverage,
  customerCentsPerTurn,
  cancelSubscriptionLocal,
  updateBillingAccount,
} from './lib/usage-billing.mjs';
import { xaiTtsConfigured } from './lib/xai-tts.mjs';
import { vendorPaygSnapshot } from './lib/vendor-payg.mjs';
import {
  ingestSalesLead,
  salesTurn,
  listSalesLeads,
  getSalesLead,
  salesPipelineStatus,
  buildSalesN8nRecipe,
  scoreLead,
} from './lib/sales-pipeline.mjs';
import { runCustomerTurn } from './lib/turn-pipeline.mjs';
import {
  setKnowledge,
  fetchWebsiteSummary,
  analyzeIntent,
} from './lib/knowledge.mjs';
import {
  refreshAgentKnowledge,
  listProposals,
  approveProposal,
  rejectProposal,
  approveAll,
  rejectAll,
  runWeeklyKnowledgeRefresh,
  knowledgeRefreshStatus,
} from './lib/knowledge-refresh.mjs';
import {
  listInteractions,
  agentStats,
  buildActivitySummary,
  logInteraction,
} from './lib/interactions.mjs';
import {
  notifyConfig,
  notifyOwner,
  sendInteractionSummary,
  sendMissedCallTextBack,
  sendSms,
  sendOwnerEmail,
} from './lib/notify.mjs';
import {
  platformStatus,
  probeAgent,
  probeAllAgents,
  getAgentHealth,
} from './lib/reliability.mjs';
import {
  publishArticle,
  unpublishArticle,
  rejectArticleFinal,
  listArticles,
  getArticle,
  listPublished,
  getPublishedArticle,
  articlesStatus,
} from './lib/articles.mjs';
import {
  runOpenClawArticles,
  runOpenClawArticlesScheduled,
  runOpenClawArticleStep,
} from './lib/openclaw-articles.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 8891;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Security headers on every response. CSP allows the fonts + inline
// style/script the current pages use (copy-button onclick, inline <style>
// blocks) — tightening further needs a nonce-based rewrite of those pages.
app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'", 'https://checkout.stripe.com'],
        frameSrc: ["'self'", 'https://checkout.stripe.com', 'https://js.stripe.com'],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    // Reduce browser "risky site" / mixed-content / clickjack surface
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: ['self', 'https://checkout.stripe.com'],
      usb: [],
      interestCohort: [],
    },
  }),
);
// Extra browser-hardening headers (some scanners look for these by name)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=(), interest-cohort=()');
  next();
});

// Public-endpoint rate limits — mitigates scraping/abuse without a login wall.
const publicLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
const chatLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
const authedLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

const PRODUCTS = {
  voice: {
    name: 'Meridian Voice Agent Kit',
    amount: 49700,
    description: '24/7 voice receptionist install kit (platform TTS). Add prepaid turns or Voice Premium for hosted neural speech.',
    files: ['kits/voice/VOICE-AGENT-KIT.md'],
  },
  sales: {
    name: 'Meridian Sales Agent Kit',
    amount: 49700,
    description: 'Instant lead follow-up install kit',
    files: ['kits/sales/SALES-AGENT-KIT.md'],
  },
  booking: {
    name: 'Meridian Booking Agent Kit',
    amount: 49700,
    description: 'Appointment scheduler install kit',
    files: ['kits/booking/BOOKING-AGENT-KIT.md'],
  },
  stack: {
    name: 'Meridian Full Stack',
    amount: 99700,
    description: 'Voice + Sales + Booking + agency playbook',
    files: [
      'kits/voice/VOICE-AGENT-KIT.md',
      'kits/sales/SALES-AGENT-KIT.md',
      'kits/booking/BOOKING-AGENT-KIT.md',
      'kits/stack/FULL-STACK-PLAYBOOK.md',
    ],
  },
  /** DFY full auto install — customer pays more, Meridian OpenClaw does the work */
  auto: {
    name: 'Meridian Full Auto Install',
    amount: Number(process.env.STRIPE_AMOUNT_AUTO || 149700), // $1,497
    description:
      'Done-for-you: we provision your agent, run smoke tests, build widget/API/n8n/phone packs via OpenClaw, and hand you a short checklist. You only attach a phone number + paste the widget if needed.',
    files: ['kits/voice/VOICE-AGENT-KIT.md'],
    fullAuto: true,
    primaryNeed: 'full',
  },
  auto_voice: {
    name: 'Meridian Voice · Full Auto Install',
    amount: Number(process.env.STRIPE_AMOUNT_AUTO_VOICE || 99700), // $997
    description: 'Done-for-you Voice agent install — OpenClaw packs widget, API, phone configs. Minimal work on your side.',
    files: ['kits/voice/VOICE-AGENT-KIT.md'],
    fullAuto: true,
    primaryNeed: 'voice',
  },
  auto_stack: {
    name: 'Meridian Full Stack · Full Auto Install',
    amount: Number(process.env.STRIPE_AMOUNT_AUTO_STACK || 249700), // $2,497
    description:
      'Done-for-you Voice + Sales + Booking install with OpenClaw autonomous packaging, priority ops, and setup wizard. Highest hands-off tier.',
    files: [
      'kits/voice/VOICE-AGENT-KIT.md',
      'kits/sales/SALES-AGENT-KIT.md',
      'kits/booking/BOOKING-AGENT-KIT.md',
      'kits/stack/FULL-STACK-PLAYBOOK.md',
    ],
    fullAuto: true,
    primaryNeed: 'full',
  },
  auto_sales: {
    name: 'Meridian Sales · Full Auto Install',
    amount: Number(process.env.STRIPE_AMOUNT_AUTO_SALES || 99700), // $997
    description:
      'Done-for-you Sales agent: lead ingest API, Claude follow-up drafts, scorecard, n8n recipe. You connect SMS/CRM to send (CASL).',
    files: ['kits/sales/SALES-AGENT-KIT.md'],
    fullAuto: true,
    primaryNeed: 'sales',
  },
};

function isFullAutoProduct(productKey) {
  return Boolean(PRODUCTS[productKey]?.fullAuto);
}

function customFieldsFromSession(session) {
  const fields = session.custom_fields || [];
  const get = (key) => {
    const f = fields.find((x) => x.key === key);
    return f?.text?.value || f?.dropdown?.value || '';
  };
  return {
    businessName: get('business_name') || session.customer_details?.name || '',
    website: get('website') || '',
    hours: get('hours') || 'Mon–Fri 9am–5pm',
    services: get('services') || 'See website / call for details',
    phone: get('phone') || '',
    phonePlatform: get('phone_platform') || 'retell',
  };
}

/**
 * Full Auto Install: provision from checkout fields + OpenClaw pack + setup wizard.
 * Customer work minimized to: attach phone number (carrier) + optional widget paste.
 */
async function runFullAutoInstall(session, lead) {
  const cf = customFieldsFromSession(session);
  const productKey = session.metadata?.product || 'auto';
  const need = PRODUCTS[productKey]?.primaryNeed || session.metadata?.primaryNeed || 'full';
  const email = (session.customer_details?.email || session.customer_email || lead.email || '').toLowerCase();

  const chatIntake = {
    businessName: cf.businessName || lead.businessName || 'Business',
    website: cf.website,
    hours: cf.hours,
    services: cf.services,
    phone: cf.phone,
    faqs: cf.website ? `See ${cf.website} for more details.` : '',
    bookingRules: 'Offer two concrete time options; confirm date and service.',
    humanTransfer: cf.phone || 'Ask for a callback number and escalate.',
    tone: 'professional',
    primaryNeed: need === 'auto' || need === 'auto_stack' ? 'full' : need,
    notes: `full_auto_install stripe:${session.id}`,
  };

  setStage(lead.id, 'money_approved', {
    moneyStatus: 'approved',
    moneyApprovedAt: new Date().toISOString(),
    moneyNote: `stripe_full_auto:${session.id}`,
    stripeSessionId: session.id,
    amountPaid: session.amount_total,
    fullAutoInstall: true,
    chatIntake,
    businessName: chatIntake.businessName,
    primaryNeed: chatIntake.primaryNeed,
  });

  let connection = null;
  let delivery = null;
  const fresh = getLead(lead.id);

  if (!fresh.agentConnection) {
    const intakeResult = submitIntake(fresh.intakeToken, chatIntake);
    if (!intakeResult.ok) {
      throw new Error(intakeResult.error || 'intake failed');
    }
    connection = intakeResult.connection;
    delivery = await finalizeDelivery({
      lead: intakeResult.lead,
      connection,
      baseUrl: BASE,
    });
  } else {
    // Already has agent — still queue auto pack
    connection = {
      id: fresh.agentConnection.id,
      apiKey: null,
      endpoints: fresh.agentConnection.endpoints,
    };
    delivery = {
      ok: true,
      deliveryToken: fresh.deliveryToken,
      guideUrl: fresh.deliveryToken ? `${BASE}/guide/${fresh.deliveryToken}` : null,
      setupWizardUrl: fresh.deliveryToken ? `${BASE}/setup/${fresh.deliveryToken}` : `${BASE}/setup`,
    };
  }

  const deliveryToken = delivery?.deliveryToken || fresh.deliveryToken;
  const apiKey = connection?.apiKey || null;

  const job = queueAutonomousInstall({
    agentId: connection?.id || fresh.agentConnection?.id,
    apiKey,
    deliveryToken,
    businessName: chatIntake.businessName,
    email,
    websiteUrl: cf.website,
    phonePlatform: cf.phonePlatform || 'retell',
    outboundWebhook: '',
    path: 'full',
    notes: 'paid_full_auto_install',
    priority: 'paid_dfy',
  });

  let processed = job;
  try {
    processed = await processInstallJob({ ...job, apiKey }, { sendEmail });
  } catch (e) {
    console.error('[full-auto process]', e.message);
  }

  // Gift starter voice turns for paid full-auto (high perceived value)
  try {
    if (connection?.id) {
      const acc = attachAgentBilling(
        { id: connection.id, leadId: lead.id, businessName: chatIntake.businessName },
        { email, leadId: lead.id },
      );
      creditPrepaidTurns(acc.id, Number(process.env.AUTO_INSTALL_BONUS_TURNS || 50), {
        amountCents: 0,
        reason: 'full_auto_install_bonus',
        stripeSessionId: session.id,
      });
    }
  } catch (e) {
    console.error('[full-auto bonus turns]', e.message);
  }

  const setupUrl = deliveryToken ? `${BASE}/setup/${deliveryToken}` : `${BASE}/setup`;
  const guideUrl = delivery?.guideUrl || (deliveryToken ? `${BASE}/guide/${deliveryToken}` : null);

  if (email) {
    await sendEmail(
      email,
      'Full Auto Install started — almost zero work for you',
      `Payment confirmed for Full Auto Install.\n\n` +
        `What Meridian already did:\n` +
        `• Built & smoke-tested your agent (Claude brain)\n` +
        `• Generated website widget snippet\n` +
        `• Generated API + phone (Retell/Vapi) configs\n` +
        `• Built n8n workflow pack via OpenClaw\n` +
        (apiKey ? `• Agent ID: ${connection.id}\n• API key (save once): ${apiKey}\n` : '') +
        `\nYour interactive wizard (confirm only — most work is done):\n${setupUrl}\n` +
        (guideUrl ? `\nStatic connect guide:\n${guideUrl}\n` : '') +
        `\nOnly remaining on your side:\n` +
        `1) Paste the widget on your site (or send site access to ops)\n` +
        `2) Attach a phone number inside Retell/Vapi (carrier requires your account)\n` +
        `3) Click through the short wizard checklist\n\n` +
        `Bonus: starter premium voice turns credited if applicable.\n\n` +
        `Meridian Agency\n${BASE}`,
    );
  }

  await dispatchWebhook('onboard.full_auto_install', {
    leadId: lead.id,
    email,
    agentId: connection?.id,
    amount: session.amount_total,
    setupUrl,
    guideUrl,
    jobId: job.id,
    jobStatus: processed?.status,
  }).catch(() => {});

  setStage(lead.id, 'delivered', {
    fullAutoInstall: true,
    fullAutoAt: new Date().toISOString(),
    setupWizardUrl: setupUrl,
    installJobId: job.id,
  });

  return {
    lead: getLead(lead.id),
    guideUrl,
    setupWizardUrl: setupUrl,
    autoProvisioned: true,
    fullAuto: true,
    job: processed,
  };
}

/** Resolve / create billing account for an agent (by agent + lead email if known). */
function billingForAgent(agent) {
  let acc = getBillingByAgent(agent.id);
  if (acc) return acc;
  const lead = agent.leadId ? getLead(agent.leadId) : null;
  return attachAgentBilling(agent, { email: lead?.email, leadId: agent.leadId });
}

/**
 * Cash-first gate: customer must already have prepaid/sub allowance.
 * Never call xAI until reserveTurn succeeds (balance held).
 */
function assertPremiumBalance(agent) {
  const account = billingForAgent(agent);
  const gate = canConsumeTurn(account.id);
  if (!gate.ok) {
    return {
      ok: false,
      status: 402,
      body: {
        ok: false,
        error: 'payment_required',
        reason: gate.reason,
        message: gate.message,
        checkout: gate.checkout,
        pricing: gate.pricing || pricingSnapshot(),
        billingAccountId: account.id,
        policy: cashFlowPolicy(),
      },
    };
  }
  return { ok: true, account, gate };
}

/**
 * Hold customer turn → call xAI only after hold → commit cost on success / refund hold on fail.
 * You never spend xAI against unpaid customer balance.
 */
async function runMeteredHostedTts(agent, text, { voiceId } = {}) {
  const account = billingForAgent(agent);
  const hold = reserveTurn(account.id, { agentId: agent.id });
  if (!hold.ok) {
    return {
      ok: false,
      status: 402,
      body: {
        ok: false,
        error: 'payment_required',
        reason: hold.reason,
        message: hold.message,
        checkout: hold.checkout,
        pricing: hold.pricing || pricingSnapshot(),
        policy: cashFlowPolicy(),
      },
    };
  }

  const result = await hostedTextToSpeech(text, {
    voiceId: resolveAgentVoiceId(agent, voiceId),
    provider: preferredHostedTts(),
  });

  if (!result.ok || result.skipped || !result.audioBuffer) {
    releaseReservedTurn(account.id, hold);
    return {
      ok: false,
      status: result.ok === false ? 502 : 200,
      holdReleased: true,
      body: {
        ok: result.ok !== false,
        agentId: agent.id,
        mode: result.mode || 'platform',
        say: text,
        speak: text,
        audioBase64: null,
        billed: false,
        error: result.error,
        message:
          result.message ||
          result.error ||
          'TTS unavailable — turn refunded to customer balance. Use platform say field.',
        policy: cashFlowPolicy(),
      },
    };
  }

  const settled = commitReservedTurn(account.id, hold, {
    chars: result.chars || text.length,
    provider: result.mode || preferredHostedTts(),
    agentId: agent.id,
  });

  // Optional: only if VOICE_ALLOW_OVERAGE=1 (off by default)
  if (
    settled.ok &&
    settled.mode === 'subscription_overage' &&
    overageAllowed() &&
    stripe &&
    settled.account?.stripeCustomerId
  ) {
    const cents = settled.revenueCents || customerCentsPerTurn();
    stripe.invoiceItems
      .create({
        customer: settled.account.stripeCustomerId,
        amount: cents,
        currency: 'usd',
        description: `Meridian Voice overage turn · agent ${agent.id}`,
        metadata: {
          brand: 'meridian',
          type: 'voice_overage_turn',
          agentId: agent.id,
          billingAccountId: account.id,
        },
      })
      .catch((e) => console.error('[stripe overage]', e.message));
  }

  return { ok: true, result, settled, account };
}

/**
 * Stripe webhook — a real payment IS the money decision (customer approved it
 * by paying). Auto-advances the lead past the money gate → intake → provision.
 * Registered BEFORE express.json so the raw body is available for signature check.
 */
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  let event;
  try {
    const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (whSecret) {
      event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), whSecret);
    } else {
      event = JSON.parse(req.body.toString('utf8'));
    }
  } catch (e) {
    return res.status(400).json({ error: `Webhook error: ${e.message}` });
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
      const kind = session.metadata?.kind || '';
      if (kind === 'voice_pack' || kind === 'voice_sub') {
        await handleVoiceBillingCheckout(session);
      } else {
        await handlePaidCheckout(session);
      }
    } catch (e) {
      console.error('[stripe webhook]', e.message);
    }
  }
  if (
    event.type === 'customer.subscription.deleted' ||
    event.type === 'customer.subscription.updated'
  ) {
    try {
      const sub = event.data.object;
      const accountId = sub.metadata?.billingAccountId;
      if (accountId && event.type === 'customer.subscription.deleted') {
        cancelSubscriptionLocal(accountId);
      }
      if (accountId && event.type === 'customer.subscription.updated') {
        const status = sub.status;
        if (status === 'active' || status === 'trialing') {
          const plan = sub.metadata?.plan || 'voice_monthly';
          activateSubscription(accountId, plan, {
            stripeCustomerId: String(sub.customer || ''),
            stripeSubscriptionId: sub.id,
          });
        }
      }
    } catch (e) {
      console.error('[stripe sub]', e.message);
    }
  }
  res.json({ received: true });
});

/**
 * Prepaid packs + Voice Premium subscriptions (usage billing).
 * Cash collected BEFORE turns — guaranteed positive unit economics when charged >> cost.
 */
async function handleVoiceBillingCheckout(session) {
  const email = (session.customer_details?.email || session.customer_email || '').toLowerCase();
  const kind = session.metadata?.kind;
  const agentId = session.metadata?.agentId || '';
  const leadId = session.metadata?.leadId || '';
  const packId = session.metadata?.packId || '';
  const planId = session.metadata?.plan || 'voice_monthly';
  const billingAccountId = session.metadata?.billingAccountId || '';

  let acc = billingAccountId ? getBillingAccount(billingAccountId) : null;
  if (!acc && agentId) acc = getBillingByAgent(agentId);
  if (!acc) {
    acc = ensureBillingAccount({
      agentId: agentId || null,
      leadId: leadId || null,
      email,
      businessName: session.customer_details?.name || '',
    });
  }

  const stripeCustomerId = String(session.customer || '');
  if (stripeCustomerId) {
    updateBillingAccount(acc.id, { stripeCustomerId, email: email || acc.email });
    acc = getBillingAccount(acc.id);
  }

  if (kind === 'voice_pack') {
    const pack = TOPUP_PACKS[packId] || TOPUP_PACKS.starter;
    creditPrepaidTurns(acc.id, pack.turns, {
      amountCents: session.amount_total || pack.amount,
      stripeSessionId: session.id,
      packId: packId || 'starter',
    });
    if (email) {
      await sendEmail(
        email,
        `+${pack.turns} Meridian voice turns ready`,
        `Your pay-as-you-go top-up is live.\n\n` +
          `Turns added: ${pack.turns}\n` +
          `Use them on your Meridian Voice agent (hosted neural speech).\n` +
          `Billing account: ${acc.id}\n\n` +
          `Meridian only bills what you use — top up again anytime:\n` +
          `${BASE}/checkout/voice-pack/starter\n\n${BASE}`,
      );
    }
    await dispatchWebhook('billing.voice_pack', {
      accountId: acc.id,
      agentId: acc.agentId,
      turns: pack.turns,
      amount: session.amount_total,
    }).catch(() => {});
    return { account: getBillingAccount(acc.id), kind: 'voice_pack' };
  }

  if (kind === 'voice_sub') {
    const plan = SUBSCRIPTION_PLANS[planId] ? planId : 'voice_monthly';
    activateSubscription(acc.id, plan, {
      amountCents: session.amount_total || SUBSCRIPTION_PLANS[plan].amount,
      stripeCustomerId,
      stripeSubscriptionId: String(session.subscription || ''),
    });
    if (email) {
      const p = SUBSCRIPTION_PLANS[plan];
      await sendEmail(
        email,
        'Meridian Voice Premium is active',
        `Subscription active: ${p.name}\n` +
          `Included turns this month: ${p.includedTurns}\n` +
          `Overage: $${((p.overageCents || customerCentsPerTurn()) / 100).toFixed(2)} per turn (billed as you go)\n\n` +
          `Your margin-safe usage meter is live — you only pay for what the agent speaks.\n\n${BASE}`,
      );
    }
    await dispatchWebhook('billing.voice_sub', {
      accountId: acc.id,
      agentId: acc.agentId,
      plan,
    }).catch(() => {});
    return { account: getBillingAccount(acc.id), kind: 'voice_sub' };
  }

  return null;
}

/** Shared: paid checkout → auto money approval → intake email. */
async function handlePaidCheckout(session) {
  const email = (session.customer_details?.email || session.customer_email || '').toLowerCase();
  const leadId = session.metadata?.leadId || '';
  const productKey = session.metadata?.product || '';
  let lead = leadId ? getLead(leadId) : null;
  if (!lead && email) {
    const need =
      productKey === 'stack' || productKey === 'auto' || productKey === 'auto_stack'
        ? 'full'
        : productKey === 'auto_voice'
          ? 'voice'
          : productKey || 'full';
    lead =
      listLeads().find((l) => l.email === email) ||
      upsertLead({
        email,
        businessName: session.customer_details?.name || '',
        primaryNeed: need,
        consent: true,
        source: isFullAutoProduct(productKey) ? 'stripe_full_auto' : 'stripe_checkout',
        stage: 'new',
      });
  }
  if (!lead) return null;
  if (!lead.proposal) runAgentOnLead(lead.id);

  // ── FULL AUTO INSTALL (paid DFY) ──────────────────────────────────────────
  if (isFullAutoProduct(productKey) || session.metadata?.fullAuto === '1') {
    try {
      return await runFullAutoInstall(session, lead);
    } catch (e) {
      console.error('[full-auto]', e.message);
      // fall through to standard path with note
      setStage(lead.id, 'money_approved', {
        moneyStatus: 'approved',
        fullAutoInstallError: e.message,
        stripeSessionId: session.id,
        amountPaid: session.amount_total,
      });
    }
  }

  setStage(lead.id, 'money_approved', {
    moneyStatus: 'approved',
    moneyApprovedAt: new Date().toISOString(),
    moneyNote: `stripe_paid:${session.id}`,
    stripeSessionId: session.id,
    amountPaid: session.amount_total,
  });
  const fresh = getLead(lead.id);
  const intakeUrl = `${BASE}/intake/${fresh.intakeToken}`;
  await dispatchWebhook('onboard.money_approved', {
    leadId: lead.id,
    email: fresh.email,
    via: 'stripe',
    amount: session.amount_total,
    intakeUrl,
  }).catch(() => {});

  // SEAMLESS PATH: details already collected on the guide-agent "call" →
  // auto-provision + verify + deliver NOW. Client goes from payment straight
  // to a live, tested agent — no forms.
  if (fresh.chatIntake && (fresh.chatIntake.hours || fresh.chatIntake.services) && !fresh.agentConnection) {
    try {
      const intakeResult = submitIntake(fresh.intakeToken, fresh.chatIntake);
      if (intakeResult.ok) {
        const delivery = await finalizeDelivery({
          lead: intakeResult.lead,
          connection: intakeResult.connection,
          baseUrl: BASE,
        });
        if (fresh.email) {
          const c = intakeResult.connection;
          await sendEmail(
            fresh.email,
            delivery.ok ? 'Your Meridian agent is LIVE — connect guide inside' : 'Payment received — agent provisioning needs attention',
            `Payment confirmed — and your agent is already built from the details you gave on chat.\n\n` +
              `Agent ID: ${c.id}\nAPI Key (save once): ${c.apiKey}\n\n` +
              `Setup wizard (Next through each block):\n${BASE}/setup/${delivery.deliveryToken}\n\n` +
              `Connect guide:\n${delivery.guideUrl}\n\n` +
              `Want us to do almost everything? Upgrade path was Full Auto Install at checkout.\n\n` +
              `Verified: ${delivery.ok ? 'YES — smoke tests passed' : 'pending — Meridian ops will follow up'}\n\nMeridian Agency\n${BASE}`,
          );
        }
        return {
          lead: getLead(lead.id),
          guideUrl: delivery.guideUrl,
          setupWizardUrl: `${BASE}/setup/${delivery.deliveryToken}`,
          autoProvisioned: true,
        };
      }
    } catch (e) {
      console.error('[auto-provision]', e.message);
    }
  }

  if (fresh.email) {
    await sendEmail(
      fresh.email,
      'Payment received — finish your Meridian setup (5 minutes)',
      `Thanks — payment confirmed.\n\nComplete this short intake and your agent goes live TODAY, smoke-tested and verified:\n${intakeUrl}\n\nYou'll get a connect guide with your API key, a one-line website widget, and phone-AI configs.\n\nPrefer hands-off next time? Full Auto Install: ${BASE}/checkout/auto\n\nMeridian Agency\n${BASE}`,
    );
  }
  return { lead: fresh, guideUrl: null, autoProvisioned: false };
}

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

function timingSafeStrEqual(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
function admin(req) {
  const token = process.env.OPS_TOKEN || process.env.ARTICLES_API_TOKEN || '';
  if (!token) return false;
  const auth = req.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const h = req.get('X-Meridian-Token') || '';
  return timingSafeStrEqual(bearer, token) || timingSafeStrEqual(h, token);
}

async function sendEmail(to, subject, text, html) {
  if (!process.env.RESEND_API_KEY || !to) return false;
  const from = process.env.EMAIL_FROM || 'Meridian <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

app.get('/health', (_req, res) => {
  const plat = platformStatus();
  res.json({
    status: plat.status === 'operational' ? 'online' : plat.status,
    product: 'meridian',
    uptime: process.uptime(),
    voice: voiceStatus(),
    brain: brainStatus(),
    claudeAgent: claudeAgentStatus(),
    openclaw: containmentStatus(),
    notify: notifyConfig(),
    platform: plat,
    ...funnelStats(),
  });
});

/** Public status JSON — safe for customers & status pages */
app.get(['/api/status', '/status.json'], (_req, res) => {
  res.json(platformStatus());
});

/** Public: OpenClaw is caged — no banks, inboxes, files, account logins */
app.get('/api/openclaw/containment', (_req, res) => {
  res.json({ ok: true, ...buildContainmentReport(), expertGate: expertGateStatus() });
});

/** Public: expert training gate status — every agent must load MD every task */
app.get('/api/openclaw/experts', (_req, res) => {
  res.json({ ok: true, ...expertGateStatus() });
});

/** Ops: run a named Meridian OpenClaw agent (expert-gated) */
app.post('/api/ops/openclaw/run', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const agentId = String(req.body?.agentId || req.body?.agent || '').toLowerCase();
  const allowed = new Set([
    'daily-ops',
    'deploy-agent',
    'install-pack',
    'health-probe',
    'sales-pipeline',
    'usage-report',
    'knowledge-refresh',
    'content-articles',
  ]);
  if (!allowed.has(agentId)) {
    return res.status(400).json({ error: 'Unknown agentId', allowed: [...allowed] });
  }
  try {
    if (agentId === 'daily-ops') {
      return res.json(await runOpenClaw());
    }
    if (agentId === 'deploy-agent') {
      return res.json(await runOpenClawDeploy({ max: Number(req.body?.max) || 10 }));
    }
    if (agentId === 'install-pack') {
      return res.json(await processInstallQueue({ sendEmail, max: Number(req.body?.max) || 10 }));
    }
    if (agentId === 'content-articles') {
      // force=true → full cycle now; else interval-aware scheduled cycle
      if (req.body?.force === true || req.body?.cycle === true) {
        return res.json(
          await runOpenClawArticles({
            topic: req.body?.topic,
            autoPublish: req.body?.autoPublish === true,
          }),
        );
      }
      return res.json(await runOpenClawArticlesScheduled());
    }
    if (agentId === 'health-probe') {
      const out = await withExpertAndContainment(
        'health-probe',
        'openclaw.health',
        async (ctx) => {
          const report = await probeAllAgents({ max: Number(req.body?.max) || 12 });
          return { ...report, expert: { path: ctx.expert.expertPath, hash: ctx.expert.expertHash } };
        },
        { taskBrief: 'Synthetic health probes for Meridian agents.' },
      );
      return res.json(out.result || out);
    }
    if (agentId === 'knowledge-refresh') {
      const out = await withExpertAndContainment(
        'knowledge-refresh',
        'openclaw.knowledge_refresh',
        async (ctx) => {
          const report = await runWeeklyKnowledgeRefresh({
            force: req.body?.force === true,
            notify: req.body?.notify !== false,
          });
          return { ...report, expert: { path: ctx.expert.expertPath, hash: ctx.expert.expertHash } };
        },
        { taskBrief: 'Knowledge self-update drafts for human approve' },
      );
      return res.json(out.result || out);
    }
    // sales-pipeline / usage-report: expert load + status stamp only (safe)
    const out = await withExpertAndContainment(
      agentId,
      `openclaw.${agentId}`,
      async (ctx) => ({
        ok: true,
        note: 'Expert loaded; specialized task handlers use this gate from their modules.',
        expert: { path: ctx.expert.expertPath, hash: ctx.expert.expertHash, runId: ctx.runId },
        containment: containmentStatus(),
      }),
      { taskBrief: req.body?.taskBrief || `Run ${agentId}` },
    );
    res.json(out.result || out);
  } catch (e) {
    res.status(e.code === 'OPENCLAW_CONTAINMENT' || e.code === 'OPENCLAW_EXPERT_MISSING' ? 403 : 500).json({
      ok: false,
      error: e.message,
      code: e.code,
    });
  }
});

/** Public: is Claude Agent API wired? */
app.get('/api/brain/status', (_req, res) => {
  res.json({ ok: true, ...brainStatus(), claude: claudeAgentStatus() });
});

/** Ops: Claude token usage totals */
app.get('/api/ops/claude/usage', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ ok: true, claude: claudeAgentStatus(), usage: claudeUsageSummary() });
});

/**
 * One URL for Claude Code / any agent: full Meridian context, always live.
 * Markdown:  GET /for-claude  (also /for-claude.md)
 * JSON:      GET /api/handoff
 */
app.get(['/for-claude', '/for-claude.md', '/claude-handoff'], (_req, res) => {
  const px = pricingSnapshot();
  const vs = voiceStatus();
  const md = `# Meridian Agency — Claude Code handoff (live)

**Use this URL as source of truth.** Paste into Claude Code:
> Load https://meridian-production-2eb0.up.railway.app/for-claude and work on Meridian in C:\\\\Users\\\\hunte\\\\github-clones\\\\meridian

Generated: ${new Date().toISOString()}  
Public base: ${BASE}

## Live product

| | URL |
|--|-----|
| **Home (open this)** | ${BASE}/ |
| Why agents | ${BASE}/why-agents |
| Ops UI | ${BASE}/ops |
| Health | ${BASE}/health |
| This handoff | ${BASE}/for-claude |
| Handoff JSON | ${BASE}/api/handoff |
| Voice pricing | ${BASE}/api/pricing/voice |

## Identity

- **Product:** Meridian Agency — Voice · Sales · Booking agents for local business
- **Not** ClaudeCraft, SaberClaw, or AgentBridge (independent brand + billing)
- **Repo (Windows):** \`C:\\\\Users\\\\hunte\\\\github-clones\\\\meridian\`
- **Same Claude Code project:** open Claude from that folder · memory \`C:\\\\Users\\\\hunte\\\\.claude\\\\projects\\\\C--Users-hunte-github-clones-meridian\\\\memory\\\\\`
- **Pull in Claude Code:** \`pull meridian\` or \`/pull-last-session meridian\`
- **Deploy:** Railway project \`meridian\` · volume \`/data\` · keep online 24/7
- **GitHub org:** agentbridgehq-oss

## Deploy command

\`\`\`powershell
cd C:\\\\Users\\\\hunte\\\\github-clones\\\\meridian
railway up --detach -m "update"
\`\`\`

## Claude Agent API (brain)

- Status: **${claudeConfigured() ? 'LIVE' : 'OFF — set ANTHROPIC_API_KEY'}**
- Model: ${brainStatus().model || 'n/a'}
- Public status: ${BASE}/api/brain/status
- Client turn: \`POST /api/v1/agents/:id/agent\` (alias \`/claude\`) with Bearer mdn_…
- Chat: \`POST /api/v1/agents/:id/chat\` · Voice brain: \`POST .../voice-turn\`
- Ops usage: \`GET /api/ops/claude/usage\` + OPS_TOKEN
- Env: \`ANTHROPIC_API_KEY\`, optional \`MERIDIAN_LLM_MODEL\`

## Contained OpenClaw (hard cage)

- Policy: ${BASE}/api/openclaw/containment · docs \`openclaw/CONTAINMENT.md\`
- **NEVER:** Ken/customer banks, email inboxes, personal files, account logins, money movement, --deliver
- **ONLY:** Meridian data dir, agent provision, install packs (widget/API/n8n/phone configs), transactional product email, draft outreach (human approve)

## Voice & billing (current server)

- Voice mode: **${vs.mode}**
- xAI TTS configured: **${xaiTtsConfigured()}**
- Metered premium audio: request \`{ "audio": true }\` on speak / voice-turn
- Empty balance → HTTP **402** (no unpaid TTS)
- Customer ~$${px.customerUsdPerTurn}/turn · cost est ~$${px.costUsdPerTurnEst} · margin ~$${px.marginUsdPerTurn}/turn
- Packs: ${BASE}/checkout/voice-pack/starter | growth | scale
- Subs: ${BASE}/checkout/voice-sub ($197/mo) · ${BASE}/checkout/voice-pro ($497/mo)
- Full docs in repo: \`USAGE-BILLING.md\`

## Agents

1. Voice — 24/7 receptionist  
2. Sales — lead follow-up  
3. Booking — calendar / no-shows  
Install order: Booking → Sales → Voice. Kits: /checkout/voice|sales|booking|stack

## Customer install guide (seamless)

Full API + webhook + widget + phone onboarding: ${BASE}/install  
**Interactive wizard (Next blocks):** ${BASE}/setup  
With delivery token: ${BASE}/setup/&lt;token&gt;  
OpenClaw autonomous install from wizard step 7 · n8n workflow download included

## Policies for the coding agent

1. Do not invent URLs or claim the site is offline without checking ${BASE}/health  
2. No fake social proof; no patent claims  
3. CASL / no spam  
4. Confirm before destructive Railway/git/billing  
5. Hero title: premium refined scale (not giant billboard) — see \`public/index.html\`  
6. Permanent memory files on disk: \`C:\\\\Users\\\\hunte\\\\AGENT_HANDOFF_GROK_CLAUDE.md\`, \`C:\\\\Users\\\\hunte\\\\.grok\\\\memory\\\\ALL_APPS_URLS_AGENTS_OPS.md\`

## Stripe / env names (no secrets)

\`STRIPE_SECRET_KEY\`, \`XAI_API_KEY\`, \`RESEND_API_KEY\`, \`OPS_TOKEN\`, \`PUBLIC_BASE_URL\`, \`DATA_DIR\`, \`VOICE_CENTS_PER_TURN\`, \`VOICE_PROVIDER\`

## Other Ken live apps

- Central Command: https://ultra-command-center-production.up.railway.app/
- ClaudeCraft: https://claudecraft.ca/
- AgentBridge: https://agentbridge-final-production.up.railway.app/
- SaberClaw: https://saberclaw-production.up.railway.app/
- GiantBiteAI: https://giantbiteai-production.up.railway.app/
`;
  res.type('text/markdown; charset=utf-8').send(md);
});

app.get('/api/handoff', (_req, res) => {
  const vs = voiceStatus();
  const px = pricingSnapshot();
  res.json({
    ok: true,
    product: 'meridian',
    brand: 'Meridian Agency',
    not: ['ClaudeCraft', 'SaberClaw', 'AgentBridge'],
    live: {
      home: `${BASE}/`,
      forClaude: `${BASE}/for-claude`,
      health: `${BASE}/health`,
      whyAgents: `${BASE}/why-agents`,
      ops: `${BASE}/ops`,
      pricingVoice: `${BASE}/api/pricing/voice`,
    },
    localPath: 'C:\\Users\\hunte\\github-clones\\meridian',
    claudeCodeProject: {
      cwd: 'C:\\Users\\hunte\\github-clones\\meridian',
      memory: 'C:\\Users\\hunte\\.claude\\projects\\C--Users-hunte-github-clones-meridian\\memory\\',
      pull: 'pull meridian | /pull-last-session meridian',
      desktop: 'OPEN-MERIDIAN-CLAUDE.bat',
    },
    deploy: 'cd C:\\Users\\hunte\\github-clones\\meridian; railway up --detach',
    railway: { project: 'meridian', dataDir: '/data', alwaysOn: true },
    voice: vs,
    claudeAgent: claudeAgentStatus(),
    brain: brainStatus(),
    billing: {
      model: 'pay_as_you_go_and_subscription',
      pricing: px,
      packs: Object.keys(TOPUP_PACKS),
      subscriptions: Object.keys(SUBSCRIPTION_PLANS),
    },
    policies: [
      'no_fake_social_proof',
      'no_patent_claims',
      'casl_no_spam',
      'confirm_before_destructive',
      'keep_railway_meridian',
    ],
    handoffFiles: [
      'C:\\Users\\hunte\\AGENT_HANDOFF_GROK_CLAUDE.md',
      'C:\\Users\\hunte\\.grok\\memory\\ALL_APPS_URLS_AGENTS_OPS.md',
      `${BASE}/for-claude`,
    ],
    promptForClaude:
      'Load https://meridian-production-2eb0.up.railway.app/for-claude as source of truth. Work in C:\\Users\\hunte\\github-clones\\meridian. Keep Railway live.',
    generatedAt: new Date().toISOString(),
  });
});

/** Public AI guide chat (site assistant — no API key). Stateful concierge:
 *  client echoes back `state` each turn; can create real leads with consent.
 *  Freeform: web search + xAI (preferred) or Claude; funnel steps stay deterministic. */
app.post('/api/guide-chat', chatLimiter, async (req, res) => {
  const message = String(req.body?.message || '').slice(0, 2000);
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-16) : [];
  const state = req.body?.state && typeof req.body.state === 'object' ? req.body.state : {};
  const forceSearch = req.body?.webSearch === true || req.body?.search === true;
  try {
    const base = guideChat(message, history, state);
    // Funnel / action turns: keep deterministic pipeline
    const step = base?.state?.step || state?.step || 'discover';
    const funnelSteps = new Set([
      'need',
      'business',
      'niche',
      'hours',
      'services',
      'email',
      'consent',
      'proposal',
      'checkout',
      'intake',
      'connect',
    ]);
    const inFunnel = funnelSteps.has(step) || (base.actions && base.actions.length && step !== 'discover');
    const freeform =
      !inFunnel &&
      message.length > 2 &&
      (step === 'discover' || step === 'done' || step === 'faq' || !step);

    let searchMeta = null;
    let searchContext = '';
    if (freeform && (forceSearch || wantsWebSearch(message) || req.body?.mode === 'research')) {
      try {
        const s = await webSearch(message, { max: 5 });
        searchMeta = { provider: s.provider, ok: s.ok, n: (s.results || []).length };
        searchContext = formatSearchForPrompt(s);
      } catch (e) {
        searchMeta = { ok: false, error: e.message };
      }
    }

    if (freeform && req.body?.llm !== false) {
      // Prefer xAI Grok for public guide quality when key present
      if (xaiGuideConfigured()) {
        const xai = await callXaiGuide({
          message,
          history,
          searchContext,
          systemExtra: 'Offer Deploy Agent when they want install. Point to Try Voice demo on homepage for xAI speech samples.',
        });
        if (xai.ok && xai.reply) {
          return res.json({
            ...base,
            reply: xai.reply,
            brain: { source: 'llm', provider: 'xai', model: xai.model },
            webSearch: searchMeta,
            features: ['chat', 'web_search', 'deploy', 'voice_demo'],
          });
        }
      }
      if (claudeConfigured()) {
        const claude = await callClaudeGuide({
          message,
          history,
          systemExtra: searchContext ? `Web notes:\n${searchContext}` : '',
        });
        if (claude.ok && claude.reply) {
          return res.json({
            ...base,
            reply: claude.reply,
            brain: { source: 'llm', provider: 'anthropic', model: claude.model },
            webSearch: searchMeta,
          });
        }
      }
    }

    // Script reply; append search notes if we have them and no LLM
    let reply = base.reply;
    if (searchContext && freeform && searchMeta?.ok) {
      reply = `${reply}\n\n— From the web —\n${(searchContext || '').slice(0, 900)}`;
    }
    res.json({
      ...base,
      reply,
      brain: { source: 'guide_script', provider: 'meridian' },
      webSearch: searchMeta,
      features: ['chat', 'web_search', 'deploy', 'voice_demo'],
      llm: { xai: xaiGuideConfigured(), claude: claudeConfigured() },
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'guide chat failed' });
  }
});

/** Public status for site guide + voice demo UI */
app.get('/api/guide-status', (_req, res) => {
  res.json({
    ok: true,
    guide: {
      xaiChat: xaiGuideConfigured(),
      claude: claudeConfigured(),
      webSearch: Boolean(process.env.BRAVE_API_KEY || process.env.SERPER_API_KEY) || true,
    },
    voice: {
      xaiTts: xaiTtsConfigured(),
      preview: '/api/voice/preview',
      voices: '/api/voice/voices',
    },
    deploy: {
      checkoutVoice: `${BASE}/checkout/voice`,
      checkoutSales: `${BASE}/checkout/sales`,
      checkoutBooking: `${BASE}/checkout/booking`,
      checkoutStack: `${BASE}/checkout/stack`,
      setup: `${BASE}/setup`,
    },
  });
});

// ── Voice pipeline (platform-first; full xAI picker) ─────────────────────────
const previewHits = new Map(); // ip → timestamps
function previewRateOk(ip) {
  const now = Date.now();
  const hits = (previewHits.get(ip) || []).filter((t) => now - t < 60_000);
  if (hits.length >= 12) return false; // 12 free previews / min / IP
  hits.push(now);
  previewHits.set(ip, hits);
  if (previewHits.size > 5000) previewHits.clear();
  return true;
}

app.get('/api/voice/status', (_req, res) => {
  res.json(voiceStatus());
});

/** Public catalog for customer voice picker (no secret key required). */
app.get('/api/voice/voices', async (_req, res) => {
  try {
    res.json(await getVoiceCatalog());
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * Free short sample for the picker — NOT billed to customer packs.
 * Prefers xAI when XAI_API_KEY set; otherwise demo TTS so Play never hard-fails.
 * Rate-limited.
 */
app.post('/api/voice/preview', async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (!previewRateOk(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many previews — wait a minute and try again.' });
  }
  const voiceId = String(req.body?.voiceId || req.body?.voice_id || 'ara').slice(0, 64);
  const text = String(req.body?.text || '').slice(0, 480);
  try {
    const result = await previewVoice(voiceId, text);
    if (!result.ok) return res.status(503).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * Premium voice agent studio:
 *  - script: multi-turn example call for their business
 *  - line: TTS one script line (premium xAI when configured)
 *  - turn: live customer line → brain + neural voice
 */
app.post('/api/voice/preview-agent', async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (!previewRateOk(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many demos — wait a minute and try again.' });
  }
  const action = String(req.body?.action || 'script').toLowerCase().slice(0, 24);
  const businessName = String(req.body?.businessName || req.body?.business || '').slice(0, 80);
  const description = String(req.body?.description || req.body?.services || '').slice(0, 400);
  const voiceId = String(req.body?.voiceId || req.body?.voice_id || 'ara').slice(0, 64);

  try {
    if (action === 'script') {
      const lines = buildPreviewCallScript(businessName, description);
      return res.json({
        ok: true,
        businessName: businessName || 'your business',
        description: description || '',
        voiceId,
        premium: xaiTtsConfigured(),
        lines,
        pitch:
          'Hear how Meridian Voice handles a real inbound call. Then try a live test line as the customer.',
        cta: {
          voice: '/checkout/voice',
          sales: '/checkout/sales',
          stack: '/checkout/stack',
        },
      });
    }

    if (action === 'line') {
      const text = String(req.body?.text || '').slice(0, 480);
      const result = await previewVoice(voiceId, text);
      if (!result.ok) return res.status(503).json(result);
      return res.json(result);
    }

    if (action === 'turn') {
      const result = await runPreviewAgentTurn({
        businessName,
        description,
        message: req.body?.message || req.body?.text,
        history: req.body?.history,
        voiceId,
        wantAudio: req.body?.audio !== false,
      });
      if (!result.ok) return res.status(400).json(result);
      return res.json(result);
    }

    return res.status(400).json({ ok: false, error: 'action must be script | line | turn' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'preview-agent failed' });
  }
});

app.post('/api/voice/tts', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const text = String(req.body?.text || '').slice(0, 2500);
  const result = await textToSpeech(text, { voiceId: req.body?.voiceId });
  if (!result.ok) return res.status(400).json(result);
  // Platform mode: no audio file — return JSON instructions
  if (result.skipped || result.mode === 'platform') {
    return res.json(result);
  }
  if (req.query.format === 'json' || req.body?.format === 'base64') {
    return res.json({
      ok: true,
      mode: result.mode,
      contentType: result.contentType,
      audioBase64: result.audioBuffer.toString('base64'),
      voiceId: result.voiceId,
    });
  }
  res.set('Content-Type', result.contentType || 'audio/mpeg');
  res.send(result.audioBuffer);
});

app.get('/api/v1/agents/:id/voice-spec', (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  res.json(buildVoiceInstallSpec(agent, BASE));
});

/** Catalog + currently selected voice for this agent. */
app.get('/api/v1/agents/:id/voices', async (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const catalog = await getVoiceCatalog();
  res.json({
    ...catalog,
    selectedVoiceId: resolveAgentVoiceId(agent),
    agentId: agent.id,
  });
});

/**
 * Save preferred xAI voice for this agent.
 * Body: { "voiceId": "carina" } or { "xaiVoiceId": "luna" }
 */
function handleSetAgentVoice(req, res) {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const voiceId = req.body?.voiceId || req.body?.xaiVoiceId || req.body?.voice_id;
  const result = setAgentVoice(agent.id, voiceId);
  if (!result.ok) return res.status(400).json(result);
  dispatchWebhook('agent.voice_selected', {
    agentId: agent.id,
    xaiVoiceId: result.xaiVoiceId,
  }).catch(() => {});
  res.json(result);
}
app.put('/api/v1/agents/:id/voice', handleSetAgentVoice);
app.post('/api/v1/agents/:id/voice', handleSetAgentVoice);

/**
 * Speak text:
 * - default / platform: { say } for Retell/Vapi (no Meridian TTS fee)
 * - audio=true or provider xai: hosted neural TTS — **metered** (pay-as-you-go or sub)
 */
app.post('/api/v1/agents/:id/speak', async (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const text = String(req.body?.text || req.body?.message || '').slice(0, 2500);
  if (!text) return res.status(400).json({ error: 'text required' });
  const platform = buildPlatformPayload(agent, text, BASE);
  // Hosted audio only when explicitly requested (never surprise-bill)
  const wantHosted =
    req.body?.audio === true ||
    req.body?.provider === 'xai' ||
    req.body?.hosted === true ||
    req.query.audio === '1';

  // Text-only platform path — free at Meridian layer
  if (!wantHosted) {
    await dispatchWebhook('agent.voice_speak', {
      agentId: agent.id,
      mode: 'platform',
      textLength: text.length,
      billed: false,
    }).catch(() => {});
    return res.json({
      ok: true,
      agentId: agent.id,
      mode: 'platform',
      say: text,
      speak: text,
      audioBase64: null,
      billed: false,
      platform,
      message:
        'Platform TTS — speak `say` in Retell/Vapi. For Meridian-hosted audio, pass { "audio": true } (requires prepaid turns or subscription).',
    });
  }

  // Hosted premium: reserve customer funds FIRST → xAI → commit/refund
  const metered = await runMeteredHostedTts(agent, text, {
    voiceId: req.body?.voiceId || req.body?.voice_id,
  });
  if (!metered.ok) {
    return res.status(metered.status || 402).json({
      ...metered.body,
      platform,
    });
  }

  const { result, settled } = metered;

  await dispatchWebhook('agent.voice_speak', {
    agentId: agent.id,
    mode: result.mode,
    textLength: text.length,
    billed: true,
    revenueCents: settled.revenueCents,
    cashFirst: true,
  }).catch(() => {});

  return res.json({
    ok: true,
    agentId: agent.id,
    mode: result.mode,
    say: text,
    speak: text,
    audioBase64: result.audioBuffer.toString('base64'),
    contentType: result.contentType,
    voiceId: result.voiceId,
    billed: true,
    cashFirst: true,
    billing: {
      mode: settled.mode,
      prepaidLeft: settled.account?.prepaidTurns,
      periodUsed: settled.account?.periodTurnsUsed,
      profitCentsEst: settled.profitCentsEst,
      policy: cashFlowPolicy(),
    },
    platform,
  });
});

/**
 * Full turn: transcript → Meridian brain → reply
 * audio:true → hosted TTS (metered). Default text reply free at Meridian layer.
 */
app.post('/api/v1/agents/:id/voice-turn', async (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const message = String(req.body?.message || req.body?.transcript || '').slice(0, 2000);
  if (!message) return res.status(400).json({ error: 'message or transcript required' });

  const wantAudio = req.body?.audio === true || req.query.audio === '1';
  let settled = null;
  let turn;

  // Cash-first for hosted audio: reserve → brain+TTS only with hold → commit/release
  if (wantAudio && preferredHostedTts() !== 'platform') {
    const pre = assertPremiumBalance(agent);
    if (!pre.ok) return res.status(pre.status || 402).json(pre.body);

    const account = billingForAgent(agent);
    const hold = reserveTurn(account.id, { agentId: agent.id });
    if (!hold.ok) {
      return res.status(402).json({
        ok: false,
        error: 'payment_required',
        reason: hold.reason,
        message: hold.message,
        policy: cashFlowPolicy(),
      });
    }

    turn = await runVoiceTurn(agent, message, {
      baseUrl: BASE,
      wantAudio: true,
      voiceId: req.body?.voiceId || req.body?.voice_id || undefined,
    });
    if (!turn.ok) {
      releaseReservedTurn(account.id, hold);
      return res.status(400).json(turn);
    }
    if (turn.audioBase64) {
      settled = commitReservedTurn(account.id, hold, {
        chars: turn.chars || (turn.reply || '').length,
        provider: turn.mode || preferredHostedTts(),
        agentId: agent.id,
      });
    } else {
      // Brain replied but no audio — refund hold (no xAI spend should have happened)
      releaseReservedTurn(account.id, hold);
    }
  } else {
    turn = await runVoiceTurn(agent, message, {
      baseUrl: BASE,
      wantAudio: false,
      voiceId: req.body?.voiceId || req.body?.voice_id || undefined,
    });
    if (!turn.ok) return res.status(400).json(turn);
  }

  const intent = analyzeIntent(message);
  const ix = logInteraction({
    agentId: agent.id,
    businessName: agent.businessName,
    channel: 'voice',
    message,
    reply: turn.reply,
    brainSource: turn.brainSource || turn.pipeline?.[0] || turn.mode,
    intent,
    meta: { mode: turn.mode, billed: Boolean(settled?.ok && turn.audioBase64) },
  });

  if (intent.emergency || intent.frustrated || intent.wantHuman) {
    notifyOwner(agent, {
      subject: intent.emergency
        ? `🚨 Emergency call · ${agent.businessName}`
        : `Voice transfer signal · ${agent.businessName}`,
      text: `Caller: ${message}\nAgent: ${turn.reply}\nTransfer: ${agent.config?.humanTransfer || 'n/a'}`,
      forceSms: intent.emergency,
    }).catch(() => {});
  }

  await dispatchWebhook('agent.voice_turn', {
    agentId: agent.id,
    businessName: agent.businessName,
    message: message.slice(0, 200),
    reply: (turn.reply || '').slice(0, 200),
    mode: turn.mode,
    intent,
    interactionId: ix.id,
    billed: Boolean(settled?.ok && settled.charged !== false),
  }).catch(() => {});

  res.json({
    ...turn,
    intent,
    transfer:
      intent.transferSuggested || intent.emergency
        ? {
            suggested: true,
            number: agent.config?.humanTransfer || null,
            reason: intent.emergency ? 'emergency' : 'human_or_frustration',
          }
        : null,
    interactionId: ix.id,
    billed: Boolean(settled?.ok && turn.audioBase64),
    billing: settled?.ok && turn.audioBase64
      ? {
          mode: settled.mode,
          prepaidLeft: settled.account?.prepaidTurns,
          periodUsed: settled.account?.periodTurnsUsed,
          profitCentsEst: settled.profitCentsEst,
        }
      : null,
    elevenlabs: elevenlabsConfigured(),
    premiumVoice: xaiTtsConfigured(),
  });
});

/** Customer: view balance / plan for this agent */
app.get('/api/v1/agents/:id/billing', (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const account = billingForAgent(agent);
  const gate = canConsumeTurn(account.id);
  res.json({
    ok: true,
    account: {
      id: account.id,
      prepaidTurns: account.prepaidTurns,
      plan: account.plan,
      subscriptionStatus: account.subscriptionStatus,
      periodKey: account.periodKey,
      periodTurnsUsed: account.periodTurnsUsed,
      periodTurnsIncluded: account.periodTurnsIncluded,
      lifetimeTurns: account.lifetimeTurns,
    },
    canUsePremiumVoice: gate.ok,
    gate: gate.ok ? { mode: gate.mode, remaining: gate.remaining } : { reason: gate.reason, message: gate.message },
    pricing: pricingSnapshot(),
    checkout: {
      packStarter: `${BASE}/checkout/voice-pack/starter?agentId=${agent.id}`,
      packGrowth: `${BASE}/checkout/voice-pack/growth?agentId=${agent.id}`,
      packScale: `${BASE}/checkout/voice-pack/scale?agentId=${agent.id}`,
      sub: `${BASE}/checkout/voice-sub?agentId=${agent.id}`,
      pro: `${BASE}/checkout/voice-pro?agentId=${agent.id}`,
    },
  });
});

// Public funnel
app.post('/api/funnel', publicLimiter, async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  if (!req.body?.consent) {
    return res.status(400).json({ error: 'Consent required' });
  }
  const lead = upsertLead({
    email,
    businessName: req.body.businessName || '',
    niche: req.body.niche || '',
    primaryNeed: req.body.primaryNeed || 'full',
    phone: req.body.phone || '',
    consent: true,
    source: 'website_funnel',
    stage: 'new',
  });
  const result = runAgentOnLead(lead.id);
  // Autonomous path: after proposal, wait on money (human gate)
  setStage(result.lead.id, 'awaiting_money', { moneyStatus: 'pending' });
  const intakeUrl = `${BASE}/intake/${result.lead?.intakeToken}`;
  await dispatchWebhook('lead.captured', {
    leadId: result.lead?.id,
    email,
    stage: 'awaiting_money',
    proposal: result.lead?.proposal,
    intakeUrl,
  });
  if (process.env.RESEND_API_KEY) {
    const p = result.lead?.proposal;
    const text = `Thanks for Meridian interest.\n\n${p?.summary || ''}\nAgents: ${(p?.agents || []).join(', ')}\nSetup ~$${p?.setupUsd} · Monthly ~$${p?.monthlyUsd}\n\nNext: confirm investment (money decision), then complete intake:\n${intakeUrl}\n\nKits: ${BASE}/#agents\n\nReply STOP to unsubscribe.`;
    await sendEmail(email, 'Your Meridian proposal + next steps', text, `<pre style="font-family:system-ui;white-space:pre-wrap">${text}</pre>`);
  }
  res.json({
    ok: true,
    stage: 'awaiting_money',
    moneyStatus: 'pending',
    humanGate: 'money',
    proposal: result.lead?.proposal,
    intakeUrl,
    note: 'Agents provision after money approval + intake. Almost autonomous except money.',
  });
});

app.post('/api/intake/:token', async (req, res) => {
  const result = submitIntake(req.params.token, req.body || {});
  if (!result.ok) return res.status(400).json(result);

  // Must-work verify + customer API/webhook guide
  const delivery = await finalizeDelivery({
    lead: result.lead,
    connection: result.connection,
    baseUrl: BASE,
  });

  await dispatchWebhook('intake.submitted', {
    leadId: result.lead?.id,
    agentId: result.connection?.id,
    verified: delivery.ok,
    guideUrl: delivery.guideUrl,
  });

  if (process.env.RESEND_API_KEY && result.lead?.email) {
    const c = result.connection || {};
    const guide = delivery.guideUrl || `${BASE}/guide`;
    const text = `Meridian agent ${delivery.ok ? 'VERIFIED and ready' : 'provisioned (needs re-check)'}.

Agent ID: ${c.id}
API Key (save once): ${c.apiKey}

Customer connect guide (API + webhooks):
${guide}

Chat:
POST ${BASE}${c.endpoints?.chat}
Authorization: Bearer ${c.apiKey}
{"message":"hours?"}

Voice turn (Retell/Vapi — speak "reply"):
POST ${BASE}${c.endpoints?.voiceTurn}
`;
    await sendEmail(
      result.lead.email,
      delivery.ok ? 'Meridian agent ready — connect guide inside' : 'Meridian agent provisioned — verification needs attention',
      text,
      `<pre>${text}</pre>`,
    );
  }

  res.json({
    ...result,
    verified: delivery.ok,
    mustWork: delivery.mustWork,
    readyToSell: delivery.ok,
    guideUrl: delivery.guideUrl,
    deliveryToken: delivery.deliveryToken,
    verification: delivery.verification,
  });
});

// Ops
app.get('/api/stats', (_req, res) => res.json(funnelStats()));
app.get('/api/leads', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ leads: listLeads() });
});
app.post('/api/leads', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const email = (req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email required' });
  const lead = upsertLead({ ...req.body, email, stage: 'new' });
  res.json(runAgentOnLead(lead.id));
});
app.post('/api/leads/:id/run', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json(runAgentOnLead(req.params.id));
});
app.get('/api/outreach', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ drafts: listOutreachDrafts() });
});
app.get('/api/outreach/status', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { outreachCaslStatus } = await import('./lib/outreach-casl.mjs');
    res.json({ ok: true, ...outreachCaslStatus() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/outreach', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  // Prefer CASL vertical draft when email present
  try {
    const { draftCaslOutreach } = await import('./lib/outreach-casl.mjs');
    if (req.body?.email || req.body?.to) {
      const r = draftCaslOutreach(req.body || {});
      if (!r.ok) return res.status(400).json(r);
      return res.json({ draft: r.draft, casl: true });
    }
  } catch {
    /* fall through */
  }
  res.json({ draft: draftOutreach(req.body || {}) });
});
app.post('/api/outreach/queue/process', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { processOutreachQueue } = await import('./lib/outreach-casl.mjs');
    const { withExpertAndContainment } = await import('./lib/openclaw-expert-gate.mjs');
    const wrapped = await withExpertAndContainment(
      'outreach-casl',
      'api.outreach.queue',
      async () => processOutreachQueue({ max: Number(req.body?.max) || 15 }),
      { taskBrief: 'Process outreach-queue.json into CASL drafts only.' },
    );
    res.json(wrapped.result || wrapped);
  } catch (e) {
    res.status(e.code === 'OPENCLAW_CONTAINMENT' ? 403 : 500).json({
      ok: false,
      error: e.message,
      code: e.code,
    });
  }
});
app.post('/api/outreach/:id/approve', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const d = approveOutreach(req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json({ draft: d, note: 'approved_send=true — still must call send-approved with confirm APPROVED_SEND' });
});
app.post('/api/outreach/approve-batch', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: 'ids[] required' });
  const { approveDrafts } = await import('./lib/outreach-casl.mjs');
  res.json(approveDrafts(ids));
});
app.post('/api/outreach/unsub', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const email = (req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email required' });
  const { addUnsub } = await import('./lib/outreach-casl.mjs');
  addUnsub(email);
  res.json({ ok: true, email, note: 'Will never receive Meridian cold outreach' });
});
/**
 * CASL send gate — does NOT send on OpenClaw daily.
 * Requires: admin + confirm "APPROVED_SEND" + MERIDIAN_OUTREACH_SEND=1 + prior approved_send per draft.
 */
app.post('/api/outreach/send-approved', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { sendApprovedOutreach } = await import('./lib/outreach-casl.mjs');
    const result = await sendApprovedOutreach({
      confirm: req.body?.confirm,
      max: Number(req.body?.max) || 5,
      draftIds: req.body?.draftIds || null,
    });
    if (result.ok && result.results?.length) {
      for (const r of result.results) {
        if (r.emailed) await dispatchWebhook('outreach.sent', { draftId: r.id, to: r.to, emailed: true });
      }
    }
    res.status(result.ok ? 200 : 400).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
app.post('/api/webhooks/test', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json(await dispatchWebhook('meridian.test', { message: req.body?.message || 'test', webhookUrl: req.body?.url }));
});
app.post('/api/openclaw/run', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  // Contained only — body may not request bank/inbox/files
  try {
    const result = await runOpenClaw();
    res.json({ ...result, containment: containmentStatus() });
  } catch (e) {
    if (e.code === 'OPENCLAW_CONTAINMENT') {
      return res.status(403).json({ ok: false, blocked: true, error: e.message, containment: containmentStatus() });
    }
    res.status(500).json({ error: e.message });
  }
});

/** Latest daily brief (ops) */
app.get('/api/ops/brief', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
    const files = fs
      .readdirSync(dataDir)
      .filter((f) => f.startsWith('brief-') && f.endsWith('.md'))
      .sort()
      .reverse();
    if (!files.length) return res.json({ ok: true, brief: null, note: 'No brief yet — run OpenClaw' });
    const name = files[0];
    const text = fs.readFileSync(path.join(dataDir, name), 'utf8');
    res.json({ ok: true, file: name, brief: text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Auto-deploy agents (Claude Code / OpenClaw / Grok / ops) ─────────────────
app.get('/api/ops/deploy/templates', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ templates: listDeployTemplates() });
});

/**
 * POST /api/ops/deploy-agent
 * Header: Authorization: Bearer OPS_TOKEN
 * Body: { email, businessName, primaryNeed|type, hours, services, ... }
 */
app.post('/api/ops/deploy-agent', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const body = req.body || {};
    const result = await deployAgent({
      ...body,
      primaryNeed: body.primaryNeed || body.type || body.agent || 'full',
      source: body.source || 'api',
      baseUrl: body.baseUrl || BASE,
      includeKeyInWebhook: !!body.includeKeyInWebhook,
    });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Process OpenClaw deploy queue (data/deploy-queue.json) */
app.post('/api/ops/deploy-queue', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json(await runOpenClawDeploy({ max: Number(req.body?.max) || 10 }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Autonomous onboard (start → sale).
 * moneyDecision: omit/pending = stop at money gate; "approved"/"skip" continues.
 */
app.post('/api/ops/onboard', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await runOnboardPipeline({
      ...(req.body || {}),
      baseUrl: req.body?.baseUrl || BASE,
      source: req.body?.source || 'ops_onboard',
    });
    res.status(result.ok ? 200 : 400).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Human money decision */
app.post('/api/ops/leads/:id/approve-money', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json(approveMoney(req.params.id, req.body?.note || ''));
});

/** Re-run must-work tests on an agent */
app.post('/api/ops/agents/:id/verify', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const key = req.body?.apiKey || '';
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(400).json({ error: 'Invalid agent or apiKey' });
  res.json(await verifyAgentWorks(agent, key));
});

/** Public customer guide (token-gated) */
app.get('/guide/:token', (req, res) => {
  const pack = getDeliveryByToken(req.params.token);
  if (!pack?.html) return res.status(404).send('Guide not found or expired');
  res.type('html').send(pack.html);
});
app.get('/guide/:token/md', (req, res) => {
  const pack = getDeliveryByToken(req.params.token);
  if (!pack?.md) return res.status(404).send('Not found');
  res.type('text/markdown').send(pack.md);
});

/** Downloadable platform configs + widget snippet, gated by the same delivery token. */
function guideMeta(token) {
  const pack = getDeliveryByToken(token);
  if (!pack?.meta) return null;
  const meta = pack.meta;
  const id = meta.connection?.id || meta.agentId;
  const apiKey = meta.connection?.apiKey || meta.apiKey;
  if (!id) return null;
  let base = meta.base || BASE;
  try {
    if (!meta.base && meta.endpoints?.chat) base = new URL(meta.endpoints.chat).origin;
  } catch { /* keep BASE */ }
  return { pack, id, apiKey, base, businessName: meta.businessName || 'Customer' };
}
function guidePlatforms(token) {
  const g = guideMeta(token);
  if (!g) return null;
  const agent = listAgents().find((a) => a.id === g.id);
  const intake = { businessName: g.businessName, ...(agent?.config || {}) };
  return {
    pack: g.pack,
    configs: platformConfigs({
      connection: { id: g.id, apiKey: g.apiKey, businessName: g.businessName },
      intake,
      base: g.base,
    }),
  };
}
app.get('/guide/:token/retell.json', (req, res) => {
  const g = guidePlatforms(req.params.token);
  if (!g) return res.status(404).json({ error: 'Not found' });
  res.set('Content-Disposition', 'attachment; filename="retell-config.json"');
  res.json(g.configs.retell);
});
app.get('/guide/:token/vapi.json', (req, res) => {
  const g = guidePlatforms(req.params.token);
  if (!g) return res.status(404).json({ error: 'Not found' });
  res.set('Content-Disposition', 'attachment; filename="vapi-config.json"');
  res.json(g.configs.vapi);
});
app.get('/guide/:token/widget.txt', (req, res) => {
  const g = guideMeta(req.params.token);
  if (!g) return res.status(404).send('Not found');
  const widgetToken = ensureWidgetToken(g.id);
  if (!widgetToken) return res.status(404).send('Agent not found');
  res.type('text/plain').send(
    `<script src="${g.base}/widget.js" data-agent="${g.id}" data-token="${widgetToken}" data-name="${g.businessName.replace(/"/g, '')}"></script>`,
  );
});

// ── Website widget (public token — runs on CUSTOMER domains, hence CORS) ─────
const widgetHits = new Map(); // key: agentId:ip → [timestamps]
function widgetRateOk(agentId, ip) {
  const key = `${agentId}:${ip}`;
  const now = Date.now();
  const hits = (widgetHits.get(key) || []).filter((t) => now - t < 60_000);
  if (hits.length >= 20) return false;
  hits.push(now);
  widgetHits.set(key, hits);
  if (widgetHits.size > 5000) widgetHits.clear(); // memory guard
  return true;
}
function widgetCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}
app.options('/api/v1/agents/:id/widget-chat', (_req, res) => {
  widgetCors(res);
  res.status(204).end();
});
app.post('/api/v1/agents/:id/widget-chat', async (req, res) => {
  widgetCors(res);
  const token = String(req.body?.widgetToken || req.get('X-Widget-Token') || '');
  const agent = verifyWidgetToken(req.params.id, token);
  if (!agent) return res.status(401).json({ error: 'Invalid widget token' });
  const ip = req.get('x-forwarded-for')?.split(',')[0]?.trim() || req.ip || 'unknown';
  if (!widgetRateOk(agent.id, ip)) {
    return res.status(429).json({ error: 'Too many messages — please slow down.' });
  }
  const message = String(req.body?.message || '').slice(0, 500);
  if (!message) return res.status(400).json({ error: 'message required' });
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [];
  const turn = await runCustomerTurn(agent, message, {
    channel: 'widget',
    history,
    maxLen: 500,
    blockSpam: true,
  });
  if (!turn.ok) return res.status(400).json(turn);
  res.json({
    reply: turn.reply,
    agentId: agent.id,
    source: turn.source,
    intent: turn.intent
      ? { priority: turn.intent.priority, transferSuggested: turn.intent.transferSuggested }
      : null,
  });
});

// ── Autopilot (autonomous ops cycle) ─────────────────────────────────────────
app.post('/api/ops/autopilot/run', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json({ ok: true, report: await runAutopilot({ sendEmail }) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/ops/autopilot/last', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ ok: true, report: lastAutopilotReport() });
});

// Client agent API (Claude-powered when ANTHROPIC_API_KEY set)
app.get('/api/v1/agents/:id', (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const brain = brainStatus();
  const health = getAgentHealth(agent.id);
  const stats = agentStats(agent.id, { hours: 24 * 7 });
  res.json({
    id: agent.id,
    businessName: agent.businessName,
    status: agent.status,
    config: agent.config,
    health,
    stats,
    endpoints: {
      ...agent.endpoints,
      agent: `/api/v1/agents/${agent.id}/agent`,
      chat: `/api/v1/agents/${agent.id}/chat`,
      voiceTurn: `/api/v1/agents/${agent.id}/voice-turn`,
      speak: `/api/v1/agents/${agent.id}/speak`,
      billing: `/api/v1/agents/${agent.id}/billing`,
      dashboard: `/api/v1/agents/${agent.id}/dashboard`,
      interactions: `/api/v1/agents/${agent.id}/interactions`,
      knowledge: `/api/v1/agents/${agent.id}/knowledge`,
      summary: `/api/v1/agents/${agent.id}/summary`,
      health: `/api/v1/agents/${agent.id}/health`,
    },
    brain: {
      provider: brain.provider,
      model: brain.model,
      mode: brain.mode,
      api: brain.api,
      version: agent.config?.brainVersion || process.env.MERIDIAN_BRAIN_VERSION || 'v2',
    },
    notify: {
      ownerEmail: Boolean(agent.config?.ownerNotifyEmail),
      ownerPhone: Boolean(agent.config?.ownerNotifyPhone),
      platform: notifyConfig(),
    },
  });
});

/** Customer mini-dashboard — stats + recent turns */
app.get('/api/v1/agents/:id/dashboard', (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const summary = buildActivitySummary(agent.id, 25);
  const health = getAgentHealth(agent.id);
  res.json({
    ok: true,
    agentId: agent.id,
    businessName: agent.businessName,
    selectedVoiceId: resolveAgentVoiceId(agent),
    stats: summary.stats,
    health,
    recent: summary.items,
    summaryText: summary.text,
    platform: platformStatus(),
  });
});

app.get('/api/v1/agents/:id/interactions', (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const limit = Math.min(Number(req.query.limit) || 40, 100);
  res.json({
    ok: true,
    agentId: agent.id,
    items: listInteractions(agent.id, limit),
    stats: agentStats(agent.id),
  });
});

/** Update knowledge / truth layer / owner notify contacts */
app.put('/api/v1/agents/:id/knowledge', (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const result = setKnowledge(agent.id, req.body || {});
  if (!result.ok) return res.status(400).json(result);
  dispatchWebhook('agent.knowledge_updated', { agentId: agent.id }).catch(() => {});
  res.json(result);
});
app.post('/api/v1/agents/:id/knowledge', (req, res) => {
  req.url = req.url; // keep path
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const result = setKnowledge(agent.id, req.body || {});
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

/** Fetch website → draft websiteSummary (optional save) */
app.post('/api/v1/agents/:id/knowledge/scrape', async (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const url = req.body?.url || agent.config?.website || agent.config?.websiteUrl || '';
  const scraped = await fetchWebsiteSummary(url);
  if (!scraped.ok) return res.status(400).json(scraped);
  if (req.body?.save === true) {
    setKnowledge(agent.id, { websiteSummary: scraped.summary });
  }
  // Remember website for weekly refresh
  if (url && !agent.config?.website && !agent.config?.websiteUrl) {
    setKnowledge(agent.id, { websiteSummary: req.body?.save ? scraped.summary : agent.config?.websiteSummary });
    const { updateAgentConfig } = await import('./engine.mjs');
    updateAgentConfig(agent.id, { website: url, websiteUrl: url });
  }
  res.json({ ...scraped, saved: req.body?.save === true });
});

/**
 * Self-update: scan website → pending proposals (never auto-applied).
 * Body: { force?: boolean }
 */
app.post('/api/v1/agents/:id/knowledge/refresh', async (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  // Optional: persist website if provided
  if (req.body?.url) {
    const { updateAgentConfig } = await import('./engine.mjs');
    updateAgentConfig(agent.id, {
      website: String(req.body.url).slice(0, 500),
      websiteUrl: String(req.body.url).slice(0, 500),
    });
  }
  try {
    const result = await refreshAgentKnowledge(agent.id, { force: req.body?.force === true });
    res.status(result.ok ? 200 : 400).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** List pending knowledge proposals */
app.get('/api/v1/agents/:id/knowledge/proposals', (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const status = req.query.status || 'pending';
  res.json({
    ok: true,
    agentId: agent.id,
    proposals: listProposals(agent.id, { status, limit: 50 }),
    status: knowledgeRefreshStatus(),
  });
});

/** Approve one proposal → applies to truth layer */
app.post('/api/v1/agents/:id/knowledge/proposals/:pid/approve', (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const result = approveProposal(agent.id, req.params.pid);
  if (!result.ok) return res.status(400).json(result);
  dispatchWebhook('agent.knowledge_approved', {
    agentId: agent.id,
    proposalId: req.params.pid,
  }).catch(() => {});
  res.json(result);
});

app.post('/api/v1/agents/:id/knowledge/proposals/:pid/reject', (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const result = rejectProposal(agent.id, req.params.pid, req.body?.reason);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/v1/agents/:id/knowledge/proposals/approve-all', (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  res.json(approveAll(agent.id));
});

app.post('/api/v1/agents/:id/knowledge/proposals/reject-all', (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  res.json(rejectAll(agent.id));
});

/** Ops: weekly knowledge refresh for all agents with websites */
app.post('/api/ops/knowledge/weekly', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const out = await withExpertAndContainment(
      'knowledge-refresh',
      'openclaw.knowledge_refresh',
      async (ctx) => {
        const report = await runWeeklyKnowledgeRefresh({
          force: req.body?.force === true,
          maxAgents: Number(req.body?.max) || 40,
          notify: req.body?.notify !== false,
        });
        return {
          ...report,
          expert: { path: ctx.expert.expertPath, hash: ctx.expert.expertHash, runId: ctx.runId },
        };
      },
      { taskBrief: 'Weekly knowledge self-update: draft proposals only, human approve.' },
    );
    res.json(out.result || out);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, code: e.code });
  }
});

app.get('/api/ops/knowledge/status', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ ok: true, ...knowledgeRefreshStatus() });
});

/** Send activity summary to owner now */
app.post('/api/v1/agents/:id/summary', async (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const built = buildActivitySummary(agent.id, Number(req.body?.limit) || 10);
  const email = req.body?.email || agent.config?.ownerNotifyEmail;
  if (email) {
    const sent = await sendOwnerEmail({
      to: email,
      subject: `Meridian activity · ${agent.businessName}`,
      text: built.text,
    });
    return res.json({ ok: true, emailed: sent, summary: built.text, stats: built.stats });
  }
  res.json({ ok: true, emailed: { skipped: true }, summary: built.text, stats: built.stats });
});

/**
 * Log end of call + optional customer SMS + owner summary
 * Body: { message?, reply?, phone?, name?, durationSec?, outcome? }
 */
app.post('/api/v1/agents/:id/call-ended', async (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const message = String(req.body?.message || req.body?.transcript || 'Call ended').slice(0, 2000);
  const reply = String(req.body?.reply || req.body?.summary || '').slice(0, 2000);
  const intent = analyzeIntent(message + ' ' + reply);
  const row = logInteraction({
    agentId: agent.id,
    businessName: agent.businessName,
    channel: 'voice',
    message,
    reply: reply || `(call ended · ${req.body?.outcome || 'completed'})`,
    brainSource: 'call_ended',
    intent,
    meta: {
      durationSec: req.body?.durationSec,
      outcome: req.body?.outcome,
      phone: req.body?.phone ? 'set' : null,
    },
  });
  const summary = await sendInteractionSummary(agent, row, {
    customerPhone: req.body?.phone || req.body?.customerPhone,
  });
  res.json({ ok: true, interactionId: row.id, summary });
});

/** Missed-call SMS text-back */
app.post('/api/v1/agents/:id/missed-call', async (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const to = req.body?.phone || req.body?.to;
  if (!to) return res.status(400).json({ error: 'phone required' });
  const sms = await sendMissedCallTextBack(agent, { to, name: req.body?.name });
  logInteraction({
    agentId: agent.id,
    businessName: agent.businessName,
    channel: 'sms',
    message: `missed-call → ${String(to).slice(0, 6)}…`,
    reply: sms.ok ? 'textback_sent' : sms.reason || sms.error || 'failed',
    brainSource: 'missed_call',
    intent: { priority: 'lead', booking: false },
    ok: sms.ok,
  });
  res.status(sms.ok || sms.skipped ? 200 : 502).json({ ok: sms.ok || Boolean(sms.skipped), sms });
});

/** Send arbitrary SMS (owner tooling) — Twilio must be configured */
app.post('/api/v1/agents/:id/sms', async (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const to = req.body?.to || req.body?.phone;
  const body = req.body?.body || req.body?.message;
  if (!to || !body) return res.status(400).json({ error: 'to and body required' });
  const sms = await sendSms({ to, body });
  res.status(sms.ok || sms.skipped ? 200 : 502).json({ ok: sms.ok || Boolean(sms.skipped), sms });
});

/** Synthetic health probe for this agent */
app.post('/api/v1/agents/:id/health', async (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const result = await probeAgent(agent.id, { apiKey: key });
  res.json({ ok: result.ok, probe: result, cached: getAgentHealth(agent.id) });
});
app.get('/api/v1/agents/:id/health', (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ ok: true, health: getAgentHealth(agent.id), platform: platformStatus() });
});

/** Ops: probe all agents */
app.post('/api/ops/health/probe', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json(await probeAllAgents({ max: Number(req.body?.max) || 15 }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Claude Agent API turn — primary surface for deployed client agents.
 * Same auth as chat; richer response (model, usage, source).
 * POST /api/v1/agents/:id/agent
 * POST /api/v1/agents/:id/claude   (alias)
 */
async function handleClaudeAgentTurn(req, res) {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const message = String(req.body?.message || req.body?.transcript || req.body?.input || '').slice(0, 2000);
  if (!message) return res.status(400).json({ error: 'message required' });
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-12) : [];

  const turn = await runCustomerTurn(agent, message, {
    channel: 'api',
    history,
    customerPhone: req.body?.phone || req.body?.customerPhone,
  });
  if (!turn.ok) return res.status(400).json(turn);

  res.json({
    ok: true,
    agentId: agent.id,
    businessName: agent.businessName,
    reply: turn.reply,
    say: turn.reply,
    source: turn.source,
    provider: turn.provider || (turn.source === 'llm' ? 'anthropic' : 'fallback'),
    model: turn.model || null,
    usage: turn.usage || null,
    latencyMs: turn.latencyMs || null,
    llmError: turn.llmError || null,
    intent: turn.intent,
    transfer: turn.transfer,
    interactionId: turn.interactionId,
    claudeConfigured: claudeConfigured(),
    systemPromptPreview: buildSystemPrompt(agent).slice(0, 280) + '…',
  });
}

app.post('/api/v1/agents/:id/agent', handleClaudeAgentTurn);
app.post('/api/v1/agents/:id/claude', handleClaudeAgentTurn);

app.post('/api/v1/agents/:id/chat', authedLimiter, async (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const message = String(req.body?.message || '').slice(0, 2000);
  if (!message) return res.status(400).json({ error: 'message required' });
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [];
  const turn = await runCustomerTurn(agent, message, {
    channel: 'chat',
    history,
    customerPhone: req.body?.phone,
  });
  if (!turn.ok) return res.status(400).json(turn);
  res.json({
    reply: turn.reply,
    agentId: agent.id,
    source: turn.source,
    provider: turn.provider || (turn.source === 'llm' ? 'anthropic' : 'fallback'),
    model: turn.model || null,
    usage: turn.usage || null,
    intent: turn.intent,
    transfer: turn.transfer,
    interactionId: turn.interactionId,
  });
});

app.post('/api/v1/agents/:id/events', async (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });

  // Sales shortcut: lead.created / sales.lead → sales pipeline
  const type = String(req.body?.type || '');
  if (
    type === 'lead.created' ||
    type === 'sales.lead' ||
    type === 'form.submitted' ||
    req.body?.salesLead === true
  ) {
    try {
      const result = await ingestSalesLead(agent, {
        ...(req.body?.payload || {}),
        ...req.body,
        consent: req.body?.consent !== false && req.body?.payload?.consent !== false,
      });
      await dispatchWebhook('sales.lead_ingested', {
        agentId: agent.id,
        leadId: result.leadId,
        score: result.scoring?.score,
      }).catch(() => {});
      return res.json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  await dispatchWebhook(type || 'agent.inbound_event', {
    agentId: agent.id,
    businessName: agent.businessName,
    payload: req.body || {},
  });
  res.json({ ok: true, agentId: agent.id });
});

// ── Sales agent pipeline ────────────────────────────────────────────────────
app.get('/api/sales/status', (_req, res) => {
  res.json({ ok: true, ...salesPipelineStatus() });
});

app.post('/api/v1/agents/:id/sales/lead', async (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  try {
    const result = await ingestSalesLead(agent, req.body || {});
    if (!result.ok) return res.status(400).json(result);
    await dispatchWebhook('sales.lead_ingested', {
      agentId: agent.id,
      leadId: result.leadId,
      score: result.scoring?.score,
      readyToBook: result.scoring?.readyToBook,
    }).catch(() => {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/v1/agents/:id/sales/turn', async (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  try {
    const result = await salesTurn(agent, {
      leadId: req.body?.leadId,
      message: req.body?.message,
      advanceSequence: Boolean(req.body?.advanceSequence),
    });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/v1/agents/:id/sales/leads', (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({
    ok: true,
    leads: listSalesLeads(agent.id, Number(req.query.limit) || 50),
    pipeline: salesPipelineStatus(),
  });
});

app.get('/api/v1/agents/:id/sales/leads/:leadId', (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  const lead = getSalesLead(agent.id, req.params.leadId);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, lead });
});

app.post('/api/v1/agents/:id/sales/score', (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ ok: true, scoring: scoreLead(req.body || {}) });
});

app.get('/api/v1/agents/:id/sales/recipe', (req, res) => {
  const key = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const agent = verifyAgentKey(req.params.id, key);
  if (!agent) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({
    ok: true,
    recipe: buildSalesN8nRecipe({
      agentId: agent.id,
      apiKey: 'mdn_YOUR_KEY',
      base: BASE,
    }),
  });
});

// ── Public pricing (no secrets) ─────────────────────────────────────────────
app.get('/api/pricing/voice', (_req, res) => {
  res.json({
    ok: true,
    model: 'pay_as_you_go',
    customerBilling: 'prepaid_packs_or_included_sub_turns',
    vendorBilling: {
      xai: 'pay_as_you_go_per_tts',
      anthropic: 'pay_as_you_go_per_token',
      groq: 'pay_as_you_go_per_token',
    },
    guarantee:
      'Customer pays Stripe first (pack or monthly included). Meridian reserves a turn, then calls xAI, then commits. TTS failure refunds the hold. Free site previews never use XAI_API_KEY. Postpaid overage off unless VOICE_ALLOW_OVERAGE=1. Claude + Groq + xAI are all usage-based (PAYG) on the vendor side.',
    policy: cashFlowPolicy(),
    pricing: pricingSnapshot(),
    packs: TOPUP_PACKS,
    subscriptions: SUBSCRIPTION_PLANS,
    checkout: {
      packStarter: `${BASE}/checkout/voice-pack/starter`,
      packGrowth: `${BASE}/checkout/voice-pack/growth`,
      packScale: `${BASE}/checkout/voice-pack/scale`,
      voiceSub: `${BASE}/checkout/voice-sub`,
      voicePro: `${BASE}/checkout/voice-pro`,
      kit: `${BASE}/checkout/voice`,
    },
    voice: voiceStatus(),
    defaultPremiumVoice: process.env.XAI_TTS_VOICE || 'ara',
  });
});

// Ops ROI dashboard (your profit, not shared with customers)
app.get('/api/ops/billing/roi', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({
    ok: true,
    ...roiSummary(),
    accounts: listBillingAccounts(),
    recent: listUsage(40),
    vendorPayg: vendorPaygSnapshot(),
  });
});

/** Vendor PAYG spend (xAI + Claude + Groq) — ops only */
app.get('/api/ops/billing/vendor-payg', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ ok: true, ...vendorPaygSnapshot() });
});

app.get('/api/ops/billing/accounts', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ ok: true, accounts: listBillingAccounts() });
});

/** Pay-as-you-go top-up packs — cash first, turns second */
app.get('/checkout/voice-pack/:packId', async (req, res) => {
  const pack = TOPUP_PACKS[req.params.packId];
  if (!pack) return res.status(404).send('Unknown pack. Use starter | growth | scale');
  if (!stripe) {
    return res
      .status(503)
      .send(
        `Stripe not configured. Pack ${pack.name}: $${(pack.amount / 100).toFixed(0)} for ${pack.turns} turns.`,
      );
  }
  try {
    const agentId = String(req.query.agentId || '');
    const leadId = String(req.query.lead || '');
    const email = String(req.query.email || '').toLowerCase();
    let acc = agentId ? getBillingByAgent(agentId) : null;
    if (!acc) {
      acc = ensureBillingAccount({ agentId: agentId || null, leadId: leadId || null, email });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_creation: 'always',
      allow_promotion_codes: true,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: pack.amount,
            product_data: {
              name: pack.name,
              description: `${pack.description} · ~$${(pack.amount / pack.turns / 100).toFixed(2)}/turn · Meridian premium voice`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        brand: 'meridian',
        kind: 'voice_pack',
        packId: req.params.packId,
        agentId,
        leadId,
        billingAccountId: acc.id,
        turns: String(pack.turns),
      },
      success_url: `${BASE}/api/checkout/confirm?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE}/#voice-usage`,
    });
    res.redirect(303, session.url);
  } catch (e) {
    console.error(e);
    res.status(500).send('Checkout error');
  }
});

/** Monthly Voice Premium / Pro — high MRR vs your xAI cost */
app.get('/checkout/voice-sub', async (req, res) => {
  return startVoiceSubscriptionCheckout(req, res, 'voice_monthly');
});
app.get('/checkout/voice-pro', async (req, res) => {
  return startVoiceSubscriptionCheckout(req, res, 'voice_pro');
});

async function startVoiceSubscriptionCheckout(req, res, planId) {
  const plan = SUBSCRIPTION_PLANS[planId];
  if (!plan) return res.status(404).send('Unknown plan');
  if (!stripe) {
    return res
      .status(503)
      .send(
        `Stripe not configured. ${plan.name}: $${(plan.amount / 100).toFixed(0)}/mo · ${plan.includedTurns} turns included.`,
      );
  }
  try {
    const agentId = String(req.query.agentId || '');
    const leadId = String(req.query.lead || '');
    const email = String(req.query.email || '').toLowerCase();
    let acc = agentId ? getBillingByAgent(agentId) : null;
    if (!acc) {
      acc = ensureBillingAccount({ agentId: agentId || null, leadId: leadId || null, email });
    }
    const priceEnv =
      planId === 'voice_pro'
        ? process.env.STRIPE_PRICE_VOICE_PRO
        : process.env.STRIPE_PRICE_VOICE_SUB;
    const lineItem = priceEnv
      ? { price: priceEnv, quantity: 1 }
      : {
          price_data: {
            currency: 'usd',
            unit_amount: plan.amount,
            recurring: { interval: 'month' },
            product_data: {
              name: plan.name,
              description: `${plan.includedTurns} hosted voice turns/mo · overage $${((plan.overageCents || 55) / 100).toFixed(2)}/turn`,
            },
          },
          quantity: 1,
        };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_creation: 'always',
      allow_promotion_codes: true,
      line_items: [lineItem],
      subscription_data: {
        metadata: {
          brand: 'meridian',
          plan: planId,
          billingAccountId: acc.id,
          agentId,
        },
      },
      metadata: {
        brand: 'meridian',
        kind: 'voice_sub',
        plan: planId,
        agentId,
        leadId,
        billingAccountId: acc.id,
      },
      success_url: `${BASE}/api/checkout/confirm?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE}/#voice-usage`,
    });
    res.redirect(303, session.url);
  } catch (e) {
    console.error(e);
    res.status(500).send('Checkout error');
  }
}

// Stripe kit checkout (one-time products) + Full Auto Install
app.get('/checkout/:product', publicLimiter, async (req, res) => {
  // voice-pack and voice-sub handled above
  if (req.params.product === 'voice-pack' || req.params.product === 'voice-sub' || req.params.product === 'voice-pro') {
    return res.status(404).send('Use /checkout/voice-pack/:id or /checkout/voice-sub');
  }
  const product = PRODUCTS[req.params.product];
  if (!product) return res.status(404).send('Unknown product');
  if (!stripe) {
    return res.status(503).send(`Stripe not configured. Set STRIPE_SECRET_KEY. Product: ${product.name} $${(product.amount / 100).toFixed(0)}`);
  }
  try {
    const priceEnv = {
      voice: process.env.STRIPE_PRICE_VOICE,
      sales: process.env.STRIPE_PRICE_SALES,
      booking: process.env.STRIPE_PRICE_BOOKING,
      stack: process.env.STRIPE_PRICE_STACK,
      auto: process.env.STRIPE_PRICE_AUTO,
      auto_voice: process.env.STRIPE_PRICE_AUTO_VOICE,
      auto_stack: process.env.STRIPE_PRICE_AUTO_STACK,
      auto_sales: process.env.STRIPE_PRICE_AUTO_SALES,
    }[req.params.product];
    const lineItem = priceEnv
      ? { price: priceEnv, quantity: 1 }
      : {
          price_data: {
            currency: 'usd',
            unit_amount: product.amount,
            product_data: { name: product.name, description: product.description },
          },
          quantity: 1,
        };

    const fullAuto = Boolean(product.fullAuto);
    const sessionParams = {
      mode: 'payment',
      customer_creation: 'always',
      allow_promotion_codes: true,
      line_items: [lineItem],
      metadata: {
        product: req.params.product,
        brand: 'meridian',
        leadId: String(req.query.lead || ''),
        fullAuto: fullAuto ? '1' : '0',
        primaryNeed: product.primaryNeed || '',
      },
      success_url: `${BASE}/api/checkout/confirm?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: fullAuto ? `${BASE}/#full-auto` : `${BASE}/#agents`,
    };

    // Stripe Checkout allows max 3 custom_fields — keep under limit or checkout crashes
    if (fullAuto) {
      sessionParams.custom_fields = [
        {
          key: 'business_name',
          label: { type: 'custom', custom: 'Business name' },
          type: 'text',
          optional: false,
        },
        {
          key: 'hours',
          label: { type: 'custom', custom: 'Business hours (e.g. Mon-Fri 9-5)' },
          type: 'text',
          optional: false,
        },
        {
          key: 'services',
          label: { type: 'custom', custom: 'Main services + phone (short)' },
          type: 'text',
          optional: false,
        },
      ];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.redirect(303, session.url);
  } catch (e) {
    console.error(e);
    res.status(500).send('Checkout error: ' + (e.message || 'unknown'));
  }
});

/**
 * Checkout success — kits → intake; full auto → setup wizard; voice packs/subs → balance.
 */
app.get('/api/checkout/confirm', async (req, res) => {
  if (!stripe) return res.redirect(302, '/');
  try {
    const session = await stripe.checkout.sessions.retrieve(String(req.query.session_id || ''), {
      expand: ['custom_fields'],
    });
    // Stripe returns custom_fields on session without expand usually
    const paid =
      session?.payment_status === 'paid' ||
      session?.status === 'complete' ||
      (session?.mode === 'subscription' && session?.status === 'complete');
    if (paid || session?.mode === 'subscription') {
      const kind = session.metadata?.kind || '';
      if (kind === 'voice_pack' || kind === 'voice_sub') {
        await handleVoiceBillingCheckout(session);
        return res.redirect(302, `/?voice_billed=1&kind=${encodeURIComponent(kind)}`);
      }
      if (session.payment_status === 'paid') {
        const result = await handlePaidCheckout(session);
        // Full auto → wizard first (minimal work path)
        if (result?.fullAuto && result.setupWizardUrl) {
          return res.redirect(302, result.setupWizardUrl.replace(BASE, '') || '/setup');
        }
        if (result?.autoProvisioned && result.setupWizardUrl) {
          return res.redirect(302, result.setupWizardUrl.replace(BASE, '') || '/setup');
        }
        if (result?.autoProvisioned && result.guideUrl) {
          return res.redirect(302, result.guideUrl.replace(BASE, '') || '/');
        }
        if (result?.lead?.intakeToken) {
          return res.redirect(302, `/intake/${result.lead.intakeToken}?paid=1`);
        }
      }
    }
  } catch (e) {
    console.error('[checkout confirm]', e.message);
  }
  res.redirect(302, '/?purchased=1');
});

// Kit downloads (after purchase would need session — for now open kit files for buyers via email later)
app.get('/kits/:which/:file', (req, res) => {
  const map = {
    voice: 'kits/voice',
    sales: 'kits/sales',
    booking: 'kits/booking',
    stack: 'kits/stack',
  };
  const dir = map[req.params.which];
  if (!dir) return res.status(404).end();
  const file = path.basename(req.params.file);
  const full = path.join(__dirname, dir, file);
  if (!full.startsWith(path.join(__dirname, 'kits')) || !fs.existsSync(full)) return res.status(404).end();
  res.type('text/markdown').send(fs.readFileSync(full, 'utf8'));
});

// SPA-style intake URLs: /intake/:token
app.get('/intake/:token', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'intake.html'));
});
app.get('/ops', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ops.html'));
});
app.get('/why-agents', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'why-agents.html'));
});
/** Agents hub + per-agent detail pages (description · special instructions · checkout) */
app.get('/agents', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'agents.html'));
});
app.get(['/agents/voice', '/agent/voice', '/voice-agent'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'agent-voice.html'));
});
app.get(['/agents/sales', '/agent/sales', '/sales-agent'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'agent-sales.html'));
});
app.get(['/agents/booking', '/agent/booking', '/booking-agent'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'agent-booking.html'));
});
app.get('/article', (_req, res) => {
  res.redirect(302, '/why-agents');
});
/** Comprehensive customer install guide (API · webhooks · widget · phone) */
app.get(['/install', '/install-guide', '/docs', '/connect', '/onboard-guide'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'install-guide.html'));
});
app.get(['/status', '/system-status'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'status.html'));
});
app.get(['/security', '/trust'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'security.html'));
});
app.get(['/dashboard', '/app', '/portal'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get(['/blog', '/insights'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'blog.html'));
});
app.get('/blog/:slug', (req, res) => {
  // Public article shell — content loaded via /api/blog/:slug
  res.sendFile(path.join(__dirname, 'public', 'article.html'));
});

// ── Public blog API ──────────────────────────────────────────────────────────
app.get('/api/blog', (_req, res) => {
  res.json({
    ok: true,
    articles: listPublished(50).map((a) => ({
      slug: a.slug,
      title: a.title,
      subtitle: a.subtitle,
      excerpt: a.excerpt,
      publishedAt: a.publishedAt,
      readingMinutes: a.readingMinutes,
      tags: a.tags,
    })),
  });
});
app.get('/api/blog/:slug', (req, res) => {
  const article = getPublishedArticle(req.params.slug);
  if (!article) return res.status(404).json({ ok: false, error: 'Article not found' });
  res.json({
    ok: true,
    article: {
      slug: article.slug,
      title: article.title,
      subtitle: article.subtitle,
      excerpt: article.excerpt,
      bodyHtml: article.bodyHtml,
      publishedAt: article.publishedAt,
      readingMinutes: article.readingMinutes,
      tags: article.tags,
    },
  });
});

// ── Ops: article pipeline (Claude draft → vet → fix → ready → publish) ───────
app.get('/api/ops/articles', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({
    ok: true,
    status: articlesStatus(),
    articles: listArticles({ limit: 40 }),
  });
});
app.get('/api/ops/articles/status', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ ok: true, ...articlesStatus() });
});
app.post('/api/ops/articles/cycle', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    // Always OpenClaw expert-gated (content-articles.md)
    const result = await runOpenClawArticles({
      topic: req.body?.topic,
      autoPublish: req.body?.autoPublish === true,
    });
    res.json(result);
  } catch (e) {
    res.status(e.code === 'OPENCLAW_EXPERT_MISSING' || e.code === 'OPENCLAW_CONTAINMENT' ? 403 : 500).json({
      ok: false,
      error: e.message,
      code: e.code,
    });
  }
});
app.post('/api/ops/articles/draft', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json(await runOpenClawArticleStep('draft', { topic: req.body?.topic }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, code: e.code });
  }
});
app.post('/api/ops/articles/:id/vet', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json(await runOpenClawArticleStep('vet', { articleId: req.params.id }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, code: e.code });
  }
});
app.post('/api/ops/articles/:id/fix', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json(await runOpenClawArticleStep('fix', { articleId: req.params.id }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, code: e.code });
  }
});
app.post('/api/ops/articles/:id/publish', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    // Publish still expert-gated for audit trail; human must call this for go-live
    const result = await runOpenClawArticleStep('publish', { articleId: req.params.id });
    if (!result.ok && req.body?.force === true) {
      const fallback = publishArticle(req.params.id, { source: 'ops_force' });
      return res.status(fallback.ok ? 200 : 400).json(fallback);
    }
    res.status(result.ok ? 200 : 400).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, code: e.code });
  }
});
app.post('/api/ops/articles/:id/unpublish', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json(unpublishArticle(req.params.id));
});
app.post('/api/ops/articles/:id/reject', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json(rejectArticleFinal(req.params.id, req.body?.reason));
});
app.get('/api/ops/articles/:id', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const a = getArticle(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, article: a });
});

/** Interactive setup wizard — Next-block onboarding */
app.get(['/setup', '/setup-wizard'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'setup.html'));
});
app.get('/setup/:token', (req, res) => {
  if (!/^[a-f0-9]{20,}$/i.test(req.params.token)) {
    return res.redirect(302, '/setup');
  }
  res.sendFile(path.join(__dirname, 'public', 'setup.html'));
});

// ── Setup wizard APIs ───────────────────────────────────────────────────────
app.get('/api/setup/blank', (_req, res) => {
  res.json({
    ...buildSetupContext({}),
    steps: SETUP_STEPS,
    blank: true,
  });
});

app.get('/api/setup/:token', (req, res) => {
  const g = guideMeta(req.params.token);
  if (!g) return res.status(404).json({ error: 'Setup link not found. Use your email guide or /setup' });
  const wt = ensureWidgetToken(g.id);
  const ctx = buildSetupContext({
    agentId: g.id,
    apiKey: g.apiKey,
    businessName: g.businessName,
    base: g.base,
    deliveryToken: req.params.token,
    widgetToken: wt,
  });
  const progress = getProgress(req.params.token);
  res.json({ ...ctx, progress, blank: false });
});

app.post('/api/setup/:token/progress', (req, res) => {
  if (!guideMeta(req.params.token)) return res.status(404).json({ error: 'Not found' });
  const p = saveProgress(req.params.token, {
    step: req.body?.step,
    path: req.body?.path,
    done: req.body?.done,
  });
  res.json({ ok: true, progress: p });
});

/** Voice catalog for setup wizard (token-scoped + selected voice). */
app.get('/api/setup/:token/voices', async (req, res) => {
  const g = guideMeta(req.params.token);
  if (!g) return res.status(404).json({ error: 'Not found' });
  try {
    const catalog = await getVoiceCatalog();
    const agent = getAgent(g.id);
    res.json({
      ...catalog,
      agentId: g.id,
      selectedVoiceId: agent ? resolveAgentVoiceId(agent) : catalog.defaultVoiceId || 'eve',
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Save preferred voice from setup wizard (delivery token auth). */
app.post('/api/setup/:token/voice', (req, res) => {
  const g = guideMeta(req.params.token);
  if (!g) return res.status(404).json({ error: 'Not found' });
  const voiceId = req.body?.voiceId || req.body?.xaiVoiceId || req.body?.voice_id;
  const result = saveAgentVoicePreference(g.id, voiceId);
  if (!result.ok) return res.status(400).json(result);
  dispatchWebhook('agent.voice_selected', {
    agentId: g.id,
    xaiVoiceId: result.xaiVoiceId,
    source: 'setup_wizard',
  }).catch(() => {});
  res.json(result);
});

/** Manual setup path: save voice with mdn_ key. */
app.post('/api/setup/voice', (req, res) => {
  const agentId = String(req.body?.agentId || '');
  const apiKey = String(req.body?.apiKey || '');
  if (!agentId || !verifyAgentKey(agentId, apiKey)) {
    return res.status(401).json({ error: 'Valid agentId + apiKey required' });
  }
  const voiceId = req.body?.voiceId || req.body?.xaiVoiceId || req.body?.voice_id;
  const result = saveAgentVoicePreference(agentId, voiceId);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

/** Save knowledge / owner alerts from setup wizard (delivery token). */
app.post('/api/setup/:token/knowledge', (req, res) => {
  const g = guideMeta(req.params.token);
  if (!g) return res.status(404).json({ error: 'Not found' });
  const result = saveSetupKnowledge(g.id, req.body || {});
  if (!result.ok) return res.status(400).json(result);
  dispatchWebhook('agent.knowledge_updated', { agentId: g.id, source: 'setup_wizard' }).catch(() => {});
  res.json(result);
});

app.post('/api/setup/:token/test', async (req, res) => {
  const g = guideMeta(req.params.token);
  if (!g) return res.status(404).json({ error: 'Not found' });
  try {
    res.json(
      await testAgentChat({
        agentId: g.id,
        apiKey: g.apiKey,
        message: String(req.body?.message || 'What are your hours?'),
      }),
    );
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/setup/test', async (req, res) => {
  try {
    res.json(
      await testAgentChat({
        agentId: String(req.body?.agentId || ''),
        apiKey: String(req.body?.apiKey || ''),
        message: String(req.body?.message || 'What are your hours?'),
      }),
    );
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/setup/:token/n8n.json', (req, res) => {
  const g = guideMeta(req.params.token);
  if (!g) return res.status(404).json({ error: 'Not found' });
  const wf = buildN8nWorkflow({
    agentId: g.id,
    apiKey: g.apiKey,
    base: g.base,
    businessName: g.businessName,
  });
  res.set('Content-Disposition', 'attachment; filename="meridian-n8n-workflow.json"');
  res.json(wf);
});

app.post('/api/setup/:token/autonomous', async (req, res) => {
  const g = guideMeta(req.params.token);
  if (!g) return res.status(404).json({ error: 'Not found' });
  const job = queueAutonomousInstall({
    agentId: g.id,
    apiKey: g.apiKey,
    deliveryToken: req.params.token,
    businessName: g.businessName,
    email: req.body?.email,
    websiteUrl: req.body?.websiteUrl,
    phonePlatform: req.body?.phonePlatform,
    outboundWebhook: req.body?.outboundWebhook,
    path: req.body?.path || 'full',
  });
  // Process immediately so customer gets pack without waiting for daily OpenClaw
  let processed = job;
  try {
    processed = await processInstallJob(
      { ...job, apiKey: g.apiKey },
      { sendEmail },
    );
  } catch (e) {
    console.error('[setup autonomous]', e.message);
  }
  await dispatchWebhook('setup.autonomous_queued', {
    jobId: job.id,
    agentId: g.id,
    businessName: g.businessName,
    email: req.body?.email,
    status: processed?.status || job.status,
  }).catch(() => {});
  res.json({ ok: true, job: processed || job });
});

app.post('/api/setup/autonomous', async (req, res) => {
  const agentId = String(req.body?.agentId || '');
  const apiKey = String(req.body?.apiKey || '');
  if (!agentId || !verifyAgentKey(agentId, apiKey)) {
    return res.status(401).json({ error: 'Valid agentId + apiKey required' });
  }
  const job = queueAutonomousInstall({
    agentId,
    apiKey,
    businessName: req.body?.businessName,
    email: req.body?.email,
    websiteUrl: req.body?.websiteUrl,
    phonePlatform: req.body?.phonePlatform,
    outboundWebhook: req.body?.outboundWebhook,
    path: req.body?.path || 'full',
  });
  let processed = job;
  try {
    processed = await processInstallJob({ ...job, apiKey }, { sendEmail });
  } catch (e) {
    console.error('[setup autonomous]', e.message);
  }
  res.json({ ok: true, job: processed || job });
});

app.post('/api/ops/setup/process-queue', async (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json({ ok: true, ...(await processInstallQueue({ sendEmail, max: Number(req.body?.max) || 20 })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ops/setup/jobs', (req, res) => {
  if (!admin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ ok: true, jobs: listInstallJobs(100) });
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/checkout/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// OpenClaw daily
if (process.env.MERIDIAN_OPENCLAW_AUTO !== '0') {
  setTimeout(() => runOpenClaw().catch((e) => console.error('[OpenClaw]', e.message)), 90000);
  setInterval(() => runOpenClaw().catch((e) => console.error('[OpenClaw]', e.message)), 24 * 60 * 60 * 1000);
}

// Autopilot — hourly self-running ops (re-verify agents, drain queue, follow-up drafts)
if (process.env.MERIDIAN_AUTOPILOT !== '0') {
  setTimeout(() => runAutopilot({ sendEmail }).catch((e) => console.error('[Autopilot]', e.message)), 3 * 60 * 1000);
  setInterval(() => runAutopilot({ sendEmail }).catch((e) => console.error('[Autopilot]', e.message)), 60 * 60 * 1000);
}

// Synthetic health probes — catch silent brain failures before customers do
if (process.env.MERIDIAN_HEALTH_PROBE !== '0') {
  const probeMs = Number(process.env.MERIDIAN_HEALTH_PROBE_MS || 15 * 60 * 1000);
  setTimeout(() => probeAllAgents({ max: 12 }).catch((e) => console.error('[HealthProbe]', e.message)), 4 * 60 * 1000);
  setInterval(() => probeAllAgents({ max: 12 }).catch((e) => console.error('[HealthProbe]', e.message)), probeMs);
}

// Weekly knowledge self-update (draft proposals only — human Approve/Reject)
// Default: every 7 days; first run after 10 minutes if MERIDIAN_KNOWLEDGE_REFRESH=1
if (process.env.MERIDIAN_KNOWLEDGE_REFRESH === '1') {
  const weekMs = Number(process.env.MERIDIAN_KNOWLEDGE_REFRESH_MS || 7 * 24 * 60 * 60 * 1000);
  const runWeekly = () =>
    withExpertAndContainment(
      'knowledge-refresh',
      'openclaw.knowledge_refresh_cron',
      async () => runWeeklyKnowledgeRefresh({ force: false, notify: true }),
      { taskBrief: 'Scheduled weekly knowledge draft proposals' },
    ).catch((e) => console.error('[KnowledgeRefresh]', e.message));
  setTimeout(runWeekly, Number(process.env.MERIDIAN_KNOWLEDGE_REFRESH_START_MS || 10 * 60 * 1000));
  setInterval(runWeekly, weekMs);
}

// Long-form AI articles every ~2.5 days via OpenClaw content-articles expert
// draft → Claude vet → fix → ready → (ops publish). Set MERIDIAN_ARTICLES=1.
if (process.env.MERIDIAN_ARTICLES === '1') {
  const articlePollMs = Number(process.env.MERIDIAN_ARTICLE_POLL_MS || 6 * 60 * 60 * 1000); // check every 6h
  const runArticles = () =>
    runOpenClawArticlesScheduled().catch((e) => console.error('[OpenClaw Articles]', e.message));
  setTimeout(runArticles, Number(process.env.MERIDIAN_ARTICLE_START_MS || 15 * 60 * 1000));
  setInterval(runArticles, articlePollMs);
}

app.listen(PORT, '0.0.0.0', () => {
  const vs = voiceStatus();
  const px = pricingSnapshot();
  console.log(`\n  MERIDIAN AGENCY  ·  Voice · Sales · Booking`);
  console.log(`  http://0.0.0.0:${PORT}`);
  console.log(`  Public: ${BASE}`);
  console.log(`  Stripe: ${stripe ? 'on' : 'off'}`);
  console.log(`  Resend: ${process.env.RESEND_API_KEY ? 'on' : 'off'}`);
  console.log(`  Webhook: ${process.env.MERIDIAN_WEBHOOK_URL ? 'on' : 'off'}`);
  console.log(`  Voice: ${vs.mode} · xAI TTS: ${xaiTtsConfigured() ? 'on' : 'off'}`);
  console.log(`  Claude Agent API: ${claudeConfigured() ? brainStatus().model : 'OFF (set ANTHROPIC_API_KEY)'}`);
  console.log(
    `  Usage billing: $${px.customerUsdPerTurn}/turn customer · ~$${px.costUsdPerTurnEst} cost est · margin $${px.marginUsdPerTurn}/turn\n`,
  );
});
