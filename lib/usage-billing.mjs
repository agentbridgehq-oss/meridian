/**
 * Meridian usage billing — prepaid-first, margin-safe, CAD.
 *
 * ALL prices, caps and policy come from lib/pricing.mjs (single source of truth).
 * Billing unit: one "turn" in the stored ledger = ONE billed AI minute
 * (field names kept so existing billing-accounts.json files still load).
 *
 * Cash flow (never reverse):
 * 1) Customer pays Stripe (plan subscription or prepaid block) → Meridian has cash.
 * 2) We RESERVE one unit from their balance (debit hold).
 * 3) Only then spend vendor usage.
 * 4) Success → commit ledger cost est. Failure → REFUND the reserved unit.
 *
 * Approved policy: stop at cap by default; overage is PREPAID BLOCKS ONLY
 * (no postpaid invoice-later); alerts at 80% / 100%; monthly block spend is
 * capped at 1x the plan price unless the client approves more in writing
 * (ops sets account.overageCeilingMultiple).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  BLOCKS,
  CURRENCY_CODE,
  OVERAGE,
  PLANS,
  PLAN_ORDER,
  USAGE_POLICY,
  WORST_CASE_UNIT_COST_CENTS,
  publicPriceList,
  resolvePlanId,
  stripeFeeCentsWorst,
  worstCaseBlockMarginCents,
  worstCaseMonthlyCostCents,
} from './pricing.mjs';

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

/** Customer price per billed AI minute above the cap (CAD cents) — the prepaid block rate. */
export function customerCentsPerTurn() {
  return OVERAGE.minuteCents;
}

/** Worst-case vendor cost per billed AI minute (CAD cents, rounded up). */
export function costCentsPerTurnEst() {
  return Math.ceil(WORST_CASE_UNIT_COST_CENTS.aiMinute);
}

export function pricingSnapshot() {
  const charge = customerCentsPerTurn();
  const cost = costCentsPerTurnEst();
  const stripe = stripeFeeCentsWorst(charge, { fixed: false });
  const plans = PLAN_ORDER.map((id) => worstCaseMonthlyCostCents(id));
  const blocks = Object.keys(BLOCKS).map((id) => worstCaseBlockMarginCents(id));
  return {
    currency: CURRENCY_CODE,
    unit: 'ai_minute',
    customerCentsPerMinute: charge,
    customerCadPerMinute: (charge / 100).toFixed(2),
    costCentsPerMinuteWorst: cost,
    costCadPerMinuteWorst: (cost / 100).toFixed(2),
    marginCentsPerMinuteWorst: Math.round(charge - cost - stripe),
    marginCadPerMinuteWorst: ((charge - cost - stripe) / 100).toFixed(2),
    guaranteedProfit:
      charge - cost - stripe > 0 && plans.every((p) => p.marginCents > 0) && blocks.every((b) => b.marginCents > 0),
    policy: { ...USAGE_POLICY, alertThresholds: [...USAGE_POLICY.alertThresholds] },
    priceList: publicPriceList(),
    packs: Object.entries(TOPUP_PACKS).map(([id, p]) => ({ id, ...p, cad: (p.amount / 100).toFixed(0) })),
    subscriptions: Object.entries(SUBSCRIPTION_PLANS).map(([id, p]) => ({
      id,
      ...p,
      cadMonthly: (p.amount / 100).toFixed(0),
      cadSetup: (p.setupAmount / 100).toFixed(0),
    })),
  };
}

/**
 * Prepaid top-up blocks (from pricing.BLOCKS). Customer pays NOW, uses later.
 * turns = AI minutes credited; smsSegments = SMS segments credited.
 */
export const TOPUP_PACKS = Object.freeze(
  Object.fromEntries(
    Object.values(BLOCKS).map((b) => [
      b.id,
      Object.freeze({
        name: `Meridian ${b.name}`,
        description: `Prepaid top-up: ${b.units} ${b.unit === 'aiMinutes' ? 'AI minutes' : 'SMS segments'} · used after your plan cap`,
        currency: CURRENCY_CODE,
        unit: b.unit,
        turns: b.unit === 'aiMinutes' ? b.units : 0,
        smsSegments: b.unit === 'smsSegments' ? b.units : 0,
        amount: b.amountCents,
      }),
    ]),
  ),
);

/** Monthly plans (from pricing.PLANS). includedTurns = included AI minutes. */
export const SUBSCRIPTION_PLANS = Object.freeze(
  Object.fromEntries(
    PLAN_ORDER.map((id) => {
      const p = PLANS[id];
      return [
        id,
        Object.freeze({
          name: `Meridian ${p.name}`,
          description: p.tagline,
          currency: CURRENCY_CODE,
          amount: p.monthlyCents,
          setupAmount: p.setupCents,
          includedTurns: p.caps.aiMinutes,
          includedSmsSegments: p.caps.smsSegments,
          numbers: p.caps.numbers,
          warmTransfers: p.caps.warmTransfers,
          overageCents: OVERAGE.minuteCents,
          interval: 'month',
        }),
      ];
    }),
  ),
);

/** Resolve a stored or legacy plan id (e.g. voice_monthly) to an approved plan id. */
export function planIdFor(planKey) {
  const id = resolvePlanId(planKey);
  return id && SUBSCRIPTION_PLANS[id] ? id : null;
}

/** Which alert thresholds (0.8, 1.0) were crossed going from prevUsed → nextUsed of included. */
export function crossedAlertThresholds(prevUsed, nextUsed, included) {
  if (!(included > 0)) return [];
  return USAGE_POLICY.alertThresholds.filter((t) => prevUsed / included < t && nextUsed / included >= t);
}

/** Monthly prepaid-block spend allowed for an account (CAD cents). */
export function overageCeilingCents(acc) {
  const id = planIdFor(acc?.plan);
  if (!id) return 0;
  const multiple = Number(acc?.overageCeilingMultiple) > 0 ? Number(acc.overageCeilingMultiple) : USAGE_POLICY.overageCeilingMultiple;
  return Math.round(SUBSCRIPTION_PLANS[id].amount * multiple);
}

/** Can this account buy this prepaid block now without passing its monthly overage ceiling? */
export function canPurchaseBlock(accountId, blockId) {
  const pack = TOPUP_PACKS[blockId];
  if (!pack) return { ok: false, reason: 'unknown_block' };
  const acc = getBillingAccount(accountId);
  if (!acc) return { ok: false, reason: 'no_billing_account' };
  if (!planIdFor(acc.plan) || acc.subscriptionStatus !== 'active') {
    return { ok: false, reason: 'no_active_plan', message: 'Top-ups are for active Meridian plans. Choose a plan first.' };
  }
  const spent = acc.periodKey === periodKey() ? acc.periodOverageCents || 0 : 0;
  const ceiling = overageCeilingCents(acc);
  if (spent + pack.amount > ceiling) {
    return {
      ok: false,
      reason: 'overage_ceiling_reached',
      message: `Monthly top-up limit reached (${CURRENCY_CODE} $${(ceiling / 100).toFixed(0)} = ${USAGE_POLICY.overageCeilingMultiple}x plan price). Written approval is needed to raise it.`,
      spentCents: spent,
      ceilingCents: ceiling,
    };
  }
  return { ok: true, spentCents: spent, ceilingCents: ceiling, headroomCents: ceiling - spent };
}

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
      prepaidTurns: 0, // prepaid AI minutes (from blocks)
      prepaidSmsSegments: 0,
      // subscription
      plan: null, // null | 'rescue' | 'pro' | 'growth' | 'platform_free'
      subscriptionStatus: 'none', // none | active | past_due | canceled
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      periodKey: periodKey(),
      periodTurnsUsed: 0,
      periodTurnsIncluded: 0,
      overageTurnsUnbilled: 0,
      overageCentsUnbilled: 0,
      periodOverageCents: 0, // prepaid block spend this period (ceiling = 1x plan price)
      periodAlerts: [],
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
      acc.periodOverageCents = 0;
      acc.periodAlerts = [];
      const pid = planIdFor(acc.plan);
      if (pid && acc.subscriptionStatus === 'active') {
        acc.plan = pid;
        acc.periodTurnsIncluded = SUBSCRIPTION_PLANS[pid].includedTurns;
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

/** After a Stripe block purchase: credit minutes or SMS segments and count it toward the overage ceiling. */
export function creditPrepaidBlock(accountId, blockId, meta = {}) {
  const pack = TOPUP_PACKS[blockId];
  if (!pack) return null;
  const amountCents = Number(meta.amountCents || pack.amount);
  let acc = getBillingAccount(accountId);
  if (!acc) return null;
  if (pack.turns) acc = creditPrepaidTurns(accountId, pack.turns, { ...meta, amountCents, blockId });
  if (pack.smsSegments) {
    updateBillingAccount(accountId, {
      prepaidSmsSegments: (acc.prepaidSmsSegments || 0) + pack.smsSegments,
      lifetimeRevenueCents: (acc.lifetimeRevenueCents || 0) + amountCents,
      lifetimeProfitCentsEst: (acc.lifetimeRevenueCents || 0) + amountCents - (acc.lifetimeCostCentsEst || 0),
    });
    appendLedger({ type: 'credit_prepaid_sms', accountId, agentId: acc.agentId, smsSegments: pack.smsSegments, revenueCents: amountCents, meta });
  }
  acc = getBillingAccount(accountId);
  const pk = periodKey();
  return updateBillingAccount(accountId, {
    periodKey: pk,
    periodOverageCents: (acc.periodKey === pk ? acc.periodOverageCents || 0 : 0) + amountCents,
  });
}

/** After Stripe subscription starts */
export function activateSubscription(accountId, planKey, meta = {}) {
  const planId = planIdFor(planKey);
  const plan = planId ? SUBSCRIPTION_PLANS[planId] : null;
  if (!plan) return { ok: false, error: 'Unknown plan' };
  const acc = getBillingAccount(accountId);
  if (!acc) return { ok: false, error: 'No billing account' };
  // Re-activation of the same plan in the same period (webhook retries, confirm page,
  // subscription.updated) must NOT reset usage, or caps could be bypassed.
  const samePeriod = acc.periodKey === periodKey() && planIdFor(acc.plan) === planId && acc.subscriptionStatus === 'active';
  updateBillingAccount(accountId, {
    plan: planId,
    subscriptionStatus: 'active',
    periodKey: periodKey(),
    periodTurnsUsed: samePeriod ? acc.periodTurnsUsed || 0 : 0,
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
 * Postpaid overage = vendor spend before the customer pays. The approved policy is
 * prepaid blocks only, so this stays false while USAGE_POLICY.overagePrepaidOnly is true.
 */
export function overageAllowed() {
  return !USAGE_POLICY.overagePrepaidOnly && process.env.VOICE_ALLOW_OVERAGE === '1';
}

const BLOCK_CHECKOUT = Object.keys(TOPUP_PACKS).map((id) => `/checkout/voice-pack/${id}`);
const PLAN_CHECKOUT = PLAN_ORDER.map((id) => `/checkout/${id}`);

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
        'This agent is platform-voice only (Retell/Vapi). Choose a Meridian plan (CAD) for Meridian-hosted audio.',
      account: acc,
      checkout: {
        packs: BLOCK_CHECKOUT,
        subscriptions: PLAN_CHECKOUT,
      },
    };
  }

  const prepaid = acc.prepaidTurns || 0;
  const activePlan = acc.subscriptionStatus === 'active' && planIdFor(acc.plan);
  // Included plan minutes are used first; prepaid top-up minutes only after the cap.
  if (prepaid > 0 && !activePlan) {
    return { ok: true, mode: 'prepaid', remaining: prepaid, account: acc };
  }

  if (activePlan) {
    const plan = SUBSCRIPTION_PLANS[planIdFor(acc.plan)];
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
    if (prepaid > 0) {
      return { ok: true, mode: 'prepaid', remaining: prepaid, account: acc };
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
      stopAtCap: USAGE_POLICY.stopAtCap,
      message:
        'Monthly included AI minutes used up. The AI stops at the cap (calls forward to the owner). Buy a prepaid top-up to continue — no unpaid overage.',
      account: acc,
      checkout: {
        packs: BLOCK_CHECKOUT,
      },
      pricing: pricingSnapshot(),
    };
  }

  return {
    ok: false,
    reason: 'insufficient_balance',
    message:
      'No active plan or prepaid minutes. Customer pays first (plan or prepaid top-up), then usage runs. Never the reverse.',
    checkout: {
      packs: BLOCK_CHECKOUT,
      subscriptions: PLAN_CHECKOUT,
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
    const plan = SUBSCRIPTION_PLANS[planIdFor(acc.plan)];
    const pk = periodKey();
    const used = acc.periodKey === pk ? (acc.periodTurnsUsed || 0) + 1 : 1;
    const holdId = rid('hold');
    const priorAlerts = acc.periodKey === pk ? acc.periodAlerts || [] : [];
    const alerts = crossedAlertThresholds(used - 1, used, plan.includedTurns).filter((t) => !priorAlerts.includes(t));
    for (const threshold of alerts) {
      appendLedger({ type: 'usage_alert', accountId, agentId: agentId || acc.agentId, threshold, used, included: plan.includedTurns });
    }
    updateBillingAccount(accountId, {
      periodAlerts: [...priorAlerts, ...alerts],
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
      alerts,
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
    const plan = SUBSCRIPTION_PLANS[planIdFor(acc.plan)] || {};
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
      'Stripe plan/prepaid-block payment (CAD) credited to billing account',
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
    currency: CURRENCY_CODE,
    lifetimeRevenueCad: (revenue / 100).toFixed(2),
    lifetimeCostCadEst: (cost / 100).toFixed(2),
    lifetimeProfitCadEst: ((revenue - cost) / 100).toFixed(2),
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
