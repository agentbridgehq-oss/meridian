/**
 * Meridian ↔ xAI (Grok) text brain — OpenAI-compatible Chat Completions.
 *
 * Docs (retrieved 2026-10-04):
 *   https://docs.x.ai/developers/models            (models + per-token prices)
 *   https://docs.x.ai/developers/models/grok-4.3   (function calling: yes, 1M context)
 *   https://docs.x.ai/developers/tools/function-calling
 *
 * Server-side only. Never throws past its own boundary. `fetchImpl` is injectable
 * so tests never touch the network.
 */

export const XAI_API_BASE = (process.env.XAI_API_BASE || 'https://api.x.ai/v1').replace(/\/$/, '');
export const XAI_CHAT_URL = (process.env.XAI_CHAT_URL || `${XAI_API_BASE}/chat/completions`).replace(/\/$/, '');

/** Default brain model: grok-4.3 — documented function calling, $1.25 / $2.50 per 1M tokens (<200k prompt). */
export const XAI_DEFAULT_TEXT_MODEL = 'grok-4.3';

export function xaiTextModel(override) {
  return String(override || process.env.XAI_TEXT_MODEL || process.env.XAI_MODEL || XAI_DEFAULT_TEXT_MODEL).trim();
}

const maxTokensDefault = () => Number(process.env.MERIDIAN_LLM_MAX_TOKENS || 400);
const timeoutDefault = () => Number(process.env.XAI_TIMEOUT_MS || process.env.MERIDIAN_LLM_TIMEOUT_MS || 12000);

export function xaiConfigured() {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

export function xaiTextStatus() {
  const ok = xaiConfigured();
  return {
    provider: 'xai',
    api: 'chat_completions',
    endpoint: XAI_CHAT_URL,
    configured: ok,
    mode: ok ? 'xai_primary' : 'offline',
    model: xaiTextModel(),
    maxTokens: maxTokensDefault(),
    timeoutMs: timeoutDefault(),
    note: ok
      ? `xAI brain live — ${xaiTextModel()} via chat completions.`
      : 'Set XAI_API_KEY to enable the xAI (Grok) brain.',
  };
}

export function toXaiMessages(system, history = [], userMessage) {
  const messages = [{ role: 'system', content: String(system || 'You are a helpful business assistant.').slice(0, 12000) }];
  for (const h of (history || []).slice(-12)) {
    if (!h?.role || !h?.content) continue;
    messages.push({ role: h.role === 'assistant' || h.role === 'ai' ? 'assistant' : 'user', content: String(h.content).slice(0, 2000) });
  }
  messages.push({ role: 'user', content: String(userMessage || 'Hello').slice(0, 20000) });
  return messages;
}

/**
 * @returns {Promise<{ ok, reply?, model?, usage?, ms?, error?, toolCalls? }>}
 */
export async function callXaiAgent({
  system,
  message,
  history = [],
  model,
  maxTokens,
  temperature,
  tools = null,
  timeoutMs,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!xaiConfigured()) return { ok: false, error: 'XAI_API_KEY_missing', provider: 'xai' };
  const msg = String(message || '').trim();
  if (!msg) return { ok: false, error: 'message_required', provider: 'xai' };

  const body = {
    model: xaiTextModel(model),
    max_tokens: maxTokens || maxTokensDefault(),
    messages: toXaiMessages(system, history, msg),
  };
  if (temperature !== undefined && temperature !== null) body.temperature = Number(temperature);
  if (Array.isArray(tools) && tools.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const started = Date.now();
  let res;
  try {
    res = await fetchImpl(XAI_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.XAI_API_KEY.trim()}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs || timeoutDefault()),
    });
  } catch (e) {
    const err = e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : e?.message || 'network_error';
    return { ok: false, error: err, provider: 'xai', ms: Date.now() - started };
  }
  const ms = Date.now() - started;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error?.message || data?.error || `http_${res.status}`;
    return { ok: false, error: String(err).slice(0, 300), httpStatus: res.status, provider: 'xai', ms };
  }
  const choice = data?.choices?.[0] || {};
  const text = String(choice.message?.content || '').trim();
  const usage = data.usage
    ? {
        inputTokens: data.usage.prompt_tokens || 0,
        outputTokens: data.usage.completion_tokens || 0,
        reasoningTokens: data.usage.completion_tokens_details?.reasoning_tokens || 0,
      }
    : null;
  const toolCalls = Array.isArray(choice.message?.tool_calls) ? choice.message.tool_calls : [];
  if (!text && !toolCalls.length) return { ok: false, error: 'empty_response', provider: 'xai', usage, ms };
  return { ok: true, reply: text, toolCalls, model: data.model || body.model, provider: 'xai', usage, ms, stopReason: choice.finish_reason, id: data.id };
}
