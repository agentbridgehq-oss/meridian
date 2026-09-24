import { corsHeaders, elevenlabsArmed, json, speak } from './_eleven.mjs';

const hits = new Map();

function rateOk(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 8) return false;
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 2000) hits.clear();
  return true;
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'POST required' });
  }

  const ip = event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'unknown';
  if (!rateOk(String(ip).split(',')[0].trim())) {
    return json(429, { ok: false, error: 'Too many previews — wait a minute.' });
  }

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return json(400, { ok: false, error: 'invalid json' });
  }

  const voiceId = String(body.voiceId || body.voice_id || 'ara').slice(0, 64);
  const text = String(body.text || '').slice(0, 220);
  try {
    const result = await speak(text, voiceId);
    if (!result.ok) return json(503, result);
    return json(200, result);
  } catch (e) {
    return json(500, {
      ok: true,
      mode: 'browser_handoff',
      useBrowser: true,
      error: e.message || 'preview_failed',
      armed: elevenlabsArmed(),
    });
  }
}
