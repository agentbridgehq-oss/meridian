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

test('AI minutes per call never exceed the 20-minute per-call cap', () => {
  assert.equal(VOICE_RATE_CARD.perCallAiMinuteCap, 20);
  assert.equal(billedAiMinutes(45 * 60), 20);
  assert.equal(quoteVoiceMinutes(45 * 60).minutes, 20);
});
