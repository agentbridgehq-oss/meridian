/**
 * Voice minute markup.
 * xAI bills Meridian's API key. The customer is billed by Meridian.
 * Published rate is set under managed-answering overage, not under wholesale pipes.
 */

export const VOICE_RATE_CARD = Object.freeze({
  currency: 'USD',
  xaiSpeechToSpeechUsdPerMinute: 0.08,
  twilioInboundLocalUsdPerMinute: 0.0085,
  twilioNumberUsdPerMonth: 1.15,
  customerUsdPerMinute: 0.35,
  includedMinutes: 200,
  numberUsdPerMonth: 19,
  roundUpSeconds: 60,
  pauseAtZeroBalance: true,
  pricedAgainst: 'Middle of inbound reseller band $0.25-$0.45. Smith.ai AI ~$1.60-$2.40 per call. Not Vapi/Retell wholesale.',
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
