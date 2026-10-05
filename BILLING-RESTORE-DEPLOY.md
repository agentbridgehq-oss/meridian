# Billing restore (feat/billing-restore) — pre-deploy checklist

Base: production `157f9b6` (xAI switch on `e11823a`). Adds CAD pricing, metering/caps,
idempotent checkout, usage alerts, pay-as-you-go metered overage, internal/demo plans.

## What changes on the live call path vs 157f9b6
- **Every AI channel now has a fail-safe billing gate.** An agent with no billing account on
  an active plan (or prepaid balance) gets **no AI**:
  - xAI SIP webhook (`/api/xai/webhooks/realtime`): call is declined before accept — xAI has no
    reject API, so the caller is REFERred to the deployment's *verified* team line, else hung up.
  - Twilio fallback voice (`/api/twilio/voice/:agentId`): `<Say>` + `<Dial>` team line, else polite hang-up.
  - Inbound SMS: inbound counted; no AI reply at cap/unmapped (text forwarded to the owner).
- Accepted calls: minutes held up front, settled on close; soft wrap-up nudge at 20 min; absolute
  60-min ceiling (or remaining plan minutes for no-card clients) → notice, then REFER/hang-up.
- Public pricing/checkout switches to the CAD plans (Rescue/Pro/Growth) and prepaid blocks; old
  checkout keys alias to a plan.

## Go-live step for the demo agent (agent_05f24ebc02d2b04c, +1 289-670-7853)
It needs a billing account with `agentId = agent_05f24ebc02d2b04c` (the deployment's managed
runtime agent) on an active plan. Set this Railway variable **before** deploying:

    MERIDIAN_INTERNAL_AGENT_IDS=agent_05f24ebc02d2b04c:pro

On boot the server idempotently creates/activates a CA$0 internal `pro` plan (600 AI min,
caps enforced, never overrides a paid plan). Then verify, without placing a call:

    curl -H "Authorization: Bearer $OPS_TOKEN" \
      "https://meridian-production-4996.up.railway.app/api/ops/billing/gate-check?number=%2B12896707853"

Expect `"billingGate":"ok"`, `"runtimeAgentId":"agent_05f24ebc02d2b04c"`, empty `readinessBlockers`.
If `runtimeAgentId` is a different agent, seed that id instead (the gate keys on the runtime agent).
Alternatives: `POST /api/ops/billing/internal-plan {"agentId":"…","plan":"pro"}` (OPS_TOKEN) or
`node scripts/billing-internal-plan.mjs agent_05f24ebc02d2b04c pro` on the data volume host.

## Env vars
- Required for the demo: `MERIDIAN_INTERNAL_AGENT_IDS`, `OPS_TOKEN` (for the checks).
- Alerts: `MERIDIAN_OWNER_EMAIL`, `MERIDIAN_OWNER_PHONE`, optional `MERIDIAN_AI_COST_ALERT_PCT` (35).
- PAYG (optional until offered): `STRIPE_PRICE_OVERAGE_MINUTE`, `STRIPE_PRICE_OVERAGE_SMS`,
  `STRIPE_METER_EVENT_MINUTES`, `STRIPE_METER_EVENT_SMS`, `MERIDIAN_PAYG_THRESHOLD_CENTS` (5000),
  `MERIDIAN_VOICEMAIL_SIP_URI`.
- Optional CAD Price IDs (inline CAD price_data otherwise): `STRIPE_PRICE_RESCUE_MONTHLY`,
  `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_SETUP`, `STRIPE_PRICE_GROWTH_MONTHLY`,
  `STRIPE_PRICE_GROWTH_SETUP`, `STRIPE_PRICE_BLOCK_MINUTES_100`, `STRIPE_PRICE_BLOCK_SMS_500`.
- Unchanged: `MERIDIAN_AI_PROVIDER=xai`, `XAI_API_KEY`, xAI webhook secret, `MERIDIAN_VOICE_ENVIRONMENT`,
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Twilio vars, `DATA_DIR` (billing state lives in
  `DATA_DIR/billing-accounts.json`, `processed-events.json`, `meter-outbox.json` — must be on the volume).

## Stripe
- Webhook endpoint events: `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`,
  `invoice.payment_succeeded`, `payment_method.detached`.
- PAYG only: meters `meridian_ai_minutes` / `meridian_sms_segments` (Sum, `stripe_customer_id`),
  metered CAD prices CA$0.45/min and CA$0.07/SMS; Smart Retries + failed-payment emails.

## Twilio (per client number, incl. +1 289-670-7853)
- Voice status callback: `POST https://meridian-production-4996.up.railway.app/api/twilio/voice/<agentId>/status`
  (settles minutes for the Gather fallback path).
- Number voice fallback URL / SIP trunk disaster-recovery URL:
  `POST https://meridian-production-4996.up.railway.app/api/twilio/voice/<agentId>/fallback` (no-AI TwiML).
- The SIP trunk origination to xAI is unchanged; xAI's webhook stays `/api/xai/webhooks/realtime`.
