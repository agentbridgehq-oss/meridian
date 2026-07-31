/**
 * Lightweight bot / abuse guards for public Meridian endpoints.
 * No third-party captcha (no extra vendor cost). Fail closed on honeypot.
 */

const BOT_UA =
  /bot|crawler|spider|scrapy|curl\/|wget|python-requests|httpclient|go-http|java\/|libwww|headless|phantom|selenium|puppeteer/i;

/**
 * Honeypot + min fill time (ms). Real users leave honeypot empty.
 * @returns {{ ok: true } | { ok: false, reason: string, status: number }}
 */
export function checkFormBot(body = {}, { minMs = 2500 } = {}) {
  const honey = String(body.website || body.company_url || body.hp_field || body.fax || '').trim();
  if (honey) {
    return { ok: false, reason: 'bot_honeypot', status: 400 };
  }
  const started = Number(body._formStartedAt || body.formStartedAt || 0);
  if (started > 0) {
    const elapsed = Date.now() - started;
    if (elapsed >= 0 && elapsed < minMs) {
      return { ok: false, reason: 'bot_too_fast', status: 400 };
    }
  }
  return { ok: true };
}

/** Soft UA filter for free public AI endpoints (not API keys). */
export function looksLikeBotUa(req) {
  const ua = String(req.get?.('user-agent') || req.headers?.['user-agent'] || '');
  if (!ua || ua.length < 8) return true;
  return BOT_UA.test(ua);
}

/**
 * Express middleware: block obvious bots on free burn endpoints.
 * Authenticated Bearer mdn_ traffic is not blocked here.
 */
export function rejectObviousBots(req, res, next) {
  if (req.get?.('authorization')?.startsWith?.('Bearer mdn_')) return next();
  if (looksLikeBotUa(req)) {
    return res.status(403).json({ error: 'Forbidden', reason: 'bot_ua' });
  }
  next();
}

/** Generic success for honeypot hits (don't teach bots). */
export function silentBotOk(res) {
  return res.status(200).json({ ok: true });
}
