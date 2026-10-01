import { corsHeaders, elevenlabsArmed, json, keyPresent } from './_eleven.mjs';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }
  const armed = elevenlabsArmed();
  return json(200, {
    mode: armed ? 'elevenlabs' : 'unconfigured',
    provider: armed ? 'elevenlabs' : 'unconfigured',
    elevenlabs: armed,
    elevenlabsKeyPresent: keyPresent(),
    elevenlabsArmed: process.env.VOICE_ENABLE_ELEVENLABS === '1',
    preview: { neverBillsXai: true, clientFirst: false, elevenlabsIfArmed: true },
    note: armed
      ? 'ElevenLabs preview armed on Netlify. Production phone path is still Railway + OpenAI Realtime.'
      : 'Premium preview needs VOICE_ENABLE_ELEVENLABS=1 and ELEVENLABS_API_KEY in Netlify. Device voice is an explicit optional fallback.',
  });
}
