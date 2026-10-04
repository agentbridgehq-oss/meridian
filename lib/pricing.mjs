/**
 * Meridian pricing — the ONE source of truth (CAD).
 *
 * Approved by Kenny 2026-10-04 (see /workspace/meridian-2.0-pricing-proposal.md).
 * Every price shown, quoted, checked out or metered anywhere in Meridian must
 * come from this module. Do not hard-code prices elsewhere and do not add
 * env overrides for amounts — change them here, with tests.
 *
 * Amounts are integer CAD cents. Stripe currency is 'cad'.
 * Stripe price IDs are OPTIONAL env placeholders (see STRIPE_PRICE_ENV). When
 * one is unset, checkout falls back to inline price_data built from these
 * amounts in CAD, so nothing here ever calls the Stripe API by itself.
 */

export const CURRENCY = 'cad';
export const CURRENCY_CODE = 'CAD';

/** Monthly plans. Caps are hard caps (stop at cap by default). */
export const PLANS = Object.freeze({
  rescue: Object.freeze({
    id: 'rescue',
    name: 'Missed-Call Rescue',
    tagline: 'Missed-call text-back + after-hours AI voice',
    monthlyCents: 19900,
    setupCents: 0,
    setupNote: 'Setup waived ($0)',
    caps: Object.freeze({ aiMinutes: 200, smsSegments: 300, numbers: 1, warmTransfers: 0 }),
    serviceHoursPerMonth: 0.5,
    primaryNeed: 'voice',
    agents: Object.freeze(['Voice Agent']),
    features: Object.freeze(['Missed-call text-back', 'After-hours AI voice', 'Weekly summary']),
  }),
  pro: Object.freeze({
    id: 'pro',
    name: 'Front Desk Pro',
    tagline: '24/7 voice receptionist + SMS + booking on a verified calendar',
    monthlyCents: 49900,
    setupCents: 49900,
    setupNote: 'One-time setup',
    caps: Object.freeze({ aiMinutes: 600, smsSegments: 800, numbers: 1, warmTransfers: 150 }),
    serviceHoursPerMonth: 1,
    primaryNeed: 'voice',
    agents: Object.freeze(['Voice Agent', 'Booking Agent']),
    features: Object.freeze(['24/7 voice receptionist', 'Two-way SMS', 'Booking on a verified calendar', 'Warm transfer', 'EN/FR', 'Monthly report']),
  }),
  growth: Object.freeze({
    id: 'growth',
    name: 'Front Desk Growth',
    tagline: 'Voice + Booking + Service + Sales follow-up',
    monthlyCents: 99900,
    setupCents: 99900,
    setupNote: 'One-time setup',
    caps: Object.freeze({ aiMinutes: 1200, smsSegments: 2000, numbers: 2, warmTransfers: 400 }),
    serviceHoursPerMonth: 2,
    primaryNeed: 'full',
    agents: Object.freeze(['Voice Agent', 'Sales Lead Agent', 'Booking Agent', 'Service Agent']),
    features: Object.freeze(['Voice + Booking + Service', 'Sales follow-up (CASL)', 'CRM / job-software integration', 'Monthly optimisation call']),
  }),
});

export const PLAN_ORDER = Object.freeze(['rescue', 'pro', 'growth']);

/** Prepaid blocks — the ONLY way to buy usage above a cap. Charged at purchase. */
export const BLOCKS = Object.freeze({
  minutes_100: Object.freeze({ id: 'minutes_100', name: '+100 AI minutes', unit: 'aiMinutes', units: 100, amountCents: 4500 }),
  sms_500: Object.freeze({ id: 'sms_500', name: '+500 SMS segments', unit: 'smsSegments', units: 500, amountCents: 3500 }),
});

/** Add-ons from the approved proposal. */
export const ADDONS = Object.freeze({
  extra_transfer: Object.freeze({ id: 'extra_transfer', name: 'Extra warm transfer', amountCents: 25, per: 'transfer' }),
  extra_number: Object.freeze({ id: 'extra_number', name: 'Extra phone number', amountCents: 1000, per: 'month' }),
  us_texting_setup: Object.freeze({ id: 'us_texting_setup', name: 'US texting (10DLC) registration', amountCents: 4900, per: 'one_time' }),
  us_texting_monthly: Object.freeze({ id: 'us_texting_monthly', name: 'US texting (10DLC) campaign', amountCents: 1900, per: 'month' }),
});

/** Usage policy (approved). */
export const USAGE_POLICY = Object.freeze({
  stopAtCap: true, // default: AI stops at cap; calls forward to owner/voicemail + missed-call text
  overagePrepaidOnly: true, // overage only via prepaid BLOCKS
  alertThresholds: Object.freeze([0.8, 1.0]),
  perCallAiMinuteCap: 20,
  overageCeilingMultiple: 1, // monthly overage spend <= 1x plan monthly price unless client OKs in writing
  roundUpSeconds: 60,
});

/** Effective per-unit overage rates, derived from the blocks (never set separately). */
export const OVERAGE = Object.freeze({
  minuteCents: BLOCKS.minutes_100.amountCents / BLOCKS.minutes_100.units, // 45
  smsSegmentCents: BLOCKS.sms_500.amountCents / BLOCKS.sms_500.units, // 7
});

/**
 * Documented vendor list prices (USD). Retrieved 2026-10-04.
 *   xAI:    https://docs.x.ai/developers/pricing · https://docs.x.ai/developers/models
 *           https://docs.x.ai/developers/models/grok-4.3
 *   Twilio: see /workspace/meridian-2.0-pricing-proposal.md §7 (unchanged).
 * Nothing here is invented: where xAI wording is ambiguous we take the worse reading.
 */
export const VENDOR_PRICES_USD = Object.freeze({
  xai: Object.freeze({
    voiceS2sPerMin: 0.08, // grok-voice-think-fast-2.0, "$0.08/min ($4.80/hr)"
    voiceTextInputEach: 0.004, // per conversation.item.create text input
    sttStreamingPerHour: 0.2,
    textGrok43PerMTok: Object.freeze({ input: 1.25, cachedInput: 0.2, output: 2.5 }), // <200k prompt
    longContextMultiplier: 2, // >=200k prompt tokens
  }),
  twilio: Object.freeze({
    sipOriginationPerMin: 0.0045,
    recordingPerMin: 0.0025,
    recordingStoragePerMinWorst: 0.0015,
    smsSegment: 0.0083,
    smsCarrierFeeMax: 0.0087,
    numberMonthly: 1.15,
    e911Monthly: 0.75,
  }),
});

const X = VENDOR_PRICES_USD.xai;
const T = VENDOR_PRICES_USD.twilio;
/** Worst-case single grok-4.3 text turn: 8k input + 1.2k output (incl. reasoning) tokens, no cache. */
const XAI_TEXT_TURN_USD_WORST = (8000 * X.textGrok43PerMTok.input + 1200 * X.textGrok43PerMTok.output) / 1e6; // 0.013

const SHARED_COST = {
  fxUsdToCadWorst: 1.5,
  perNumberUsdMonthly: T.numberMonthly + T.e911Monthly, // local number + E911
  perTransferUsd: 0.1,
  sharedInfraUsdMonthly: 60,
  sharedInfraClients: 5,
  stripePct: 0.029 + 0.007 + 0.01, // card + Billing + worst-case buffer
  stripeFixedCents: 30,
  hstMultiplier: 1.13, // Stripe % taken on the tax-inclusive amount (worst case)
};

/**
 * Cost profiles. `xai` is the active one (Kenny 2026-10-04: all AI on xAI, one bill).
 * `openai_legacy` is the previous model, kept so a rollback (MERIDIAN_AI_PROVIDER=legacy)
 * is still proven profitable by tests.
 */
export const COST_PROFILES = Object.freeze({
  xai: Object.freeze({
    ...SHARED_COST,
    provider: 'xai',
    perAiMinuteUsdWorst:
      T.sipOriginationPerMin + T.recordingPerMin + T.recordingStoragePerMinWorst
      + X.sttStreamingPerHour / 60 // optional separate transcript stream (buffer; S2S already returns transcripts)
      + 2 * X.voiceS2sPerMin // "per minute of audio sent or received": worst case bills both directions
      + X.voiceTextInputEach, // ≤1 billed text input per minute (call-limit notice etc.)
    perAiMinuteUsdExpected: T.sipOriginationPerMin + T.recordingPerMin + T.recordingStoragePerMinWorst + X.voiceS2sPerMin, // one-direction billing, no extra STT
    perSmsSegmentUsdWorst: T.smsSegment + T.smsCarrierFeeMax + 0.001 + XAI_TEXT_TURN_USD_WORST, // segment + carrier + failed + grok-4.3 reply
    opsLlmUsdMonthly: Object.freeze({ rescue: 50 * XAI_TEXT_TURN_USD_WORST, pro: 150 * XAI_TEXT_TURN_USD_WORST, growth: 300 * XAI_TEXT_TURN_USD_WORST }),
  }),
  openai_legacy: Object.freeze({
    ...SHARED_COST,
    provider: 'openai_legacy',
    perAiMinuteUsdWorst: 0.0045 + 0.0025 + 0.0015 + 0.006 + 0.2, // SIP + rec + storage + transcribe + realtime model (worst)
    perSmsSegmentUsdWorst: 0.0083 + 0.0087 + 0.001 + 0.01, // segment + max carrier + failed + Haiku reply (worst)
    opsLlmUsdMonthly: Object.freeze({ rescue: 0.5, pro: 1.5, growth: 3.0 }),
  }),
});

/** Active worst-case cost model (xAI). Source and assumptions: proposal §8 (xAI); §2 for the legacy profile. */
export const COST_MODEL = COST_PROFILES.xai;

const profileOf = (profile = 'xai') => {
  const p = typeof profile === 'string' ? COST_PROFILES[profile] : profile;
  if (!p) throw new Error(`Unknown cost profile ${profile}`);
  return p;
};
const usdToCadCents = (usd) => usd * COST_MODEL.fxUsdToCadWorst * 100;

export function stripeFeeCentsWorst(amountCents, { fixed = true } = {}) {
  return amountCents * COST_MODEL.hstMultiplier * COST_MODEL.stripePct + (fixed ? COST_MODEL.stripeFixedCents : 0);
}

export function worstCaseUnitCostCents(profile = 'xai') {
  const p = profileOf(profile);
  const cad = (usd) => usd * p.fxUsdToCadWorst * 100;
  return Object.freeze({
    aiMinute: cad(p.perAiMinuteUsdWorst),
    smsSegment: cad(p.perSmsSegmentUsdWorst),
    number: cad(p.perNumberUsdMonthly),
    transfer: cad(p.perTransferUsd),
  });
}

export const WORST_CASE_UNIT_COST_CENTS = worstCaseUnitCostCents('xai');

/** Worst-case monthly COGS for a plan used to 100% of every cap (CAD cents, fractional). */
export function worstCaseMonthlyCostCents(planId, { clients = COST_MODEL.sharedInfraClients, profile = 'xai' } = {}) {
  const plan = getPlan(planId);
  if (!plan) throw new Error(`Unknown plan ${planId}`);
  const p = profileOf(profile);
  const cad = (usd) => usd * p.fxUsdToCadWorst * 100;
  const u = worstCaseUnitCostCents(p);
  const lines = {
    voice: plan.caps.aiMinutes * u.aiMinute,
    sms: plan.caps.smsSegments * u.smsSegment,
    numbers: plan.caps.numbers * u.number,
    transfers: plan.caps.warmTransfers * u.transfer,
    opsLlm: cad(p.opsLlmUsdMonthly[plan.id] || 0),
    hosting: cad(p.sharedInfraUsdMonthly) / Math.max(1, clients),
    stripe: stripeFeeCentsWorst(plan.monthlyCents),
  };
  const total = Object.values(lines).reduce((s, v) => s + v, 0);
  return { planId: plan.id, profile: p.provider, lines, total, marginCents: plan.monthlyCents - total };
}

export function worstCaseBlockMarginCents(blockId, { profile = 'xai' } = {}) {
  const b = BLOCKS[blockId];
  if (!b) throw new Error(`Unknown block ${blockId}`);
  const u = worstCaseUnitCostCents(profile);
  const unitCost = b.unit === 'aiMinutes' ? u.aiMinute : u.smsSegment;
  const cost = b.units * unitCost + stripeFeeCentsWorst(b.amountCents);
  return { blockId, cost, marginCents: b.amountCents - cost };
}

/** Legacy SKU / plan keys → approved plan. Old checkout links keep working but bill the CAD plan. */
export const LEGACY_PLAN_ALIASES = Object.freeze({
  // server.mjs PRODUCTS (USD kits + DFY installs)
  voice: 'rescue',
  auto_voice: 'pro',
  sales: 'pro',
  auto_sales: 'pro',
  booking: 'pro',
  auto: 'growth',
  stack: 'growth',
  auto_stack: 'growth',
  // usage-billing SUBSCRIPTION_PLANS (USD "turns")
  voice_monthly: 'rescue',
  'voice-sub': 'rescue',
  voice_pro: 'pro',
  'voice-pro': 'pro',
  // expertise VOICE_TRIO roles
  receptionist: 'pro',
  service: 'growth',
  full: 'growth',
  trio: 'growth',
});

/** Legacy USD "turn" packs → approved minute block. */
export const LEGACY_BLOCK_ALIASES = Object.freeze({ starter: 'minutes_100', growth: 'minutes_100', scale: 'minutes_100' });

export function resolvePlanId(key) {
  const k = String(key || '').trim().toLowerCase();
  if (PLANS[k]) return k;
  return LEGACY_PLAN_ALIASES[k] || null;
}

export function getPlan(key) {
  const id = resolvePlanId(key);
  return id ? PLANS[id] : null;
}

export function resolveBlockId(key) {
  const k = String(key || '').trim().toLowerCase();
  if (BLOCKS[k]) return k;
  return LEGACY_BLOCK_ALIASES[k] || null;
}

export function getBlock(key) {
  const id = resolveBlockId(key);
  return id ? BLOCKS[id] : null;
}

/** Plan for a sales need / proposal. */
export function planForNeed(need, agentCount = 1) {
  const n = String(need || '').toLowerCase();
  if (/missed|after.?hours|rescue/.test(n)) return PLANS.rescue;
  if (/full|stack|service|all|growth/.test(n) || agentCount >= 3) return PLANS.growth;
  return PLANS.pro;
}

/** Plan for a voice agent role (receptionist | booking | service | full). */
export function planForRole(role) {
  if (role === 'service' || role === 'full' || role === 'trio') return PLANS.growth;
  return PLANS.pro;
}

/**
 * Stripe price ID placeholders. Kenny creates these in Stripe (currency CAD)
 * and sets the env vars. Unset → inline CAD price_data fallback.
 */
export const STRIPE_PRICE_ENV = Object.freeze({
  rescue: Object.freeze({ monthly: 'STRIPE_PRICE_RESCUE_MONTHLY', setup: null }),
  pro: Object.freeze({ monthly: 'STRIPE_PRICE_PRO_MONTHLY', setup: 'STRIPE_PRICE_PRO_SETUP' }),
  growth: Object.freeze({ monthly: 'STRIPE_PRICE_GROWTH_MONTHLY', setup: 'STRIPE_PRICE_GROWTH_SETUP' }),
  minutes_100: 'STRIPE_PRICE_BLOCK_MINUTES_100',
  sms_500: 'STRIPE_PRICE_BLOCK_SMS_500',
});

function envPrice(name, env) {
  if (!name) return null;
  const v = String(env[name] || '').trim();
  return v || null;
}

export const dollars = (cents) => (Number(cents) / 100).toFixed(Number(cents) % 100 === 0 ? 0 : 2);
export const formatCad = (cents) => `CA$${Number(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: Number(cents) % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

/** Stripe Checkout line items for a plan (subscription mode: monthly + optional one-time setup). */
export function planCheckoutLineItems(planKey, env = process.env) {
  const plan = getPlan(planKey);
  if (!plan) return null;
  const ids = STRIPE_PRICE_ENV[plan.id];
  const items = [];
  const monthlyId = envPrice(ids.monthly, env);
  items.push(
    monthlyId
      ? { price: monthlyId, quantity: 1 }
      : {
          price_data: {
            currency: CURRENCY,
            unit_amount: plan.monthlyCents,
            recurring: { interval: 'month' },
            product_data: {
              name: `Meridian ${plan.name}`,
              description: `${plan.caps.aiMinutes} AI min · ${plan.caps.smsSegments} SMS segments · ${plan.caps.numbers} number(s) · stops at cap; prepaid top-ups only`,
            },
          },
          quantity: 1,
        },
  );
  if (plan.setupCents > 0) {
    const setupId = envPrice(ids.setup, env);
    items.push(
      setupId
        ? { price: setupId, quantity: 1 }
        : {
            price_data: {
              currency: CURRENCY,
              unit_amount: plan.setupCents,
              product_data: { name: `Meridian ${plan.name} · setup`, description: 'One-time done-for-you setup' },
            },
            quantity: 1,
          },
    );
  }
  return items;
}

/** Stripe Checkout line item for a prepaid block (payment mode). */
export function blockCheckoutLineItem(blockKey, env = process.env) {
  const block = getBlock(blockKey);
  if (!block) return null;
  const id = envPrice(STRIPE_PRICE_ENV[block.id], env);
  return id
    ? { price: id, quantity: 1 }
    : {
        price_data: {
          currency: CURRENCY,
          unit_amount: block.amountCents,
          product_data: { name: `Meridian ${block.name}`, description: 'Prepaid top-up · charged now · used after your plan cap' },
        },
        quantity: 1,
      };
}

/** Which Stripe price env vars are set (names only, never values). */
export function stripePriceEnvStatus(env = process.env) {
  const names = [];
  for (const v of Object.values(STRIPE_PRICE_ENV)) {
    if (typeof v === 'string') names.push(v);
    else for (const n of Object.values(v)) if (n) names.push(n);
  }
  return names.map((name) => ({ name, set: Boolean(String(env[name] || '').trim()) }));
}

/** Public, JSON-safe price list (no cost model). */
export function publicPriceList() {
  return {
    currency: CURRENCY_CODE,
    plans: PLAN_ORDER.map((id) => {
      const p = PLANS[id];
      return {
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        monthlyCad: p.monthlyCents / 100,
        setupCad: p.setupCents / 100,
        caps: { ...p.caps },
        features: [...p.features],
        checkout: `/checkout/${p.id}`,
      };
    }),
    blocks: Object.values(BLOCKS).map((b) => ({ id: b.id, name: b.name, units: b.units, unit: b.unit, priceCad: b.amountCents / 100, checkout: `/checkout/voice-pack/${b.id}` })),
    addons: Object.values(ADDONS).map((a) => ({ id: a.id, name: a.name, priceCad: a.amountCents / 100, per: a.per })),
    overage: { perMinuteCad: OVERAGE.minuteCents / 100, perSmsSegmentCad: OVERAGE.smsSegmentCents / 100, prepaidOnly: true },
    policy: { ...USAGE_POLICY, alertThresholds: [...USAGE_POLICY.alertThresholds] },
  };
}

/** One-line human summary used by chat guides, emails and handoff docs. */
export function pricingSummaryText() {
  const plans = PLAN_ORDER.map((id) => {
    const p = PLANS[id];
    const setup = p.setupCents ? ` + ${formatCad(p.setupCents)} setup` : ' ($0 setup)';
    return `${p.name} ${formatCad(p.monthlyCents)}/mo${setup}, ${p.caps.aiMinutes} AI min + ${p.caps.smsSegments} SMS`;
  }).join('; ');
  return `Prices in CAD: ${plans}. Usage stops at the cap unless you buy a prepaid top-up (${formatCad(BLOCKS.minutes_100.amountCents)} per 100 min, ${formatCad(BLOCKS.sms_500.amountCents)} per 500 SMS).`;
}
