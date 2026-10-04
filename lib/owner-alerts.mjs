/**
 * Alerts to Kenny (the Meridian owner), via the existing notify code.
 *   MERIDIAN_OWNER_EMAIL  — email via Resend (sendOwnerEmail)
 *   MERIDIAN_OWNER_PHONE  — SMS via Twilio (sendSms)
 * Falls back to OWNER_EMAIL / OWNER_PHONE when the MERIDIAN_ names are unset.
 *
 * AI cost guard: once per month (persistent dedupe), alert when the estimated
 * AI-vendor (xAI) cost across all clients exceeds MERIDIAN_AI_COST_ALERT_PCT
 * (default 35) percent of Meridian revenue for that month.
 */
import { listBillingAccounts, planIdFor, SUBSCRIPTION_PLANS } from './usage-billing.mjs';
import { claimOnce, completeClaim, releaseClaim } from './processed-events.mjs';
import { formatCad } from './pricing.mjs';

export function ownerContacts(env = process.env) {
  return {
    email: String(env.MERIDIAN_OWNER_EMAIL || env.OWNER_EMAIL || '').trim(),
    phone: String(env.MERIDIAN_OWNER_PHONE || env.OWNER_PHONE || '').trim(),
  };
}

async function defaultSend({ email, phone }, { subject, text, smsText }) {
  const { sendOwnerEmail, sendSms } = await import('./notify.mjs');
  const results = {
    email: email ? await sendOwnerEmail({ to: email, subject, text }) : { ok: false, skipped: true, reason: 'no_owner_email' },
    sms: phone ? await sendSms({ to: phone, body: smsText || subject }) : { ok: false, skipped: true, reason: 'no_owner_phone' },
  };
  return { ok: Boolean(results.email?.ok || results.sms?.ok), results };
}

/** Send an alert to Kenny. `send` is injectable for tests. Never throws. */
export async function notifyKenny(msg, { send = defaultSend, env = process.env } = {}) {
  const to = ownerContacts(env);
  if (!to.email && !to.phone) return { ok: false, skipped: true, reason: 'no_owner_contact' };
  try {
    return await send(to, msg);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function currentPeriod(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Month-to-date AI vendor cost vs revenue (CAD cents, estimates).
 * Revenue = active plan price + prepaid blocks bought this month + metered PAYG overage.
 * Cost = xAI share of every billed minute / outbound segment (worst-case unit cost unless
 * MERIDIAN_AI_COST_BASIS=expected). Replace with the real xAI invoice when reconciling.
 */
export function aiCostRevenueSnapshot({ period = currentPeriod() } = {}) {
  let revenueCents = 0;
  let aiCostCents = 0;
  let accounts = 0;
  for (const acc of listBillingAccounts()) {
    if (acc.periodKey !== period) continue;
    accounts += 1;
    const pid = planIdFor(acc.plan);
    if (pid && acc.subscriptionStatus === 'active') revenueCents += SUBSCRIPTION_PLANS[pid].amount;
    revenueCents += (acc.periodOverageCents || 0) + (acc.periodPaygCents || 0);
    aiCostCents += acc.periodAiCostCentsEst || 0;
  }
  const ratio = revenueCents > 0 ? aiCostCents / revenueCents : aiCostCents > 0 ? Infinity : 0;
  return { period, accounts, revenueCents, aiCostCents: Math.round(aiCostCents), ratio };
}

export function aiCostAlertPct(env = process.env) {
  const n = Number(env.MERIDIAN_AI_COST_ALERT_PCT);
  return Number.isFinite(n) && n > 0 ? n : 35;
}

/** Once per month: alert Kenny when AI vendor cost > threshold % of revenue. */
export async function maybeAlertAiCostRatio({ period, send, env = process.env } = {}) {
  const snap = aiCostRevenueSnapshot({ period: period || currentPeriod() });
  const pct = aiCostAlertPct(env);
  if (!(snap.aiCostCents > 0) || snap.ratio * 100 <= pct) return { ok: true, alerted: false, ...snap, thresholdPct: pct };
  const key = `owner_ai_cost_alert:${snap.period}`;
  const claim = claimOnce(key, { ratio: snap.ratio });
  if (!claim.claimed) return { ok: true, alerted: false, duplicate: true, ...snap, thresholdPct: pct };
  const pctNow = Number.isFinite(snap.ratio) ? (snap.ratio * 100).toFixed(1) : 'n/a';
  const subject = `Meridian: AI vendor cost is ${pctNow}% of revenue (${snap.period})`;
  const text = [
    `Estimated xAI cost this month: ${formatCad(snap.aiCostCents)} vs revenue ${formatCad(snap.revenueCents)} (${pctNow}%; alert above ${pct}%).`,
    `Accounts counted: ${snap.accounts}. Cost basis: ${env.MERIDIAN_AI_COST_BASIS === 'expected' ? 'expected' : 'worst-case'} unit cost.`,
    'Check the xAI console usage explorer, heavy PAYG clients and long calls. This alert is sent once per month.',
  ].join('\n');
  const result = await notifyKenny({ subject, text, smsText: subject }, { send, env });
  if (result.ok || result.skipped) completeClaim(key, { delivered: Boolean(result.ok) });
  else releaseClaim(key, { error: result.error || 'delivery_failed' });
  return { ok: Boolean(result.ok), alerted: Boolean(result.ok), ...snap, thresholdPct: pct };
}
