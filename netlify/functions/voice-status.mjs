import { corsHeaders, elevenlabsArmed, json, keyPresent } from './_eleven.mjs';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }
  const armed = elevenlabsArmed();
  return json(200, {
    mode: armed ? 'elevenlabs' : 'browser',
    provider: armed ? 'elevenlabs' : 'browser',
    elevenlabs: armed,
    elevenlabsKeyPresent: keyPresent(),
    elevenlabsArmed: process.env.VOICE_ENABLE_ELEVENLABS === '1',
    preview: { neverBillsXai: true, clientFirst: true, elevenlabsIfArmed: true },
    note: armed
      ? 'ElevenLabs preview armed on Netlify. Production phone path is still Railway + OpenAI Realtime.'
      : 'Preview will use on-device browser speech until VOICE_ENABLE_ELEVENLABS=1 and ELEVENLABS_API_KEY are set in Netlify.',
  });
}
