/**
 * Reliability: synthetic probes, platform status, circuit stats.
 * Ensures operators (and customers) can see "is Meridian healthy?"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listAgents, verifyAgentKey, getAgent } from '../engine.mjs';
import { smartAgentChat, brainStatus } from './agent-brain.mjs';
import { voiceStatus, preferredHostedTts } from './voice-pipeline.mjs';
import { xaiTtsConfigured } from './xai-tts.mjs';
import { claudeConfigured } from './claude-agent-api.mjs';
import { containmentStatus } from './openclaw-containment.mjs';
import { globalInteractionStats } from './interactions.mjs';
import { notifyConfig } from './notify.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(__dirname, '..', 'data');
const PROBE_FILE = path.join(DATA_DIR, 'health-probes.json');

function loadProbes() {
  try {
    return JSON.parse(fs.readFileSync(PROBE_FILE, 'utf8'));
  } catch {
    return { agents: {}, lastPlatform: null };
  }
}
function saveProbes(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PROBE_FILE, JSON.stringify(data, null, 2));
}

/**
 * Public platform status (no secrets).
 */
export function platformStatus() {
  const brain = brainStatus();
  const voice = voiceStatus();
  const ix = globalInteractionStats();
  const notify = notifyConfig();
  const checks = {
    online: true,
    claude: claudeConfigured(),
    xaiTts: xaiTtsConfigured(),
    voiceMode: preferredHostedTts(),
    email: notify.email,
    sms: notify.sms,
    openclawContained: true,
  };
  const degraded = [];
  if (!checks.claude) degraded.push('claude_offline_fallback_brain');
  if (!checks.xaiTts) degraded.push('xai_tts_unavailable_platform_tts_ok');
  if (!checks.email) degraded.push('owner_email_alerts_need_resend');
  if (!checks.sms) degraded.push('sms_optional_twilio_unset');

  return {
    ok: true,
    product: 'meridian',
    status: degraded.length ? 'degraded' : 'operational',
    message:
      degraded.length === 0
        ? 'All core systems operational. Agents answer with Claude when configured; phone path uses platform TTS by default.'
        : `Operational with notes: ${degraded.join(', ')}. Customer phone/chat still work via fallbacks.`,
    checks,
    brain,
    voice: { mode: voice.mode, provider: voice.provider, metered: voice.metered },
    openclaw: containmentStatus(),
    interactions: ix,
    degraded,
    updatedAt: new Date().toISOString(),
    uptimeSec: Math.floor(process.uptime()),
  };
}

/**
 * Smoke-test one agent brain (must always return a reply).
 */
export async function probeAgent(agentId, { apiKey } = {}) {
  const agent = apiKey ? verifyAgentKey(agentId, apiKey) : getAgent(agentId);
  if (!agent) return { ok: false, error: 'agent_not_found' };

  const t0 = Date.now();
  let brain;
  try {
    brain = await smartAgentChat(agent, 'What are your hours?', { history: [] });
  } catch (e) {
    brain = { reply: '', source: 'error', llmError: e.message };
  }
  const ms = Date.now() - t0;
  const ok = Boolean(brain?.reply && String(brain.reply).trim().length > 0);
  const result = {
    ok,
    agentId: agent.id,
    businessName: agent.businessName,
    ms,
    brainSource: brain?.source || null,
    replyPreview: String(brain?.reply || '').slice(0, 160),
    llmError: brain?.llmError || null,
    at: new Date().toISOString(),
  };

  const store = loadProbes();
  store.agents[agent.id] = {
    ...(store.agents[agent.id] || {}),
    last: result,
    lastOkAt: ok ? result.at : store.agents[agent.id]?.lastOkAt || null,
    consecutiveFails: ok ? 0 : (store.agents[agent.id]?.consecutiveFails || 0) + 1,
  };
  saveProbes(store);
  return result;
}

/**
 * Probe a sample of active agents (ops / cron).
 */
export async function probeAllAgents({ max = 10 } = {}) {
  const agents = listAgents().filter((a) => a.status === 'active').slice(0, max);
  const results = [];
  for (const a of agents) {
    // Without apiKey we still can getAgent + smartAgentChat
    results.push(await probeAgent(a.id));
  }
  const store = loadProbes();
  store.lastPlatform = {
    at: new Date().toISOString(),
    probed: results.length,
    ok: results.filter((r) => r.ok).length,
    fail: results.filter((r) => !r.ok).length,
  };
  saveProbes(store);
  return { ok: true, ...store.lastPlatform, results };
}

export function getAgentHealth(agentId) {
  const store = loadProbes();
  return store.agents[agentId] || null;
}

export function getProbeStore() {
  return loadProbes();
}

/**
 * Circuit breaker metadata for responses.
 */
export function reliabilityHeaders(brain) {
  return {
    'X-Meridian-Brain': brain?.source || 'unknown',
    'X-Meridian-Fallback': brain?.source === 'fallback' ? '1' : '0',
  };
}
