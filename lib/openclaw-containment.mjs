/**
 * Meridian OpenClaw — HARD CONTAINMENT CAGE
 *
 * OpenClaw may ONLY:
 *  - Read/write Meridian app data dirs (leads, agents metadata, deploy queue, install packs)
 *  - Provision Meridian agents + generate install packs (widget, API configs, n8n JSON)
 *  - Write daily briefs / reports under DATA_DIR
 *  - Call Meridian-internal APIs and approved transactional email (Resend) for product messages
 *
 * OpenClaw must NEVER:
 *  - Access Ken's bank, customer banks, Wise, PayPal, crypto wallets, tax software
 *  - Read Ken's or customer email inboxes / send arbitrary mail
 *  - Browse personal files, Desktop, Documents, Downloads statements, password managers
 *  - Use customer Stripe/bank dashboards or move money
 *  - Exfiltrate customer PII lists, CRM dumps, secret keys to third parties
 *  - Post publicly or use --deliver blast
 *  - Log into customer accounts (Google, Meta, banks, hosting) or Ken's accounts
 *
 * Money movement, refunds, inbox access, and account logins = HUMAN ONLY.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(REPO_ROOT, 'data');

/** Paths OpenClaw is allowed to touch (absolute prefixes) */
export function allowedRoots() {
  const roots = [
    path.resolve(DATA_DIR),
    path.resolve(REPO_ROOT, 'data'),
    path.resolve(REPO_ROOT, 'kits'),
    path.resolve(REPO_ROOT, 'deploy'),
    path.resolve(REPO_ROOT, 'public'),
    path.resolve(REPO_ROOT, 'openclaw'),
  ];
  // Optional explicit sandbox if set
  if (process.env.OPENCLAW_SANDBOX_DIR) {
    roots.push(path.resolve(process.env.OPENCLAW_SANDBOX_DIR));
  }
  return roots;
}

export const DENY_PATH_PATTERNS = [
  /bank|banking|cheque|wire.?transfer/i,
  /wise\.com|paypal|venmo|cashapp|crypto|metamask|seed.?phrase|wallet\.dat/i,
  /stripe.*(secret|dashboard)|sk_live|rk_live|whsec_|pk_live/i,
  /\.env(\.|$|local)/i,
  /id_rsa|\.pem$|credentials\.json|password|secret.?key|auth\.json/i,
  /customer.*(export|csv|dump|pii)|ssn|sin\b|tax.?return|w-?2|t4\b/i,
  /onedrive|documents|downloads.*(statement|invoice|tax)|desktop\\.*(password|bank)/i,
  /AppData.*(Chrome|Firefox|Edge|Login Data|Keychain)/i,
  /gmail|outlook\.com|mail\.google|imap|smtp.*(login|pass)/i,
  /quickbooks|xero|freshbooks|plaid|open.?banking/i,
];

export const DENY_ACTION_PATTERNS = [
  /access.*(bank|inbox|email.?account|customer.?account)/i,
  /log\s*in|login|sign\s*in.*(bank|gmail|stripe|paypal|customer)/i,
  /send.*(email|sms|dm).*to.*(customer|list|everyone)/i,
  /blast|mass.?mail|cold.?email.*without.*approv/i,
  /post.*(twitter|x\.com|reddit|facebook|instagram|tiktok|linkedin)/i,
  /issue.?refund|charge.?card|transfer.?money|wire.?fund|withdraw|payout/i,
  /delete.*(customer|production|database|all.?leads)/i,
  /--deliver\b|deliver.?to.?channel/i,
  /read.*(email|inbox|mail)|open.*(mailbox|outlook|gmail)/i,
  /export.*(customers|leads|pii|full.?database)/i,
  /scrape.*(password|cookie|session)/i,
];

/** Explicit allowlist of OpenClaw job kinds on Meridian */
export const ALLOWED_JOB_KINDS = new Set([
  'daily_brief',
  'deploy_agent',
  'install_pack',
  'lead_progress',
  'draft_outreach', // drafts only — never auto-send
  'smoke_verify',
  'usage_report',
]);

export function containmentStatus() {
  return {
    mode: 'contained',
    product: 'meridian',
    never: [
      'ken_bank',
      'customer_bank',
      'ken_email_inbox',
      'customer_email_inbox',
      'ken_personal_files',
      'customer_personal_files',
      'customer_accounts_login',
      'ken_accounts_login',
      'money_movement',
      'refunds',
      'public_social_posts',
      'mass_email_without_approval',
      'production_secrets_exfiltration',
    ],
    only: [
      'meridian_data_dir',
      'agent_provision',
      'install_packs_widget_api_n8n_phone_configs',
      'daily_brief_reports',
      'transactional_product_email_via_resend',
      'draft_outreach_awaiting_human_approve_send',
    ],
    noDeliverFlag: true,
    humanOnly: ['money', 'legal', 'refunds', 'inbox_access', 'bank', 'account_passwords'],
    allowedRoots: allowedRoots(),
    policyVersion: '2026-07-20-meridian-v1',
  };
}

export function containmentPreamble() {
  return `
═══════════════════════════════════════════════════════════════
MERIDIAN OPENCLAW — CONTAINMENT CAGE (NON-NEGOTIABLE)
═══════════════════════════════════════════════════════════════
You are Contained OpenClaw for Meridian Agency ONLY.

ALLOWED:
- Meridian DATA_DIR (queues, briefs, install packs, agent metadata)
- Provision Meridian agents + generate widget/API/phone/n8n configs
- Write reports under data/
- Transactional product email through Meridian Resend only (templates)

DENIED FOREVER — refuse immediately with "BLOCKED BY CONTAINMENT":
- Ken's bank OR any customer bank / Wise / PayPal / wallets / tax apps
- Ken's or customers' email inboxes, mail passwords, IMAP/SMTP logins
- Personal files (Desktop, Documents, Downloads statements, password managers)
- Logging into customer accounts or Ken's accounts (Google, Meta, hosting, banks)
- Moving money, refunds, card charges, payouts
- Public social posts, mass email, --deliver blasts
- Reading or exporting full customer secret dumps beyond the single agent being installed
- Production .env secrets, SSH keys, Stripe secret keys

If a task needs anything DENIED: stop. Human (Ken / customer) does it outside the cage.
No --deliver. Ever.
═══════════════════════════════════════════════════════════════
`.trim();
}

/**
 * @returns {string|null} reason if blocked
 */
export function violatesContainment(text) {
  const t = String(text || '');
  if (!t.trim()) return null;
  for (const p of DENY_PATH_PATTERNS) {
    if (p.test(t)) return `Blocked path/secret pattern: ${p}`;
  }
  for (const p of DENY_ACTION_PATTERNS) {
    if (p.test(t)) return `Blocked action: ${p}`;
  }
  // hard tokens
  if (/\b--deliver\b/i.test(t)) return 'Blocked: --deliver is forbidden';
  if (/\bsk_live_|rk_live_|whsec_|xai-[A-Za-z0-9]{20,}/i.test(t) && /print|email|post|upload|send/i.test(t)) {
    return 'Blocked: secret key exfiltration';
  }
  return null;
}

export function assertSafeText(text, label = 'input') {
  const reason = violatesContainment(text);
  if (reason) {
    const err = new Error(`BLOCKED BY CONTAINMENT (${label}): ${reason}`);
    err.code = 'OPENCLAW_CONTAINMENT';
    throw err;
  }
  return true;
}

/**
 * Ensure a filesystem path is inside allowed roots (no escape).
 */
export function assertSafePath(filePath, label = 'path') {
  const resolved = path.resolve(filePath);
  const ok = allowedRoots().some((root) => {
    const r = path.resolve(root);
    return resolved === r || resolved.startsWith(r + path.sep);
  });
  if (!ok) {
    const err = new Error(
      `BLOCKED BY CONTAINMENT (${label}): path outside sandbox — ${resolved}`,
    );
    err.code = 'OPENCLAW_CONTAINMENT';
    throw err;
  }
  // double-check deny patterns on path string
  assertSafeText(resolved, label);
  return resolved;
}

/**
 * Sanitize deploy / install job — strip fields that could expand privileges.
 */
export function sanitizeOpenClawJob(job = {}) {
  const raw = JSON.stringify(job);
  const violation = violatesContainment(raw);
  if (violation) {
    return {
      ok: false,
      blocked: true,
      reason: violation,
      job: null,
    };
  }

  // Allow only known safe fields
  const safe = {
    email: String(job.email || '')
      .toLowerCase()
      .slice(0, 200),
    businessName: String(job.businessName || '').slice(0, 200),
    primaryNeed: String(job.primaryNeed || job.type || 'full').slice(0, 40),
    source: 'openclaw_contained',
    website: String(job.website || job.websiteUrl || '').slice(0, 300),
    hours: String(job.hours || '').slice(0, 200),
    services: String(job.services || '').slice(0, 500),
    phone: String(job.phone || '').slice(0, 40),
    phonePlatform: String(job.phonePlatform || 'retell').slice(0, 20),
    agentId: job.agentId ? String(job.agentId).slice(0, 80) : undefined,
    deliveryToken: job.deliveryToken ? String(job.deliveryToken).slice(0, 80) : undefined,
    path: String(job.path || 'full').slice(0, 40),
    priority: job.priority === 'paid_dfy' ? 'paid_dfy' : 'normal',
    notes: String(job.notes || '')
      .slice(0, 300)
      .replace(/sk_live|rk_live|mdn_[a-f0-9]{20,}/gi, '[redacted]'),
    // apiKey only for install pack generation inside process — never log
    apiKey: job.apiKey ? String(job.apiKey).slice(0, 120) : undefined,
    done: Boolean(job.done),
    skip: Boolean(job.skip),
    contained: true,
  };

  // Block jobs that look like bank/email harvest
  if (/bank|password|ssn|inbox|imap/i.test(safe.notes + safe.services + safe.hours)) {
    return {
      ok: false,
      blocked: true,
      reason: 'Job notes/fields request disallowed data',
      job: null,
    };
  }

  return { ok: true, blocked: false, job: safe };
}

/**
 * Safe write: only under allowed roots.
 */
export function containedWriteFile(filePath, content) {
  const safe = assertSafePath(filePath, 'write');
  fs.mkdirSync(path.dirname(safe), { recursive: true });
  fs.writeFileSync(safe, content);
  return safe;
}

/**
 * Safe read: only under allowed roots.
 */
export function containedReadFile(filePath, encoding = 'utf8') {
  const safe = assertSafePath(filePath, 'read');
  return fs.readFileSync(safe, encoding);
}

/** Guard wrapper for OpenClaw entrypoints */
export function withContainment(name, fn) {
  return async (...args) => {
    // Scan string args
    for (const a of args) {
      if (typeof a === 'string') assertSafeText(a, name);
      else if (a && typeof a === 'object') {
        const v = violatesContainment(JSON.stringify(a));
        if (v) {
          return {
            ok: false,
            blocked: true,
            code: 'OPENCLAW_CONTAINMENT',
            error: `BLOCKED BY CONTAINMENT: ${v}`,
            containment: containmentStatus(),
          };
        }
      }
    }
    try {
      const result = await fn(...args);
      if (result && typeof result === 'object') {
        return { ...result, containment: { mode: 'contained', entry: name } };
      }
      return result;
    } catch (e) {
      if (e.code === 'OPENCLAW_CONTAINMENT') {
        return {
          ok: false,
          blocked: true,
          code: 'OPENCLAW_CONTAINMENT',
          error: e.message,
          containment: containmentStatus(),
        };
      }
      throw e;
    }
  };
}

export function buildContainmentReport() {
  return {
    generatedAt: new Date().toISOString(),
    ...containmentStatus(),
    preamble: containmentPreamble(),
  };
}
