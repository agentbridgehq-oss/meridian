/**
 * Meridian Voice pipeline
 * - platform: Retell / Vapi / Bland TTS (customer pays their phone platform)
 * - xai: premium neural TTS hosted by Meridian (metered — high-ROI billing)
 * - elevenlabs: optional plug-in if armed
 *
 * Priority when wantAudio: xai (if key) → elevenlabs (if armed) → platform text-only
 * Public preview never spends xAI. Play on the site uses on-device speech + optional demo sample.
 */

import { smartAgentChat, buildSystemPrompt as buildExpertSystemPrompt } from './agent-brain.mjs';
import {
  elevenlabsConfigured as elKeyPresent,
  textToSpeech as elTextToSpeech,
  voiceTurnPipeline as elVoiceTurn,
  listVoices as elListVoices,
} from './elevenlabs.mjs';
import {
  xaiTtsConfigured,
  xaiTextToSpeech,
  xaiTtsStatus,
  listXaiVoices,
  PREVIEW_SAMPLE_TEXT,
  XAI_VOICE_CATALOG,
} from './xai-tts.mjs';

export function elevenlabsEnabled() {
  return process.env.VOICE_ENABLE_ELEVENLABS === '1' && elKeyPresent();
}

export function preferredHostedTts() {
  const forced = (process.env.VOICE_PROVIDER || '').toLowerCase().trim();
  if (forced === 'xai' && xaiTtsConfigured()) return 'xai';
  if (forced === 'elevenlabs' && elevenlabsEnabled()) return 'elevenlabs';
  if (forced === 'platform') return 'platform';
  if (xaiTtsConfigured()) return 'xai';
  if (elevenlabsEnabled()) return 'elevenlabs';
  return 'platform';
}

export function voicePipelineMode() {
  return preferredHostedTts();
}

export function voiceStatus() {
  const mode = voicePipelineMode();
  return {
    mode,
    provider: mode,
    xai: xaiTtsStatus(),
    elevenlabs: elevenlabsEnabled(),
    elevenlabsKeyPresent: elKeyPresent(),
    elevenlabsArmed: process.env.VOICE_ENABLE_ELEVENLABS === '1',
    platforms: ['retell', 'vapi', 'bland', 'twilio'],
    defaultPhone: 'retell',
    metered: mode === 'xai' || mode === 'elevenlabs',
    preview: {
      neverBillsXai: true,
      clientFirst: true,
      demoSample: true,
    },
    note:
      mode === 'xai'
        ? 'Premium xAI TTS — Meridian meters per turn (pay-as-you-go or subscription).'
        : mode === 'elevenlabs'
          ? 'ElevenLabs plug-in active for TTS (metered if billing attached).'
          : 'Platform mode: Meridian brain + Retell/Vapi/Bland TTS. No Meridian-hosted audio charge.',
  };
}

export function elevenlabsConfigured() {
  return elevenlabsEnabled();
}

export async function listVoices({ force = false } = {}) {
  const mode = preferredHostedTts();
  const xai = await listXaiVoices({ force });
  const out = {
    ok: true,
    mode,
    provider: mode,
    hostedReady: xai.hostedReady || xaiTtsConfigured(),
    source: xai.source,
    voices: xai.voices || [],
    defaultVoiceId: process.env.XAI_TTS_VOICE || 'ara',
    previewText: PREVIEW_SAMPLE_TEXT,
    platformNote:
      'Phone calls: pick a native voice in Retell (default). Meridian xAI voice applies when you request hosted audio ({ audio: true }) or speak API.',
    message: xai.message || 'xAI neural voices for Meridian-hosted TTS (metered).',
  };

  if (elevenlabsEnabled()) {
    const el = await elListVoices();
    out.elevenlabs = el;
    if (mode === 'elevenlabs' && el.voices?.length) {
      out.voices = el.voices.map((v) => ({
        id: v.id,
        voice_id: v.id,
        name: v.name || v.id,
        tagline: 'ElevenLabs',
        provider: 'elevenlabs',
      }));
      out.message = 'ElevenLabs plug-in voices';
    }
  }

  return out;
}

export function resolveAgentVoiceId(agent, override) {
  const raw =
    override ||
    agent?.config?.xaiVoiceId ||
    agent?.config?.voiceId ||
    agent?.config?.elevenlabsVoiceId ||
    process.env.XAI_TTS_VOICE ||
    'ara';
  return String(raw || 'ara')
    .toLowerCase()
    .trim()
    .slice(0, 64);
}

async function demoPreviewTts(text) {
  const sample = String(text || '').trim().slice(0, 180);
  if (!sample) return { ok: false, error: 'text required' };
  const url =
    'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=' +
    encodeURIComponent(sample);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
        Referer: 'https://translate.google.com/',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { ok: false, error: `Demo TTS unavailable (${res.status})` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length < 200) {
      return { ok: false, error: 'Demo TTS returned empty audio' };
    }
    return {
      ok: true,
      mode: 'demo_fallback',
      provider: 'demo',
      contentType: res.headers.get('content-type') || 'audio/mpeg',
      audioBuffer: buf,
      chars: sample.length,
      note: 'Free demo voice. Premium xAI neural voice is used on paid, metered installs.',
    };
  } catch (e) {
    return { ok: false, error: e.message || 'Demo TTS failed' };
  }
}

function browserHandoff(voiceId, sample, reason) {
  return {
    ok: true,
    mode: 'browser_handoff',
    provider: 'browser',
    useBrowser: true,
    voiceId: resolveAgentVoiceId(null, voiceId),
    preview: true,
    billed: false,
    chars: (sample || '').length,
    needsXaiKey: !xaiTtsConfigured(),
    note: reason || 'Use on-device speech so Play never dies.',
  };
}

/**
 * Public preview — never calls xAI.
 * Returns audio when demo TTS works; otherwise a successful browser handoff
 * so the client keeps speaking instead of showing a hard fail.
 */
export async function previewVoice(voiceId, text) {
  const sample = String(text || PREVIEW_SAMPLE_TEXT)
    .trim()
    .slice(0, 220);
  if (!sample) return { ok: false, error: 'text required' };

  const demo = await demoPreviewTts(sample);
  if (!demo.ok) {
    return browserHandoff(voiceId, sample, demo.error || 'Demo TTS down — browser voice');
  }
  return {
    ok: true,
    mode: 'demo_fallback',
    provider: 'demo',
    voiceId: resolveAgentVoiceId(null, voiceId),
    contentType: demo.contentType || 'audio/mpeg',
    audioBase64: demo.audioBuffer.toString('base64'),
    preview: true,
    billed: false,
    chars: demo.chars,
    needsXaiKey: true,
    note: demo.note,
  };
}

export function buildPreviewCallScript(businessName, description) {
  const name = (businessName || 'your business').trim();
  const services = (description || '').trim() || 'your services';
  return [
    { speaker: 'caller', text: `Hi, is this ${name}?` },
    {
      speaker: 'agent',
      text: `Yes, thanks for calling ${name}! I can help with ${services}, book an appointment, or answer questions. What can I do for you today?`,
    },
    { speaker: 'caller', text: 'Do you have anything available this week?' },
    {
      speaker: 'agent',
      text: 'Let me check — I can get you booked in now, or take your details and have the team follow up. Want me to book something?',
    },
  ];
}

export async function runPreviewAgentTurn({
  businessName,
  description,
  message,
  history = [],
  voiceId,
  wantAudio = true,
} = {}) {
  const msg = String(message || '').trim().slice(0, 480);
  if (!msg) return { ok: false, error: 'message required' };

  const agent = {
    id: 'preview',
    businessName: (businessName || 'your business').trim(),
    config: { services: (description || '').trim(), tone: 'professional' },
  };

  const brain = await smartAgentChat(agent, msg, { history });
  const reply = brain.reply;

  let audioBase64 = null;
  let contentType = null;
  let mode = 'demo_fallback';
  if (wantAudio && reply) {
    const demo = await demoPreviewTts(reply);
    if (demo.ok) {
      audioBase64 = demo.audioBuffer.toString('base64');
      contentType = demo.contentType;
    } else {
      mode = 'browser_handoff';
    }
  }

  return {
    ok: true,
    businessName: agent.businessName,
    message: msg,
    reply,
    speak: reply,
    brainSource: brain.source,
    mode,
    useBrowser: mode === 'browser_handoff',
    audioBase64,
    contentType,
    voiceId: resolveAgentVoiceId(null, voiceId),
    billed: false,
    preview: true,
  };
}

export async function hostedTextToSpeech(text, opts = {}) {
  const clean = String(text || '').trim().slice(0, 2500);
  if (!clean) return { ok: false, error: 'text required' };

  const prefer = opts.provider || preferredHostedTts();

  if (prefer === 'xai' && xaiTtsConfigured()) {
    const tts = await xaiTextToSpeech(clean, {
      voiceId: opts.voiceId || opts.xaiVoiceId,
      language: opts.language,
    });
    if (tts.ok) return tts;
    if (elevenlabsEnabled()) {
      const fallback = await elTextToSpeech(clean, { voiceId: opts.voiceId });
      if (fallback.ok) return { ...fallback, fallbackFrom: 'xai', xaiError: tts.error };
    }
    return tts;
  }

  if (elevenlabsEnabled() && (prefer === 'elevenlabs' || prefer === 'xai')) {
    const tts = await elTextToSpeech(clean, { voiceId: opts.voiceId });
    return tts;
  }

  if (prefer === 'xai' && !xaiTtsConfigured()) {
    return {
      ok: false,
      mode: 'xai',
      error: 'XAI_API_KEY not configured on Meridian — cannot host premium TTS',
    };
  }

  return {
    ok: true,
    mode: 'platform',
    skipped: true,
    text: clean,
    message: 'Platform TTS — send reply text to Retell/Vapi. No Meridian-hosted audio.',
  };
}

export async function textToSpeechSafe(text, opts) {
  return hostedTextToSpeech(text, opts);
}

export async function runVoiceTurn(agent, message, { baseUrl = '', wantAudio = false, history = [], voiceId } = {}) {
  const msg = String(message || '').trim().slice(0, 2000);
  if (!msg) return { ok: false, error: 'message required' };

  const brain = await smartAgentChat(agent, msg, { history });
  const reply = brain.reply;
  const mode = voicePipelineMode();
  const platform = buildPlatformPayload(agent, reply, baseUrl);

  let audio = null;
  let contentType = null;
  let usedVoiceId = null;
  let chars = (reply || '').length;
  let pipeline = [brain.source === 'llm' ? 'claude_brain' : 'fallback_brain', 'platform_tts'];
  let ttsError = null;
  let audioBytes = 0;

  if (wantAudio && mode !== 'platform') {
    if (mode === 'xai' && xaiTtsConfigured()) {
      const tts = await xaiTextToSpeech(reply, {
        voiceId: resolveAgentVoiceId(agent, voiceId),
      });
      if (tts.ok && tts.audioBuffer) {
        audio = tts.audioBuffer.toString('base64');
        contentType = tts.contentType;
        usedVoiceId = tts.voiceId;
        chars = tts.chars || chars;
        audioBytes = tts.bytes || tts.audioBuffer.length;
        pipeline = [brain.source === 'llm' ? 'claude_brain' : 'fallback_brain', 'xai_tts'];
      } else {
        ttsError = tts.error;
        if (elevenlabsEnabled()) {
          const fallback = await elVoiceTurn({
            reply,
            voiceId: voiceId || agent.config?.elevenlabsVoiceId,
            format: 'base64',
          });
          if (fallback.ok && fallback.audioBase64) {
            audio = fallback.audioBase64;
            contentType = fallback.contentType;
            usedVoiceId = fallback.voiceId;
            pipeline = fallback.pipeline || ['meridian_brain', 'elevenlabs_tts'];
            ttsError = null;
          }
        }
      }
    } else if (mode === 'elevenlabs' && elevenlabsEnabled()) {
      const tts = await elVoiceTurn({
        reply,
        voiceId: voiceId || agent.config?.elevenlabsVoiceId,
        format: 'base64',
      });
      if (tts.ok && tts.audioBase64) {
        audio = tts.audioBase64;
        contentType = tts.contentType;
        usedVoiceId = tts.voiceId;
        pipeline = tts.pipeline || ['meridian_brain', 'elevenlabs_tts'];
      } else {
        ttsError = tts.error;
      }
    }
  }

  return {
    ok: true,
    mode: audio ? mode : 'platform',
    hostedAudio: Boolean(audio),
    agentId: agent.id,
    businessName: agent.businessName,
    message: msg,
    reply,
    speak: reply,
    pipeline,
    brainSource: brain.source,
    audioBase64: audio,
    contentType,
    voiceId: usedVoiceId,
    chars,
    audioBytes,
    ttsError,
    platform,
  };
}

export function buildPlatformPayload(agent, reply, baseUrl = '') {
  const base = (baseUrl || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const cfg = agent.config || {};
  const id = agent.id;
  return {
    provider: 'platform',
    recommended: ['retell', 'vapi', 'bland'],
    defaultPhone: 'retell',
    say: reply,
    endCall: false,
    tools: {
      chat: `${base}/api/v1/agents/${id}/chat`,
      voiceTurn: `${base}/api/v1/agents/${id}/voice-turn`,
      events: `${base}/api/v1/agents/${id}/events`,
      voiceSpec: `${base}/api/v1/agents/${id}/voice-spec`,
      billing: `${base}/api/v1/agents/${id}/billing`,
    },
    auth: 'Authorization: Bearer <mdn_api_key>',
    systemPromptHints: {
      hours: cfg.hours || '',
      services: cfg.services || '',
      faqs: cfg.faqs || '',
      bookingRules: cfg.bookingRules || '',
      humanTransfer: cfg.humanTransfer || '',
      tone: cfg.tone || 'professional',
    },
    retell: {
      response_type: 'response',
      content: reply,
    },
    vapi: {
      type: 'conversation-update',
      role: 'assistant',
      content: reply,
    },
  };
}

export function buildVoiceInstallSpec(agent, baseUrl = '') {
  const mode = voicePipelineMode();
  const base = (baseUrl || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const id = agent?.id;
  return {
    mode,
    provider: mode,
    metered: mode === 'xai' || mode === 'elevenlabs',
    businessName: agent?.businessName || 'Client',
    systemPrompt: buildExpertSystemPrompt(agent),
    meridian: {
      chat: `${base}/api/v1/agents/${id}/chat`,
      voiceTurn: `${base}/api/v1/agents/${id}/voice-turn`,
      speak: `${base}/api/v1/agents/${id}/speak`,
      billing: `${base}/api/v1/agents/${id}/billing`,
      events: `${base}/api/v1/agents/${id}/events`,
    },
    billing: {
      model: 'pay_as_you_go_or_subscription',
      note: 'Premium hosted voice (xAI) requires prepaid turns or Voice Premium subscription. Platform phone TTS has no Meridian per-turn fee.',
      topUp: `${base}/checkout/voice-pack/starter`,
      subscribe: `${base}/checkout/voice-sub`,
    },
    platform: {
      default: 'retell',
      goLive: [
        '1. Create assistant in Retell (default) or Vapi',
        '2. Paste systemPrompt above',
        '3. On each user turn, POST transcript to voice-turn; speak the reply field',
        '4. For Meridian-hosted xAI audio: POST voice-turn with { "audio": true } and keep prepaid/sub balance',
        '5. Wire phone number + calendar per kit',
      ],
      tts: mode === 'xai' ? 'Meridian xAI TTS (metered) or Retell native voice' : 'Use Retell native voice',
    },
    selectedVoiceId: resolveAgentVoiceId(agent),
    xai: {
      voice: resolveAgentVoiceId(agent),
      defaultVoice: process.env.XAI_TTS_VOICE || 'ara',
      hostedReady: xaiTtsConfigured(),
      listEndpoint: '/api/voice/voices',
      pickerNote: 'Customer can change voice in setup wizard or PATCH agent voice preference.',
    },
    elevenlabs: null,
  };
}

export { textToSpeechSafe as textToSpeech, elListVoices, listXaiVoices, PREVIEW_SAMPLE_TEXT };
