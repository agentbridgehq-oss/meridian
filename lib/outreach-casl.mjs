/**
 * CASL-compliant cold outreach — draft only, human-approved send.
 *
 * This module was referenced (via dynamic import) from server.mjs and
 * openclaw/daily.mjs but never actually existed in the repo, so every
 * outreach API route and the daily queue-processing step threw/failed at
 * runtime. Built on top of engine.mjs's existing, already-correct
 * draft/store primitives (draftOutreach, listOutreachDrafts, approveOutreach,
 * markOutreachSent, listApprovedUnsent) rather than a second parallel store.
 *
 * Compliance model (Canada's Anti-Spam Law):
 *  - Every draft carries sender ID + an explicit unsubscribe line.
 *  - A prospect on the unsubscribe list is never drafted to again.
 *  - Nothing sends itself. sendApprovedOutreach() is the one path that can
 *    actually deliver mail, and it requires ALL of: confirm === "APPROVED_SEND",
 *    MERIDIAN_OUTREACH_SEND=1 on the server, and the draft already having
 *    approved_send === true from a prior human /approve call.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  draftOutreach,
  listOutreachDrafts,
  approveOutreach,
  markOutreachSent,
  listApprovedUnsent,
} from '../engine.mjs';
import { sendOwnerEmail } from './notify.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(__dirname, '..', 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'outreach-queue.json');
const UNSUB_FILE = path.join(DATA_DIR, 'outreach-unsub.json');

const CASL_NOTICE =
  'This message includes sender identification and an unsubscribe option per Canada\'s Anti-Spam Law (CASL). Reply STOP or use the unsubscribe link to opt out — we will not contact you again.';

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function saveJson(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadQueue() {
  return loadJson(QUEUE_FILE, { prospects: [] });
}
function saveQueue(store) {
  saveJson(QUEUE_FILE, store);
}

export function listUnsubs() {
  return loadJson(UNSUB_FILE, { emails: [] }).emails || [];
}

export function isUnsubscribed(email) {
  const e = String(email || '').toLowerCase().trim();
  if (!e) return false;
  return listUnsubs().includes(e);
}

/** Record an unsubscribe — permanent, checked before every future draft/send. */
export function addUnsub(email) {
  const e = String(email || '').toLowerCase().trim();
  if (!e) return { ok: false, error: 'email required' };
  const store = loadJson(UNSUB_FILE, { emails: [] });
  if (!Array.isArray(store.emails)) store.emails = [];
  if (!store.emails.includes(e)) store.emails.push(e);
  saveJson(UNSUB_FILE, store);
  return { ok: true, email: e, total: store.emails.length };
}

/**
 * Draft one CASL-compliant outreach email. Never sends. Refuses to draft
 * for an unsubscribed recipient, and refuses a duplicate draft for the same
 * email while an earlier one is still pending approval or approved-but-unsent.
 */
export function draftCaslOutreach(input = {}) {
  const email = String(input.email || input.to || '').toLowerCase().trim();
  if (!email) return { ok: false, error: 'email required' };
  if (isUnsubscribed(email)) {
    return {
      ok: false,
      error: 'unsubscribed',
      message: `${email} is on the Meridian unsubscribe list — will never draft outreach to them.`,
    };
  }
  const existing = listOutreachDrafts().find((d) => d.to === email && !d.sentAt);
  if (existing) {
    return { ok: false, error: 'duplicate_pending', message: `An unresolved draft already exists for ${email}.`, draft: existing };
  }

  const draft = draftOutreach({
    businessName: input.businessName,
    niche: input.niche,
    contactName: input.contactName,
    email,
    website: input.website,
  });
  draft.casl = true;
  draft.caslNotice = CASL_NOTICE;
  return { ok: true, draft };
}

/**
 * Process the prospect queue (data/outreach-queue.json: { prospects: [{ email, businessName, niche, contactName?, website? }] })
 * into CASL drafts. Consumes processed prospects off the queue. Never sends.
 */
export async function processOutreachQueue({ max = 15 } = {}) {
  const store = loadQueue();
  const prospects = Array.isArray(store.prospects) ? store.prospects : [];
  const batch = prospects.slice(0, Math.max(0, Number(max) || 15));
  const remaining = prospects.slice(batch.length);

  let drafted = 0;
  let skipped = 0;
  const results = [];
  for (const p of batch) {
    const r = draftCaslOutreach(p);
    if (r.ok) {
      drafted += 1;
      results.push({ email: p.email, ok: true, draftId: r.draft.id });
    } else {
      skipped += 1;
      results.push({ email: p.email, ok: false, error: r.error });
    }
  }

  store.prospects = remaining;
  saveQueue(store);

  return {
    ok: true,
    processed: batch.length,
    drafted,
    skipped,
    pending: remaining.length,
    results,
  };
}

/** Approve multiple drafts at once (each still requires the separate send-approved gate to actually go out). */
export function approveDrafts(ids = []) {
  const list = Array.isArray(ids) ? ids : [];
  const results = list.map((id) => ({ id, draft: approveOutreach(id) }));
  const approved = results.filter((r) => r.draft).length;
  return { ok: true, approved, total: list.length, results };
}

export function outreachCaslStatus() {
  const drafts = listOutreachDrafts();
  const approvedUnsent = listApprovedUnsent();
  const queue = loadQueue();
  const sendGateOpen = process.env.MERIDIAN_OUTREACH_SEND === '1';
  return {
    mode: 'casl_draft_only',
    sendGateOpen,
    totalDrafts: drafts.length,
    pendingApproval: drafts.filter((d) => !d.approved_send && !d.sentAt).length,
    approvedUnsent: approvedUnsent.length,
    sentTotal: drafts.filter((d) => d.sentAt).length,
    unsubTotal: listUnsubs().length,
    queuePending: (queue.prospects || []).length,
    note: sendGateOpen
      ? 'Send gate is OPEN — approved drafts can be sent via POST /api/outreach/send-approved with confirm: "APPROVED_SEND".'
      : 'Send gate is CLOSED (MERIDIAN_OUTREACH_SEND unset) — no outreach can be sent regardless of approval.',
  };
}

/**
 * The one path that can actually deliver cold outreach. Hard-gated:
 *  - confirm must be exactly "APPROVED_SEND"
 *  - MERIDIAN_OUTREACH_SEND=1 must be set on the server
 *  - each candidate must already have approved_send === true (set via /approve)
 *  - re-checks the unsubscribe list at send time, not just at draft time
 */
export async function sendApprovedOutreach({ confirm, max = 5, draftIds = null } = {}) {
  if (confirm !== 'APPROVED_SEND') {
    return { ok: false, error: 'confirm must be exactly "APPROVED_SEND"' };
  }
  if (process.env.MERIDIAN_OUTREACH_SEND !== '1') {
    return { ok: false, error: 'MERIDIAN_OUTREACH_SEND is not set to 1 on this server — send gate closed.' };
  }

  let candidates = listApprovedUnsent();
  if (Array.isArray(draftIds) && draftIds.length) {
    const idSet = new Set(draftIds);
    candidates = candidates.filter((d) => idSet.has(d.id));
  }
  candidates = candidates.slice(0, Math.max(1, Number(max) || 5));

  const results = [];
  for (const draft of candidates) {
    if (isUnsubscribed(draft.to)) {
      results.push({ id: draft.id, to: draft.to, emailed: false, error: 'unsubscribed_since_approval' });
      continue;
    }
    const sent = await sendOwnerEmail({
      to: draft.to,
      subject: draft.subject,
      text: `${draft.text}\n\n${CASL_NOTICE}`,
    });
    if (sent.ok) {
      markOutreachSent(draft.id, { emailedAt: new Date().toISOString() });
    }
    results.push({ id: draft.id, to: draft.to, emailed: Boolean(sent.ok), error: sent.ok ? null : sent.error });
  }

  return {
    ok: true,
    sent: results.filter((r) => r.emailed).length,
    attempted: results.length,
    results,
  };
}
