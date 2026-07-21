/**
 * Meridian Agent Brain — Claude Agent API (Anthropic Messages) with
 * deterministic fallback that NEVER breaks the must-work promise.
 *
 * Every agent, from every spawn path (manual deploy, OpenClaw queue, chat
 * concierge, Stripe auto-provision), builds its system prompt through
 * buildSystemPrompt() here — business facts + expertise + knowledge + truth rules.
 */

import { agentChat as regexAgentChat } from '../engine.mjs';
import { expertiseFor } from './expertise.mjs';
import {
  callClaudeAgent,
  claudeConfigured,
  claudeAgentStatus,
  DEFAULT_MODEL,
} from './claude-agent-api.mjs';
import { antiHallucinationRules, buildKnowledgeBlock } from './knowledge.mjs';

export function llmConfigured() {
  return claudeConfigured();
}

export function brainStatus() {
  const claude = claudeAgentStatus();
  return {
    mode: claude.configured ? 'llm' : 'fallback',
    provider: claude.configured ? 'anthropic' : 'regex_fallback',
    api: claude.configured ? 'claude_messages' : null,
    model: claude.configured ? claude.model : null,
    claude,
    reliability: 'circuit_breaker_fallback_always_on',
    note: claude.configured
      ? `Real conversation via Claude Agent API (${claude.model}). Fallback brain if timeout/error.`
      : 'No ANTHROPIC_API_KEY — using deterministic fallback brain (core intents only).',
  };
}

/**
 * The ONE place every agent's system prompt is built.
 */
export function buildSystemPrompt(agent) {
  const cfg = agent?.config || {};
  const name = agent?.businessName || 'the business';
  const version = cfg.brainVersion || process.env.MERIDIAN_BRAIN_VERSION || 'v2';
  const facts = [
    `Business: ${name}.`,
    cfg.hours ? `Hours: ${cfg.hours}.` : '',
    cfg.services ? `Services: ${cfg.services}.` : '',
    cfg.faqs ? `FAQs: ${cfg.faqs}.` : '',
    cfg.bookingRules ? `Booking rules: ${cfg.bookingRules}.` : '',
    cfg.humanTransfer ? `Human transfer / emergencies: ${cfg.humanTransfer}.` : '',
    cfg.calendarUrl ? `Calendar / booking link: ${cfg.calendarUrl}.` : '',
    cfg.serviceArea ? `Service area: ${cfg.serviceArea}.` : '',
    `Tone: ${cfg.tone || 'professional'}.`,
  ]
    .filter(Boolean)
    .join(' ');

  const knowledge = buildKnowledgeBlock(agent);
  const truth = antiHallucinationRules();

  return [
    expertiseFor(cfg.primaryNeed),
    '',
    `BRAIN_VERSION: ${version}`,
    '',
    truth,
    '',
    `BUSINESS FACTS (ground every answer in these — never contradict or invent beyond them):\n${facts}`,
    knowledge ? `\n${knowledge}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Real conversation via Claude Agent API.
 * Falls back to regex brain on missing key / timeout / API error — never silent.
 */
export async function smartAgentChat(agent, message, { history = [] } = {}) {
  const msg = String(message || '').trim();
  if (!msg) return { reply: regexAgentChat(agent, msg), source: 'fallback' };

  if (!llmConfigured()) {
    return { reply: regexAgentChat(agent, msg), source: 'fallback', provider: 'regex' };
  }

  const result = await callClaudeAgent({
    system: buildSystemPrompt(agent),
    message: msg,
    history,
    model: agent.config?.claudeModel || process.env.MERIDIAN_LLM_MODEL || DEFAULT_MODEL,
    agentId: agent.id,
  });

  if (!result.ok || !result.reply) {
    return {
      reply: regexAgentChat(agent, msg),
      source: 'fallback',
      provider: 'regex',
      llmError: result.error || 'claude_failed',
      claudeMs: result.ms,
    };
  }

  return {
    reply: result.reply,
    source: 'llm',
    provider: 'anthropic',
    model: result.model,
    usage: result.usage,
    claudeMs: result.ms,
    stopReason: result.stopReason,
  };
}

export { callClaudeAgent, claudeConfigured, claudeAgentStatus };
