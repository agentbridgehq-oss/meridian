/**
 * Meridian ↔ Groq (OpenAI-compatible) fast brain failover.
 *
 * Server-side only. Used by agent-brain.mjs as the second link in the
 * must-work chain: Claude → Groq → regex. Never the primary brain —
 * only called when Claude is unconfigured or fails, so it must be fast
 * and must never throw past its own boundary.
 *
 * Docs: https://console.groq.com/docs/api-reference#chat-create
 */

export const GROQ_CHAT_URL =
  (process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions').replace(/\/$/, '');

/** Fast + cheap failover model; override with GROQ_MODEL */
export const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
export const DEFAULT_MAX_TOKENS = Number(process.env.MERIDIAN_LLM_MAX_TOKENS || 400);
export const DEFAULT_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS || 8000);

export function groqConfigured() {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export function groqStatus() {
  const ok = groqConfigured();
  return {
    provider: 'groq',
    api: 'chat_completions',
    endpoint: GROQ_CHAT_URL,
    configured: ok,
    mode: ok ? 'groq_failover' : 'offline',
    model: ok ? DEFAULT_MODEL : null,
    maxTokens: DEFAULT_MAX_TOKENS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    note: ok
      ? `Groq failover live — ${DEFAULT_MODEL} via OpenAI-compatible chat completions.`
      : 'Set GROQ_API_KEY on Meridian (Railway) to enable Groq brain failover.',
  };
}

/**
 * Normalize chat history for an OpenAI-style messages array.
 */
function toGroqMessages(system, history = [], userMessage) {
  const messages = [{ role: 'system', content: String(system || 'You are a helpful business assistant.').slice(0, 12000) }];
  for (const h of history.slice(-12)) {
    if (!h?.role || !h?.content) continue;
    messages.push({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: String(h.content).slice(0, 2000),
    });
  }
  messages.push({ role: 'user', content: String(userMessage || 'Hello').slice(0, 2000) });
  return messages;
}

/**
 * Core Groq chat call.
 * @returns {Promise<{ ok, reply?, model?, usage?, ms?, error? }>}
 */
export async function callGroqAgent({
  system,
  message,
  history = [],
  model = DEFAULT_MODEL,
  maxTokens = DEFAULT_MAX_TOKENS,
  temperature,
} = {}) {
  if (!groqConfigured()) {
    return { ok: false, error: 'GROQ_API_KEY_missing', provider: 'groq' };
  }

  const msg = String(message || '').trim();
  if (!msg) {
    return { ok: false, error: 'message_required', provider: 'groq' };
  }

  const body = {
    model: model || DEFAULT_MODEL,
    max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
    messages: toGroqMessages(system, history, msg),
  };
  if (temperature !== undefined && temperature !== null) {
    body.temperature = Number(temperature);
  }

  const started = Date.now();
  let res;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    res = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY.trim()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (e) {
    const err = e.name === 'AbortError' ? 'timeout' : e.message || 'network_error';
    return { ok: false, error: err, provider: 'groq', ms: Date.now() - started };
  }

  const ms = Date.now() - started;
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = data?.error?.message || data?.error?.type || `http_${res.status}`;
    return { ok: false, error: err, httpStatus: res.status, provider: 'groq', ms };
  }

  const text = String(data?.choices?.[0]?.message?.content || '').trim();
  const usage = data.usage
    ? {
        inputTokens: data.usage.prompt_tokens || 0,
        outputTokens: data.usage.completion_tokens || 0,
      }
    : null;

  if (!text) {
    return { ok: false, error: 'empty_response', provider: 'groq', usage, ms };
  }

  return {
    ok: true,
    reply: text,
    model: data.model || body.model,
    provider: 'groq',
    usage,
    ms,
    stopReason: data.choices?.[0]?.finish_reason,
    id: data.id,
  };
}
