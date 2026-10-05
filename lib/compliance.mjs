/**
 * Fixed launch copy for voice disclosure and SMS compliance.
 * Phrases are deterministic so tests and live TwiML match. Not a legal opinion.
 */

export const RECORDING_DISCLOSURE =
  'This call may be recorded for quality, training, and customer support.';

export const SMS_STOP = "You're unsubscribed. Reply START to opt back in.";
export const SMS_START = "You're opted in. How can we help?";

export function businessLabel(name) {
  const cleaned = String(name || 'this business').replace(/\s+/g, ' ').trim();
  return cleaned || 'this business';
}

/** Exact opening the caller must hear before any business answer. */
export function spokenDisclosure(businessName) {
  return `You are speaking with ${businessLabel(businessName)}'s AI assistant. ${RECORDING_DISCLOSURE}`;
}

export function smsHelp(businessName) {
  const name = businessLabel(businessName);
  return `This is a Meridian AI service for ${name}. Reply STOP to unsubscribe.`;
}

export function isNanpPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return true;
  if (digits.length === 10) return true;
  return false;
}

/** Business identification + STOP on customer SMS. Keeps an existing STOP line. */
export function stampCustomerSms(body, businessName) {
  const name = businessLabel(businessName);
  let text = String(body || '').replace(/\s+/g, ' ').trim();
  if (!text) text = `Thanks for texting ${name}.`;
  if (!text.toLowerCase().includes(name.toLowerCase())) text = `${name}: ${text}`;
  if (!/reply stop to unsubscribe/i.test(text)) text = `${text} Reply STOP to unsubscribe.`;
  return text;
}
