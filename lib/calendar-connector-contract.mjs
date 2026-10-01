import crypto from 'node:crypto';

export const CALENDAR_ACTIONS = Object.freeze([
  'check_availability',
  'book_appointment',
  'cancel_appointment',
  'reschedule_appointment',
]);

export const CALENDAR_SUCCESS_KEYS = Object.freeze(['ok', 'confirmed']);

function clean(value, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function isSupportedCalendarAction(action) {
  return CALENDAR_ACTIONS.includes(clean(action, 120));
}

export function meridianCalendarPayload({ action, deploymentId, projectId, businessName, idempotencyKey, data = {} } = {}) {
  return {
    version: 1,
    action: clean(action, 120),
    deploymentId: clean(deploymentId, 120),
    projectId: clean(projectId, 120),
    businessName: clean(businessName, 160),
    idempotencyKey: clean(idempotencyKey, 120),
    data: data && typeof data === 'object' ? data : {},
  };
}

export function signMeridianPayload(payload, secret) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return `sha256=${crypto.createHmac('sha256', String(secret || '')).update(body).digest('hex')}`;
}

export function verifyMeridianCalendarRequest({ rawBody, signatureHeader, bearerHeader, secret } = {}) {
  const expectedSecret = clean(secret, 400);
  if (!expectedSecret || expectedSecret.length < 12) return { ok: false, code: 'connector_secret_missing' };
  const bearer = clean(bearerHeader, 500);
  if (bearer === `Bearer ${expectedSecret}`) return { ok: true, method: 'bearer' };
  const sig = clean(signatureHeader, 200);
  const body = typeof rawBody === 'string' ? rawBody : '';
  if (!body || !sig.startsWith('sha256=')) return { ok: false, code: 'signature_missing' };
  const expected = signMeridianPayload(body, expectedSecret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, code: 'signature_mismatch' };
  return { ok: true, method: 'hmac' };
}

export function calendarSuccess({ action, bookingId, start, end, slots, available, message } = {}) {
  const out = { ok: true, confirmed: true, action: clean(action, 120) };
  if (typeof available === 'boolean') out.available = available;
  if (bookingId) out.bookingId = clean(bookingId, 300);
  if (start) out.start = clean(start, 120);
  if (end) out.end = clean(end, 120);
  if (message) out.message = clean(message, 1000);
  if (Array.isArray(slots)) {
    out.slots = slots.slice(0, 12).map(slot => ({
      start: clean(slot?.start, 120),
      end: clean(slot?.end, 120),
      label: clean(slot?.label, 200),
    })).filter(slot => slot.start);
  }
  return out;
}

export function calendarDenied(code, message) {
  return { ok: false, confirmed: false, code: clean(code, 80), message: clean(message, 1000) };
}

export function assertCalendarConfirmable(body) {
  return body?.ok === true && body?.confirmed === true;
}
