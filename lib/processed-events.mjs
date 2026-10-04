/**
 * Persistent "process once" ledger for side effects that must never repeat:
 * Stripe checkout sessions / webhook events (credits, plan activation) and
 * usage-alert deliveries.
 *
 * claimOnce() is synchronous: it reads, checks and writes the record in a single
 * tick, so two concurrent handlers in this process (e.g. Stripe webhook + the
 * checkout confirm page) can never both win the same key. The file is written
 * atomically (tmp + rename) so a crash cannot leave a half-written ledger.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STALE_PROCESSING_MS = 10 * 60 * 1000;

function file() {
  const dir = process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(__dirname, '..', 'data');
  return path.join(dir, 'processed-events.json');
}

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return data && typeof data.keys === 'object' ? data : { keys: {} };
  } catch {
    return { keys: {} };
  }
}

function save(data) {
  const f = file();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, f);
}

/**
 * Claim a key. Returns { claimed: true } exactly once per key (unless released, or a
 * 'processing' claim went stale after a crash). Otherwise { claimed: false, record }.
 */
export function claimOnce(key, meta = {}, { now = Date.now(), staleMs = STALE_PROCESSING_MS } = {}) {
  if (!key) return { claimed: false, record: null, error: 'key_required' };
  const data = load();
  const rec = data.keys[key];
  if (rec && (rec.status === 'done' || now - Date.parse(rec.claimedAt) < staleMs)) {
    return { claimed: false, record: rec };
  }
  data.keys[key] = { status: 'processing', claimedAt: new Date(now).toISOString(), attempts: (rec?.attempts || 0) + 1, meta };
  save(data);
  return { claimed: true, record: data.keys[key] };
}

export function completeClaim(key, result = null) {
  const data = load();
  const rec = data.keys[key] || { claimedAt: new Date().toISOString(), attempts: 1 };
  data.keys[key] = { ...rec, status: 'done', completedAt: new Date().toISOString(), result };
  save(data);
  return data.keys[key];
}

/** Give the key back (side effect did not happen) so a retry can process it. */
export function releaseClaim(key, { error = '' } = {}) {
  const data = load();
  const rec = data.keys[key];
  if (!rec || rec.status === 'done') return false;
  data.keys[key] = { ...rec, status: 'released', claimedAt: new Date(0).toISOString(), lastError: String(error).slice(0, 300) };
  save(data);
  return true;
}

export function getClaim(key) {
  return load().keys[key] || null;
}

/**
 * Run an async side effect at most once per key. Concurrent/duplicate callers get
 * { duplicate: true, pending } or the stored summary of the first run. A thrown
 * error releases the key so a later retry can run it.
 */
export async function processOnce(key, fn, { summarize = (r) => r ?? null, meta = {} } = {}) {
  const claim = claimOnce(key, meta);
  if (!claim.claimed) {
    const done = claim.record?.status === 'done';
    return { duplicate: true, pending: !done, result: done ? claim.record.result : null };
  }
  try {
    const result = await fn();
    completeClaim(key, summarize(result));
    return { duplicate: false, pending: false, result };
  } catch (error) {
    releaseClaim(key, { error: error?.message || String(error) });
    throw error;
  }
}
