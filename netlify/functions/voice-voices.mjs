import { corsHeaders, elevenlabsArmed, json, listElevenVoices, PREVIEW_CATALOG } from './_eleven.mjs';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }
  try {
    const listed = await listElevenVoices();
    return json(200, {
      ok: true,
      mode: elevenlabsArmed() ? 'elevenlabs' : 'browser',
      provider: elevenlabsArmed() ? 'elevenlabs' : 'browser',
      hostedReady: elevenlabsArmed(),
      voices: listed.voices?.length ? listed.voices : PREVIEW_CATALOG,
      defaultVoiceId: 'ara',
      previewText:
        "Thanks for calling. You've reached the Meridian demo receptionist. How can I help you today?",
    });
  } catch (e) {
    return json(200, {
      ok: true,
      mode: 'browser',
      hostedReady: false,
      voices: PREVIEW_CATALOG,
      error: e.message,
    });
  }
}
