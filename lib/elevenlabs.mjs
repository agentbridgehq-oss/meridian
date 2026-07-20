/**
 * Optional ElevenLabs voice plug-in for Meridian Voice Agent.
 * If ELEVENLABS_API_KEY is missing, pipeline runs in "platform" mode (no TTS API calls).
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const API = 'https://api.elevenlabs.io/v1';
const DEFAULT_MODEL = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
// Rachel — common public default; override with ELEVENLABS_VOICE_ID
const DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

export function elevenlabsConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

export function voicePipelineMode() {
  return elevenlabsConfigured() ? 'elevenlabs' : 'platform';
}

export function voiceStatus() {
  return {
    mode: voicePipelineMode(),
    elevenlabs: elevenlabsConfigured(),
    defaultVoiceId: process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE,
    modelId: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL,
    note: elevenlabsConfigured()
      ? 'TTS available via ElevenLabs; agent brain stays Meridian.'
      : 'No ELEVENLABS_API_KEY — voice installs use platform TTS (Vapi/Retell/etc). Same pipeline.',
  };
}

function headers() {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return null;
  return {
    'xi-api-key': key,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/**
 * List voices from ElevenLabs (empty array if not configured).
 */
export async function listVoices() {
  const h = headers();
  if (!h) return { ok: true, mode: 'platform', voices: [] };
  const res = await fetch(`${API}/voices`, { headers: h, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    return { ok: false, mode: 'elevenlabs', error: err.slice(0, 400), voices: [] };
  }
  const data = await res.json();
  const voices = (data.voices || []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    category: v.category,
    previewUrl: v.preview_url || null,
  }));
  return { ok: true, mode: 'elevenlabs', voices };
}

/**
 * Text-to-speech. Returns { mode, audioBuffer, contentType } or platform skip.
 */
export async function textToSpeech(text, { voiceId, modelId } = {}) {
  const clean = String(text || '').trim().slice(0, 2500);
  if (!clean) return { ok: false, error: 'text required' };

  if (!elevenlabsConfigured()) {
    return {
      ok: true,
      mode: 'platform',
      skipped: true,
      text: clean,
      message: 'ElevenLabs not configured — use platform TTS (Retell/Vapi) or set ELEVENLABS_API_KEY.',
    };
  }

  const vid = voiceId || DEFAULT_VOICE;
  const mid = modelId || DEFAULT_MODEL;
  const res = await fetch(`${API}/text-to-speech/${vid}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY.trim(),
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: clean,
      model_id: mid,
      voice_settings: {
        stability: Number(process.env.ELEVENLABS_STABILITY || 0.45),
        similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY || 0.75),
      },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    return { ok: false, mode: 'elevenlabs', error: err.slice(0, 500) };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return {
    ok: true,
    mode: 'elevenlabs',
    contentType: 'audio/mpeg',
    audioBuffer: buf,
    voiceId: vid,
    modelId: mid,
    bytes: buf.length,
  };
}

/**
 * Full voice turn: Meridian reply text + optional ElevenLabs audio.
 * @param {object} opts
 * @param {string} opts.reply - agent text
 * @param {string} [opts.voiceId]
 * @param {string} [opts.format] - 'base64' | 'buffer' | 'file'
 * @param {string} [opts.cacheDir] - if format=file, write under this dir
 */
export async function voiceTurnPipeline({ reply, voiceId, format = 'base64', cacheDir } = {}) {
  const text = String(reply || '').trim();
  if (!text) return { ok: false, error: 'reply required' };

  const tts = await textToSpeech(text, { voiceId });
  if (!tts.ok) return tts;

  if (tts.skipped || tts.mode === 'platform') {
    return {
      ok: true,
      mode: 'platform',
      reply: text,
      audio: null,
      pipeline: ['meridian_brain', 'platform_tts'],
    };
  }

  const out = {
    ok: true,
    mode: 'elevenlabs',
    reply: text,
    voiceId: tts.voiceId,
    modelId: tts.modelId,
    contentType: tts.contentType,
    pipeline: ['meridian_brain', 'elevenlabs_tts'],
  };

  if (format === 'buffer') {
    out.audioBuffer = tts.audioBuffer;
  } else if (format === 'file' && cacheDir) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const name = `tts_${crypto.randomBytes(8).toString('hex')}.mp3`;
    const full = path.join(cacheDir, name);
    fs.writeFileSync(full, tts.audioBuffer);
    out.audioPath = full;
    out.audioFile = name;
  } else {
    out.audioBase64 = tts.audioBuffer.toString('base64');
  }

  return out;
}

// Note: the system-prompt-building voice-install-spec lives in
// voice-pipeline.mjs (buildVoiceInstallSpec), which delegates prompt text to
// lib/agent-brain.mjs — the single source every agent spawn path uses. This
// keeps ElevenLabs focused on TTS only, so expertise + business facts are
// composed in exactly one place, never duplicated or left to drift.
