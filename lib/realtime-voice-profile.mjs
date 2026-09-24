const BUILTIN_VOICES = Object.freeze(['alloy','ash','ballad','coral','echo','sage','shimmer','verse','marin','cedar']);
const SEMANTIC_EAGERNESS = new Set(['low','medium','high','auto']);

function clean(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function numberEnv(name, fallback, min, max) {
  const parsed = Number(process.env[name]);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, value));
}

export function normalizeRealtimeVoice(value, fallback = 'marin') {
  const candidate = clean(value, 80).toLowerCase();
  return BUILTIN_VOICES.includes(candidate) ? candidate : fallback;
}

export function normalizeRealtimeSpeed(value, fallback = 1) {
  const parsed = Number(value);
  return Math.max(0.75, Math.min(1.25, Number.isFinite(parsed) ? parsed : fallback));
}

function transcription(language = 'en') {
  const normalizedLanguage = /^[a-z]{2}$/i.test(clean(language, 8)) ? clean(language, 8).toLowerCase() : 'en';
  return {
    model: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',
    language: normalizedLanguage,
  };
}

function semanticEagerness() {
  const value = clean(process.env.MERIDIAN_VOICE_DEMO_VAD_EAGERNESS, 16).toLowerCase();
  return SEMANTIC_EAGERNESS.has(value) ? value : 'medium';
}

export function buildProductionVoiceAudioProfile({ voice = 'marin', speed = 1, language = 'en' } = {}) {
  return {
    input: {
      noise_reduction: { type: 'near_field' },
      transcription: transcription(language),
      turn_detection: {
        type: 'server_vad',
        threshold: numberEnv('MERIDIAN_VOICE_VAD_THRESHOLD', 0.5, 0.25, 0.9),
        prefix_padding_ms: Math.round(numberEnv('MERIDIAN_VOICE_PREFIX_PADDING_MS', 300, 100, 1000)),
        silence_duration_ms: Math.round(numberEnv('MERIDIAN_VOICE_SILENCE_MS', 450, 200, 1500)),
        idle_timeout_ms: Math.round(numberEnv('MERIDIAN_VOICE_IDLE_TIMEOUT_MS', 8000, 3000, 30000)),
        create_response: true,
        interrupt_response: true,
      },
    },
    output: {
      voice: normalizeRealtimeVoice(voice),
      speed: normalizeRealtimeSpeed(speed),
    },
  };
}

export function buildBrowserVoiceAudioProfile({ voice = 'marin', speed = 1, language = 'en' } = {}) {
  return {
    input: {
      noise_reduction: { type: 'far_field' },
      transcription: transcription(language),
      turn_detection: {
        type: 'semantic_vad',
        eagerness: semanticEagerness(),
        create_response: true,
        interrupt_response: true,
      },
    },
    output: {
      voice: normalizeRealtimeVoice(voice),
      speed: normalizeRealtimeSpeed(speed),
    },
  };
}

export function realtimeVoiceCapabilities() {
  return {
    voices: [...BUILTIN_VOICES],
    recommendedVoices: ['marin','cedar'],
    production: {
      noiseReduction: 'near_field',
      turnDetection: 'server_vad',
      interruption: true,
      idleRecovery: true,
      transcription: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',
    },
    browser: {
      noiseReduction: 'far_field',
      turnDetection: 'semantic_vad',
      interruption: true,
      transcription: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',
    },
  };
}
