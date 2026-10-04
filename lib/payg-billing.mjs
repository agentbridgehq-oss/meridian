/**
 * Pay-as-you-go overage via Stripe usage-based billing (Billing Meters).
 *
 * Kenny 2026-10-04: calls must never drop. For clients with a valid card on file and
 * PAYG enabled, usage beyond plan caps + prepaid blocks keeps working and is reported
 * to Stripe as meter events; Stripe bills it on the subscription invoice (optionally
 * early via billing_thresholds.amount_gte, default every CA$50).
 *
 * Idempotency (two layers):
 *  1. Our processed-events ledger: one claim per usage identifier (one per call /
 *     per SMS message) → the outbox never holds the same usage twice, across restarts.
 *  2. Stripe: meter event `identifier` (Stripe dedupes ≥ 24 h) + Idempotency-Key header.
 * Usage is written to a durable outbox first, then flushed (retries on 5xx/429/network).
 *
 * Payment failure (invoice.payment_failed): live calls are never cut; NEW calls go to
 * voicemail / team line (no AI) until invoice.paid. Kenny and the client are alerted.
 *
 * Docs: https://docs.stripe.com/api/billing/meter-event/create
 *       https://docs.stripe.com/billing/subscriptions/usage-based/thresholds
 * No Stripe call is made here unless a `stripe` client is passed in (tests use mocks).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { METERED_OVERAGE, USAGE_POLICY, formatCad } from './pricing.mjs';
import { getBillingAccount, listBillingAccounts, updateBillingAccount, usageState, planIdFor, SUBSCRIPTION_PLANS, setPaygUsageSink } from './usage-billing.mjs';
import { claimOnce, completeClaim, releaseClaim } from './processed-events.mjs';
import { notifyKenny } from './owner-alerts.mjs';
import { customerPortalUrl, manageBillingLine } from './customer-portal.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = () => process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(__dirname, '..', 'data');
const outboxFile = () => path.join(dataDir(), 'meter-outbox.json');
const MAX_EVENT_AGE_MS = 34 * 24 * 3600 * 1000; // Stripe accepts timestamps up to 35 days old

export function paygConfig(env = process.env) {
  const threshold = env.MERIDIAN_PAYG_THRESHOLD_CENTS === undefined || env.MERIDIAN_PAYG_THRESHOLD_CENTS === ''
    ? USAGE_POLICY.paygBillingThresholdCents
    : Math.max(0, Math.round(Number(env.MERIDIAN_PAYG_THRESHOLD_CENTS) || 0));
  const minutePriceId = String(env.STRIPE_PRICE_OVERAGE_MINUTE || '').trim();
  const smsPriceId = String(env.STRIPE_PRICE_OVERAGE_SMS || '').trim();
  return {
    minuteEventName: String(env.STRIPE_METER_EVENT_MINUTES || 'meridian_ai_minutes').trim(),
    smsEventName: String(env.STRIPE_METER_EVENT_SMS || 'meridian_sms_segments').trim(),
    minutePriceId,
    smsPriceId,
    thresholdCents: threshold && threshold < 50 ? 50 : threshold, // Stripe minimum amount_gte is 50
    configured: Boolean(minutePriceId && smsPriceId),
    minuteCents: METERED_OVERAGE.minuteCents,
    smsSegmentCents: METERED_OVERAGE.smsSegmentCents,
  };
}

/**
 * PAYG state for an account.
 *  eligible  → no stop at cap (metered overage)
 *  blocked   → payment failed: new calls go to voicemail, no AI
 *  otherwise → classic stop at cap
 */
export function paygState(accOrId) {
  const acc = typeof accOrId === 'string' ? getBillingAccount(accOrId) : accOrId;
  if (!acc) return { enabled: false, eligible: false, blocked: false, reason: 'no_account' };
  const p = acc.payg || {};
  const paymentFailed = acc.paymentState === 'failed';
  const enabled = Boolean(p.enabled);
  const active = Boolean(usageState(acc)?.active);
  let reason = 'ok';
  if (paymentFailed) reason = 'payment_failed';
  else if (!enabled) reason = 'payg_off';
  else if (!acc.stripeCustomerId) reason = 'no_stripe_customer';
  else if (p.paymentMethodOk !== true) reason = 'no_valid_card';
  else if (!active) reason = 'plan_inactive';
  return { enabled, eligible: reason === 'ok', blocked: paymentFailed, reason, alertCents: paygAlertCents(acc) };
}

/** Optional informational spend alert (client-settable); default = 1x plan price of overage per month. */
export function paygAlertCents(acc) {
  if (Number(acc?.payg?.alertCents) > 0) return Math.round(Number(acc.payg.alertCents));
  const pid = planIdFor(acc?.plan);
  return pid ? Math.round(SUBSCRIPTION_PLANS[pid].amount * USAGE_POLICY.paygSpendAlertMultiple) : 0;
}

export function enablePayg(accountId, { stripeSubscriptionId = '', stripeCustomerId = '', minuteItemId = '', smsItemId = '', paymentMethodOk = false, alertCents } = {}) {
  const acc = getBillingAccount(accountId);
  if (!acc) return null;
  return updateBillingAccount(accountId, {
    ...(stripeCustomerId ? { stripeCustomerId } : {}),
    ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
    payg: {
      ...(acc.payg || {}),
      enabled: true,
      paymentMethodOk: Boolean(paymentMethodOk),
      minuteItemId: minuteItemId || acc.payg?.minuteItemId || '',
      smsItemId: smsItemId || acc.payg?.smsItemId || '',
      ...(alertCents !== undefined ? { alertCents: Math.max(0, Math.round(Number(alertCents) || 0)) } : {}),
      enabledAt: acc.payg?.enabledAt || new Date().toISOString(),
    },
  });
}

export function disablePayg(accountId) {
  const acc = getBillingAccount(accountId);
  if (!acc) return null;
  return updateBillingAccount(accountId, { payg: { ...(acc.payg || {}), enabled: false, disabledAt: new Date().toISOString() } });
}

/** Client-settable informational spend alert (CAD cents). 0 = back to default (1x plan price). */
export function setPaygAlertCents(accountId, cents) {
  const acc = getBillingAccount(accountId);
  if (!acc) return null;
  return updateBillingAccount(accountId, { payg: { ...(acc.payg || {}), alertCents: Math.max(0, Math.round(Number(cents) || 0)) } });
}

// ── Outbox ───────────────────────────────────────────────────────────────────

function loadOutbox() {
  try { return JSON.parse(fs.readFileSync(outboxFile(), 'utf8')); } catch { return { events: [] }; }
}
function saveOutbox(data) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = `${outboxFile()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, outboxFile());
}
export function listMeterOutbox({ status } = {}) {
  const events = loadOutbox().events || [];
  return status ? events.filter((e) => e.status === status) : events;
}

function cleanIdentifier(id) {
  return String(id || '').replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 100);
}

/**
 * Queue billable overage units for Stripe. Synchronous (claim + outbox write in one
 * tick), so concurrent settles of the same call / message can only queue once.
 * @returns {{ ok, queued, duplicate?, event? }}
 */
export function recordMeteredUsage(accountId, { metric, units, identifier, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const n = Math.floor(Number(units) || 0);
  if (!(n > 0)) return { ok: true, queued: false, reason: 'no_units' };
  if (!['minutes', 'sms'].includes(metric)) return { ok: false, queued: false, reason: 'bad_metric' };
  const acc = getBillingAccount(accountId);
  if (!acc?.stripeCustomerId) return { ok: false, queued: false, reason: 'no_stripe_customer' };
  const id = cleanIdentifier(identifier || `${metric}_${accountId}_${crypto.randomUUID()}`);
  const key = `meter_event:${id}`;
  if (!claimOnce(key, { accountId, metric, units: n }).claimed) return { ok: true, queued: false, duplicate: true, identifier: id };
  const cfg = paygConfig();
  const event = {
    identifier: id,
    accountId,
    customerId: acc.stripeCustomerId,
    metric,
    eventName: metric === 'minutes' ? cfg.minuteEventName : cfg.smsEventName,
    value: n,
    amountCents: n * (metric === 'minutes' ? cfg.minuteCents : cfg.smsSegmentCents),
    timestamp,
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  const box = loadOutbox();
  box.events = [...(box.events || []), event].slice(-20000);
  saveOutbox(box);
  completeClaim(key, { queued: true });
  return { ok: true, queued: true, identifier: id, event };
}

let flushing = null;

/**
 * Send pending meter events to Stripe. One flush at a time per process.
 * 4xx (except 429) → 'failed' + Kenny alert (needs a human); 5xx/429/network → retry later.
 */
export function flushMeterOutbox({ stripe, now = Date.now(), notify, limit = 200 } = {}) {
  if (!stripe?.billing?.meterEvents?.create) return Promise.resolve({ ok: false, skipped: true, reason: 'stripe_not_configured' });
  if (flushing) return flushing;
  flushing = (async () => {
    const sent = [], failed = [], retry = [];
    const pending = listMeterOutbox({ status: 'pending' }).slice(0, limit);
    for (const ev of pending) {
      let patch;
      if (now - ev.timestamp * 1000 > MAX_EVENT_AGE_MS) {
        patch = { status: 'expired', lastError: 'older_than_stripe_window' };
        failed.push(ev.identifier);
      } else {
        try {
          await stripe.billing.meterEvents.create(
            { event_name: ev.eventName, payload: { stripe_customer_id: ev.customerId, value: String(ev.value) }, identifier: ev.identifier, timestamp: ev.timestamp },
            { idempotencyKey: `meridian_meter_${ev.identifier}` },
          );
          patch = { status: 'sent', sentAt: new Date(now).toISOString() };
          sent.push(ev.identifier);
        } catch (e) {
          const code = Number(e?.statusCode || e?.raw?.statusCode || 0);
          const permanent = code >= 400 && code < 500 && code !== 429 && code !== 409;
          patch = { status: permanent ? 'failed' : 'pending', attempts: (ev.attempts || 0) + 1, lastError: String(e?.message || 'error').slice(0, 300) };
          (permanent ? failed : retry).push(ev.identifier);
        }
      }
      const box = loadOutbox();
      box.events = box.events.map((x) => (x.identifier === ev.identifier ? { ...x, ...patch } : x));
      saveOutbox(box);
    }
    if (failed.length) {
      await notifyKenny({
        subject: `Meridian: ${failed.length} usage event(s) could not be billed in Stripe`,
        text: `These metered usage events failed permanently or expired and need a manual invoice item:\n${failed.join('\n')}`,
      }, notify ? { send: notify } : {}).catch(() => {});
    }
    return { ok: failed.length === 0, sent, failed, retry };
  })().finally(() => { flushing = null; });
  return flushing;
}

// ── Payment state + notifications ────────────────────────────────────────────

function accountByCustomer(customerId) {
  if (!customerId) return null;
  return listBillingAccounts().find((a) => a.stripeCustomerId === customerId) || null;
}

async function notifyClient(acc, msg, { notifyClientFn } = {}) {
  try {
    if (notifyClientFn) return await notifyClientFn(acc, msg);
    const { getAgent } = await import('../engine.mjs');
    const { notifyOwner } = await import('./notify.mjs');
    const agent = acc.agentId ? getAgent(acc.agentId) : null;
    const config = { ...(agent?.config || {}) };
    if (!config.ownerNotifyEmail && !config.notifyEmail && acc.email) config.ownerNotifyEmail = acc.email;
    return await notifyOwner({ ...(agent || {}), businessName: agent?.businessName || acc.businessName || '', config }, { ...msg, forceSms: true });
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Mark an account's payment as failed (idempotent per invoice) and alert Kenny + client once. */
export async function markPaymentFailed(accountId, { invoiceId = '', reason = '', deps = {} } = {}) {
  const acc = getBillingAccount(accountId);
  if (!acc) return { ok: false, reason: 'no_account' };
  updateBillingAccount(accountId, { paymentState: 'failed', paymentFailedAt: new Date().toISOString(), paymentFailedInvoiceId: invoiceId || acc.paymentFailedInvoiceId || '', paymentFailedReason: String(reason || '').slice(0, 200) });
  const key = `payg_payment_failed:${accountId}:${invoiceId || 'unknown'}`;
  if (!claimOnce(key).claimed) return { ok: true, duplicate: true };
  const name = acc.businessName || acc.email || acc.id;
  const clientMsg = {
    subject: `Meridian: payment failed for ${name} — AI receptionist paused for new calls`,
    text: `We couldn't charge your card for Meridian${invoiceId ? ` (invoice ${invoiceId})` : ''}. Calls already in progress were not interrupted. New calls now go to voicemail / your team line until the payment goes through. Update your card from the Stripe invoice email and service resumes automatically.\n\n${manageBillingLine()}`,
    smsText: `Meridian: card payment failed. New calls go to voicemail until it's fixed. Live calls were not cut. Update your card: ${customerPortalUrl()}`,
  };
  const [client, owner] = await Promise.all([
    notifyClient(acc, clientMsg, deps),
    notifyKenny({ subject: `Meridian: payment failed — ${name}`, text: `Account ${acc.id} (${acc.email || 'no email'}) payment failed${invoiceId ? ` on ${invoiceId}` : ''}${reason ? `: ${reason}` : ''}. New calls → voicemail (no AI) until invoice.paid.` }, deps.send ? { send: deps.send } : {}),
  ]);
  completeClaim(key, { client: Boolean(client?.ok), owner: Boolean(owner?.ok) });
  return { ok: true, client, owner };
}

export async function markPaymentRestored(accountId, { invoiceId = '', deps = {} } = {}) {
  const acc = getBillingAccount(accountId);
  if (!acc) return { ok: false, reason: 'no_account' };
  if (acc.paymentState !== 'failed') return { ok: true, unchanged: true };
  // Only the invoice that failed (when known) restores service; paying a later, unrelated
  // invoice must not unblock an account that still owes the failed one.
  if (acc.paymentFailedInvoiceId && invoiceId && invoiceId !== acc.paymentFailedInvoiceId) {
    return { ok: true, unchanged: true, reason: 'different_invoice' };
  }
  updateBillingAccount(accountId, { paymentState: 'ok', paymentRestoredAt: new Date().toISOString() });
  const key = `payg_payment_restored:${accountId}:${invoiceId || 'unknown'}`;
  if (!claimOnce(key).claimed) return { ok: true, duplicate: true };
  const name = acc.businessName || acc.email || acc.id;
  await Promise.all([
    notifyClient(acc, { subject: `Meridian: payment received — AI receptionist is back on`, text: `Thanks — your payment went through and the AI receptionist is answering calls again.\n\n${manageBillingLine()}`, smsText: 'Meridian: payment received. AI receptionist is back on.' }, deps),
    notifyKenny({ subject: `Meridian: payment restored — ${name}`, text: `Account ${acc.id} paid${invoiceId ? ` ${invoiceId}` : ''}. AI calls restored.` }, deps.send ? { send: deps.send } : {}),
  ]);
  completeClaim(key);
  return { ok: true, restored: true };
}

/**
 * Handle the Stripe webhook events PAYG cares about. Returns { handled }.
 * Events: invoice.payment_failed, invoice.paid, invoice.payment_succeeded,
 *         payment_method.detached, customer.subscription.updated (card re-saved),
 *         customer.subscription.deleted (PAYG off).
 */
export async function handlePaygStripeEvent(event, deps = {}) {
  const obj = event?.data?.object || {};
  switch (event?.type) {
    case 'invoice.payment_failed': {
      const acc = accountByCustomer(String(obj.customer || ''));
      if (!acc) return { handled: false, reason: 'unknown_customer' };
      const reason = obj.last_finalization_error?.message || obj.billing_reason || '';
      return { handled: true, ...(await markPaymentFailed(acc.id, { invoiceId: obj.id, reason, deps })) };
    }
    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      const acc = accountByCustomer(String(obj.customer || ''));
      if (!acc) return { handled: false, reason: 'unknown_customer' };
      return { handled: true, ...(await markPaymentRestored(acc.id, { invoiceId: obj.id, deps })) };
    }
    case 'payment_method.detached': {
      const customer = String(event.data?.previous_attributes?.customer || '');
      const acc = accountByCustomer(customer);
      if (!acc?.payg?.enabled) return { handled: false };
      updateBillingAccount(acc.id, { payg: { ...acc.payg, paymentMethodOk: false } });
      await notifyKenny({ subject: `Meridian: card removed — ${acc.businessName || acc.id}`, text: `Payment method detached for ${acc.id}; PAYG overage is off until a card is saved (back to stop at cap).` }, deps.send ? { send: deps.send } : {});
      return { handled: true, paymentMethodOk: false };
    }
    case 'customer.subscription.updated': {
      // A new default card saved on the subscription re-arms PAYG after a detach.
      const acc = accountByCustomer(String(obj.customer || ''));
      if (!acc?.payg?.enabled || !obj.default_payment_method || acc.payg.paymentMethodOk) return { handled: false };
      updateBillingAccount(acc.id, { payg: { ...acc.payg, paymentMethodOk: true } });
      return { handled: true, paymentMethodOk: true };
    }
    case 'customer.subscription.deleted': {
      const acc = accountByCustomer(String(obj.customer || ''));
      if (!acc?.payg?.enabled) return { handled: false };
      disablePayg(acc.id);
      return { handled: true, disabled: true };
    }
    default:
      return { handled: false };
  }
}

/**
 * After a PAYG plan checkout completes: confirm the subscription has a saved default
 * payment method and the metered overage items, enable PAYG, and set the billing
 * threshold (charge early every CA$50 of usage by default).
 */
export async function enablePaygFromCheckout(session, { stripe, accountId, env = process.env } = {}) {
  if (session?.metadata?.payg !== '1') return { ok: true, enabled: false, reason: 'not_opted_in' };
  const cfg = paygConfig(env);
  if (!cfg.configured) return { ok: false, enabled: false, reason: 'metered_prices_not_configured' };
  const subId = String(session.subscription || '');
  if (!stripe || !subId || !accountId) return { ok: false, enabled: false, reason: 'missing_stripe_or_subscription' };
  const sub = await stripe.subscriptions.retrieve(subId);
  const items = sub?.items?.data || [];
  const minuteItem = items.find((i) => i.price?.id === cfg.minutePriceId);
  const smsItem = items.find((i) => i.price?.id === cfg.smsPriceId);
  const paymentMethodOk = Boolean(sub?.default_payment_method);
  if (!minuteItem || !smsItem) return { ok: false, enabled: false, reason: 'metered_items_missing' };
  enablePayg(accountId, {
    stripeSubscriptionId: subId,
    stripeCustomerId: String(sub.customer || session.customer || ''),
    minuteItemId: minuteItem.id,
    smsItemId: smsItem.id,
    paymentMethodOk,
  });
  let threshold = null;
  if (cfg.thresholdCents > 0) {
    await stripe.subscriptions.update(
      subId,
      { billing_thresholds: { amount_gte: cfg.thresholdCents, reset_billing_cycle_anchor: false } },
      { idempotencyKey: `meridian_threshold_${subId}_${cfg.thresholdCents}` },
    );
    threshold = cfg.thresholdCents;
  }
  return { ok: true, enabled: true, paymentMethodOk, thresholdCents: threshold };
}

/** Informational spend alert: once per account per period when metered overage passes the alert amount. */
export async function maybeAlertPaygSpend(accountId, deps = {}) {
  const acc = getBillingAccount(accountId);
  if (!acc?.payg?.enabled) return { alerted: false };
  const limit = paygAlertCents(acc);
  if (!(limit > 0) || (acc.periodPaygCents || 0) < limit) return { alerted: false };
  const key = `payg_spend_alert:${acc.id}:${acc.periodKey}:${limit}`;
  if (!claimOnce(key).claimed) return { alerted: false, duplicate: true };
  const msg = {
    subject: `Meridian: pay-as-you-go usage passed ${formatCad(limit)} this month`,
    text: `Overage this month: ${acc.periodPaygMinutes || 0} AI minutes and ${acc.periodPaygSms || 0} SMS segments = ${formatCad(acc.periodPaygCents || 0)} (CA$0.45/min, CA$0.07/segment). Calls keep working; this is informational. You can change this alert amount any time.`,
    smsText: `Meridian: overage passed ${formatCad(limit)} this month (${formatCad(acc.periodPaygCents || 0)}). Calls keep working.`,
  };
  const [client] = await Promise.all([
    notifyClient(acc, msg, deps),
    notifyKenny({ subject: `${msg.subject} — ${acc.businessName || acc.id}`, text: msg.text }, deps.send ? { send: deps.send } : {}),
  ]);
  if (!client?.ok) releaseClaim(key, { error: 'client_notify_failed' });
  else completeClaim(key);
  return { alerted: Boolean(client?.ok) };
}

// Every voice settle (incl. the stale-hold sweeper) queues its PAYG minutes here.
setPaygUsageSink(recordMeteredUsage);
