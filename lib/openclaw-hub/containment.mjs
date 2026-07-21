/**
 * OpenClaw Hub — global containment (shared by all Ken apps)
 * Fail closed. Never bank/inbox/files/account logins/money/--deliver.
 */

import path from 'path';
import fs from 'fs';

export const GLOBAL_POLICY_VERSION = '2026-07-20-hub-v1';

export const GLOBAL_DENY_PATH = [
  /bank|banking|cheque|wire.?transfer/i,
  /wise\.com|paypal|venmo|cashapp|crypto|metamask|seed.?phrase|wallet\.dat/i,
  /stripe.*(secret|dashboard)|sk_live|rk_live|whsec_|pk_live/i,
  /\.env(\.|$|local)/i,
  /id_rsa|\.pem$|credentials\.json|password|secret.?key|auth\.json/i,
  /customer.*(export|csv|dump|pii)|ssn|sin\b|tax.?return|w-?2|t4\b/i,
  /onedrive|documents|downloads.*(statement|invoice|tax)/i,
  /AppData.*(Chrome|Firefox|Edge|Login Data|Keychain)/i,
  /gmail|outlook\.com|mail\.google|imap|smtp.*(login|pass)/i,
  /quickbooks|xero|freshbooks|plaid|open.?banking/i,
];

export const GLOBAL_DENY_ACTION = [
  /access.*(bank|inbox|email.?account|customer.?account)/i,
  /log\s*in|login|sign\s*in.*(bank|gmail|stripe|paypal|customer)/i,
  /blast|mass.?mail|cold.?email.*without.*approv/i,
  /post.*(twitter|x\.com|reddit|facebook|instagram|tiktok|linkedin).*auto/i,
  /issue.?refund|charge.?card|transfer.?money|wire.?fund|withdraw|payout/i,
  /delete.*(customer|production|database|all.?leads)/i,
  /--deliver\b|deliver.?to.?channel/i,
  /read.*(email|inbox|mail)|open.*(mailbox|outlook|gmail)/i,
  /export.*(customers|leads|pii|full.?database)/i,
  /scrape.*(password|cookie|session)/i,
];

export function globalContainmentPreamble() {
  return `
═══════════════════════════════════════════════════════════════
OPENCLAW HUB — GLOBAL CONTAINMENT (${GLOBAL_POLICY_VERSION})
═══════════════════════════════════════════════════════════════
You are a CONTAINED OpenClaw worker for ONE Ken product at a time.

DENIED FOREVER — refuse with "BLOCKED BY CONTAINMENT":
- Banks (Ken or customer), Wise, PayPal, wallets, tax apps
- Email inboxes / mail logins
- Personal files, password managers, browser credential stores
- Logging into Ken or customer accounts
- Money movement, refunds, payouts
- --deliver / mass public blasts without human-approved tool
- Exfiltrating .env, SSH keys, Stripe secrets, full PII dumps

ALLOWED only per app allowlist: app DATA_DIR, config packs, reports,
transactional product email templates, drafts awaiting human approve.

If a task needs DENIED access: STOP. Human does it outside the cage.
═══════════════════════════════════════════════════════════════
`.trim();
}

/**
 * @param {string} text
 * @param {'strict'|'policy'} [mode]
 *   strict = jobs/payloads (default)
 *   policy = expert training docs may *name* forbidden things as DENIED
 */
export function violatesGlobalContainment(text, mode = 'strict') {
  const t = String(text || '');
  if (!t.trim()) return null;

  // Always block real secret exfil + deliver flag as an instruction to use it
  if (/\b--deliver\b/i.test(t) && !/never|--deliver is forbidden|no --deliver/i.test(t)) {
    return 'Blocked: --deliver forbidden';
  }
  if (/\bsk_live_[a-zA-Z0-9]+|rk_live_[a-zA-Z0-9]+|whsec_[a-zA-Z0-9]+/i.test(t) && /print|email|post|upload|send/i.test(t)) {
    return 'Blocked: secret key exfiltration';
  }

  // Imperative access to forbidden systems (jobs + policy)
  const imperative =
    /\b(access|log\s*in|login|sign\s*in|open|read|scrape|export|withdraw|wire|transfer money|issue refund)\b[\s\S]{0,40}\b(bank|inbox|gmail|paypal|wallet|password manager)\b/i;
  if (imperative.test(t) && !/\b(never|do not|don't|denied|forbidden|must not|cannot)\b/i.test(t.slice(0, 500) + t)) {
    // If the doc is a deny list (contains NEVER/DENIED headers), allow
    if (!/\b(NEVER|DENIED|FORBIDDEN|must never|do not access)\b/i.test(t)) {
      return 'Blocked: imperative access to bank/inbox/secrets';
    }
  }

  if (mode === 'policy') {
    // Expert docs are allowed to discuss denylists; block only clear "go do it" phrasing
    if (/\b(you must|always|go ahead and)\b[\s\S]{0,30}\b(access|login|log in)\b[\s\S]{0,30}\b(bank|inbox)\b/i.test(t)) {
      return 'Blocked: training doc instructs forbidden access';
    }
    return null;
  }

  for (const p of GLOBAL_DENY_PATH) {
    if (p.test(t)) return `Blocked path/secret: ${p}`;
  }
  for (const p of GLOBAL_DENY_ACTION) {
    if (p.test(t)) return `Blocked action: ${p}`;
  }
  if (/\b--deliver\b/i.test(t)) return 'Blocked: --deliver forbidden';
  return null;
}

export function assertGlobalSafeText(text, label = 'input') {
  const reason = violatesGlobalContainment(text);
  if (reason) {
    const err = new Error(`BLOCKED BY CONTAINMENT (${label}): ${reason}`);
    err.code = 'OPENCLAW_CONTAINMENT';
    throw err;
  }
  return true;
}

/**
 * Path must resolve under one of allowedRoots.
 */
export function assertPathInRoots(filePath, allowedRoots = [], label = 'path') {
  const resolved = path.resolve(filePath);
  const ok = (allowedRoots || []).some((root) => {
    const r = path.resolve(root);
    return resolved === r || resolved.startsWith(r + path.sep);
  });
  if (!ok) {
    const err = new Error(`BLOCKED BY CONTAINMENT (${label}): path outside sandbox — ${resolved}`);
    err.code = 'OPENCLAW_CONTAINMENT';
    throw err;
  }
  assertGlobalSafeText(resolved, label);
  return resolved;
}

export function globalContainmentStatus() {
  return {
    mode: 'contained',
    policyVersion: GLOBAL_POLICY_VERSION,
    never: [
      'ken_bank',
      'customer_bank',
      'ken_email_inbox',
      'customer_email_inbox',
      'personal_files',
      'account_logins',
      'money_movement',
      'refunds',
      'mass_deliver',
      'secret_exfiltration',
    ],
    expertGateRequired: true,
    failClosed: true,
  };
}
