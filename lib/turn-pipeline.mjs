/**
 * Unified customer turn pipeline:
 * intent → brain → log → optional owner alert / summary
 * Used by chat, widget, voice, agent endpoints so quality is consistent.
 */

import { smartAgentChat } from './agent-brain.mjs';
import { analyzeIntent } from './knowledge.mjs';
import { logInteraction } from './interactions.mjs';
import { notifyOwner, sendInteractionSummary } from './notify.mjs';
import { dispatchWebhook } from '../engine.mjs';

/**
 * @param {object} agent
 * @param {string} message
 * @param {object} opts
 */
export async function runCustomerTurn(agent, message, opts = {}) {
  const channel = opts.channel || 'chat';
  const history = Array.isArray(opts.history) ? opts.history.slice(-12) : [];
  const msg = String(message || '').trim().slice(0, opts.maxLen || 2000);

  if (!msg) {
    return { ok: false, error: 'message required' };
  }

  const intent = analyzeIntent(msg);

  // Soft spam gate for widget/public only
  if (intent.spam && opts.blockSpam) {
    const reply =
      'Thanks for reaching out. Please leave your name and a brief note about how we can help your business, and our team will respond if relevant.';
    const row = logInteraction({
      agentId: agent.id,
      businessName: agent.businessName,
      channel,
      message: msg,
      reply,
      brainSource: 'spam_filter',
      intent,
      ok: true,
    });
    return {
      ok: true,
      reply,
      say: reply,
      source: 'spam_filter',
      intent,
      interactionId: row.id,
      spam: true,
    };
  }

  let brain;
  try {
    brain = await smartAgentChat(agent, msg, { history });
  } catch (e) {
    brain = {
      reply: fallbackEmergencyReply(agent, intent),
      source: 'fallback',
      provider: 'error_catch',
      llmError: e.message,
    };
  }

  let reply = String(brain.reply || '').trim();
  if (!reply) {
    reply = fallbackEmergencyReply(agent, intent);
    brain = { ...brain, reply, source: 'fallback', emptyGuard: true };
  }

  // Inject transfer hint on emergency if model forgot
  if (intent.emergency && agent.config?.humanTransfer) {
    if (!reply.toLowerCase().includes(String(agent.config.humanTransfer).slice(-4))) {
      reply = `${reply} For emergencies, call ${agent.config.humanTransfer} now.`;
    }
  }

  const row = logInteraction({
    agentId: agent.id,
    businessName: agent.businessName,
    channel,
    message: msg,
    reply,
    brainSource: brain.source,
    intent,
    meta: {
      model: brain.model || null,
      ms: brain.claudeMs || null,
      llmError: brain.llmError || null,
    },
    ok: true,
  });

  // Fire-and-forget side effects — never block the customer reply
  Promise.resolve()
    .then(async () => {
      await dispatchWebhook('agent.turn', {
        agentId: agent.id,
        businessName: agent.businessName,
        channel,
        message: msg.slice(0, 200),
        reply: reply.slice(0, 200),
        source: brain.source,
        intent,
        interactionId: row.id,
      }).catch(() => {});

      if (intent.emergency || intent.frustrated || (intent.wantHuman && opts.alertOnHuman !== false)) {
        await notifyOwner(agent, {
          subject: intent.emergency
            ? `🚨 Emergency · ${agent.businessName}`
            : `Meridian · human needed · ${agent.businessName}`,
          text: `Channel: ${channel}\nVisitor: ${msg}\nAgent: ${reply}\nTransfer: ${agent.config?.humanTransfer || 'n/a'}`,
          smsText: intent.emergency
            ? `EMERGENCY via Meridian (${agent.businessName}): ${msg.slice(0, 120)}`
            : `Meridian human request (${agent.businessName}): ${msg.slice(0, 120)}`,
          forceSms: intent.emergency,
        }).catch(() => {});
      }

      // Auto summary for high priority
      if (intent.emergency || intent.booking || opts.alwaysSummary) {
        await sendInteractionSummary(agent, row, {
          customerPhone: opts.customerPhone,
        }).catch(() => {});
      }
    })
    .catch(() => {});

  return {
    ok: true,
    reply,
    say: reply,
    source: brain.source,
    provider: brain.provider,
    model: brain.model || null,
    usage: brain.usage || null,
    latencyMs: brain.claudeMs || null,
    llmError: brain.llmError || null,
    intent,
    interactionId: row.id,
    transfer:
      intent.transferSuggested || intent.emergency
        ? {
            suggested: true,
            number: agent.config?.humanTransfer || null,
            reason: intent.emergency ? 'emergency' : intent.wantHuman ? 'requested_human' : 'frustrated',
          }
        : null,
    brain,
  };
}

function fallbackEmergencyReply(agent, intent) {
  const name = agent?.businessName || 'us';
  const transfer = agent?.config?.humanTransfer;
  if (intent?.emergency) {
    return transfer
      ? `This may be an emergency. Please call ${transfer} immediately, or dial local emergency services if you are in danger.`
      : `This may be an emergency. Please contact emergency services if you are in danger, or call ${name} directly right away.`;
  }
  if (agent?.config?.hours) {
    return `Thanks for contacting ${name}. Our hours are ${agent.config.hours}. How can I help — booking or a quick question?`;
  }
  return `Thanks for contacting ${name}. I can help with hours, booking, or a quick question. What do you need?`;
}
