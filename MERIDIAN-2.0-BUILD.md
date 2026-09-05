# Meridian 2.0 — managed agency build

Branch: `meridian-agency-2-0`. PR: #2. Deployment and merge remain paused at the owner's request.

## Implemented

- Existing premium typography and dark/mint styling extended with shared responsive styles, readable form labels, focus states and reduced-motion behavior.
- Seven server-rendered service routes: `/go/automation`, `/go/revenue-ops`, `/go/voice`, `/go/sales`, `/go/booking`, `/go/search`, `/go/web`.
- Homepage carousel navigation and seven service links. Workflow demonstration changes all steps and is explicitly illustrative.
- Opportunity scan routes the selected bottleneck into the proposal builder, instead of silently failing the bot guard.
- Foundation/Growth/Scale offer links carry the selected engagement to the proposal form.
- Versioned `flow: agency-v2` submissions to `/api/funnel` validate and retain name, business, real website, goals, tools, volume, selected service and engagement.
- Real website is `businessWebsite`; legacy `website` remains the honeypot. Form start time is captured when the form loads.
- Scoped proposals contain deliverables, proposed integration categories, acceptance checks, exclusions and commercial-review status. Automation, search and web are never automatically quoted as the old three-agent kit.
- Successful submission returns a private onboarding link. No confirmation email is sent by the agency form. Duplicate emails return an update instruction without exposing an existing token or resetting work.
- Private onboarding reads durable project state and accepts business intake after agreement approval.
- `/meridian-operations.html` uses the existing operations authorization to review client requests, record CAD/USD setup and monthly fees, final scope and approval evidence, and advance project stages.
- Stage order: Proposal → Approval → Intake → Access → Design → Build → QA → Go-live → Operate → Improve. Intake, commercial agreement, QA and client acceptance gates are checked server-side.
- The system hierarchy is accessible expandable HTML, with explicit responsibilities rather than a claim of autonomous execution.
- Twilio diagnostic handler examples no longer include the webhook secret. This existing optional route module is not currently mounted in server.mjs; the fix is tested directly.
- Existing agent pages, legacy voice proposal behavior, master homepage, billing routes and Railway configuration remain intact.

## Structure

| Component | Source |
| --- | --- |
| Service definitions and initial scope generator | `lib/agency-catalog.mjs` |
| Service-page rendering | `lib/agency-pages.mjs` |
| Managed funnel and onboarding APIs | `lib/agency-routes.mjs` |
| Shared visual system | `public/css/agency.css` |
| Proposal and private onboarding UI | `public/js/agency.js` |
| Operator review UI | `public/js/agency-ops.js` |
| Homepage carousel and workflow demonstration | `public/js/agency-home.js` |
| Isolated API regression tests | `tests/agency.test.mjs` |

## Verification

Run `npm ci` then `npm run test:agency`. Tests launch a disposable server with an explicit environment allowlist, no AI/payment/email credentials, no outbound webhooks, and a temporary DATA_DIR. They cover seven service routes, validation, durable intake fields, token privacy, duplicate protection, stage gates, restart persistence, legacy voice proposals and public telephony diagnostics. Tests do not contact real customers or purchase services.

Provider call quality, live telephony transfer, live calendar booking, CRM writes, payment settlement and customer installs require separate sandbox/live integration acceptance tests. Merely rendering an agent page is not proof its provider integration works.

Browser verification was attempted, but the browser permission check denied preview access. Desktop/mobile visual QA remains unverified. The preview server was stopped.

## Hosting direction — not executed

Use the existing Meridian Express service on Railway with one replica initially. GitHub is source control; GitHub Pages cannot execute this backend. Retain a persistent volume mounted at `/data` with `DATA_DIR=/data`, and establish backup/restore before production client data. The current inherited store is synchronous JSON file storage; do not enable multiple application replicas against it. Move to a transactional database before scaling writes or replicas. No database migration or Railway configuration was performed here.

The repository's deployment workflow triggers on master/main. Do not merge until the owner lifts the Railway pause and live acceptance tests pass. The new homepage remains at `/meridian-2.html`; promotion to `/` remains a separate release step.

## What is deliberately not represented as complete

- Proposed integrations are checklists, not connected OAuth accounts.
- Operator stage changes are attestations with evidence, not autonomous verification of external systems.
- The management hierarchy is a delivery model, not a newly built autonomous multi-agent worker runtime.
- Client account connection, CRM/calendar adapters and production provider credentials are not provisioned by the new form.
- Existing Retell/Vapi configuration packs require provider-specific validation; they are not evidence of turnkey provider deployment.
- Private links are bearer access: share only with the project owner. Operator access is the existing shared token; per-user identity/roles remain future work.

## Suggested first customer stack

Recommendation, pending one tested pilot: Retell for managed phone conversations and a Retell-managed Canadian number; Meridian for scope, business rules and project control; Make for the first managed cross-app workflows; the client's existing CRM/calendar as the source of truth. Use a direct, confirmed calendar API/tool for in-call availability and booking; keep asynchronous post-call CRM updates and reporting in Make. Retain the existing optional Twilio code for comparison and provider-specific installs; its route module is not currently mounted and is not a ready live integration. Avoid simultaneously operating Retell, Vapi, direct Twilio, n8n and Make for the first offer.

Customer integrations and account ownership must be scoped per client. Prefer client-owned provider accounts with delegated access where supported. Define usage allowances, overage treatment, support coverage and failure routing in the approved commercial agreement.

Official references checked September 5, 2026:
- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- https://docs.railway.com/guides/express
- https://docs.railway.com/volumes
- https://docs.retellai.com/general/introduction
- https://docs.retellai.com/build/single-multi-prompt/function-calling
- https://help.make.com/webhooks
