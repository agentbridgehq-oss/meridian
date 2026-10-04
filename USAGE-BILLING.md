# Meridian — pricing & usage billing (CAD · cash first)

**Single source of truth:** `lib/pricing.mjs`. Every price, cap, block, alert threshold and
Stripe line item in the app is derived from it (server PRODUCTS, proposals, voice rate card,
usage billing, per-minute markup, public `/api/pricing`). Do not hard-code prices elsewhere.

All amounts are **CAD, before HST**. Stripe currency is `cad`.

## Plans (month-to-month)

| Plan | Monthly | Setup | AI minutes | SMS segments | Numbers | Warm transfers |
|------|---------|-------|-----------:|-------------:|--------:|---------------:|
| Missed-Call Rescue (`rescue`) | $199 | $0 | 200 | 300 | 1 | 0 |
| Front Desk Pro (`pro`) | $499 | $499 | 600 | 800 | 1 | 150 |
| Front Desk Growth (`growth`) | $999 | $999 | 1,200 | 2,000 | 2 | 400 |

Checkout: `/checkout/rescue`, `/checkout/pro`, `/checkout/growth` (subscription mode; setup fee
is a one-time line item on the first invoice). Legacy routes (`/checkout/voice`, `/checkout/stack`,
`/checkout/auto*`, `/checkout/voice-sub`, `/checkout/voice-pro`) resolve to these plans.

## Usage policy

- **Stop at cap** by default — calls forward to the owner with a missed-call text; nothing is billed silently.
- Alerts at **80%** and **100%** of included usage (ledger `usage_alert` events).
- **20 AI minutes max per call** (`USAGE_POLICY.perCallAiMinuteCap`).
- Extra usage is **prepaid blocks only**, and blocks bought in a period may not exceed
  **1× the plan's monthly price** (overage ceiling).

| Block | Price | Checkout |
|-------|-------|----------|
| 100 AI minutes (`minutes_100`) | $45 | `/checkout/voice-pack/minutes_100?agentId=…` |
| 500 SMS segments (`sms_500`) | $35 | `/checkout/voice-pack/sms_500?agentId=…` |

Blocks require an active plan. Legacy pack IDs (`starter`, `growth`, `scale`) map to `minutes_100`.

## Unit economics

`worstCaseMonthlyCostCents(plan)` assumes every included unit is used at worst-case vendor
cost (stress FX), plus hosting and Stripe fees. Tests assert worst-case cost < price for every
plan and block. See `GET /api/pricing/voice` for the live snapshot.

## Stripe

Optional Price IDs (CAD) — when unset, checkout uses inline CAD `price_data` from `lib/pricing.mjs`:

`STRIPE_PRICE_RESCUE_MONTHLY`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_SETUP`,
`STRIPE_PRICE_GROWTH_MONTHLY`, `STRIPE_PRICE_GROWTH_SETUP`, `STRIPE_PRICE_BLOCK_MINUTES_100`,
`STRIPE_PRICE_BLOCK_SMS_500`.

Webhook (`STRIPE_WEBHOOK_SECRET`): `checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`.

Retired env vars: `STRIPE_PRICE_{VOICE,SALES,BOOKING,STACK,AUTO,AUTO_VOICE,AUTO_STACK,AUTO_SALES,VOICE_SUB,VOICE_PRO}`,
`STRIPE_AMOUNT_AUTO*`, `VOICE_SUB_*`, `VOICE_CENTS_PER_TURN`,
`VOICE_MIN_MARGIN_MULTIPLE`, `AUTO_INSTALL_BONUS_TURNS`.
