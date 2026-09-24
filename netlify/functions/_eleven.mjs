/**
 * Shared ElevenLabs TTS helper for Netlify functions.
 * Mirrors lib/elevenlabs.mjs enough to run without the Node server.
 * Never log or return the API key.
 */

const API = 'https://api.elevenlabs.io/v1';
const DEFAULT_MODEL = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
const DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

export const MERIDIAN_TO_ELEVEN = {
  ara: process.env.ELEVENLABS_VOICE_ARA || '21m00Tcm4TlvDq8ikWAM', // Rachel
  eve: process.env.ELEVENLABS_VOICE_EVE || 'EXAVITQu4vr4xnSDxMaL', // Bella
  leo: process.env.ELEVENLABS_VOICE_LEO || 'JBFqnCBsd6RMkjVDRZzb', // George
  rex: process.env.ELEVENLABS_VOICE_REX || 'pNInz6obpgDQGcFmaJgB', // Adam
};

export const PREVIEW_CATALOG = [
  { id: 'ara', voice_id: 'ara', name: 'Ara', tagline: 'Warm receptionist', gender: 'female', provider: 'elevenlabs' },
  { id: 'eve', voice_id: 'eve', name: 'Eve', tagline: 'Energetic', gender: 'female', provider: 'elevenlabs' },
  { id: 'leo', voice_id: 'leo', name: 'Leo', tagline: 'Authoritative', gender: 'male', provider: 'elevenlabs' },
  { id: 'rex', voice_id: 'rex', name: 'Rex', tagline: 'Professional', gender: 'male', provider: 'elevenlabs' },
];

export function keyPresent() {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

export function elevenlabsArmed() {
  return process.env.VOICE_ENABLE_ELEVENLABS === '1' && keyPresent();
}

export function resolveElevenVoiceId(voiceId) {
  const raw = String(voiceId || '').trim();
  if (!raw) return DEFAULT_VOICE;
  const mapped = MERIDIAN_TO_ELEVEN[raw.toLowerCase()];
  if (mapped) return mapped;
  return raw.slice(0, 64);
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.PUBLIC_SITE_ORIGIN || 'https://meridian-open.netlify.app',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
}

export function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(body),
  };
}

export async function listElevenVoices() {
  if (!keyPresent()) return { ok: true, mode: 'browser', voices: PREVIEW_CATALOG };
  const res = await fetch(`${API}/voices`, {
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY.trim() },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    return { ok: false, error: `voices_${res.status}`, voices: PREVIEW_CATALOG };
  }
  const data = await res.json();
  const remote = (data.voices || []).slice(0, 12).map((v) => ({
    id: v.voice_id,
    voice_id: v.voice_id,
    name: v.name,
    tagline: v.category || 'ElevenLabs',
    provider: 'elevenlabs',
  }));
  return { ok: true, mode: 'elevenlabs', voices: [...PREVIEW_CATALOG, ...remote] };
}

export async function speak(text, voiceId) {
  const clean = String(text || '').trim().slice(0, 220);
  if (!clean) return { ok: false, error: 'text required' };
  if (!elevenlabsArmed()) {
    return {
      ok: true,
      mode: 'browser_handoff',
      useBrowser: true,
      billed: false,
      note: 'Set VOICE_ENABLE_ELEVENLABS=1 and ELEVENLABS_API_KEY in Netlify env.',
    };
  }

  const vid = resolveElevenVoiceId(voiceId);
  const res = await fetch(`${API}/text-to-speech/${vid}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY.trim(),
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: clean,
      model_id: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL,
      voice_settings: {
        stability: Number(process.env.ELEVENLABS_STABILITY || 0.45),
        similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY || 0.75),
      },
    }),
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    return { ok: false, mode: 'elevenlabs', error: String(err).slice(0, 240) };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return {
    ok: true,
    mode: 'elevenlabs',
    provider: 'elevenlabs',
    voiceId: vid,
    requestedVoice: voiceId || 'ara',
    contentType: 'audio/mpeg',
    audioBase64: buf.toString('base64'),
    preview: true,
    billed: true,
    chars: clean.length,
    bytes: buf.length,
  };
}
