/**
 * Meridian AI provider switch — ONE place that decides which vendor runs the
 * brain (text) and the realtime voice path.
 *
 *   MERIDIAN_AI_PROVIDER=xai     (default) → xAI for text brain + realtime voice. One bill.
 *   MERIDIAN_AI_PROVIDER=legacy            → previous chain (Claude → Groq text, OpenAI Realtime voice).
 *
 * Rollback = flip the env var; no code revert required. Regex fallback always stays last.
 */
import { callXaiAgent, xaiConfigured, xaiTextModel } from './xai-llm.mjs';
import { callClaudeAgent, claudeConfigured } from './claude-agent-api.mjs';

export const AI_PROVIDERS = Object.freeze(['xai', 'legacy']);

export function aiProvider() {
  const v = String(process.env.MERIDIAN_AI_PROVIDER || 'xai').trim().toLowerCase();
  return AI_PROVIDERS.includes(v) ? v : 'xai';
}

/** Realtime voice vendor that the SIP ingress expects. */
export function voiceProvider() {
  return aiProvider() === 'legacy' ? 'openai' : 'xai';
}

export function textModelConfigured() {
  return aiProvider() === 'xai' ? xaiConfigured() : claudeConfigured();
}

export function textModelLabel() {
  return aiProvider() === 'xai' ? `xai:${xaiTextModel()}` : 'anthropic';
}

/** Long-form / ops text generation (articles, vetting, summaries). */
export async function callTextModel(opts = {}) {
  if (aiProvider() === 'xai') {
    const { model, ...rest } = opts;
    // Anthropic model names (claude-*) are meaningless to xAI — ignore them.
    return callXaiAgent({ ...rest, model: model && !/^claude/i.test(model) ? model : undefined });
  }
  return callClaudeAgent(opts);
}
