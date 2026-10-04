import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billedMinutes, billedAiMinutes, quoteVoiceMinutes, VOICE_RATE_CARD } from '../lib/voice-minute-markup.mjs';

test('rounds a short call up to a billed minute', () => {
  assert.equal(billedMinutes(12), 1);
  assert.equal(billedMinutes(61), 2);
});

test('customer CAD rate keeps the spread above worst-case vendor cost and Stripe', () => {
  const quote = quoteVoiceMinutes(120);
  assert.equal(quote.currency, 'CAD');
  assert.equal(quote.minutes, 2);
  assert.equal(quote.customerCad, 0.9); // 2 min x CA$0.45 (100-min block rate)
  assert.equal(VOICE_RATE_CARD.customerCadPerMinute, 0.45);
  assert.ok(quote.vendorCad < quote.customerCad);
  assert.ok(quote.marginCad > 0.2);
});

test('AI minutes per call: 20-min soft wrap-up nudge, 60-min absolute safety ceiling', () => {
  assert.equal(VOICE_RATE_CARD.perCallSoftWrapMinutes, 20);
  assert.equal(VOICE_RATE_CARD.perCallAiMinuteCap, 60);
  assert.equal(VOICE_RATE_CARD.paygCadPerMinute, 0.45);
  assert.equal(billedAiMinutes(45 * 60), 45);
  assert.equal(billedAiMinutes(75 * 60), 60);
  assert.equal(quoteVoiceMinutes(75 * 60).minutes, 60);
});
