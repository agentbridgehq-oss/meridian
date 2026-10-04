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

Updated 2026-10-04 (Kenny: **calls must never drop**).

- **Card on file + pay-as-you-go (PAYG)** — no stop at cap. Usage beyond the plan cap and any prepaid
  blocks keeps working and is billed through **Stripe usage-based billing (Billing Meters)** at
  **CA$0.45 / AI minute** and **CA$0.07 / SMS segment** (block-equivalent rates, `METERED_OVERAGE`).
  Stripe charges it on the monthly invoice, or early each time unbilled usage reaches the billing
  threshold (`MERIDIAN_PAYG_THRESHOLD_CENTS`, default CA$50). The spend amount is an **informational alert
  only** (default 1× plan price, client-settable via `POST /api/v1/agents/:id/billing/payg-alert`).
- **No valid card (or PAYG off)** — **stop at cap**, exactly as before: calls forward to the owner, nothing is
  billed silently, extra usage is prepaid blocks only (≤ 1× plan price per month).
- **Payment failed** (`invoice.payment_failed`, incl. a failed threshold charge): live calls are **never cut**.
  NEW calls go to voicemail / the team line with **no AI** until `invoice.paid` for that invoice; Kenny and the
  client are alerted once per invoice.
- Alerts at **80%** and **100%** of included usage (informational for PAYG clients).
- Per call: a **soft wrap-up nudge at 20 minutes** (`perCallSoftWrapMinutes`, instruction only, never hangs up)
  and an **absolute safety ceiling of 60 minutes** (`perCallAiMinuteCap`) — bounds a stuck/looping call or an
  abusive caller to ≈ CA$15.83 worst-case vendor cost, well inside xAI's 120-minute max session.
- Owner AI-cost guard: once per month, alert Kenny when estimated xAI cost > `MERIDIAN_AI_COST_ALERT_PCT`
  (default 35) % of revenue.

| Block | Price | Checkout |
|-------|-------|----------|
| 100 AI minutes (`minutes_100`) | $45 | `/checkout/voice-pack/minutes_100?agentId=…` |
| 500 SMS segments (`sms_500`) | $35 | `/checkout/voice-pack/sms_500?agentId=…` |

Blocks require an active plan. Legacy pack IDs (`starter`, `growth`, `scale`) map to `minutes_100`.

## Unit economics

`worstCaseMonthlyCostCents(plan)` assumes every included unit is used at worst-case vendor
cost (stress FX), plus hosting and Stripe fees. Tests assert worst-case cost < price for every
plan and block. See `GET /api/pricing/voice` for the live snapshot.

Active cost profile: **`xai`** (2026-10-04 — all AI on xAI). Worst-case AI minute =
Twilio SIP 0.0045 + recording 0.0025 + storage 0.0015 + xAI STT buffer 0.0033 +
xAI Grok Voice $0.08 × 2 (audio billed both directions, worst reading) + $0.004 text input
= **US$0.1758 → CA$0.2637/min at FX 1.50**. SMS segment worst = Twilio 0.0083 + carrier 0.0087
+ failed 0.001 + grok-4.3 reply 0.013 = US$0.031. Worst-case monthly COGS (5-client hosting split):
Rescue **$99.17**, Pro **$267.96**, Growth **$551.28** (all CAD). The previous OpenAI/Claude
profile (`openai_legacy`, used on rollback) stays in `COST_PROFILES` and is also asserted profitable.

## Stripe

Optional Price IDs (CAD) — when unset, checkout uses inline CAD `price_data` from `lib/pricing.mjs`:

`STRIPE_PRICE_RESCUE_MONTHLY`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_SETUP`,
`STRIPE_PRICE_GROWTH_MONTHLY`, `STRIPE_PRICE_GROWTH_SETUP`, `STRIPE_PRICE_BLOCK_MINUTES_100`,
`STRIPE_PRICE_BLOCK_SMS_500`.

Webhook (`STRIPE_WEBHOOK_SECRET`): `checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`, `invoice.payment_succeeded`,
`payment_method.detached`.

### Pay-as-you-go setup (Stripe Dashboard, test mode first)

1. **Meters** (Billing → Meters): `meridian_ai_minutes` and `meridian_sms_segments`; aggregation **Sum**;
   customer mapping payload key `stripe_customer_id`; value key `value`.
2. **Metered prices** (CAD, recurring monthly, usage-based, attached to those meters): CA$0.45 per unit (minutes)
   and CA$0.07 per unit (SMS). Put the IDs in `STRIPE_PRICE_OVERAGE_MINUTE` / `STRIPE_PRICE_OVERAGE_SMS`.
3. Checkout with `?payg=1` adds both metered items, forces card collection, and tags `metadata.payg=1`; after
   checkout the server verifies the default payment method and sets
   `billing_thresholds.amount_gte = MERIDIAN_PAYG_THRESHOLD_CENTS` on the subscription.
4. Enable Smart Retries and failed-payment customer emails (Billing → Revenue recovery).

Usage flow: call/SMS settles → `recordMeteredUsage` (one identifier per call `voice_<callId>` / per message
`sms_<in|out>_<MessageSid>`, claimed in `processed-events`) → durable outbox `data/meter-outbox.json` →
`stripe.billing.meterEvents.create` with `identifier` + `Idempotency-Key` (retries 5xx/429; 4xx or > 34 days
old → Kenny alert for a manual invoice item). The outbox is also flushed every 5 minutes.

Retired env vars: `STRIPE_PRICE_{VOICE,SALES,BOOKING,STACK,AUTO,AUTO_VOICE,AUTO_STACK,AUTO_SALES,VOICE_SUB,VOICE_PRO}`,
`STRIPE_AMOUNT_AUTO*`, `VOICE_SUB_*`, `VOICE_CENTS_PER_TURN`,
`VOICE_MIN_MARGIN_MULTIPLE`, `AUTO_INSTALL_BONUS_TURNS`.

## Live-channel metering (lib/usage-meter.mjs)

Every live channel maps to the client's billing account and fails safe (no mapped account
with an active plan / prepaid balance → no AI usage):

| Channel | Mapping | Metering | At cap |
|---------|---------|----------|--------|
| OpenAI Realtime SIP | route → deployment → runtime agent (or `deployment.billingAccountId`) | Holds min(60, remaining) AI minutes before accept (PAYG: the full 60); soft wrap-up nudge at 20 min; settles rounded-up minutes on sideband close (PAYG excess → Stripe meter) | No card: call declined before the AI answers (SIP `MERIDIAN_CAP_SIP_STATUS`, default 480). PAYG: never at cap. Payment failed: declined/transferred to `MERIDIAN_VOICEMAIL_SIP_URI`. Mid-call: notice 30 s before the allowance ends, then REFER to the verified human line or hang up |
| Twilio `<Gather>` voice | agent id / `TWILIO_AGENT_MAP` | Hold on first webhook, checked every turn, settled on `<Dial>`, status callback, or stale-hold sweep | `<Say>` notice + `<Dial>` humanTransfer, else polite hang-up. Payment failed: `<Record>` voicemail → `/voicemail-done` emails the owner the recording |
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
