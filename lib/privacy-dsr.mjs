/**
 * GDPR / PIPEDA data subject requests (access & delete).
 * Stored under DATA_DIR; ops follows up. No silent bulk delete without human review
 * when agents/billing are attached.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function dataDir() {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

function storePath() {
  return path.join(dataDir(), 'privacy-requests.json');
}

function load() {
  try {
    const p = storePath();
    if (!fs.existsSync(p)) return { requests: [] };
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { requests: [] };
  }
}

function save(doc) {
  const dir = dataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(doc, null, 2));
}

/**
 * @param {{ email: string, type: 'access'|'delete'|'correct', note?: string, source?: string }} input
 */
export function createPrivacyRequest(input) {
  const email = String(input.email || '')
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Valid email required' };
  }
  const type = ['access', 'delete', 'correct'].includes(input.type) ? input.type : 'access';
  const doc = load();
  const row = {
    id: crypto.randomBytes(12).toString('hex'),
    email,
    type,
    note: String(input.note || '').slice(0, 1000),
    source: String(input.source || 'web').slice(0, 64),
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  doc.requests = [row, ...(doc.requests || [])].slice(0, 500);
  save(doc);
  return { ok: true, id: row.id, message: 'Request recorded. We will respond within 30 days.' };
}

export function listPrivacyRequests(limit = 100) {
  const doc = load();
  return (doc.requests || []).slice(0, limit);
}
