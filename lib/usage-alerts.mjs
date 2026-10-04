/**
 * Deliver 80% / 100% usage alerts to the client owner through the existing
 * notify code (email via Resend, SMS via Twilio). Exactly once per
 * account × billing period × metric × threshold (persistent dedupe in
 * processed-events). A failed delivery is released and retried on the next
 * metering event (max 5 attempts).
 */
import { getBillingAccount } from './usage-billing.mjs';
import { claimOnce, completeClaim, releaseClaim } from './processed-events.mjs';
import { formatCad, BLOCKS } from './pricing.mjs';

const MAX_ATTEMPTS = 5;
const LABEL = { minutes: 'AI minutes', sms: 'SMS segments' };

export function usageAlertKey(accountId, period, metric, threshold) {
  return `usage_alert:${accountId}:${period}:${metric}:${threshold}`;
}

function pendingAlerts(acc) {
  return [
    ...(acc.periodAlerts || []).map((t) => ['minutes', t]),
    ...(acc.periodSmsAlerts || []).map((t) => ['sms', t]),
  ];
}

export function usageAlertMessage(acc, metric, threshold, business = '') {
  const pct = Math.round(threshold * 100);
  const name = business || acc.businessName || 'your business';
  const included = metric === 'minutes' ? acc.periodTurnsIncluded : null;
  const block = metric === 'minutes' ? BLOCKS.minutes_100 : BLOCKS.sms_500;
  const atCap = threshold >= 1;
  const subject = atCap
    ? `Meridian: ${name} has used 100% of this month's ${LABEL[metric]}`
    : `Meridian: ${name} has used ${pct}% of this month's ${LABEL[metric]}`;
  const text = [
    `Your Meridian plan has used ${pct}% of the ${LABEL[metric]} included this month${included ? ` (${included})` : ''}.`,
    atCap
      ? metric === 'minutes'
        ? 'The AI receptionist has paused for the rest of the month (stop at cap). Calls go to your team or voicemail instead.'
        : 'AI text replies have paused for the rest of the month (stop at cap).'
      : 'Nothing has changed yet. At 100% the AI pauses until next month or until you add a top-up.',
    `Top-up: ${block.name} for ${formatCad(block.amountCents)} (prepaid, CAD). Top-ups are capped at 1x your plan price per month.`,
    `Billing account: ${acc.id} · period ${acc.periodKey}`,
  ].join('\n');
  const smsText = atCap
    ? `Meridian: 100% of this month's ${LABEL[metric]} used. AI paused (stop at cap). Top-up ${formatCad(block.amountCents)} for ${block.units}.`
    : `Meridian: ${pct}% of this month's ${LABEL[metric]} used. AI pauses at 100%.`;
  return { subject, text, smsText };
}

async function defaultNotify(target, msg) {
  const { notifyOwner } = await import('./notify.mjs');
  return notifyOwner(target, msg);
}

async function defaultGetAgent(id) {
  const { getAgent } = await import('../engine.mjs');
  return getAgent(id);
}

/**
 * Send any not-yet-delivered alerts recorded on the account for its current period.
 * @param {object} deps  { notify(agentLike, {subject,text,smsText,forceSms}), getAgent(id) } — injectable for tests.
 */
export async function deliverUsageAlerts(accountId, { notify = defaultNotify, getAgent = defaultGetAgent } = {}) {
  const acc = getBillingAccount(accountId);
  if (!acc) return { ok: false, sent: [] };
  const sent = [];
  const failed = [];
  for (const [metric, threshold] of pendingAlerts(acc)) {
    const key = usageAlertKey(acc.id, acc.periodKey, metric, threshold);
    const claim = claimOnce(key, { accountId: acc.id, metric, threshold });
    if (!claim.claimed) continue;
    let result;
    try {
      const agent = acc.agentId ? await getAgent(acc.agentId) : null;
      const config = { ...(agent?.config || {}) };
      if (!config.ownerNotifyEmail && !config.notifyEmail && acc.email) config.ownerNotifyEmail = acc.email;
      const target = { ...(agent || {}), businessName: agent?.businessName || acc.businessName || '', config };
      const msg = usageAlertMessage(acc, metric, threshold, target.businessName);
      result = await notify(target, { ...msg, forceSms: true });
    } catch (e) {
      result = { ok: false, error: e.message };
    }
    if (result?.ok) {
      completeClaim(key, { channels: result.results ? Object.keys(result.results).filter((k) => result.results[k]?.ok) : [] });
      sent.push({ metric, threshold });
    } else if ((claim.record?.attempts || 1) >= MAX_ATTEMPTS) {
      completeClaim(key, { delivered: false, gaveUp: true });
      failed.push({ metric, threshold, gaveUp: true });
    } else {
      releaseClaim(key, { error: result?.error || 'delivery_failed' });
      failed.push({ metric, threshold });
    }
  }
  return { ok: failed.length === 0, sent, failed };
}
