// Durable sender/recipient suppression. Never store message bodies or raw numbers.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const file = path.join(dir, 'sms-preferences.json');
function key(sender, recipient) {
  const normalize = value => String(value || '').replace(/\D/g, '');
  const a = normalize(sender), b = normalize(recipient);
  if (!a || !b) throw new Error('sms_preference_number_missing');
  return crypto.createHash('sha256').update(`${a}:${b}`).digest('hex');
}
function load() {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || data.version !== 1 || !data.blocked || typeof data.blocked !== 'object' || Array.isArray(data.blocked)) throw new Error('sms_preference_store_invalid');
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, blocked: {} };
    throw error; // Fail closed: a broken store is not permission to send.
  }
}
export function smsSuppressed(sender, recipient) {
  return Boolean(load().blocked[key(sender, recipient)]);
}
export function setSmsSuppressed(sender, recipient, blocked) {
  const id = key(sender, recipient), data = load();
  if (blocked) data.blocked[id] = { at: new Date().toISOString() };
  else delete data.blocked[id];
  fs.mkdirSync(dir, { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(temporary, file);
}
