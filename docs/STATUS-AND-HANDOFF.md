# Meridian status and handoff

**Snapshot:** 2026-10-04, about 10:00 AM ET
**Repo:** `agentbridgehq-oss/meridian`
**Production branch:** `meridian-agency-2-0` (master is frozen)
**This document is the first read for AI agents.**

## What Meridian is

Meridian is an AI agency app for local businesses: voice receptionist, booking, sales, and service agents. Owner: Kenny Hunter, Ontario. Prices are CAD. The operating model is profit-first: calls must never drop, and Meridian must never send outreach, spend money, or go live without Kenny's approval.

## Production

- Railway project **Meridian**, service `meridian`, environment `production`.
- URL: <https://meridian-production-4996.up.railway.app>
- Deploy source: `meridian-agency-2-0`; Railway does **not** auto-deploy on push.
- Redeploy only when approved: `railway redeploy --from-source -y`.
- Persistent volume: `/data`.
- This handoff is docs-only; no redeploy is needed.
- Current prod baseline: commit `39d1c80` or newer after fetching `origin`.

## AI and voice

- All AI runs on xAI: `MERIDIAN_AI_PROVIDER=xai`; legacy remains the rollback provider.
- Voice is Grok Voice over SIP: `sip:{number}@sip.voice.x.ai`.
- Brain: `grok-4.3`.
- Grok Voice path cost is approximately US$0.085/minute.
- Demo line: **+1 289-670-7853** (Milton).
- Twilio Elastic SIP trunk: `TKfd21d22bf686f96b9561a3e6c567e2d2`; origination is TLS first, then non-TLS, then the fallback Gather route `/api/twilio/voice/agent_05f24ebc02d2b04c`.
- xAI registration: `phone_js4v3UJNc9eP62pJ`; webhook path `/api/xai/webhooks/realtime`.
- Demo agent: `agent_05f24ebc02d2b04c` (internal Pro plan, 600 minutes, selected through `MERIDIAN_INTERNAL_AGENT_IDS`).
- Toronto main line: **+1 647-490-3326**, bought 2026-10-04, **not routed yet**. Route it to the knowledge-base reception after the disclosure ships. SMS has no reply URL yet.

## Billing (live)

Billing restoration is represented by commits `a404e6d..8994c57`, with the customer-portal link in `39d1c80`:

- CAD pricing, caps/metering, idempotent checkout, and 80%/100% usage alerts.
- Pay-as-you-go uses Stripe meters; 20-minute wrap-up and 60-minute cap.
- Missed-Call Rescue: **$199/mo**.
- Front Desk Pro: **$499/mo + $499 setup**.
- Growth: **$999/mo + $999 setup**.
- 100 minutes: **$45**; 500 SMS: **$35**.
- Overage: **$0.45/minute**, **$0.07/SMS**.
- Stripe is live with a restricted key. Products/prices are tagged `app=meridian` and use `meridian_*` lookup keys.
- Meters: `meridian_ai_minutes` and `meridian_sms_segments`.
- Signed webhook: `we_1UMl2mP5z41oM8NhX53IKM5f` at `/api/stripe/webhook`; unsigned events are rejected.
- Customer portal configuration: `bpc_1UMl70P5z41oM8NhwvWhPbyK`; login URL: <https://billing.stripe.com/p/login/cNi9AVbYVazXd481dw7ok00>. Site-wide URL is configured through `MERIDIAN_CUSTOMER_PORTAL_URL` (commit `39d1c80`).
- GST/HST is not collected; the owner likely qualifies as an unregistered small supplier and `automatic_tax` is off.

## Railway variable names (names only)

The intended read-only command is:

```bash
PATH="$(npm prefix -g)/bin:$PATH" railway variables --kv | cut -d= -f1
```

The linked directory `/tmp/rw` was unavailable in this handoff environment and the CLI reported no linked project, so a live production listing could not be retrieved. The repository's documented variable-name baseline is below; values are intentionally omitted. Re-run the command from the linked production directory before treating this as an authoritative live inventory:

`PORT`, `PUBLIC_BASE_URL`, `DATA_DIR`, `OPS_TOKEN`, `MERIDIAN_AI_PROVIDER`, `XAI_API_KEY`, `XAI_WEBHOOK_SECRET`, `XAI_TEXT_MODEL`, `XAI_VOICE_MODEL`, `OPENAI_API_KEY`, `OPENAI_WEBHOOK_SECRET`, `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_TRANSCRIPTION_MODEL`, `MERIDIAN_VOICE_DEFAULT_VOICE`, `MERIDIAN_VOICE_DEFAULT_SPEED`, `MERIDIAN_VOICE_VAD_THRESHOLD`, `MERIDIAN_VOICE_PREFIX_PADDING_MS`, `MERIDIAN_VOICE_SILENCE_MS`, `MERIDIAN_VOICE_IDLE_TIMEOUT_MS`, `MERIDIAN_VOICE_ENVIRONMENT`, `MERIDIAN_VOICE_DEMO_ENABLED`, `MERIDIAN_VOICE_DEMO_MODEL`, `MERIDIAN_VOICE_DEMO_VOICE`, `MERIDIAN_VOICE_DEMO_SPEED`, `MERIDIAN_VOICE_DEMO_VAD_EAGERNESS`, `MERIDIAN_VOICE_DEMO_MAX_STARTS_PER_10M`, `OPENAI_TEXT_MODEL`, `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WEBHOOK_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `MERIDIAN_WEBHOOK_URL`, `MERIDIAN_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_RESCUE_MONTHLY`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_SETUP`, `STRIPE_PRICE_GROWTH_MONTHLY`, `STRIPE_PRICE_GROWTH_SETUP`, `STRIPE_PRICE_BLOCK_MINUTES_100`, `STRIPE_PRICE_BLOCK_SMS_500`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_OVERAGE_MINUTE`, `STRIPE_PRICE_OVERAGE_SMS`, `STRIPE_METER_EVENT_MINUTES`, `STRIPE_METER_EVENT_SMS`, `MERIDIAN_PAYG_THRESHOLD_CENTS`, `MERIDIAN_VOICEMAIL_SIP_URI`, `MERIDIAN_INTERNAL_AGENT_IDS`, `MERIDIAN_OWNER_EMAIL`, `MERIDIAN_OWNER_PHONE`, `MERIDIAN_AI_COST_ALERT_PCT`, `MERIDIAN_AI_COST_BASIS`, `MERIDIAN_OPENCLAW_AUTO`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `VOICE_ENABLE_ELEVENLABS`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`, `ELEVENLABS_VOICE_ARA`, `ELEVENLABS_VOICE_EVE`, `ELEVENLABS_VOICE_LEO`, `ELEVENLABS_VOICE_REX`, `PUBLIC_SITE_ORIGIN`.

## Remaining before launch

1. Add AI and recording disclosure on every call path, plus a never-claim-human rule.
2. Lock down SMS: STOP opt-outs; business identification and STOP in texts; ops-only `/sms`; CA/US only; rate limits.
3. Finish the knowledge-base reception that books demos itself (`feat/meridian-reception`, in progress).
4. Finish provisioning per package (`feat/provisioning`).
5. Change `meridian-open.netlify.app` from USD to CAD.
6. Publish the new privacy policy and terms/DPA. Drafts are in `/workspace/guardian/meridian-legal` on the box.
7. Create a dedicated Meridian contact Gmail (address TBD) with a three-business-day response window; never use the owner's personal contacts.
8. Get owner decisions on SLA, setup turnaround, guarantee, and Rescue scope.

## Go-to-market

Slow and steady. Wave 1 is 10 Hamilton trades businesses; drafts are on the box at `/workspace/sales/wave1`. Outreach must be CASL-compliant and sent only with owner approval. Target: 3 clients by 2026-10-23. The public order line opens after client #1.

## Test baseline

There are 6 pre-existing failures: 3 premium-studio and 3 readiness failures. Do not call these regressions without a fresh comparison.

## Rollback

Sanitized rollback from the demo runbook:

1. Remove the demo number from Twilio trunk `TKfd21d22bf686f96b9561a3e6c567e2d2`.
2. Delete xAI phone registration `phone_js4v3UJNc9eP62pJ`.
3. Disable the Meridian inbound route.
4. Set `MERIDIAN_AI_PROVIDER=legacy`, or revert `157f9b6` on `meridian-agency-2-0` to `e11823`.

Do not copy webhook query tokens, webhook secrets, auth tokens, or local secret-file contents into GitHub.

## Security review: open risks only

The 2026-10-04 Guardian review found these items requiring remediation or explicit sign-off:

- **Critical disclosure gap:** no fixed AI/recording/US-processing disclosure was verified at the start of every realtime, Gather, fallback, and demo call; prompts could frame the agent as human. Add a fixed first utterance and never-claim-human rule.
- **High SMS compliance and abuse risk:** STOP suppression was not enforced, templates lacked consistent business identification/opt-out language, and the arbitrary SMS endpoint lacked ops-only restriction, CA/US restriction, rate limits, and metering.
- **High voice-cost risk:** no verified hard duration, concurrency, or per-caller limits on the public xAI voice path.
- **High privacy/contract gaps:** the privacy policy did not cover caller audio/transcripts/phone data and subprocessors accurately; no designated privacy contact or breach process was documented; client MSA/DPA and deletion/offboarding terms were missing.
- **Medium data-leak risk:** owner contact details were available to the model through knowledge context and should not be exposed to callers.
- **Medium webhook risk:** Stripe must fail closed without a signing secret (now intended to be enforced); xAI webhook signature assumptions need confirmation and replay de-duplication.
- **Medium route/config risk:** the public demo route was staging/self-attested rather than production-verified; public xAI-cost endpoints need global budget controls.
- **Medium retention risk:** retention was count-based rather than time-based, DSR history was capped, and per-caller export/delete tooling was absent.
- **Medium CASL outreach risk:** outreach needed a real monitored reply address, mailing address, working unsubscribe mechanism, and recorded consent basis.
- **Low hardening items:** protect public stats/handoff details, remove token-in-query fallback where possible, disable signature bypasses in production, and use TLS/SRTP for SIP failover.

The review's secret check reported no committed Meridian secrets. This handoff repeats no secret values.

## Agent operating rules

- Read this file first, then inspect the current `meridian-agency-2-0` branch and recent commits.
- Never send outreach, send messages, spend money, or deploy/go live without Kenny's explicit approval.
- Never commit API keys, tokens, webhook secrets, auth tokens, `OPS_TOKEN` values, or personal contacts.
