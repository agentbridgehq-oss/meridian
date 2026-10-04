/**
 * Voice minute markup.
 * xAI bills Meridian's API key. The customer is billed by Meridian.
 * Do not pass the vendor invoice through. Publish one customer rate.
 */

export const VOICE_RATE_CARD = Object.freeze({
  currency: 'USD',
  xaiSpeechToSpeechUsdPerMinute: 0.08,
  twilioInboundLocalUsdPerMinute: 0.0085,
  customerUsdPerMinute: 0.2,
  includedMinutes: 200,
  numberUsdPerMonth: 19,
  roundUpSeconds: 60,
  pauseAtZeroBalance: true,
});

function money(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

export function billedMinutes(durationSeconds, roundUpSeconds = VOICE_RATE_CARD.roundUpSeconds) {
  const seconds = Math.max(0, Number(durationSeconds) || 0);
  const block = Math.max(1, Number(roundUpSeconds) || 60);
  return Math.ceil(seconds / block) * (block / 60);
}

export function quoteVoiceMinutes(durationSeconds, card = VOICE_RATE_CARD) {
  const minutes = billedMinutes(durationSeconds, card.roundUpSeconds);
  const vendorUsd = money(minutes * (card.xaiSpeechToSpeechUsdPerMinute + card.twilioInboundLocalUsdPerMinute));
  const customerUsd = money(minutes * card.customerUsdPerMinute);
  return {
    minutes,
    vendorUsd,
    customerUsd,
    marginUsd: money(customerUsd - vendorUsd),
    customerRate: card.customerUsdPerMinute,
    note: 'Customer pays the published rate. xAI invoices Meridian separately.',
  };
}
