import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billedMinutes, quoteVoiceMinutes, VOICE_RATE_CARD } from '../lib/voice-minute-markup.mjs';

test('rounds a short call up to a billed minute', () => {
  assert.equal(billedMinutes(12), 1);
  assert.equal(billedMinutes(61), 2);
});

test('customer rate keeps the spread above xAI plus Twilio', () => {
  const quote = quoteVoiceMinutes(120);
  assert.equal(quote.minutes, 2);
  assert.equal(quote.customerUsd, 0.4);
  assert.ok(quote.vendorUsd < quote.customerUsd);
  assert.equal(VOICE_RATE_CARD.xaiSpeechToSpeechUsdPerMinute, 0.08);
  assert.ok(quote.marginUsd > 0.2);
});
