/**
 * Meridian Voice pipeline
 * - platform: Retell / Vapi / Bland TTS (customer pays their phone platform)
 * - xai: premium neural TTS hosted by Meridian (metered — high-ROI billing)
 * - elevenlabs: optional plug-in if armed
 *
 * Priority when wantAudio: xai (if key) → elevenlabs (if armed) → platform text-only
 */

import { smartAgentChat, buildSystemPrompt as buildExpertSystemPrompt } from './agent-brain.mjs';
import {
  elevenlabsConfigured as elKeyPresent,
  textToSpeech as elTextToSpeech,
  voiceTurnPipeline as elVoiceTurn,
  listVoices as elListVoices,
} from './elevenlabs.mjs';
import { xaiTtsConfigured, xaiTextToSpeech, xaiTtsStatus } from './xai-tts.mjs';

export function elevenlabsEnabled() {
  return process.env.VOICE_ENABLE_ELEVENLABS === '1' && elKeyPresent();
}

/**
 * Default speech provider for hosted audio.
 * VOICE_PROVIDER=xai|elevenlabs|platform
 */
export function preferredHostedTts() {
  const forced = (process.env.VOICE_PROVIDER || '').toLowerCase().trim();
  if (forced === 'xai' && xaiTtsConfigured()) return 'xai';
  if (forced === 'elevenlabs' && elevenlabsEnabled()) return 'elevenlabs';
  if (forced === 'platform') return 'platform';
  // Auto: prefer xAI when key present (premium metered product)
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
    metered: mode === 'xai' || mode === 'elevenlabs',
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

export async function listVoices() {
  const mode = preferredHostedTts();
  if (mode === 'xai') {
    return {
      ok: true,
      mode: 'xai',
      voices: [
        { id: process.env.XAI_TTS_VOICE || 'eve', name: 'Eve (xAI)', provider: 'xai' },
        { id: 'ara', name: 'Ara (xAI)', provider: 'xai' },
        { id: 'rex', name: 'Rex (xAI)', provider: 'xai' },
        { id: 'sal', name: 'Sal (xAI)', provider: 'xai' },
        { id: 'leo', name: 'Leo (xAI)', provider: 'xai' },
      ],
      message: 'xAI neural voices — customer billed per use via Meridian.',
    };
  }
  if (!elevenlabsEnabled()) {
    return {
      ok: true,
      mode: 'platform',
      voices: [],
      message: 'Platform mode — pick voices in Retell/Vapi dashboard.',
    };
  }
  return elListVoices();
}

/**
 * Hosted TTS (xAI or ElevenLabs). Does NOT bill — caller must meter.
 */
export async function hostedTextToSpeech(text, opts = {}) {
  const clean = String(text || '').trim().slice(0, 2500);
  if (!clean) return { ok: false, error: 'text required' };

  const prefer = opts.provider || preferredHostedTts();

  if (prefer === 'xai' && xaiTtsConfigured()) {
    return xaiTextToSpeech(clean, {
      voiceId: opts.voiceId || opts.xaiVoiceId,
      language: opts.language,
    });
  }

  if ((prefer === 'elevenlabs' || prefer === 'xai') && elevenlabsEnabled()) {
    // fall through to elevenlabs if xai requested but failed config
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

/**
 * Core turn: Meridian brain always; hosted audio only if wantAudio + provider ready.
 * Billing is handled by server before/after this call.
 */
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
        voiceId: voiceId || agent.config?.xaiVoiceId || agent.config?.voiceId,
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
      goLive: [
        '1. Create assistant in Retell or Vapi',
        '2. Paste systemPrompt above',
        '3. On each user turn, POST transcript to voice-turn; speak the reply field',
        '4. For Meridian-hosted xAI audio: POST voice-turn with { "audio": true } and keep prepaid/sub balance',
        '5. Wire phone number + calendar per kit',
      ],
      tts: mode === 'xai' ? 'Meridian xAI TTS (metered) or platform native voice' : 'Use platform native voice',
    },
    xai: mode === 'xai' ? { voice: process.env.XAI_TTS_VOICE || 'eve' } : null,
    elevenlabs: null,
  };
}

export { textToSpeechSafe as textToSpeech, elListVoices };
