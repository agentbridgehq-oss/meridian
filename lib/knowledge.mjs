/**
 * Meridian Knowledge / Truth Layer
 * - Structured business facts + optional knowledge docs
 * - Anti-hallucination rules baked into system prompts
 * - Optional website text fetch for self-update drafts
 */

import crypto from 'crypto';
import dns from 'dns';
import net from 'net';
import { getAgent, updateAgentConfig } from '../engine.mjs';

const ANTI_HALLUCINATION = `
TRUTH RULES (non-negotiable):
1. Only state facts present in BUSINESS FACTS or KNOWLEDGE BASE below. If unknown, say you will have the team confirm — never invent prices, hours, availability, insurance coverage, legal outcomes, or medical advice.
2. Never invent appointments. Propose booking and collect name, phone, preferred time; only confirm a slot if a calendar tool reports it free.
3. If the caller is angry after two failed attempts, or asks for a manager/human, offer human transfer using the number in BUSINESS FACTS.
4. Emergency (flood, fire, gas, medical crisis, crime): do not delay — give human transfer / emergency instructions immediately.
5. Keep phone answers under ~2 short sentences when possible; chat may be slightly longer.
6. Never claim to be a human. Be a helpful professional assistant for the business.
`.trim();

/**
 * Build knowledge section for prompts from agent config.
 */
export function buildKnowledgeBlock(agent) {
  const cfg = agent?.config || {};
  const parts = [];
  if (cfg.knowledgeBase) {
    parts.push(`KNOWLEDGE BASE:\n${String(cfg.knowledgeBase).slice(0, 12000)}`);
  }
  if (cfg.websiteSummary) {
    parts.push(`WEBSITE SUMMARY:\n${String(cfg.websiteSummary).slice(0, 4000)}`);
  }
  if (Array.isArray(cfg.knowledgeDocs) && cfg.knowledgeDocs.length) {
    const docs = cfg.knowledgeDocs
      .slice(0, 20)
      .map((d, i) => `[${i + 1}] ${d.title || d.id || 'doc'}: ${String(d.text || '').slice(0, 2000)}`)
      .join('\n\n');
    parts.push(`KNOWLEDGE DOCS:\n${docs}`);
  }
  if (cfg.serviceArea) parts.push(`Service area: ${cfg.serviceArea}`);
  if (cfg.doNotSay) parts.push(`Never say / avoid: ${cfg.doNotSay}`);
  if (cfg.ownerNotifyEmail) parts.push(`Owner notify email (internal): ${cfg.ownerNotifyEmail}`);
  if (cfg.ownerNotifyPhone) parts.push(`Owner notify phone (internal): ${cfg.ownerNotifyPhone}`);
  return parts.filter(Boolean).join('\n\n');
}

export function antiHallucinationRules() {
  return ANTI_HALLUCINATION;
}

/**
 * Merge knowledge into agent config.
 */
export function setKnowledge(agentId, patch = {}) {
  const agent = getAgent(agentId);
  if (!agent) return { ok: false, error: 'Agent not found' };

  const configPatch = {};
  if (patch.knowledgeBase != null) configPatch.knowledgeBase = String(patch.knowledgeBase).slice(0, 20000);
  if (patch.websiteSummary != null) configPatch.websiteSummary = String(patch.websiteSummary).slice(0, 6000);
  if (patch.serviceArea != null) configPatch.serviceArea = String(patch.serviceArea).slice(0, 500);
  if (patch.doNotSay != null) configPatch.doNotSay = String(patch.doNotSay).slice(0, 1000);
  if (patch.ownerNotifyEmail != null) {
    configPatch.ownerNotifyEmail = String(patch.ownerNotifyEmail).toLowerCase().trim().slice(0, 200);
  }
  if (patch.ownerNotifyPhone != null) {
    configPatch.ownerNotifyPhone = String(patch.ownerNotifyPhone).replace(/[^\d+]/g, '').slice(0, 20);
  }
  if (patch.hours != null) configPatch.hours = String(patch.hours).slice(0, 500);
  if (patch.services != null) configPatch.services = String(patch.services).slice(0, 4000);
  if (patch.faqs != null) configPatch.faqs = String(patch.faqs).slice(0, 8000);
  if (patch.bookingRules != null) configPatch.bookingRules = String(patch.bookingRules).slice(0, 2000);
  if (patch.humanTransfer != null) configPatch.humanTransfer = String(patch.humanTransfer).slice(0, 200);
  if (patch.calendarUrl != null) configPatch.calendarUrl = String(patch.calendarUrl).slice(0, 500);
  if (patch.brainVersion != null) configPatch.brainVersion = String(patch.brainVersion).slice(0, 32);

  if (patch.doc && (patch.doc.text || patch.doc.title)) {
    const docs = Array.isArray(agent.config?.knowledgeDocs) ? [...agent.config.knowledgeDocs] : [];
    docs.unshift({
      id: `kd_${crypto.randomBytes(4).toString('hex')}`,
      title: String(patch.doc.title || 'Note').slice(0, 120),
      text: String(patch.doc.text || '').slice(0, 8000),
      at: new Date().toISOString(),
    });
    configPatch.knowledgeDocs = docs.slice(0, 30);
  }

  const updated = updateAgentConfig(agentId, {
    ...configPatch,
    knowledgeUpdatedAt: new Date().toISOString(),
  });
  return { ok: true, agentId, config: updated.config };
}

/**
 * True if an IP address (v4 or v6) is loopback/private/link-local/reserved —
 * i.e. not something an SSRF guard should let a server-side fetch reach.
 */
function isPrivateOrReservedIp(ip, family) {
  if (family === 4 || ip.includes('.') && !ip.includes(':')) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true; // fail closed
    const [a, b] = parts;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local + cloud metadata)
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 carrier-grade NAT
    if (a === 0) return true; // 0.0.0.0/8
    return false;
  }
  // IPv6
  const lower = ip.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (lower === '::' ) return true; // unspecified
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // fe80::/10 link-local
  if (/^f[cd]/.test(lower)) return true; // fc00::/7 unique local
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — check the embedded IPv4
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateOrReservedIp(mapped[1], 4);
  return false;
}

/**
 * Resolve a hostname and reject if ANY resolved address is private/reserved.
 * Hostname-string blocklisting alone (the old approach here) is bypassable
 * with an attacker-controlled DNS record pointing a public-looking domain at
 * a private/metadata IP — this actually resolves DNS and checks the real
 * address(es), fail-closed on lookup failure.
 */
async function assertPublicHost(hostname) {
  // WHATWG URL keeps brackets around IPv6 literals in .hostname (e.g. "[::1]") — strip
  // them so both the literal-IP fast path and dns.lookup see the bare address.
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, error: 'private hosts blocked' };
  }
  // Literal IP in the URL (v4 or v6) — check directly, no DNS lookup needed/possible.
  const literalFamily = net.isIP(host);
  if (literalFamily) {
    return isPrivateOrReservedIp(host, literalFamily)
      ? { ok: false, error: 'private hosts blocked' }
      : { ok: true };
  }
  let addresses;
  try {
    addresses = await dns.promises.lookup(host, { all: true, verbatim: true });
  } catch (e) {
    return { ok: false, error: `DNS resolution failed: ${e.message}` };
  }
  if (!addresses.length) return { ok: false, error: 'DNS resolution returned no addresses' };
  for (const { address, family } of addresses) {
    if (isPrivateOrReservedIp(address, family)) {
      return { ok: false, error: 'private hosts blocked' };
    }
  }
  return { ok: true };
}

/**
 * Fetch public website text (best-effort) for knowledge draft — no JS render.
 * SSRF-guarded: re-resolves and re-validates the actual DNS-resolved IP (not
 * just the hostname string) before every request, including redirect hops.
 */
export async function fetchWebsiteSummary(url) {
  const raw = String(url || '').trim();
  if (!raw) return { ok: false, error: 'url required' };
  let parsed;
  try {
    parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: 'invalid url' };
  }

  const MAX_REDIRECTS = 3;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, error: 'only http/https' };
    }
    const guard = await assertPublicHost(parsed.hostname);
    if (!guard.ok) return guard;

    let res;
    try {
      res = await fetch(parsed.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'MeridianKnowledgeBot/1.0 (+https://meridian-agency)',
          Accept: 'text/html,text/plain',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(12000),
      });
    } catch (e) {
      return { ok: false, error: e.message || 'fetch failed' };
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) return { ok: false, error: `redirect (${res.status}) with no Location header` };
      try {
        parsed = new URL(location, parsed);
      } catch {
        return { ok: false, error: 'invalid redirect target' };
      }
      continue; // re-validate the new host on the next loop iteration
    }

    if (!res.ok) return { ok: false, error: `fetch ${res.status}` };
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text') && !ct.includes('html')) {
      return { ok: false, error: 'not text/html' };
    }
    const html = await res.text();
    const text = htmlToPlain(html).slice(0, 8000);
    return {
      ok: true,
      url: parsed.toString(),
      summary: text.slice(0, 3500),
      chars: text.length,
      fetchedAt: new Date().toISOString(),
    };
  }
  return { ok: false, error: 'too many redirects' };
}

function htmlToPlain(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect emergency / transfer intent from caller text.
 */
export function analyzeIntent(message = '') {
  const m = String(message).toLowerCase();
  const emergency =
    /\b(emergency|on fire|gas leak|flooding|flood|can't breathe|heart attack|stroke|suicide|gun|weapon|break.?in|ambulance|911|active threat)\b/i.test(
      m,
    );
  const wantHuman =
    /\b(human|real person|manager|owner|operator|speak to someone|talk to a person|representative|agent please)\b/i.test(
      m,
    );
  const booking =
    /\b(book|appoint|schedul|reserve|come in|available|slot|reschedul)\b/i.test(m);
  const pricing = /\b(price|cost|how much|quote|estimate|rate)\b/i.test(m);
  const frustrated =
    /\b(this is ridiculous|useless|stupid|hate|awful|worst|scam|lawsuit|attorney|complaint)\b/i.test(m);
  const spammy =
    /\b(seo services|rank your website|google my business|crypto|bitcoin investment|outsource your|cheap leads)\b/i.test(
      m,
    );

  let priority = 'normal';
  if (emergency) priority = 'emergency';
  else if (frustrated || wantHuman) priority = 'high';
  else if (booking) priority = 'lead';

  return {
    emergency,
    wantHuman,
    booking,
    pricing,
    frustrated,
    spam: spammy,
    priority,
    transferSuggested: emergency || wantHuman || frustrated,
  };
}
