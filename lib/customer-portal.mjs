/**
 * Stripe customer portal (self-serve billing: card, invoices, plan).
 * URL comes from MERIDIAN_CUSTOMER_PORTAL_URL; defaults to Meridian's Stripe portal login.
 */
export const DEFAULT_CUSTOMER_PORTAL_URL = 'https://billing.stripe.com/p/login/cNi9AVbYVazXd481dw7ok00';

export function customerPortalUrl(env = process.env) {
  const raw = String(env.MERIDIAN_CUSTOMER_PORTAL_URL || '').trim();
  return /^https:\/\/\S+$/i.test(raw) ? raw : DEFAULT_CUSTOMER_PORTAL_URL;
}

/** One-line "Manage billing" footer for billing emails / SMS. */
export function manageBillingLine(env = process.env) {
  return `Manage billing: ${customerPortalUrl(env)}`;
}

/** Static HTML ships the default URL; swap in the configured one when serving. */
export function withCustomerPortalUrl(html, env = process.env) {
  const url = customerPortalUrl(env);
  if (url === DEFAULT_CUSTOMER_PORTAL_URL) return html;
  const safe = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return String(html).split(DEFAULT_CUSTOMER_PORTAL_URL).join(safe);
}
