/**
 * Meridian Voice usage billing — prepaid-first, margin-safe.
 *
 * Cash flow (never reverse):
 * 1) Customer pays Stripe (pack or monthly sub) → Meridian has cash.
 * 2) We RESERVE one turn from their balance (debit hold).
 * 3) Only then call xAI TTS (your key spends against revenue already collected).
 * 4) Success → commit ledger cost est. Failure → REFUND the reserved turn (no customer charge burn, no silent free speech).
 *
 * Default: NO subscription overage on invoice-later (that would let xAI bill you before the customer pays).
 * Set VOICE_ALLOW_OVERAGE=1 only if you accept that risk.
 *
 * Env overrides (cents unless noted):
 *   VOICE_CENTS_PER_TURN          customer list per TTS turn (default 55 = $0.55)
 *   VOICE_COST_CENTS_PER_TURN     your estimated xAI cost (default 4 = $0.04)
 *   VOICE_ALLOW_OVERAGE           0 (default) | 1 to allow postpaid sub overage
 *   VOICE_SUB_MONTHLY_CENTS / VOICE_SUB_INCLUDED_TURNS / VOICE_SUB_PRO_*
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

/** Postpaid overage = you can pay xAI before customer pays. Off by default. */
export function overageAllowed() {
  return process.env.VOICE_ALLOW_OVERAGE === '1';
}

/**
 * Can this account run one premium hosted TTS turn (xAI)?
 * platform_free = Retell/Vapi only — NOT hosted xAI.
 * Prepaid turns or unused subscription included turns only (cash already collected).
 */
export function canConsumeTurn(accountId) {
  const acc = getBillingAccount(accountId);
  if (!acc) {
    return {
      ok: false,
      reason: 'no_billing_account',
      message: 'No billing account — buy prepaid turns or subscribe first. We never run premium voice on credit.',
    };
  }

  // Platform-only install: phone platform speaks; Meridian does not spend xAI
  if (acc.plan === 'platform_free') {
    return {
      ok: false,
      reason: 'platform_tts_only',
      message:
        'This agent is platform-voice only (Retell/Vapi). Buy prepaid xAI turns or Voice Premium for Meridian-hosted neural audio.',
      account: acc,
      checkout: {
        packs: Object.keys(TOPUP_PACKS).map((id) => `/checkout/voice-pack/${id}`),
        subscriptions: ['/checkout/voice-sub', '/checkout/voice-pro'],
      },
    };
  }

  const prepaid = acc.prepaidTurns || 0;
  if (prepaid > 0) {
    return { ok: true, mode: 'prepaid', remaining: prepaid, account: acc };
  }

  if (acc.subscriptionStatus === 'active' && acc.plan && SUBSCRIPTION_PLANS[acc.plan]) {
    const plan = SUBSCRIPTION_PLANS[acc.plan];
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
    // Included turns exhausted
    if (overageAllowed()) {
      return {
        ok: true,
        mode: 'subscription_overage',
        overageCents: plan.overageCents || customerCentsPerTurn(),
        account: acc,
      };
    }
    return {
      ok: false,
      reason: 'included_turns_exhausted',
      message:
        'Monthly included turns used up. Top up a prepaid pack (pay first) — we do not run xAI on unpaid overage.',
      account: acc,
      checkout: {
        packs: Object.keys(TOPUP_PACKS).map((id) => `/checkout/voice-pack/${id}`),
      },
      pricing: pricingSnapshot(),
    };
  }

  return {
    ok: false,
    reason: 'insufficient_balance',
    message:
      'No prepaid voice turns. Customer pays first (pack or subscription), then premium xAI audio runs. Never the reverse.',
    checkout: {
      packs: Object.keys(TOPUP_PACKS).map((id) => `/checkout/voice-pack/${id}`),
      subscriptions: ['/checkout/voice-sub', '/checkout/voice-pro'],
    },
    pricing: pricingSnapshot(),
  };
}

/**
 * RESERVE one turn BEFORE calling xAI (debit hold).
 * Prevents free speech if TTS is invoked; refunds on TTS failure via releaseReservedTurn.
 */
export function reserveTurn(accountId, { agentId = null } = {}) {
  const gate = canConsumeTurn(accountId);
  if (!gate.ok) return gate;

  const acc = getBillingAccount(accountId);
  if (!acc) return { ok: false, reason: 'no_billing_account' };

  if (gate.mode === 'prepaid') {
    if ((acc.prepaidTurns || 0) < 1) {
      return { ok: false, reason: 'insufficient_balance', message: 'No prepaid turns left.' };
    }
    const holdId = rid('hold');
    updateBillingAccount(accountId, {
      prepaidTurns: Math.max(0, (acc.prepaidTurns || 0) - 1),
      heldTurns: (acc.heldTurns || 0) + 1,
      lastHoldId: holdId,
      lastHoldAt: new Date().toISOString(),
    });
    appendLedger({
      type: 'turn_reserve',
      accountId,
      agentId: agentId || acc.agentId,
      mode: 'prepaid',
      holdId,
    });
    return {
      ok: true,
      mode: 'prepaid',
      holdId,
      account: getBillingAccount(accountId),
    };
  }

  if (gate.mode === 'subscription_included') {
    const plan = SUBSCRIPTION_PLANS[acc.plan];
    const pk = periodKey();
    const used = acc.periodKey === pk ? (acc.periodTurnsUsed || 0) + 1 : 1;
    const holdId = rid('hold');
    updateBillingAccount(accountId, {
      periodKey: pk,
      periodTurnsUsed: used,
      periodTurnsIncluded: plan.includedTurns,
      heldTurns: (acc.heldTurns || 0) + 1,
      lastHoldId: holdId,
      lastHoldAt: new Date().toISOString(),
    });
    appendLedger({
      type: 'turn_reserve',
      accountId,
      agentId: agentId || acc.agentId,
      mode: 'subscription_included',
      holdId,
    });
    return {
      ok: true,
      mode: 'subscription_included',
      holdId,
      account: getBillingAccount(accountId),
    };
  }

  if (gate.mode === 'subscription_overage' && overageAllowed()) {
    // Only when explicitly enabled — postpaid risk
    const holdId = rid('hold');
    updateBillingAccount(accountId, {
      heldTurns: (acc.heldTurns || 0) + 1,
      lastHoldId: holdId,
      lastHoldAt: new Date().toISOString(),
      pendingOverageHolds: (acc.pendingOverageHolds || 0) + 1,
    });
    appendLedger({
      type: 'turn_reserve',
      accountId,
      agentId: agentId || acc.agentId,
      mode: 'subscription_overage',
      holdId,
    });
    return {
      ok: true,
      mode: 'subscription_overage',
      holdId,
      account: getBillingAccount(accountId),
    };
  }

  return { ok: false, reason: 'cannot_reserve', message: gate.message || 'Cannot reserve turn' };
}

/** TTS failed — put the turn back so customer is not burned and you did not deliver speech. */
export function releaseReservedTurn(accountId, hold) {
  if (!hold?.ok || !hold.mode) return { ok: false };
  const acc = getBillingAccount(accountId);
  if (!acc) return { ok: false };

  if (hold.mode === 'prepaid') {
    updateBillingAccount(accountId, {
      prepaidTurns: (acc.prepaidTurns || 0) + 1,
      heldTurns: Math.max(0, (acc.heldTurns || 0) - 1),
    });
  } else if (hold.mode === 'subscription_included') {
    updateBillingAccount(accountId, {
      periodTurnsUsed: Math.max(0, (acc.periodTurnsUsed || 0) - 1),
      heldTurns: Math.max(0, (acc.heldTurns || 0) - 1),
    });
  } else if (hold.mode === 'subscription_overage') {
    updateBillingAccount(accountId, {
      heldTurns: Math.max(0, (acc.heldTurns || 0) - 1),
      pendingOverageHolds: Math.max(0, (acc.pendingOverageHolds || 0) - 1),
    });
  }

  appendLedger({
    type: 'turn_release',
    accountId,
    agentId: acc.agentId,
    mode: hold.mode,
    holdId: hold.holdId,
    reason: 'tts_failed_or_cancelled',
  });
  return { ok: true, account: getBillingAccount(accountId) };
}

/**
 * TTS succeeded after reserve — record cost (your xAI spend est.) and revenue bookkeeping.
 * Prepaid cash was collected at pack purchase; we only track cost/profit here.
 */
export function commitReservedTurn(accountId, hold, { chars = 0, provider = 'xai', agentId = null } = {}) {
  if (!hold?.ok) return { ok: false, reason: 'no_hold' };
  const acc = getBillingAccount(accountId);
  if (!acc) return { ok: false, reason: 'no_billing_account' };

  const cost = costCentsPerTurnEst();
  let revenue = 0;
  const debitMode = hold.mode;

  if (hold.mode === 'prepaid') {
    revenue = customerCentsPerTurn(); // effective unit for ROI (cash already in at top-up)
    updateBillingAccount(accountId, {
      heldTurns: Math.max(0, (acc.heldTurns || 0) - 1),
      lifetimeTurns: (acc.lifetimeTurns || 0) + 1,
      lifetimeCostCentsEst: (acc.lifetimeCostCentsEst || 0) + cost,
      lifetimeProfitCentsEst:
        (acc.lifetimeRevenueCents || 0) - ((acc.lifetimeCostCentsEst || 0) + cost),
    });
  } else if (hold.mode === 'subscription_included') {
    revenue = 0; // monthly fee already collected
    updateBillingAccount(accountId, {
      heldTurns: Math.max(0, (acc.heldTurns || 0) - 1),
      lifetimeTurns: (acc.lifetimeTurns || 0) + 1,
      lifetimeCostCentsEst: (acc.lifetimeCostCentsEst || 0) + cost,
      lifetimeProfitCentsEst:
        (acc.lifetimeRevenueCents || 0) - ((acc.lifetimeCostCentsEst || 0) + cost),
    });
  } else if (hold.mode === 'subscription_overage') {
    const plan = SUBSCRIPTION_PLANS[acc.plan] || {};
    revenue = plan.overageCents || customerCentsPerTurn();
    const pk = periodKey();
    const used = acc.periodKey === pk ? (acc.periodTurnsUsed || 0) + 1 : 1;
    updateBillingAccount(accountId, {
      periodKey: pk,
      periodTurnsUsed: used,
      heldTurns: Math.max(0, (acc.heldTurns || 0) - 1),
      pendingOverageHolds: Math.max(0, (acc.pendingOverageHolds || 0) - 1),
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
    type: 'turn_commit',
    accountId,
    agentId: agentId || acc.agentId,
    chars,
    provider,
    debitMode,
    holdId: hold.holdId,
    revenueCents: revenue,
    costCentsEst: cost,
    profitCentsEst: revenue - cost,
    prepaidLeft: fresh.prepaidTurns,
    periodUsed: fresh.periodTurnsUsed,
    note: 'Customer balance was reserved before xAI; cost booked after success only',
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

/**
 * Legacy helper: reserve + commit in one shot (prefer reserve→TTS→commit on server).
 */
export function consumeTurn(accountId, { chars = 0, provider = 'xai', agentId = null } = {}) {
  const hold = reserveTurn(accountId, { agentId });
  if (!hold.ok) return hold;
  return commitReservedTurn(accountId, hold, { chars, provider, agentId });
}

/** Alias kept for readability in ROI docs */
export function cashFlowPolicy() {
  return {
    rule: 'customer_pays_first',
    xaiOnlyAfterReserve: true,
    freePublicPreviewUsesXai: false,
    overagePostpaid: overageAllowed(),
    neverOweXaiWithoutCustomerCash: !overageAllowed(),
    steps: [
      'Stripe pack/sub payment credited to billing account',
      'reserveTurn debits balance (hold)',
      'xAI TTS only after hold',
      'commit on success / release on failure',
    ],
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
