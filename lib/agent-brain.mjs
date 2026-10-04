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
import { callGroqAgent, groqConfigured, groqStatus } from './groq-llm.mjs';
import { callXaiAgent, xaiConfigured, xaiTextStatus } from './xai-llm.mjs';
import { aiProvider } from './ai-provider.mjs';
import { antiHallucinationRules, buildKnowledgeBlock } from './knowledge.mjs';

export function llmConfigured() {
  if (aiProvider() === 'xai') return xaiConfigured();
  return claudeConfigured() || groqConfigured();
}

export function brainStatus() {
  if (aiProvider() === 'xai') {
    const xai = xaiTextStatus();
    return {
      mode: xai.configured ? 'llm' : 'fallback',
      provider: xai.configured ? 'xai' : 'regex_fallback',
      aiProvider: 'xai',
      api: xai.configured ? 'xai_chat' : null,
      model: xai.configured ? xai.model : null,
      xai,
      reliability: 'xai_then_regex_never_silent',
      note: xai.configured
        ? `xAI brain (${xai.model}) primary · regex last. Rollback: MERIDIAN_AI_PROVIDER=legacy.`
        : 'No XAI_API_KEY — deterministic fallback only.',
    };
  }
  const claude = claudeAgentStatus();
  const groq = groqStatus();
  const mode = claude.configured ? 'llm' : groq.configured ? 'llm_groq' : 'fallback';
  return {
    mode,
    provider: claude.configured ? 'anthropic' : groq.configured ? 'groq' : 'regex_fallback',
    aiProvider: 'legacy',
    api: claude.configured ? 'claude_messages' : groq.configured ? 'groq_chat' : null,
    model: claude.configured ? claude.model : groq.configured ? groq.model : null,
    claude,
    groq,
    reliability: 'claude_then_groq_then_regex_never_silent',
    note: claude.configured
      ? `Claude Agent API (${claude.model}) primary · Groq ${groq.configured ? 'armed' : 'off'} · regex last.`
      : groq.configured
        ? `No Claude key — Groq PAYG brain (${groq.model}) · regex last.`
        : 'No ANTHROPIC_API_KEY / GROQ_API_KEY — deterministic fallback only.',
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
 * Real conversation via the configured AI provider (xAI by default; legacy Claude → Groq).
 * Falls back to regex brain on missing key / timeout / API error — never silent.
 */
export async function smartAgentChat(agent, message, { history = [] } = {}) {
  const msg = String(message || '').trim();
  if (!msg) return { reply: regexAgentChat(agent, msg), source: 'fallback' };

  const system = buildSystemPrompt(agent);
  const errors = [];
  const provider = aiProvider();

  // 0) xAI (default — one vendor bill). Legacy chain below only when MERIDIAN_AI_PROVIDER=legacy.
  if (provider === 'xai') {
    if (xaiConfigured()) {
      const result = await callXaiAgent({
        system,
        message: msg,
        history,
        model: agent.config?.xaiModel || process.env.XAI_TEXT_MODEL,
      });
      if (result.ok && result.reply) {
        try {
          const { recordVendorPayg } = await import('./vendor-payg.mjs');
          recordVendorPayg('xai_llm', { ok: true, agentId: agent?.id, meta: { model: result.model, ms: result.ms, usage: result.usage } });
        } catch {
          /* ignore */
        }
        return {
          reply: result.reply,
          source: 'llm',
          provider: 'xai',
          model: result.model,
          usage: result.usage,
          xaiMs: result.ms,
          stopReason: result.stopReason,
          billing: 'pay_as_you_go',
        };
      }
      errors.push(result.error || 'xai_failed');
      try {
        const { recordVendorPayg } = await import('./vendor-payg.mjs');
        recordVendorPayg('xai_llm', { ok: false, agentId: agent?.id, meta: { error: result.error, httpStatus: result.httpStatus } });
      } catch {
        /* ignore */
      }
    }
  }

  // 1) Claude PAYG (legacy primary)
  if (provider === 'legacy' && claudeConfigured()) {
    const result = await callClaudeAgent({
      system,
      message: msg,
      history,
      model: agent.config?.claudeModel || process.env.MERIDIAN_LLM_MODEL || DEFAULT_MODEL,
      agentId: agent.id,
    });
    if (result.ok && result.reply) {
      try {
        const { recordVendorPayg } = await import('./vendor-payg.mjs');
        recordVendorPayg('claude', {
          ok: true,
          agentId: agent?.id,
          meta: { model: result.model, ms: result.ms },
        });
      } catch {
        /* ignore */
      }
      return {
        reply: result.reply,
        source: 'llm',
        provider: 'anthropic',
        model: result.model,
        usage: result.usage,
        claudeMs: result.ms,
        stopReason: result.stopReason,
        billing: 'pay_as_you_go',
      };
    }
    errors.push(result.error || 'claude_failed');
    try {
      const { recordVendorPayg } = await import('./vendor-payg.mjs');
      recordVendorPayg('claude', { ok: false, agentId: agent?.id, meta: { error: result.error } });
    } catch {
      /* ignore */
    }
  }

  // 2) Groq PAYG (legacy failover — never leave customer hanging)
  if (provider === 'legacy' && groqConfigured()) {
    const groq = await callGroqAgent({
      system,
      message: msg,
      history,
      model: agent.config?.groqModel || process.env.GROQ_MODEL,
    });
    if (groq.ok && groq.reply) {
      try {
        const { recordVendorPayg } = await import('./vendor-payg.mjs');
        recordVendorPayg('groq', {
          ok: true,
          agentId: agent?.id,
          meta: { model: groq.model, ms: groq.ms, failover: Boolean(errors.length) },
        });
      } catch {
        /* ignore */
      }
      return {
        reply: groq.reply,
        source: 'llm',
        provider: 'groq',
        model: groq.model,
        usage: groq.usage,
        groqMs: groq.ms,
        llmError: errors[0] || null,
        failover: Boolean(errors.length),
        billing: 'pay_as_you_go',
      };
    }
    errors.push(groq.error || 'groq_failed');
    try {
      const { recordVendorPayg } = await import('./vendor-payg.mjs');
      recordVendorPayg('groq', { ok: false, agentId: agent?.id, meta: { error: groq.error } });
    } catch {
      /* ignore */
    }
  }

  // 3) Deterministic fallback — must-work promise
  return {
    reply: regexAgentChat(agent, msg),
    source: 'fallback',
    provider: 'regex',
    llmError: errors.join(' | ') || 'no_llm',
  };
}

export { callClaudeAgent, claudeConfigured, claudeAgentStatus };
