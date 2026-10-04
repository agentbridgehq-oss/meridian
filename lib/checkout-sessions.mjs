/**
 * Pure Stripe Checkout session builders (no Stripe API calls here).
 * All amounts/currency come from lib/pricing.mjs (CAD).
 */
import { CURRENCY, getBlock, getPlan, planCheckoutLineItems, blockCheckoutLineItem } from './pricing.mjs';

/** Plan checkout: subscription mode, monthly recurring + one-time setup on the first invoice. */
/** Metered PAYG overage line items (no quantity) — only when both metered price IDs are configured. */
export function paygCheckoutLineItems(env = process.env) {
  const minute = String(env.STRIPE_PRICE_OVERAGE_MINUTE || '').trim();
  const sms = String(env.STRIPE_PRICE_OVERAGE_SMS || '').trim();
  if (!minute || !sms) return [];
  return [{ price: minute }, { price: sms }];
}

export function buildPlanCheckoutSession({ planKey, base, leadId = '', billingAccountId = '', email = '', payg = false, env = process.env }) {
  const plan = getPlan(planKey);
  if (!plan) return null;
  const meta = {
    brand: 'meridian',
    kind: 'plan',
    plan: plan.id,
    product: plan.id,
    requestedProduct: String(planKey || ''),
    leadId: String(leadId || ''),
    billingAccountId: String(billingAccountId || ''),
    fullAuto: '1',
    primaryNeed: plan.primaryNeed,
    currency: CURRENCY,
  };
  const params = {
    mode: 'subscription',
    currency: CURRENCY,
    allow_promotion_codes: true,
    line_items: planCheckoutLineItems(plan.id, env),
    subscription_data: { metadata: { brand: 'meridian', plan: plan.id, billingAccountId: meta.billingAccountId } },
    metadata: meta,
    success_url: `${base}/api/checkout/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/#pricing`,
    // Stripe Checkout allows max 3 custom_fields — keep under limit or checkout crashes
    custom_fields: [
      { key: 'business_name', label: { type: 'custom', custom: 'Business name' }, type: 'text', optional: false },
      { key: 'hours', label: { type: 'custom', custom: 'Business hours (e.g. Mon-Fri 9-5)' }, type: 'text', optional: false },
      { key: 'services', label: { type: 'custom', custom: 'Main services + phone (short)' }, type: 'text', optional: false },
    ],
  };
  // Pay-as-you-go overage (opt-in): calls never drop at the cap; extra minutes/SMS are
  // reported to Stripe Billing Meters and billed on the invoice (early threshold set later).
  const metered = payg ? paygCheckoutLineItems(env) : [];
  if (metered.length) {
    params.line_items = [...params.line_items, ...metered];
    params.payment_method_collection = 'always';
    params.metadata = { ...meta, payg: '1' };
    params.subscription_data.metadata.payg = '1';
  }
  if (email) params.customer_email = email;
  return params;
}

/** Prepaid block checkout: payment mode, charged now. */
export function buildBlockCheckoutSession({ blockKey, base, agentId = '', leadId = '', billingAccountId = '', env = process.env }) {
  const block = getBlock(blockKey);
  if (!block) return null;
  return {
    mode: 'payment',
    currency: CURRENCY,
    customer_creation: 'always',
    allow_promotion_codes: false,
    line_items: [blockCheckoutLineItem(block.id, env)],
    metadata: {
      brand: 'meridian',
      kind: 'voice_pack',
      packId: block.id,
      unit: block.unit,
      units: String(block.units),
      agentId: String(agentId || ''),
      leadId: String(leadId || ''),
      billingAccountId: String(billingAccountId || ''),
      currency: CURRENCY,
    },
    success_url: `${base}/api/checkout/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/#pricing`,
  };
}
