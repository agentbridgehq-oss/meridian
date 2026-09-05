import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProductionVoiceAudioProfile,
  buildBrowserVoiceAudioProfile,
  normalizeRealtimeVoice,
  normalizeRealtimeSpeed,
  realtimeVoiceCapabilities,
} from '../lib/realtime-voice-profile.mjs';

test('production phone profile uses quality voice, interruption and idle recovery', () => {
  const profile = buildProductionVoiceAudioProfile({ voice: 'cedar', speed: 1.05, language: 'en' });
  assert.equal(profile.output.voice, 'cedar');
  assert.equal(profile.output.speed, 1.05);
  assert.equal(profile.input.noise_reduction.type, 'near_field');
  assert.equal(profile.input.transcription.model, 'gpt-4o-transcribe');
  assert.equal(profile.input.transcription.language, 'en');
  assert.equal(profile.input.turn_detection.type, 'server_vad');
  assert.equal(profile.input.turn_detection.create_response, true);
  assert.equal(profile.input.turn_detection.interrupt_response, true);
  assert.ok(profile.input.turn_detection.idle_timeout_ms >= 3000);
});

test('browser profile uses far-field cleanup and semantic turn detection', () => {
  const profile = buildBrowserVoiceAudioProfile({ voice: 'marin' });
  assert.equal(profile.output.voice, 'marin');
  assert.equal(profile.input.noise_reduction.type, 'far_field');
  assert.equal(profile.input.turn_detection.type, 'semantic_vad');
  assert.equal(profile.input.turn_detection.interrupt_response, true);
});

test('voice and speed inputs fail safely to supported bounds', () => {
  assert.equal(normalizeRealtimeVoice('not-a-real-voice'), 'marin');
  assert.equal(normalizeRealtimeVoice('CEDAR'), 'cedar');
  assert.equal(normalizeRealtimeSpeed(99), 1.25);
  assert.equal(normalizeRealtimeSpeed(0.1), 0.75);
  const caps = realtimeVoiceCapabilities();
  assert.deepEqual(caps.recommendedVoices, ['marin','cedar']);
  assert.equal(caps.production.interruption, true);
  assert.equal(caps.production.idleRecovery, true);
});
