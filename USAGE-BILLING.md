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

## Live-channel metering (lib/usage-meter.mjs)

Every live channel maps to the client's billing account and fails safe (no mapped account
with an active plan / prepaid balance → no AI usage):

| Channel | Mapping | Metering | At cap |
|---------|---------|----------|--------|
| OpenAI Realtime SIP | route → deployment → runtime agent (or `deployment.billingAccountId`) | Holds min(20, remaining) AI minutes before accept; settles rounded-up minutes on sideband close | Call declined before the AI answers (SIP `MERIDIAN_CAP_SIP_STATUS`, default 480). Mid-call: wrap-up notice 30 s before the allowance ends, then REFER to the verified human line or hang up |
| Twilio `<Gather>` voice | agent id / `TWILIO_AGENT_MAP` | Hold on first webhook, checked every turn, settled on `<Dial>`, status callback, or stale-hold sweep | `<Say>` notice + `<Dial>` humanTransfer, else polite hang-up |
| Twilio inbound SMS | agent id / `TWILIO_AGENT_MAP` | Inbound + reply segments (GSM-7/UCS-2), included then prepaid; replies trimmed to the balance | No AI reply; text forwarded to owner by email; one notice per customer number per period. STOP/START always answered |
| Customer-facing outbound SMS | agent | `sendClientSms` → metered; refused at cap | Skipped (`billing.sms_cap_reached`) |

Twilio console settings for each client number:
- Voice status callback: `POST /api/twilio/voice/<agentId>/status` (settles minutes).
- Voice fallback URL / Elastic SIP trunk disaster-recovery URL: `POST /api/twilio/voice/<agentId>/fallback` (no-AI TwiML).

Alerts at 80% / 100% (minutes and SMS) are emailed / texted to the owner through `lib/notify.mjs`
once per threshold per billing period (dedupe in `data/processed-events.json`).

Stripe checkout processing is idempotent: Stripe event ids and checkout session ids are claimed
atomically in `data/processed-events.json` before any plan activation, block credit or provisioning,
so the webhook, its retries and the confirm page never double-apply a purchase.
