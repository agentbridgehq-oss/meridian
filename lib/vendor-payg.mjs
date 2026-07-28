/**
 * Vendor PAYG spend log — xAI TTS, Claude, Groq are all usage-based.
 * No auto top-up, no prepaid vendor contracts in-app.
 * Customer still pays Meridian cash-first (usage-billing packs).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(__dirname, '..', 'data');
const LEDGER = path.join(DATA_DIR, 'vendor-payg-ledger.json');

/** Rough cost cents for ops ROI (override via env). All PAYG — no monthly floor. */
export function vendorCostCents(kind, meta = {}) {
  if (kind === 'xai_tts') {
    // ~$0.04/turn est default (matches VOICE_COST_CENTS_PER_TURN)
    return Math.max(0, Number(process.env.VOICE_COST_CENTS_PER_TURN || 4));
  }
  if (kind === 'claude') {
    // rough haiku-class: ~0.5¢ average short voice turn
    return Math.max(0, Number(process.env.CLAUDE_COST_CENTS_PER_TURN || 1));
  }
  if (kind === 'groq') {
    // Groq is typically sub-cent for short turns
    return Math.max(0, Number(process.env.GROQ_COST_CENTS_PER_TURN || 0));
  }
  return 0;
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  } catch {
    return {
      mode: 'pay_as_you_go',
      vendors: {
        xai: { calls: 0, ok: 0, fail: 0, centsEst: 0 },
        anthropic: { calls: 0, ok: 0, fail: 0, centsEst: 0 },
        groq: { calls: 0, ok: 0, fail: 0, centsEst: 0 },
      },
      events: [],
    };
  }
}

function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(data, null, 2));
}

/**
 * Record one vendor API call (usage-only billing to that vendor).
 * @param {'xai_tts'|'claude'|'groq'} kind
 */
export function recordVendorPayg(kind, { ok = true, agentId = null, meta = {} } = {}) {
  try {
    const store = load();
    const cents = ok ? vendorCostCents(kind, meta) : 0;
    const vendorKey =
      kind === 'xai_tts' ? 'xai' : kind === 'claude' ? 'anthropic' : kind === 'groq' ? 'groq' : 'other';
    if (!store.vendors[vendorKey]) {
      store.vendors[vendorKey] = { calls: 0, ok: 0, fail: 0, centsEst: 0 };
    }
    store.vendors[vendorKey].calls += 1;
    if (ok) {
      store.vendors[vendorKey].ok += 1;
      store.vendors[vendorKey].centsEst += cents;
    } else {
      store.vendors[vendorKey].fail += 1;
    }
    store.events.unshift({
      id: `vpg_${crypto.randomBytes(5).toString('hex')}`,
      at: new Date().toISOString(),
      kind,
      vendor: vendorKey,
      ok: Boolean(ok),
      centsEst: cents,
      agentId,
      meta: meta || {},
      billing: 'pay_as_you_go',
    });
    store.events = store.events.slice(0, 3000);
    store.mode = 'pay_as_you_go';
    store.updatedAt = new Date().toISOString();
    save(store);
    return { ok: true, centsEst: cents };
  } catch {
    return { ok: false };
  }
}

export function vendorPaygSnapshot() {
  const store = load();
  const v = store.vendors || {};
  const totalCents =
    (v.xai?.centsEst || 0) + (v.anthropic?.centsEst || 0) + (v.groq?.centsEst || 0);
  return {
    mode: 'pay_as_you_go',
    policy: {
      xai: 'usage_per_tts_call',
      anthropic: 'usage_per_token',
      groq: 'usage_per_token',
      customerVoice: 'prepaid_packs_or_sub_included_then_pack',
      noAutoTopUp: true,
      note: 'All LLM/TTS vendors billed only when used. Customer pays Meridian before hosted audio.',
    },
    vendors: v,
    totalVendorCentsEst: totalCents,
    totalVendorUsdEst: (totalCents / 100).toFixed(2),
    recent: (store.events || []).slice(0, 20),
    updatedAt: store.updatedAt || null,
  };
}
