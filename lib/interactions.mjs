/**
 * Interaction log — every chat/voice/widget turn for dashboard + summaries.
 * Disk-backed, per-agent capped history.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(__dirname, '..', 'data');
const STORE = path.join(DATA_DIR, 'interactions.json');
const MAX_GLOBAL = 5000;
const MAX_PER_AGENT = 200;

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE, 'utf8'));
  } catch {
    return { items: [], byAgent: {} };
  }
}
function save(data) {
  ensure();
  fs.writeFileSync(STORE, JSON.stringify(data, null, 2));
}

/**
 * @param {object} evt
 */
export function logInteraction(evt = {}) {
  const store = load();
  const id = `ix_${crypto.randomBytes(6).toString('hex')}`;
  const agentId = evt.agentId || 'unknown';
  const row = {
    id,
    at: new Date().toISOString(),
    agentId,
    businessName: evt.businessName || '',
    channel: evt.channel || 'chat', // chat | widget | voice | sms | form | system
    role: evt.role || 'turn',
    message: String(evt.message || '').slice(0, 800),
    reply: String(evt.reply || '').slice(0, 800),
    brainSource: evt.brainSource || null,
    intent: evt.intent || null,
    meta: evt.meta || null,
    ok: evt.ok !== false,
  };
  store.items.unshift(row);
  store.items = store.items.slice(0, MAX_GLOBAL);
  if (!store.byAgent[agentId]) store.byAgent[agentId] = [];
  store.byAgent[agentId].unshift(row.id);
  store.byAgent[agentId] = store.byAgent[agentId].slice(0, MAX_PER_AGENT);
  // Keep only referenced items for space: rebuild map periodically by id
  if (store.items.length % 200 === 0) {
    const keep = new Set(Object.values(store.byAgent).flat());
    store.items = store.items.filter((i) => keep.has(i.id)).slice(0, MAX_GLOBAL);
  }
  save(store);
  return row;
}

export function listInteractions(agentId, limit = 40) {
  const store = load();
  if (!agentId) return store.items.slice(0, limit);
  const ids = new Set(store.byAgent[agentId] || []);
  return store.items.filter((i) => ids.has(i.id) || i.agentId === agentId).slice(0, limit);
}

export function agentStats(agentId, { hours = 24 * 7 } = {}) {
  const since = Date.now() - hours * 3600 * 1000;
  const items = listInteractions(agentId, MAX_PER_AGENT).filter(
    (i) => new Date(i.at).getTime() >= since,
  );
  const byChannel = {};
  let transfers = 0;
  let emergencies = 0;
  let fallbacks = 0;
  let bookings = 0;
  for (const i of items) {
    byChannel[i.channel] = (byChannel[i.channel] || 0) + 1;
    if (i.intent?.transferSuggested) transfers += 1;
    if (i.intent?.emergency) emergencies += 1;
    if (i.brainSource === 'fallback') fallbacks += 1;
    if (i.intent?.booking) bookings += 1;
  }
  return {
    agentId,
    windowHours: hours,
    total: items.length,
    byChannel,
    transfers,
    emergencies,
    fallbacks,
    bookings,
    lastAt: items[0]?.at || null,
  };
}

/**
 * Build a short owner-facing summary of recent activity.
 */
export function buildActivitySummary(agentId, limit = 8) {
  const items = listInteractions(agentId, limit);
  const stats = agentStats(agentId, { hours: 24 });
  const lines = items.map((i, n) => {
    const t = i.at?.slice(11, 16) || '';
    return `${n + 1}. [${i.channel}/${t}] "${(i.message || '').slice(0, 80)}" → "${(i.reply || '').slice(0, 80)}"`;
  });
  return {
    stats,
    text:
      `Meridian summary (last 24h): ${stats.total} turns · bookings-ish ${stats.bookings} · transfers ${stats.transfers} · emergencies ${stats.emergencies} · fallback brain ${stats.fallbacks}.\n\n` +
      (lines.length ? `Recent:\n${lines.join('\n')}` : 'No recent interactions.'),
    items,
  };
}

export function globalInteractionStats() {
  const store = load();
  const day = Date.now() - 24 * 3600 * 1000;
  const recent = store.items.filter((i) => new Date(i.at).getTime() >= day);
  return {
    totalStored: store.items.length,
    last24h: recent.length,
    agentsActive24h: new Set(recent.map((i) => i.agentId)).size,
  };
}
