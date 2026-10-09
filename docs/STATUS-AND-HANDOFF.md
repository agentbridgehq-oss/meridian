# Meridian status and handoff

## 2026-10-09 — Website analysis, offers and growth worker

- Added an actual public HTTPS HTML analyzer with pinned DNS, redirect/size/time checks, bounded concurrency and scan rate limits. Observed search/mobile/structure/enquiry findings carry evidence and explicit limits; no invented revenue, rankings or Core Web Vitals. Free interest creates the existing private agency project and a requested-report email job.
- Added customer offer requests, owner-approved priced templates, current-revision customer approval, intake, delivery work plans and approved-design deployment preparation. Existing integration/QA/client-acceptance/rollback gates remain. Custom offers need final scope, CAD fees, timing and provider costs; no prices or activated client systems are invented.
- Added niche/location campaigns with start/pause, hourly bounded searches, daily caps, deduplication, source records and up to two candidate website verifications per cycle. Public mailto/tel observations retain source evidence. Candidates still require business-fit/contact-permission review. No cold outreach sender.
- Added approved live-project daily website reviews with new/resolved findings, explicit scope and pause. Operator workspace includes quote/templates/campaigns/provider readiness/queue/retry/design preparation controls. Worker is opt-in via MERIDIAN_GROWTH_WORKER=1 and uses the existing persistent DATA_DIR, one replica. It does not publish arbitrary SEO content or modify external client systems without implemented scoped connectors.
- Validation: full npm test 236/236; new growth checks 10/10; V2 mocked-DOM interactions 11 groups; JS syntax and diff checks pass. Fixed pre-existing voice-status test leakage by isolating its data directory (test-only). No rendered browser/mobile QA. Live analyzer fetch from this workspace failed DNS EAI_AGAIN, so real-site acceptance is not claimed; fixtures cover analysis/offer/approval/email acceptance/work plan/deployment blockers and HTTP auth.
- Railway read-only inspection: existing service fe23148e-0c58-4e87-82c7-5dc0a95c9fcd, production 9dbfe413-b78a-4a9a-a974-eb371785cfde, deployment c903f1af-617d-4958-a1ca-9f8fdc7e4ef5 SUCCESS, source pinned at 50fc5a71e290eb48dc66b510257852c6490d2419, one replica and /data volume. No staged changes. Growth worker, Brave/Serper and Resend variable names absent. No secret values read and no production mutation.
- New analysis and growth pages added to the existing private V2 design preview with explicit backend-pending labels; preview submissions and operator credential entry disabled. Netlify browser access remains denied from the earlier action; no retry or workaround.
- Starting source 134716f72eb4629d502afe454001b713c122e868; source saved to meridian-agency-2-0. PR #2 is previously merged; master untouched. Exact next: review preview, obtain explicit production deploy confirmation required by Railway accept-deploy, deploy this tested release and enable worker with configured search/email; approve commercial templates and niche campaigns, then verify real fetch/report email/offer approval/intake/delivery/search.


## 2026-10-09 — Premium interactive onboarding

- Preserved the linked dark green onboarding page, serif typography, existing private project/intake IDs and agency API behavior. Added ten-stage interactive process explorer, next-stage navigation, local-only four-item preparation checklist with reset, responsive native horizontal stage rail, scoped premium styling and reduced-motion support.
- Verified JS syntax, git diff --check and customer-front/customer-portal tests: 8/8 pass. No rendered phone/browser QA claimed.
- Netlify published deploy remains 6ac3b4d1a5cd62cbc5924718. Browser security policy denied access to app.netlify.com in this session; no Netlify publication attempted after denial. Railway, voice and payment processing unchanged.
- Updating the existing owner-private Meridian V2 preview with an onboarding presentation page; live business links return to Netlify. Preview has no authenticated project backend.
- Starting head 0ae3387d084404c01f6fbea37a9d0c379c240278. PR #2 was already merged and does not track these newer changes. Next: review private onboarding preview; publish exact static changes to existing Netlify when access is authorized and available.


## 2026-10-08 12:45 UTC — Enhanced mobile V2 and private preview

- Ken requested a preview, mobile smooth scrolling and polished minimal interactions. Preserved the green/serif identity, hero wording, operating layer, CAD plans and black standby. Added phone menu, 44px controls, native scroll/snap services, tappable operating-layer steps, playable/pauseable/resettable four-scenario workflow, selective mobile plan CTA, reduced-motion support and lightweight decorative Canvas orbit motion. Canvas pauses offscreen and when the page is hidden; no scroll interception, dependency or video payload added.
- Research: official Retell (https://www.retellai.com/ai-voice-agents), Vapi (https://vapi.ai/) and Sierra (https://sierra.ai/) sites. Applied hands-on scenarios, visible workflow steps and outcome-focused explanation as design inspiration. No competitor performance, testimonial or superiority claim copied. Canvas chosen from Ken's requested alternatives; no Higgsfield/CapCut migration.
- Validation: customer-front and customer-portal 8/8 pass; scripts/check-v2-interactions.cjs passes 11 interaction groups using a mocked DOM (not a real-browser test). JS syntax, V2 parity, unique IDs/anchors/assets, black byte comparison and git diff checks pass. No actual mobile rendered/performance QA: static preview has no supported browser-testing runtime here.
- Private design preview SUCCESS: https://meridian-v2-preview.hunter82kh.chatgpt.site . Sites project appgprj_6ac78fdb52c881919966df6e2c362367; deployment appgdep_6ac790355d888191a93339cbf3c49829; preview source a385c1ba16658d46d3da11b17f411f38ec23bdd8. This is a static presentation preview; checkout/service/setup/proposal links go to the existing public application, with no backend in the preview.
- Saved implementation on meridian-agency-2-0 in this commit. No master merge, Netlify/Railway deployment, phone or payment-processing changes. Netlify production V2 publication still needs secure authenticated access; earlier login handoffs failed on Ken's phone. Do not claim this preview changed meridian-open.netlify.app.
- Next: Ken reviews the private preview on his phone; apply feedback on V2, then use already approved Netlify publication when authenticated. PR #2 remains previously merged at 4eaa904 and does not track this work.

## Latest verified update — 2026-10-05 01:50 UTC

Product `e5d91da65f21f7d6dc94edc985b9b7f20f85f65a` combines newer disclosure/SMS/contact work with xAI WebSocket hardening and corrected setup guidance. Tests **225/225**, production audit zero vulnerabilities. Railway connector staged one source change but automatic approval review rejected deployment pending explicit approval of that exact production deploy. Runtime remains `23fd69e`. Twilio authentication timed out; no routing changes. **Customer launch remains NO-GO.** See latest MERIDIAN-SESSION-SYNC.md for blockers. The older missing GitHub token does not prevent use of the connected Railway deploy tool after approval.

## Latest verified update — 2026-10-05 01:34 UTC

Netlify production `6ac2fe64cc0fa7500ffd2a0b` is ready. Draft privacy, terms, and contact are on https://meridian-open.netlify.app. Railway redeploy failed: GitHub Actions run 37251822796, `RAILWAY_TOKEN` secret missing. Phone runtime is unchanged. Customer launch remains NO-GO.

## Previous verified update — 2026-10-05 01:30 UTC

Source on `meridian-agency-2-0` now has the fixed AI/recording first utterance, SMS STOP/START/HELP lines, business-name plus STOP on customer texts, Canada/US-only AI texts, and draft privacy, terms, and contact pages. `npm test` 220/220. This is not deployed. Production health is 200 and degraded; Twilio reports configured with an empty agent map; new legal copy is not on the live URLs yet. Customer launch remains NO-GO. See MERIDIAN-SESSION-SYNC.md.

## Previous verified update — 2026-10-04 16:05 UTC

Ken authorized the source-sync and launch-correction deployment. Product `23fd69ed5b8aca4b751a4ff30406984215bab071` is live on Railway (`e48f1e19-abe1-464b-a8bd-72095ae46eeb`, SUCCESS) and Netlify (`6ac2780a8b3b09cc5e4a3484`, ready). Tests 213/213, npm production audit zero vulnerabilities. The earlier six-failure statement is stale: fresh baseline was 198/201; repaired premium-studio mocks and new safety tests now pass.

Public CAD pricing, current xAI guides, checkout/private setup routing, local Setup help, checklist and private-page cache/referrer protections are published. SMS STOP is durably enforced by sender/recipient; Advanced Opt-Out does not double-reply; corrupt suppression storage fails closed; arbitrary SMS requires operator plus tenant credentials and is rate limited. Outbound customer texts add business identification and STOP. AI identity instructions and Gather greeting were improved. Remaining geographic/abuse, full recording/processing disclosure and privacy/contract items below are still open, not silently signed off.

Live checks: three CAD plan checkout routes return 303 to Stripe (no payment); setup/hub/install 200; invalid guide 404 with private/no-store and no-referrer; current voice API reports xAI configured, real-call verification null. Browser confirmed CAD plans and Setup help. No actual call, calendar booking, paid acceptance, or mobile visual verification was performed.

**Full customer launch remains NO-GO.** Main-line routing/SMS callback, reception knowledge base, package provisioning, real-call/fallback/calendar acceptance and legal/contact/commercial decisions remain required. Daily owner brief is enabled at 03:30 America/Toronto, starting October 5; it reports money decisions and owner-only blockers, without spending, outreach or autonomous deployment. See latest MERIDIAN-SESSION-SYNC.md for exact next action. Historical snapshot follows.

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
- If the base payment fails, new calls go to voicemail; live calls finish.
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
