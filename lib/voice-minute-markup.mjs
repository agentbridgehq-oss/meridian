/**
 * Voice minute markup — CAD, derived from lib/pricing.mjs (single source of truth).
 * Phone runtime is xAI Grok Voice over Twilio Elastic SIP (legacy: OpenAI Realtime). Vendor cost here is the
 * approved WORST-CASE per-minute COGS, so any quote that clears it is profitable.
 */
import { CURRENCY_CODE, METERED_OVERAGE, OVERAGE, USAGE_POLICY, WORST_CASE_UNIT_COST_CENTS, stripeFeeCentsWorst } from './pricing.mjs';

export const VOICE_RATE_CARD = Object.freeze({
  currency: CURRENCY_CODE,
  runtime: 'xAI Grok Voice via Twilio Elastic SIP',
  customerCadPerMinute: OVERAGE.minuteCents / 100, // prepaid block rate (100 min / CA$45)
  vendorCadPerMinuteWorst: WORST_CASE_UNIT_COST_CENTS.aiMinute / 100,
  roundUpSeconds: USAGE_POLICY.roundUpSeconds,
  paygCadPerMinute: METERED_OVERAGE.minuteCents / 100, // metered PAYG (Stripe Billing Meter)
  perCallSoftWrapMinutes: USAGE_POLICY.perCallSoftWrapMinutes, // nudge only — never drops the call
  perCallAiMinuteCap: USAGE_POLICY.perCallAiMinuteCap, // absolute safety ceiling
  overageMode: USAGE_POLICY.paygOverage ? 'payg_metered_with_card_else_stop_at_cap' : 'stop_at_cap',
  stopAtCap: USAGE_POLICY.stopAtCap,
});

function money(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

export function billedMinutes(durationSeconds, roundUpSeconds = VOICE_RATE_CARD.roundUpSeconds) {
  const seconds = Math.max(0, Number(durationSeconds) || 0);
  const block = Math.max(1, Number(roundUpSeconds) || 60);
  return Math.ceil(seconds / block) * (block / 60);
}

/** AI minutes billed for one call: rounded up, never above the per-call AI cap. */
export function billedAiMinutes(durationSeconds, card = VOICE_RATE_CARD) {
  return Math.min(billedMinutes(durationSeconds, card.roundUpSeconds), card.perCallAiMinuteCap);
}

export function quoteVoiceMinutes(durationSeconds, card = VOICE_RATE_CARD) {
  const minutes = billedAiMinutes(durationSeconds, card);
  const vendorCad = money(minutes * card.vendorCadPerMinuteWorst);
  const customerCad = money(minutes * card.customerCadPerMinute);
  const stripeCad = money(stripeFeeCentsWorst(customerCad * 100, { fixed: false }) / 100);
  return {
    currency: card.currency,
    minutes,
    vendorCad,
    customerCad,
    stripeCad,
    marginCad: money(customerCad - vendorCad - stripeCad),
    customerRate: card.customerCadPerMinute,
    note: 'Overage minutes are sold only as prepaid blocks. Vendor cost is the worst-case COGS from lib/pricing.mjs.',
  };
}
