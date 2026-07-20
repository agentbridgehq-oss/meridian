/**
 * Meridian ↔ Claude (Anthropic) Agent API
 *
 * Server-side only. Customers use mdn_ keys; Meridian holds ANTHROPIC_API_KEY.
 * Wraps Anthropic Messages API as the production brain for every client agent.
 *
 * Docs: https://docs.anthropic.com/en/api/messages
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(__dirname, '..', 'data');
const USAGE = path.join(DATA_DIR, 'claude-usage.json');

export const ANTHROPIC_MESSAGES_URL =
  (process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages').replace(/\/$/, '');

/** Default fast + cheap for voice/chat agents; override with MERIDIAN_LLM_MODEL */
export const DEFAULT_MODEL = process.env.MERIDIAN_LLM_MODEL || 'claude-haiku-4-5-20251001';
export const DEFAULT_MAX_TOKENS = Number(process.env.MERIDIAN_LLM_MAX_TOKENS || 400);
export const DEFAULT_TIMEOUT_MS = Number(process.env.MERIDIAN_LLM_TIMEOUT_MS || 12000);
export const ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION || '2023-06-01';

export function claudeConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function claudeAgentStatus() {
  const ok = claudeConfigured();
  return {
    provider: 'anthropic',
    api: 'messages',
    endpoint: ANTHROPIC_MESSAGES_URL,
    configured: ok,
    mode: ok ? 'claude_agent' : 'offline',
    model: ok ? DEFAULT_MODEL : null,
    maxTokens: DEFAULT_MAX_TOKENS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    note: ok
      ? `Claude Agent API live — Meridian agents use ${DEFAULT_MODEL} via Anthropic Messages API.`
      : 'Set ANTHROPIC_API_KEY on Meridian (Railway) to enable Claude-powered agents.',
  };
}

function loadUsage() {
  try {
    return JSON.parse(fs.readFileSync(USAGE, 'utf8'));
  } catch {
    return { events: [], totals: { inputTokens: 0, outputTokens: 0, turns: 0 } };
  }
}

function saveUsage(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USAGE, JSON.stringify(data, null, 2));
}

function recordUsage({ agentId, model, inputTokens, outputTokens, ms, ok, error }) {
  try {
    const store = loadUsage();
    store.events.unshift({
      id: `cl_${crypto.randomBytes(6).toString('hex')}`,
      at: new Date().toISOString(),
      agentId: agentId || null,
      model,
      inputTokens: inputTokens || 0,
      outputTokens: outputTokens || 0,
      ms,
      ok: Boolean(ok),
      error: error || null,
    });
    store.events = store.events.slice(0, 2000);
    if (ok) {
      store.totals.inputTokens = (store.totals.inputTokens || 0) + (inputTokens || 0);
      store.totals.outputTokens = (store.totals.outputTokens || 0) + (outputTokens || 0);
      store.totals.turns = (store.totals.turns || 0) + 1;
    }
    saveUsage(store);
  } catch {
    /* non-fatal */
  }
}

export function claudeUsageSummary() {
  const store = loadUsage();
  return {
    totals: store.totals || { inputTokens: 0, outputTokens: 0, turns: 0 },
    recent: (store.events || []).slice(0, 20),
  };
}

/**
 * Normalize chat history for Anthropic Messages API.
 * Alternating user/assistant; merge consecutive same-role if needed.
 */
export function toAnthropicMessages(history = [], userMessage) {
  const raw = [
    ...history
      .slice(-12)
      .filter((h) => h?.role && h?.content)
      .map((h) => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: String(h.content).slice(0, 2000),
      })),
    { role: 'user', content: String(userMessage || '').slice(0, 2000) },
  ].filter((m) => m.content);

  // Anthropic requires first message user and no empty; collapse consecutive roles
  const out = [];
  for (const m of raw) {
    if (!out.length) {
      if (m.role !== 'user') continue;
      out.push(m);
      continue;
    }
    const last = out[out.length - 1];
    if (last.role === m.role) {
      last.content = `${last.content}\n${m.content}`.slice(0, 4000);
    } else {
      out.push(m);
    }
  }
  if (!out.length) out.push({ role: 'user', content: String(userMessage || 'Hello').slice(0, 2000) });
  return out;
}

/**
 * Core Claude Agent API call (Messages API).
 * @returns {Promise<{ ok, reply?, model?, usage?, ms?, error?, raw? }>}
 */
export async function callClaudeAgent({
  system,
  message,
  history = [],
  model = DEFAULT_MODEL,
  maxTokens = DEFAULT_MAX_TOKENS,
  temperature,
  agentId = null,
  tools = null,
} = {}) {
  if (!claudeConfigured()) {
    return { ok: false, error: 'ANTHROPIC_API_KEY_missing', provider: 'anthropic' };
  }

  const msg = String(message || '').trim();
  if (!msg && !(tools && history.length)) {
    return { ok: false, error: 'message_required' };
  }

  const body = {
    model: model || DEFAULT_MODEL,
    max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
    system: String(system || 'You are a helpful business assistant.').slice(0, 12000),
    messages: toAnthropicMessages(history, msg || 'Continue.'),
  };
  if (temperature !== undefined && temperature !== null) {
    body.temperature = Number(temperature);
  }
  if (Array.isArray(tools) && tools.length) {
    body.tools = tools;
  }

  const started = Date.now();
  let res;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    res = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY.trim(),
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (e) {
    const err = e.name === 'AbortError' ? 'timeout' : e.message || 'network_error';
    recordUsage({ agentId, model: body.model, ms: Date.now() - started, ok: false, error: err });
    return { ok: false, error: err, provider: 'anthropic', ms: Date.now() - started };
  }

  const ms = Date.now() - started;
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err =
      data?.error?.message ||
      data?.error?.type ||
      `http_${res.status}`;
    recordUsage({ agentId, model: body.model, ms, ok: false, error: err });
    return {
      ok: false,
      error: err,
      httpStatus: res.status,
      provider: 'anthropic',
      ms,
    };
  }

  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  const usage = data.usage
    ? {
        inputTokens: data.usage.input_tokens || 0,
        outputTokens: data.usage.output_tokens || 0,
      }
    : null;

  recordUsage({
    agentId,
    model: data.model || body.model,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    ms,
    ok: true,
  });

  if (!text) {
    return {
      ok: false,
      error: 'empty_response',
      provider: 'anthropic',
      usage,
      ms,
      stopReason: data.stop_reason,
      content: data.content,
    };
  }

  return {
    ok: true,
    reply: text,
    model: data.model || body.model,
    provider: 'anthropic',
    usage,
    ms,
    stopReason: data.stop_reason,
    id: data.id,
  };
}

/**
 * Lightweight public FAQ / guide assistant (site hamburger) via Claude.
 */
export async function callClaudeGuide({ message, history = [], systemExtra = '' } = {}) {
  const system = `You are Meridian AI, the on-site guide for Meridian Agency (Voice, Sales, Booking agents for local businesses).
Be concise, professional, and helpful. Never invent fake customer counts or patents.
Pricing: kits $497 each, full stack $997; Voice Premium usage packs/subs for hosted xAI speech.
Phone: Retell/Vapi/Bland + Meridian brain. CASL: consent required, no spam.
If they want to buy or onboard, tell them to say "start" or use Get a proposal / checkout on the site.
${systemExtra}`.trim();

  return callClaudeAgent({
    system,
    message,
    history,
    model: process.env.MERIDIAN_GUIDE_MODEL || DEFAULT_MODEL,
    maxTokens: Number(process.env.MERIDIAN_GUIDE_MAX_TOKENS || 350),
    agentId: 'site_guide',
  });
}
