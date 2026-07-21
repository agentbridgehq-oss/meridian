/**
 * Meridian long-form AI articles — self-updating content engine
 *
 * Pipeline (never silent-publish junk):
 *  1. draft     — Claude writes long-form article + image plan
 *  2. vet       — Claude (or ops) quality/compliance review
 *  3. fix       — if rejected / needs_fix → rewrite, re-vet (max rounds)
 *  4. ready     — passed vet; waiting for publish
 *  5. published — live on /blog/:slug
 *
 * Default: after Claude "approve", status = ready (Ken ops still clicks Publish)
 * Optional: MERIDIAN_ARTICLES_AUTO_PUBLISH=1 publishes when Claude approves.
 *
 * Hard rules: no fake testimonials, no invented metrics, no bank/inbox access.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  callClaudeAgent,
  claudeConfigured,
  DEFAULT_MODEL,
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
} from './claude-agent-api.mjs';
import { sendOwnerEmail } from './notify.mjs';

/** Long-form calls need more than default 12s agent timeout */
async function callClaudeAgentLong(opts) {
  const prev = process.env.MERIDIAN_LLM_TIMEOUT_MS;
  process.env.MERIDIAN_LLM_TIMEOUT_MS = String(process.env.MERIDIAN_ARTICLE_TIMEOUT_MS || 120000);
  try {
    // callClaudeAgent reads DEFAULT_TIMEOUT_MS at module load — pass via wrapper fetch if needed
    return await callClaudeAgentWithTimeout(opts, Number(process.env.MERIDIAN_ARTICLE_TIMEOUT_MS || 120000));
  } finally {
    if (prev === undefined) delete process.env.MERIDIAN_LLM_TIMEOUT_MS;
    else process.env.MERIDIAN_LLM_TIMEOUT_MS = prev;
  }
}

async function callClaudeAgentWithTimeout(opts, timeoutMs) {
  // Prefer standard path; if timeout is the issue, use extended fetch here
  const base = await callClaudeAgent(opts);
  if (base.ok || base.error !== 'timeout') return base;

  if (!claudeConfigured()) return base;
  const body = {
    model: opts.model || DEFAULT_MODEL,
    max_tokens: opts.maxTokens || 4096,
    system: String(opts.system || '').slice(0, 12000),
    messages: [{ role: 'user', content: String(opts.message || '').slice(0, 20000) }],
  };
  if (opts.temperature != null) body.temperature = Number(opts.temperature);
  const started = Date.now();
  try {
    const res = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY.trim(),
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.error?.message || `http_${res.status}`, ms: Date.now() - started };
    }
    const text = (data.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
      .trim();
    return {
      ok: Boolean(text),
      reply: text,
      model: data.model || body.model,
      usage: data.usage,
      ms: Date.now() - started,
    };
  } catch (e) {
    return { ok: false, error: e.message || 'network_error', ms: Date.now() - started };
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(__dirname, '..', 'data');
const STORE = path.join(DATA_DIR, 'articles.json');
const PUB_DIR = path.join(DATA_DIR, 'articles-published');
const BASE = (process.env.PUBLIC_BASE_URL || 'http://localhost:8891').replace(/\/$/, '');

const MAX_FIX_ROUNDS = Number(process.env.MERIDIAN_ARTICLE_MAX_FIX || 2);
const DRAFT_MODEL = process.env.MERIDIAN_ARTICLE_MODEL || process.env.MERIDIAN_LLM_MODEL || DEFAULT_MODEL;
const DRAFT_MAX_TOKENS = Number(process.env.MERIDIAN_ARTICLE_MAX_TOKENS || 4096);
const VET_MAX_TOKENS = Number(process.env.MERIDIAN_ARTICLE_VET_TOKENS || 1200);

const TOPICS = [
  'Why local businesses lose money on missed calls after hours',
  'AI receptionist vs human answering service: cost and quality in 2026',
  'How to train an AI agent on your real hours and prices without hallucinations',
  'Missed-call text-back: the simple recovery system most shops skip',
  'Voice AI for HVAC, plumbing, and home services: what actually books jobs',
  'Security basics for small businesses using AI phone agents',
  'From website chat to phone agent: one brain, two channels',
  'What “never invent prices” means for AI customer service',
  'CASL-safe lead follow-up for Canadian local businesses',
  'How agencies deliver AI agents without touching client banks or inboxes',
  'Calendars, confirmations, and no-shows: booking agents that respect reality',
  'Choosing Retell/Vapi vs a finished AI front desk product',
];

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PUB_DIR, { recursive: true });
}
function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE, 'utf8'));
  } catch {
    return { articles: [], lastCycleAt: null };
  }
}
function save(data) {
  ensure();
  fs.writeFileSync(STORE, JSON.stringify(data, null, 2));
}
function rid() {
  return `art_${crypto.randomBytes(6).toString('hex')}`;
}
function slugify(title) {
  return String(title || 'article')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function pickTopic(store) {
  const used = new Set((store.articles || []).slice(0, 30).map((a) => a.topic));
  const pool = TOPICS.filter((t) => !used.has(t));
  const list = pool.length ? pool : TOPICS;
  return list[Math.floor(Math.random() * list.length)];
}

const DRAFT_SYSTEM = `You are a senior B2B content writer for Meridian Agency (AI voice, sales, and booking agents for local business).

Write long-form educational articles (1,200–2,000 words) that help owners and operators.

HARD RULES:
- No fake testimonials, invented customer names, or fake statistics.
- If you cite a number, frame as illustration ("for example") or general industry observation — never claim a specific Meridian case study unless given.
- No medical/legal advice. No spam. No bank/login instructions.
- Canadian-friendly tone is fine (Ontario SMBs) without overdoing it.
- Clear H2/H3 structure. Practical checklists. Short paragraphs.
- End with a soft CTA to learn about AI agents — not hard-sell hype.

Output ONLY valid JSON (no markdown fences):
{
  "title": string,
  "subtitle": string,
  "slug": string-kebab,
  "excerpt": string (max 220 chars),
  "bodyMarkdown": string (full article in markdown with ## headings),
  "imagePlan": [
    { "slot": 1, "caption": string, "alt": string, "motif": "phone|calendar|shield|chat|growth" },
    { "slot": 2, "caption": string, "alt": string, "motif": "..." },
    { "slot": 3, "caption": string, "alt": string, "motif": "..." }
  ],
  "tags": string[],
  "readingMinutes": number
}`;

const VET_SYSTEM = `You are a strict editorial and compliance reviewer for Meridian Agency content.

Approve ONLY if the article is:
- Accurate enough (no invented case studies or fake quotes)
- Useful to local business owners
- Free of spam, hate, medical/legal overclaim
- Free of secret-key or bank/inbox instructions
- Well structured long-form (not thin fluff)

Respond ONLY JSON:
{
  "decision": "approve" | "needs_fix" | "reject",
  "score": 0-100,
  "issues": string[],
  "fixInstructions": string,
  "summary": string
}`;

/**
 * Build inline SVG figures so we never depend on external CDNs or unpaid image APIs.
 */
export function buildImageSvg(motif = 'phone', caption = '') {
  const colors = {
    phone: ['#0C0C0B', '#1F7A4C'],
    calendar: ['#0C0C0B', '#2563EB'],
    shield: ['#0C0C0B', '#B45309'],
    chat: ['#0C0C0B', '#7C3AED'],
    growth: ['#0C0C0B', '#0F766E'],
  };
  const [bg, accent] = colors[motif] || colors.phone;
  const label = String(caption || motif).slice(0, 80);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 420" role="img" aria-label="${escapeXml(label)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="420" rx="24" fill="url(#g)"/>
  <circle cx="640" cy="90" r="80" fill="rgba(255,255,255,0.08)"/>
  <circle cx="120" cy="320" r="100" fill="rgba(255,255,255,0.06)"/>
  <text x="48" y="200" fill="#fff" font-family="Georgia, serif" font-size="36">${escapeXml(motif.toUpperCase())}</text>
  <text x="48" y="250" fill="rgba(255,255,255,0.85)" font-family="system-ui,sans-serif" font-size="18">${escapeXml(label)}</text>
</svg>`;
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseJsonLoose(text) {
  const raw = String(text || '').trim();
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Inject SVG figures into markdown at ## boundaries.
 */
export function injectImages(bodyMarkdown, imagePlan = []) {
  let body = String(bodyMarkdown || '');
  const plan = Array.isArray(imagePlan) ? imagePlan.slice(0, 3) : [];
  if (!plan.length) {
    plan.push(
      { slot: 1, caption: 'AI answering the line', alt: 'AI phone', motif: 'phone' },
      { slot: 2, caption: 'Booking without phone tag', alt: 'Calendar', motif: 'calendar' },
      { slot: 3, caption: 'Secure by default', alt: 'Shield', motif: 'shield' },
    );
  }
  const parts = body.split(/\n(?=## )/);
  const out = [];
  let imgIdx = 0;
  for (let i = 0; i < parts.length; i++) {
    out.push(parts[i]);
    if (imgIdx < plan.length && i > 0 && i % Math.max(1, Math.floor(parts.length / (plan.length + 1))) === 0) {
      const im = plan[imgIdx++];
      const svg = buildImageSvg(im.motif || 'phone', im.caption || im.alt || '');
      out.push(
        `\n\n<figure class="mdn-art-fig">\n${svg}\n<figcaption>${escapeXml(im.caption || '')}</figcaption>\n</figure>\n`,
      );
    }
  }
  while (imgIdx < plan.length) {
    const im = plan[imgIdx++];
    out.push(
      `\n\n<figure class="mdn-art-fig">\n${buildImageSvg(im.motif || 'growth', im.caption || '')}\n<figcaption>${escapeXml(im.caption || '')}</figcaption>\n</figure>\n`,
    );
  }
  return out.join('\n');
}

/**
 * Step 1: draft article with Claude
 */
export async function draftArticle({ topic } = {}) {
  if (!claudeConfigured()) {
    return { ok: false, error: 'ANTHROPIC_API_KEY required to draft articles' };
  }
  const store = load();
  const chosen = topic || pickTopic(store);
  const result = await callClaudeAgentLong({
    system: DRAFT_SYSTEM,
    message: `Write a new long-form article on this topic:\n\n${chosen}\n\nAudience: local business owners and operators. Brand: Meridian Agency (tools, not hype).`,
    model: DRAFT_MODEL,
    maxTokens: DRAFT_MAX_TOKENS,
    temperature: 0.55,
    agentId: 'meridian_articles',
  });
  if (!result.ok) return { ok: false, error: result.error || 'draft_failed' };

  const parsed = parseJsonLoose(result.reply);
  if (!parsed?.title || !parsed?.bodyMarkdown) {
    return { ok: false, error: 'draft_parse_failed', raw: String(result.reply || '').slice(0, 500) };
  }

  const slugBase = slugify(parsed.slug || parsed.title);
  const slug = uniqueSlug(store, slugBase);
  const article = {
    id: rid(),
    status: 'draft',
    topic: chosen,
    title: String(parsed.title).slice(0, 200),
    subtitle: String(parsed.subtitle || '').slice(0, 300),
    slug,
    excerpt: String(parsed.excerpt || '').slice(0, 280),
    bodyMarkdown: String(parsed.bodyMarkdown).slice(0, 50000),
    imagePlan: parsed.imagePlan || [],
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 12) : ['ai', 'local-business'],
    readingMinutes: Number(parsed.readingMinutes) || 7,
    fixRound: 0,
    vetHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    model: result.model || DRAFT_MODEL,
  };

  store.articles.unshift(article);
  store.articles = store.articles.slice(0, 200);
  save(store);
  return { ok: true, article };
}

function uniqueSlug(store, base) {
  let s = base || 'article';
  const taken = new Set((store.articles || []).map((a) => a.slug));
  if (!taken.has(s)) return s;
  let i = 2;
  while (taken.has(`${s}-${i}`)) i++;
  return `${s}-${i}`;
}

/**
 * Step 2: Claude vet
 */
export async function vetArticle(articleId) {
  const store = load();
  const article = store.articles.find((a) => a.id === articleId);
  if (!article) return { ok: false, error: 'not_found' };
  if (!claudeConfigured()) return { ok: false, error: 'ANTHROPIC_API_KEY required to vet' };

  const result = await callClaudeAgentLong({
    system: VET_SYSTEM,
    message: `Review this article JSON for publish readiness:\n\n${JSON.stringify(
      {
        title: article.title,
        excerpt: article.excerpt,
        bodyMarkdown: article.bodyMarkdown.slice(0, 14000),
        tags: article.tags,
      },
      null,
      2,
    )}`,
    model: DRAFT_MODEL,
    maxTokens: VET_MAX_TOKENS,
    temperature: 0.2,
    agentId: 'meridian_articles_vet',
  });
  if (!result.ok) return { ok: false, error: result.error || 'vet_failed' };

  const vet = parseJsonLoose(result.reply) || {
    decision: 'needs_fix',
    score: 0,
    issues: ['vet_parse_failed'],
    fixInstructions: 'Rewrite for clarity and remove any unverifiable claims.',
    summary: 'Could not parse vet response',
  };

  const decision = ['approve', 'needs_fix', 'reject'].includes(vet.decision)
    ? vet.decision
    : 'needs_fix';

  article.vetHistory = article.vetHistory || [];
  article.vetHistory.unshift({
    at: new Date().toISOString(),
    decision,
    score: vet.score,
    issues: vet.issues,
    summary: vet.summary,
  });
  article.lastVet = article.vetHistory[0];
  article.updatedAt = new Date().toISOString();

  if (decision === 'approve') {
    article.status = 'ready';
    article.claudeApprovedAt = new Date().toISOString();
  } else {
    article.status = decision === 'reject' ? 'rejected' : 'needs_fix';
    article.fixInstructions = String(vet.fixInstructions || vet.summary || '').slice(0, 2000);
  }
  save(store);
  return { ok: true, article, vet: article.lastVet };
}

/**
 * Step 3: fix after reject / needs_fix
 */
export async function fixArticle(articleId) {
  const store = load();
  const article = store.articles.find((a) => a.id === articleId);
  if (!article) return { ok: false, error: 'not_found' };
  if (article.fixRound >= MAX_FIX_ROUNDS) {
    return { ok: false, error: 'max_fix_rounds', article };
  }
  if (!claudeConfigured()) return { ok: false, error: 'ANTHROPIC_API_KEY required' };

  const result = await callClaudeAgentLong({
    system: DRAFT_SYSTEM + '\n\nYou are FIXING a rejected article. Address every issue. Keep JSON schema.',
    message: `Fix this article.\n\nIssues / instructions:\n${article.fixInstructions || 'Improve accuracy and usefulness.'}\n\nPrior vet:\n${JSON.stringify(article.lastVet || {}, null, 2)}\n\nCurrent article:\n${JSON.stringify(
      {
        title: article.title,
        subtitle: article.subtitle,
        excerpt: article.excerpt,
        bodyMarkdown: article.bodyMarkdown.slice(0, 14000),
        imagePlan: article.imagePlan,
        tags: article.tags,
      },
      null,
      2,
    )}`,
    model: DRAFT_MODEL,
    maxTokens: DRAFT_MAX_TOKENS,
    temperature: 0.4,
    agentId: 'meridian_articles_fix',
  });
  if (!result.ok) return { ok: false, error: result.error || 'fix_failed' };

  const parsed = parseJsonLoose(result.reply);
  if (!parsed?.bodyMarkdown) return { ok: false, error: 'fix_parse_failed', raw: result.reply?.slice(0, 400) };

  article.fixRound = (article.fixRound || 0) + 1;
  if (parsed.title) article.title = String(parsed.title).slice(0, 200);
  if (parsed.subtitle) article.subtitle = String(parsed.subtitle).slice(0, 300);
  if (parsed.excerpt) article.excerpt = String(parsed.excerpt).slice(0, 280);
  article.bodyMarkdown = String(parsed.bodyMarkdown).slice(0, 50000);
  if (parsed.imagePlan) article.imagePlan = parsed.imagePlan;
  if (parsed.tags) article.tags = parsed.tags.slice(0, 12);
  article.status = 'draft';
  article.updatedAt = new Date().toISOString();
  save(store);

  // Re-vet immediately
  return vetArticle(articleId);
}

/**
 * Full auto cycle: draft → vet → fix loop → ready (or failed)
 * Does NOT publish unless autoPublish env on and ready.
 */
export async function runArticleCycle({ topic, autoPublish } = {}) {
  const draft = await draftArticle({ topic });
  if (!draft.ok) return draft;

  let articleId = draft.article.id;
  let vet = await vetArticle(articleId);
  if (!vet.ok) return { ...vet, articleId };

  let rounds = 0;
  while (
    vet.article &&
    (vet.article.status === 'needs_fix' || vet.article.status === 'rejected') &&
    rounds < MAX_FIX_ROUNDS
  ) {
    rounds++;
    const fixed = await fixArticle(articleId);
    if (!fixed.ok) return { ...fixed, articleId, fixRounds: rounds };
    vet = fixed;
  }

  const store = load();
  const article = store.articles.find((a) => a.id === articleId);
  const shouldPub =
    autoPublish === true ||
    (autoPublish !== false && process.env.MERIDIAN_ARTICLES_AUTO_PUBLISH === '1');

  if (article?.status === 'ready' && shouldPub) {
    const pub = publishArticle(articleId, { source: 'claude_auto' });
    await notifyOps(article, 'published');
    return { ok: true, stage: 'published', article: pub.article, fixRounds: rounds };
  }

  if (article?.status === 'ready') {
    await notifyOps(article, 'ready');
    return { ok: true, stage: 'ready', article, fixRounds: rounds, note: 'Awaiting ops publish' };
  }

  await notifyOps(article, article?.status || 'failed');
  return {
    ok: false,
    stage: article?.status || 'failed',
    article,
    fixRounds: rounds,
    error: 'did_not_pass_vet_after_fixes',
  };
}

/**
 * Human / ops final publish gate
 */
export function publishArticle(articleId, { source = 'ops' } = {}) {
  const store = load();
  const article = store.articles.find((a) => a.id === articleId);
  if (!article) return { ok: false, error: 'not_found' };
  // ready → publish; ops_force allows re-publish of already published
  if (article.status === 'published' && source !== 'ops_force') {
    return { ok: true, article, note: 'already_published' };
  }
  if (article.status !== 'ready' && source !== 'ops_force') {
    return { ok: false, error: `Cannot publish status=${article.status}. Need Claude vet → ready first.` };
  }

  const bodyWithImages = injectImages(article.bodyMarkdown, article.imagePlan);
  article.bodyHtml = markdownLite(bodyWithImages);
  article.status = 'published';
  article.publishedAt = new Date().toISOString();
  article.publishSource = source;
  article.updatedAt = new Date().toISOString();
  article.publicPath = `/blog/${article.slug}`;
  article.publicUrl = `${BASE}/blog/${article.slug}`;

  ensure();
  fs.writeFileSync(
    path.join(PUB_DIR, `${article.slug}.json`),
    JSON.stringify(article, null, 2),
  );

  save(store);
  return { ok: true, article };
}

export function unpublishArticle(articleId) {
  const store = load();
  const article = store.articles.find((a) => a.id === articleId);
  if (!article) return { ok: false, error: 'not_found' };
  article.status = 'ready';
  article.unpublishedAt = new Date().toISOString();
  try {
    fs.unlinkSync(path.join(PUB_DIR, `${article.slug}.json`));
  } catch {
    /* ok */
  }
  save(store);
  return { ok: true, article };
}

/** Ops reject permanently */
export function rejectArticleFinal(articleId, reason = '') {
  const store = load();
  const article = store.articles.find((a) => a.id === articleId);
  if (!article) return { ok: false, error: 'not_found' };
  article.status = 'rejected_final';
  article.finalRejectReason = String(reason || '').slice(0, 500);
  article.updatedAt = new Date().toISOString();
  save(store);
  return { ok: true, article };
}

export function listArticles({ status, limit = 30 } = {}) {
  const all = load().articles || [];
  return all.filter((a) => !status || a.status === status).slice(0, limit);
}

export function getArticle(idOrSlug) {
  const all = load().articles || [];
  return all.find((a) => a.id === idOrSlug || a.slug === idOrSlug) || null;
}

export function getPublishedArticle(slug) {
  try {
    return JSON.parse(fs.readFileSync(path.join(PUB_DIR, `${slug}.json`), 'utf8'));
  } catch {
    const a = getArticle(slug);
    return a?.status === 'published' ? a : null;
  }
}

export function listPublished(limit = 50) {
  ensure();
  try {
    return fs
      .readdirSync(PUB_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(PUB_DIR, f), 'utf8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
      .slice(0, limit);
  } catch {
    return listArticles({ status: 'published', limit });
  }
}

/**
 * Minimal markdown → HTML (headings, lists, paragraphs, figures passthrough)
 */
export function markdownLite(md) {
  let html = String(md || '');
  // preserve figures
  const figures = [];
  html = html.replace(/<figure[\s\S]*?<\/figure>/gi, (m) => {
    figures.push(m);
    return `\n\n%%FIG${figures.length - 1}%%\n\n`;
  });
  html = html
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  html = html
    .split(/\n\n+/)
    .map((block) => {
      const t = block.trim();
      if (!t) return '';
      if (t.startsWith('%%FIG')) return t;
      if (t.startsWith('<h') || t.startsWith('<ul') || t.startsWith('<figure')) return t;
      return `<p>${t.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  html = html.replace(/%%FIG(\d+)%%/g, (_, i) => figures[Number(i)] || '');
  return html;
}

async function notifyOps(article, stage) {
  const to = process.env.SUPPORT_NOTIFY_EMAIL || process.env.OPS_NOTIFY_EMAIL || '';
  if (!to || !process.env.RESEND_API_KEY) return { skipped: true };
  const text =
    `Meridian article ${stage}\n\n` +
    `Title: ${article?.title}\n` +
    `Status: ${article?.status}\n` +
    `Slug: ${article?.slug}\n` +
    (article?.publicUrl ? `URL: ${article.publicUrl}\n` : '') +
    `Ops: ${BASE}/ops\n` +
    `API publish: POST /api/ops/articles/${article?.id}/publish\n`;
  return sendOwnerEmail({
    to,
    subject: `Meridian article · ${stage} · ${article?.title || 'untitled'}`,
    text,
  });
}

/**
 * Scheduler helper: only run if last cycle older than interval days
 */
export async function maybeRunScheduledCycle() {
  const days = Number(process.env.MERIDIAN_ARTICLE_INTERVAL_DAYS || 2.5);
  const store = load();
  const last = store.lastCycleAt ? new Date(store.lastCycleAt).getTime() : 0;
  const minMs = days * 24 * 60 * 60 * 1000;
  if (last && Date.now() - last < minMs) {
    return { ok: true, skipped: true, nextInMs: minMs - (Date.now() - last), lastCycleAt: store.lastCycleAt };
  }
  const result = await runArticleCycle();
  store.lastCycleAt = new Date().toISOString();
  // reload after cycle mutated file
  const s2 = load();
  s2.lastCycleAt = store.lastCycleAt;
  save(s2);
  return { ok: true, skipped: false, result, lastCycleAt: store.lastCycleAt };
}

export function articlesStatus() {
  const store = load();
  const by = {};
  for (const a of store.articles || []) {
    by[a.status] = (by[a.status] || 0) + 1;
  }
  return {
    total: (store.articles || []).length,
    byStatus: by,
    lastCycleAt: store.lastCycleAt,
    published: listPublished(5).map((a) => ({ title: a.title, slug: a.slug, publishedAt: a.publishedAt })),
    intervalDays: Number(process.env.MERIDIAN_ARTICLE_INTERVAL_DAYS || 2.5),
    autoPublish: process.env.MERIDIAN_ARTICLES_AUTO_PUBLISH === '1',
    claude: claudeConfigured(),
  };
}
