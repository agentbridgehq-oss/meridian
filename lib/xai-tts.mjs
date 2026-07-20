/**
 * xAI Text-to-Speech (premium neural voices e.g. Eve).
 * API key stays on Meridian server only — never exposed to customers.
 *
 * POST https://api.x.ai/v1/tts
 * { text, voice_id, language } → audio/mpeg
 */

const API = (process.env.XAI_TTS_URL || 'https://api.x.ai/v1/tts').replace(/\/$/, '');
const DEFAULT_VOICE = process.env.XAI_TTS_VOICE || 'eve';
const DEFAULT_LANG = process.env.XAI_TTS_LANGUAGE || 'en';

export function xaiTtsConfigured() {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

export function xaiTtsStatus() {
  return {
    configured: xaiTtsConfigured(),
    voice: process.env.XAI_TTS_VOICE || DEFAULT_VOICE,
    language: process.env.XAI_TTS_LANGUAGE || DEFAULT_LANG,
    endpoint: API,
  };
}

/**
 * @returns {Promise<{ ok: boolean, mode?: string, audioBuffer?: Buffer, contentType?: string, voiceId?: string, chars?: number, error?: string, httpStatus?: number }>}
 */
export async function xaiTextToSpeech(text, { voiceId, language } = {}) {
  const clean = String(text || '').trim().slice(0, 2500);
  if (!clean) return { ok: false, error: 'text required' };

  const key = process.env.XAI_API_KEY?.trim();
  if (!key) {
    return {
      ok: false,
      mode: 'xai',
      error: 'XAI_API_KEY not set on Meridian server',
    };
  }

  const voice = String(voiceId || process.env.XAI_TTS_VOICE || DEFAULT_VOICE).slice(0, 64);
  const lang = String(language || process.env.XAI_TTS_LANGUAGE || DEFAULT_LANG).slice(0, 16);

  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg, application/json, */*',
      },
      body: JSON.stringify({
        text: clean,
        voice_id: voice,
        language: lang,
      }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    return { ok: false, mode: 'xai', error: e.message || 'xAI TTS network error' };
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => res.statusText);
    return {
      ok: false,
      mode: 'xai',
      httpStatus: res.status,
      error: `xAI TTS ${res.status}: ${String(errBody).slice(0, 400)}`,
    };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) {
    return { ok: false, mode: 'xai', error: 'xAI TTS returned empty audio' };
  }

  const ct = res.headers.get('content-type') || 'audio/mpeg';
  return {
    ok: true,
    mode: 'xai',
    audioBuffer: buf,
    contentType: ct.includes('json') ? 'audio/mpeg' : ct,
    voiceId: voice,
    chars: clean.length,
    bytes: buf.length,
  };
}
