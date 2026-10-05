/**
 * Public contact requests. Stored for the operator to answer.
 * Does not send email or SMS (no spend) and is not a monitored mailbox by itself.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function dataDir() {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

function storePath() {
  return path.join(dataDir(), 'contact-requests.json');
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

export function createContactRequest(input) {
  const email = String(input.email || '').trim().toLowerCase();
  const message = String(input.message || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Valid email required' };
  if (message.length < 8) return { ok: false, error: 'Please include a short message' };
  const doc = load();
  const row = {
    id: crypto.randomBytes(12).toString('hex'),
    name: String(input.name || '').trim().slice(0, 120),
    email,
    phone: String(input.phone || '').trim().slice(0, 40),
    message: message.slice(0, 2000),
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  doc.requests = [row, ...(doc.requests || [])].slice(0, 500);
  save(doc);
  return {
    ok: true,
    id: row.id,
    message: 'Message saved. Meridian aims to reply within three business days once the dedicated support mailbox is monitored.',
  };
}

export function listContactRequests(limit = 100) {
  return (load().requests || []).slice(0, limit);
}
