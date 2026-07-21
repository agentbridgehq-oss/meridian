/**
 * xAI Text-to-Speech (premium neural voices).
 * API key stays on Meridian server only — never exposed to customers.
 *
 * POST https://api.x.ai/v1/tts
 * GET  https://api.x.ai/v1/tts/voices
 * { text, voice_id, language } → audio/mpeg
 */

const API = (process.env.XAI_TTS_URL || 'https://api.x.ai/v1/tts').replace(/\/$/, '');
const VOICES_URL = (process.env.XAI_TTS_VOICES_URL || 'https://api.x.ai/v1/tts/voices').replace(/\/$/, '');
const DEFAULT_VOICE = process.env.XAI_TTS_VOICE || 'eve';
const DEFAULT_LANG = process.env.XAI_TTS_LANGUAGE || 'en';
const CACHE_MS = Number(process.env.XAI_VOICES_CACHE_MS || 60 * 60 * 1000); // 1h

/** Rich fallback when API key missing or list endpoint fails (xAI public catalog + docs). */
export const XAI_VOICE_CATALOG = [
  { id: 'eve', name: 'Eve', tagline: 'Energetic & upbeat', useCases: 'General, sales, friendly receptionist', gender: 'female' },
  { id: 'ara', name: 'Ara', tagline: 'Warm & conversational', useCases: 'Support, booking, local services', gender: 'female' },
  { id: 'leo', name: 'Leo', tagline: 'Authoritative & strong', useCases: 'Professional, legal-adjacent tone', gender: 'male' },
  { id: 'rex', name: 'Rex', tagline: 'Clear & professional', useCases: 'Business, HVAC, trades', gender: 'male' },
  { id: 'sal', name: 'Sal', tagline: 'Smooth & balanced', useCases: 'All-purpose, calm intake', gender: 'neutral' },
  { id: 'carina', name: 'Carina', tagline: 'Soft, empathetic, soothing', useCases: 'Wellness, med spa, care', gender: 'female' },
  { id: 'luna', name: 'Luna', tagline: 'Gentle, patient, nurturing', useCases: 'Education, assistants, calm FAQs', gender: 'female' },
  { id: 'orion', name: 'Orion', tagline: 'Rich, cinematic, resonant', useCases: 'Narration, premium brands', gender: 'male' },
  { id: 'helix', name: 'Helix', tagline: 'Bold, dynamic, adrenaline', useCases: 'Commentary, sports, hype', gender: 'male' },
  { id: 'zagan', name: 'Zagan', tagline: 'Powerful & dramatic', useCases: 'Characters, narration, bold brand', gender: 'male' },
];

let voicesCache = { at: 0, payload: null };

export function xaiTtsConfigured() {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

export function xaiTtsStatus() {
  return {
    configured: xaiTtsConfigured(),
    voice: process.env.XAI_TTS_VOICE || DEFAULT_VOICE,
    language: process.env.XAI_TTS_LANGUAGE || DEFAULT_LANG,
    endpoint: API,
    voicesEndpoint: VOICES_URL,
    catalogSize: XAI_VOICE_CATALOG.length,
  };
}

function enrichVoice(raw) {
  const id = String(raw.voice_id || raw.id || raw.voiceId || '')
    .toLowerCase()
    .trim();
  if (!id) return null;
  const known = XAI_VOICE_CATALOG.find((v) => v.id === id);
  return {
    id,
    voice_id: id,
    name: raw.name || known?.name || id.charAt(0).toUpperCase() + id.slice(1),
    tagline: raw.tagline || known?.tagline || raw.description || 'xAI neural voice',
    useCases: raw.useCases || known?.useCases || '',
    gender: raw.gender || known?.gender || null,
    language: raw.language || 'en',
    provider: 'xai',
  };
}

/**
 * Full catalog for the picker: live xAI list merged with local descriptions.
 * Falls back to XAI_VOICE_CATALOG when key missing or request fails.
 */
export async function listXaiVoices({ force = false } = {}) {
  const now = Date.now();
  if (!force && voicesCache.payload && now - voicesCache.at < CACHE_MS) {
    return voicesCache.payload;
  }

  const key = process.env.XAI_API_KEY?.trim();
  if (!key) {
    const payload = {
      ok: true,
      source: 'catalog',
      hostedReady: false,
      voices: XAI_VOICE_CATALOG.map((v) => ({
        id: v.id,
        voice_id: v.id,
        name: v.name,
        tagline: v.tagline,
        useCases: v.useCases,
        gender: v.gender,
        language: 'en',
        provider: 'xai',
      })),
      message: 'XAI_API_KEY not set — showing built-in catalog. Set key for live list + previews.',
    };
    voicesCache = { at: now, payload };
    return payload;
  }

  try {
    const res = await fetch(VOICES_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => res.statusText);
      throw new Error(`list voices ${res.status}: ${String(errBody).slice(0, 200)}`);
    }
    const data = await res.json();
    const rawList = Array.isArray(data.voices) ? data.voices : Array.isArray(data) ? data : [];
    const fromApi = rawList.map(enrichVoice).filter(Boolean);

    // Merge: API ids first, then any catalog-only ids not returned yet
    const seen = new Set(fromApi.map((v) => v.id));
    const merged = [...fromApi];
    for (const v of XAI_VOICE_CATALOG) {
      if (!seen.has(v.id)) {
        merged.push({
          id: v.id,
          voice_id: v.id,
          name: v.name,
          tagline: v.tagline,
          useCases: v.useCases,
          gender: v.gender,
          language: 'en',
          provider: 'xai',
        });
      }
    }

    // Prefer stable product order: catalog order, then extras from API
    const order = new Map(XAI_VOICE_CATALOG.map((v, i) => [v.id, i]));
    merged.sort((a, b) => {
      const ia = order.has(a.id) ? order.get(a.id) : 1000;
      const ib = order.has(b.id) ? order.get(b.id) : 1000;
      if (ia !== ib) return ia - ib;
      return a.name.localeCompare(b.name);
    });

    const payload = {
      ok: true,
      source: 'live',
      hostedReady: true,
      voices: merged,
      message: `Live xAI catalog · ${merged.length} voices`,
    };
    voicesCache = { at: now, payload };
    return payload;
  } catch (e) {
    const payload = {
      ok: true,
      source: 'catalog_fallback',
      hostedReady: true,
      error: e.message || 'list failed',
      voices: XAI_VOICE_CATALOG.map((v) => ({
        id: v.id,
        voice_id: v.id,
        name: v.name,
        tagline: v.tagline,
        useCases: v.useCases,
        gender: v.gender,
        language: 'en',
        provider: 'xai',
      })),
      message: 'Live list unavailable — using built-in catalog.',
    };
    voicesCache = { at: now, payload };
    return payload;
  }
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

  const voice = String(voiceId || process.env.XAI_TTS_VOICE || DEFAULT_VOICE)
    .toLowerCase()
    .trim()
    .slice(0, 64);
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

  const ct = res.headers.get('content-type') || 'audio/mpeg';
  // Some xAI responses may return JSON envelope with base64 audio
  if (ct.includes('application/json')) {
    try {
      const json = await res.json();
      const b64 = json.audio || json.audioBase64 || json.data;
      if (b64) {
        const buf = Buffer.from(b64, 'base64');
        return {
          ok: true,
          mode: 'xai',
          audioBuffer: buf,
          contentType: json.content_type || 'audio/mpeg',
          voiceId: voice,
          chars: clean.length,
          bytes: buf.length,
        };
      }
    } catch {
      /* fall through */
    }
    return { ok: false, mode: 'xai', error: 'xAI TTS returned JSON without audio' };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) {
    return { ok: false, mode: 'xai', error: 'xAI TTS returned empty audio' };
  }

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

/** Short sample line for voice previews (picker). */
export const PREVIEW_SAMPLE_TEXT =
  process.env.XAI_PREVIEW_TEXT ||
  'Thanks for calling. I can help with hours, booking, or a quick question — how can I help today?';
