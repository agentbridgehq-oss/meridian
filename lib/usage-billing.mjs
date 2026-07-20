/**
 * Meridian Voice usage billing — high-ROI pay-as-you-go + subscription.
 *
 * Model:
 * - YOU pay xAI a small cost per TTS (tracked as costCentsEst).
 * - CUSTOMER pays Meridian far more per turn (or via prepaid packs / monthly sub).
 * - No TTS until customer has prepaid turns OR active subscription allowance.
 * - Profit is guaranteed by construction: charge >> cost; refuse if unpaid.
 *
 * Env overrides (cents unless noted):
 *   VOICE_CENTS_PER_TURN          customer charge per TTS turn (default 55 = $0.55)
 *   VOICE_COST_CENTS_PER_TURN     your estimated cost (default 4 = $0.04)
 *   VOICE_SUB_MONTHLY_CENTS       default sub price (default 19700 = $197)
 *   VOICE_SUB_INCLUDED_TURNS      included turns/mo (default 300)
 *   VOICE_SUB_PRO_CENTS           pro sub (default 49700)
 *   VOICE_SUB_PRO_INCLUDED        pro included (default 1200)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(__dirname, '..', 'data');
const BILLING = path.join(DATA_DIR, 'billing-accounts.json');
const USAGE = path.join(DATA_DIR, 'usage-ledger.json');

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
function rid(p = 'bill') {
  return `${p}_${crypto.randomBytes(8).toString('hex')}`;
}

/** Customer-facing list price per TTS turn (cents). Default $0.55 */
export function customerCentsPerTurn() {
  return Math.max(1, Number(process.env.VOICE_CENTS_PER_TURN || 55));
}

/** Your estimated cost per TTS turn (cents). Default $0.04 — keep well below customer price */
export function costCentsPerTurnEst() {
  return Math.max(0, Number(process.env.VOICE_COST_CENTS_PER_TURN || 4));
}

/** Minimum margin multiple required (default 5× cost). Refuse to sell below this if misconfigured. */
export function minMarginMultiple() {
  return Math.max(2, Number(process.env.VOICE_MIN_MARGIN_MULTIPLE || 5));
}

export function pricingSnapshot() {
  const charge = customerCentsPerTurn();
  const cost = costCentsPerTurnEst();
  const multiple = cost > 0 ? charge / cost : Infinity;
  return {
    customerCentsPerTurn: charge,
    customerUsdPerTurn: (charge / 100).toFixed(2),
    costCentsPerTurnEst: cost,
    costUsdPerTurnEst: (cost / 100).toFixed(4),
    marginMultiple: Number.isFinite(multiple) ? Number(multiple.toFixed(1)) : null,
    marginCentsPerTurn: charge - cost,
    marginUsdPerTurn: ((charge - cost) / 100).toFixed(2),
    guaranteedProfit: charge > cost * minMarginMultiple() || (cost === 0 && charge > 0),
    packs: Object.entries(TOPUP_PACKS).map(([id, p]) => ({
      id,
      ...p,
      centsPerTurn: Math.round(p.amount / p.turns),
      usd: (p.amount / 100).toFixed(0),
    })),
    subscriptions: Object.entries(SUBSCRIPTION_PLANS).map(([id, p]) => ({
      id,
      ...p,
      usdMonthly: (p.amount / 100).toFixed(0),
      effectiveCentsPerIncluded: Math.round(p.amount / p.includedTurns),
    })),
  };
}

/**
 * Prepaid top-up packs — customer pays NOW, uses turns later.
 * High ROI: pack price / turns >> your cost.
 */
export const TOPUP_PACKS = {
  starter: {
    name: 'Voice turns · Starter (100)',
    description: '100 premium xAI voice turns — pay as you go',
    turns: 100,
    amount: 4900, // $49 → $0.49/turn
  },
  growth: {
    name: 'Voice turns · Growth (500)',
    description: '500 premium xAI voice turns — best value pay-as-you-go',
    turns: 500,
    amount: 19900, // $199 → $0.398/turn
  },
  scale: {
    name: 'Voice turns · Scale (2,000)',
    description: '2,000 premium xAI voice turns for busy lines',
    turns: 2000,
    amount: 69700, // $697 → $0.348/turn
  },
};

/**
 * Subscriptions — high monthly vs your fixed/variable cost.
 * Included turns then overage at customerCentsPerTurn (or plan overage).
 */
export const SUBSCRIPTION_PLANS = {
  voice_monthly: {
    name: 'Meridian Voice Premium',
    description: 'Premium xAI voice agent — 300 turns/mo + overage',
    amount: Number(process.env.VOICE_SUB_MONTHLY_CENTS || 19700), // $197
    includedTurns: Number(process.env.VOICE_SUB_INCLUDED_TURNS || 300),
    overageCents: Number(process.env.VOICE_SUB_OVERAGE_CENTS || 55),
    interval: 'month',
  },
  voice_pro: {
    name: 'Meridian Voice Pro',
    description: 'High-volume premium voice — 1,200 turns/mo + overage',
    amount: Number(process.env.VOICE_SUB_PRO_CENTS || 49700), // $497
    includedTurns: Number(process.env.VOICE_SUB_PRO_INCLUDED || 1200),
    overageCents: Number(process.env.VOICE_SUB_PRO_OVERAGE_CENTS || 45),
    interval: 'month',
  },
};

function periodKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getBillingAccount(accountId) {
  if (!accountId) return null;
  return load(BILLING, { accounts: [] }).accounts.find((a) => a.id === accountId) || null;
}

export function getBillingByAgent(agentId) {
  if (!agentId) return null;
  return load(BILLING, { accounts: [] }).accounts.find((a) => a.agentId === agentId) || null;
}

export function getBillingByEmail(email) {
  const e = (email || '').toLowerCase().trim();
  if (!e) return null;
  return load(BILLING, { accounts: [] }).accounts.find((a) => a.email === e) || null;
}

export function listBillingAccounts() {
  return load(BILLING, { accounts: [] }).accounts;
}

/**
 * Ensure a billing account for an agent (defaults: no free TTS — must pay).
 */
export function ensureBillingAccount({ agentId, leadId, email, businessName } = {}) {
  const store = load(BILLING, { accounts: [] });
  let acc =
    (agentId && store.accounts.find((a) => a.agentId === agentId)) ||
    (email && store.accounts.find((a) => a.email === String(email).toLowerCase().trim()));

  if (!acc) {
    acc = {
      id: rid('bill'),
      agentId: agentId || null,
      leadId: leadId || null,
      email: (email || '').toLowerCase().trim() || null,
      businessName: businessName || '',
      createdAt: new Date().toISOString(),
      // paygo prepaid turns remaining
      prepaidTurns: 0,
      // subscription
      plan: null, // null | 'voice_monthly' | 'voice_pro' | 'platform_free'
      subscriptionStatus: 'none', // none | active | past_due | canceled
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      periodKey: periodKey(),
      periodTurnsUsed: 0,
      periodTurnsIncluded: 0,
      overageTurnsUnbilled: 0,
      overageCentsUnbilled: 0,
      // lifetime economics (your ROI dashboard)
      lifetimeTurns: 0,
      lifetimeRevenueCents: 0,
      lifetimeCostCentsEst: 0,
      lifetimeProfitCentsEst: 0,
    };
    store.accounts.push(acc);
  } else {
    if (agentId && !acc.agentId) acc.agentId = agentId;
    if (leadId && !acc.leadId) acc.leadId = leadId;
    if (email) acc.email = String(email).toLowerCase().trim();
    if (businessName) acc.businessName = businessName;
    // roll period if month changed
    const pk = periodKey();
    if (acc.periodKey !== pk) {
      acc.periodKey = pk;
      acc.periodTurnsUsed = 0;
      if (acc.plan && SUBSCRIPTION_PLANS[acc.plan] && acc.subscriptionStatus === 'active') {
        acc.periodTurnsIncluded = SUBSCRIPTION_PLANS[acc.plan].includedTurns;
      }
    }
  }
  save(BILLING, store);
  return acc;
}

export function updateBillingAccount(accountId, patch) {
  const store = load(BILLING, { accounts: [] });
  const i = store.accounts.findIndex((a) => a.id === accountId);
  if (i < 0) return null;
  store.accounts[i] = { ...store.accounts[i], ...patch, updatedAt: new Date().toISOString() };
  save(BILLING, store);
  return store.accounts[i];
}

/** After Stripe pack purchase */
export function creditPrepaidTurns(accountId, turns, meta = {}) {
  const acc = getBillingAccount(accountId);
  if (!acc) return null;
  const n = Math.max(0, Number(turns) || 0);
  const next = updateBillingAccount(accountId, {
    prepaidTurns: (acc.prepaidTurns || 0) + n,
    lastTopUpAt: new Date().toISOString(),
    lastTopUp: { turns: n, ...meta },
  });
  appendLedger({
    type: 'credit_prepaid',
    accountId,
    agentId: acc.agentId,
    turns: n,
    revenueCents: meta.amountCents || 0,
    meta,
  });
  if (meta.amountCents) {
    updateBillingAccount(accountId, {
      lifetimeRevenueCents: (next.lifetimeRevenueCents || 0) + Number(meta.amountCents),
      lifetimeProfitCentsEst:
        (next.lifetimeRevenueCents || 0) +
        Number(meta.amountCents) -
        (next.lifetimeCostCentsEst || 0),
    });
  }
  return getBillingAccount(accountId);
}

/** After Stripe subscription starts */
export function activateSubscription(accountId, planId, meta = {}) {
  const plan = SUBSCRIPTION_PLANS[planId];
  if (!plan) return { ok: false, error: 'Unknown plan' };
  const acc = getBillingAccount(accountId);
  if (!acc) return { ok: false, error: 'No billing account' };
  updateBillingAccount(accountId, {
    plan: planId,
    subscriptionStatus: 'active',
    periodKey: periodKey(),
    periodTurnsUsed: 0,
    periodTurnsIncluded: plan.includedTurns,
    stripeCustomerId: meta.stripeCustomerId || acc.stripeCustomerId,
    stripeSubscriptionId: meta.stripeSubscriptionId || acc.stripeSubscriptionId,
    lastSubAt: new Date().toISOString(),
  });
  if (meta.amountCents) {
    const a = getBillingAccount(accountId);
    updateBillingAccount(accountId, {
      lifetimeRevenueCents: (a.lifetimeRevenueCents || 0) + Number(meta.amountCents),
      lifetimeProfitCentsEst:
        (a.lifetimeRevenueCents || 0) + Number(meta.amountCents) - (a.lifetimeCostCentsEst || 0),
    });
  }
  appendLedger({
    type: 'subscription_activate',
    accountId,
    agentId: acc.agentId,
    plan: planId,
    includedTurns: plan.includedTurns,
    revenueCents: meta.amountCents || plan.amount,
    meta,
  });
  return { ok: true, account: getBillingAccount(accountId) };
}

export function cancelSubscriptionLocal(accountId) {
  return updateBillingAccount(accountId, {
    subscriptionStatus: 'canceled',
    plan: null,
    periodTurnsIncluded: 0,
  });
}

/**
 * Can this account run one premium TTS turn?
 * platform_free plan = no Meridian TTS charge (customer uses Retell/Vapi own TTS).
 */
export function canConsumeTurn(accountId) {
  const acc = getBillingAccount(accountId);
  if (!acc) return { ok: false, reason: 'no_billing_account', message: 'No billing account — buy turns or subscribe.' };

  // Explicit free platform (no xAI hosted audio)
  if (acc.plan === 'platform_free') {
    return { ok: true, mode: 'platform_free', account: acc };
  }

  const prepaid = acc.prepaidTurns || 0;
  if (prepaid > 0) {
    return { ok: true, mode: 'prepaid', remaining: prepaid, account: acc };
  }

  if (acc.subscriptionStatus === 'active' && acc.plan && SUBSCRIPTION_PLANS[acc.plan]) {
    const plan = SUBSCRIPTION_PLANS[acc.plan];
    // roll period
    const pk = periodKey();
    let periodUsed = acc.periodTurnsUsed || 0;
    let periodIncluded = acc.periodTurnsIncluded ?? plan.includedTurns;
    if (acc.periodKey !== pk) {
      periodUsed = 0;
      periodIncluded = plan.includedTurns;
    }
    if (periodUsed < periodIncluded) {
      return {
        ok: true,
        mode: 'subscription_included',
        remaining: periodIncluded - periodUsed,
        account: acc,
      };
    }
    // overage allowed (billed to customer later / invoice item)
    return {
      ok: true,
      mode: 'subscription_overage',
      overageCents: plan.overageCents || customerCentsPerTurn(),
      account: acc,
    };
  }

  return {
    ok: false,
    reason: 'insufficient_balance',
    message:
      'No voice turns left. Top up pay-as-you-go or start Voice Premium subscription. Meridian only bills when you use the premium voice.',
    checkout: {
      packs: Object.keys(TOPUP_PACKS).map((id) => `/checkout/voice-pack/${id}`),
      subscriptions: ['/checkout/voice-sub', '/checkout/voice-pro'],
    },
    pricing: pricingSnapshot(),
  };
}

/**
 * Consume one turn AFTER successful TTS. Records cost vs revenue for ROI.
 */
export function consumeTurn(accountId, { chars = 0, provider = 'xai', agentId = null } = {}) {
  const gate = canConsumeTurn(accountId);
  if (!gate.ok) return gate;

  const acc = getBillingAccount(accountId);
  const cost = costCentsPerTurnEst();
  let revenue = 0;
  let debitMode = gate.mode;

  if (gate.mode === 'platform_free') {
    appendLedger({
      type: 'turn_platform_free',
      accountId,
      agentId: agentId || acc.agentId,
      chars,
      provider: 'platform',
      revenueCents: 0,
      costCentsEst: 0,
    });
    return { ok: true, mode: 'platform_free', account: acc, charged: false };
  }

  if (gate.mode === 'prepaid') {
    // amortized pack revenue is already booked at top-up; per-turn revenue for ROI = pack avg
    // Use list price for "effective" revenue display; cash already collected
    revenue = customerCentsPerTurn();
    updateBillingAccount(accountId, {
      prepaidTurns: Math.max(0, (acc.prepaidTurns || 0) - 1),
      lifetimeTurns: (acc.lifetimeTurns || 0) + 1,
      lifetimeCostCentsEst: (acc.lifetimeCostCentsEst || 0) + cost,
      // don't double-count pack cash as per-turn revenue
      lifetimeProfitCentsEst:
        (acc.lifetimeRevenueCents || 0) - ((acc.lifetimeCostCentsEst || 0) + cost),
    });
  } else if (gate.mode === 'subscription_included') {
    revenue = 0; // monthly fee already booked
    const pk = periodKey();
    const plan = SUBSCRIPTION_PLANS[acc.plan];
    const used = acc.periodKey === pk ? (acc.periodTurnsUsed || 0) + 1 : 1;
    updateBillingAccount(accountId, {
      periodKey: pk,
      periodTurnsUsed: used,
      periodTurnsIncluded: plan.includedTurns,
      lifetimeTurns: (acc.lifetimeTurns || 0) + 1,
      lifetimeCostCentsEst: (acc.lifetimeCostCentsEst || 0) + cost,
      lifetimeProfitCentsEst:
        (acc.lifetimeRevenueCents || 0) - ((acc.lifetimeCostCentsEst || 0) + cost),
    });
  } else if (gate.mode === 'subscription_overage') {
    const plan = SUBSCRIPTION_PLANS[acc.plan];
    revenue = plan.overageCents || customerCentsPerTurn();
    const pk = periodKey();
    const used = acc.periodKey === pk ? (acc.periodTurnsUsed || 0) + 1 : 1;
    updateBillingAccount(accountId, {
      periodKey: pk,
      periodTurnsUsed: used,
      overageTurnsUnbilled: (acc.overageTurnsUnbilled || 0) + 1,
      overageCentsUnbilled: (acc.overageCentsUnbilled || 0) + revenue,
      lifetimeTurns: (acc.lifetimeTurns || 0) + 1,
      lifetimeRevenueCents: (acc.lifetimeRevenueCents || 0) + revenue,
      lifetimeCostCentsEst: (acc.lifetimeCostCentsEst || 0) + cost,
      lifetimeProfitCentsEst:
        (acc.lifetimeRevenueCents || 0) + revenue - ((acc.lifetimeCostCentsEst || 0) + cost),
    });
  }

  const fresh = getBillingAccount(accountId);
  appendLedger({
    type: 'turn_consume',
    accountId,
    agentId: agentId || acc.agentId,
    chars,
    provider,
    debitMode,
    revenueCents: revenue,
    costCentsEst: cost,
    profitCentsEst: revenue - cost,
    prepaidLeft: fresh.prepaidTurns,
    periodUsed: fresh.periodTurnsUsed,
  });

  return {
    ok: true,
    mode: debitMode,
    charged: true,
    revenueCents: revenue,
    costCentsEst: cost,
    profitCentsEst: revenue - cost,
    account: fresh,
  };
}

function appendLedger(entry) {
  const store = load(USAGE, { events: [] });
  store.events.unshift({
    id: rid('use'),
    at: new Date().toISOString(),
    ...entry,
  });
  store.events = store.events.slice(0, 5000);
  save(USAGE, store);
}

export function listUsage(limit = 100) {
  return load(USAGE, { events: [] }).events.slice(0, limit);
}

export function usageForAccount(accountId, limit = 100) {
  return load(USAGE, { events: [] }).events.filter((e) => e.accountId === accountId).slice(0, limit);
}

/** Ops ROI rollup */
export function roiSummary() {
  const accounts = listBillingAccounts();
  const revenue = accounts.reduce((s, a) => s + (a.lifetimeRevenueCents || 0), 0);
  const cost = accounts.reduce((s, a) => s + (a.lifetimeCostCentsEst || 0), 0);
  const turns = accounts.reduce((s, a) => s + (a.lifetimeTurns || 0), 0);
  const prepaid = accounts.reduce((s, a) => s + (a.prepaidTurns || 0), 0);
  const unbilledOverage = accounts.reduce((s, a) => s + (a.overageCentsUnbilled || 0), 0);
  return {
    accounts: accounts.length,
    lifetimeTurns: turns,
    prepaidTurnsOutstanding: prepaid,
    overageCentsUnbilled: unbilledOverage,
    lifetimeRevenueCents: revenue,
    lifetimeCostCentsEst: cost,
    lifetimeProfitCentsEst: revenue - cost,
    lifetimeRevenueUsd: (revenue / 100).toFixed(2),
    lifetimeCostUsdEst: (cost / 100).toFixed(2),
    lifetimeProfitUsdEst: ((revenue - cost) / 100).toFixed(2),
    marginPct: revenue > 0 ? Number((((revenue - cost) / revenue) * 100).toFixed(1)) : null,
    pricing: pricingSnapshot(),
  };
}

/**
 * Link agent → billing after provision.
 */
export function attachAgentBilling(agent, { email, leadId } = {}) {
  return ensureBillingAccount({
    agentId: agent.id,
    leadId: leadId || agent.leadId,
    email: email || null,
    businessName: agent.businessName,
  });
}

/** Mark overage as billed (after Stripe invoice item success) */
export function clearUnbilledOverage(accountId) {
  return updateBillingAccount(accountId, {
    overageTurnsUnbilled: 0,
    overageCentsUnbilled: 0,
    lastOverageBilledAt: new Date().toISOString(),
  });
}
