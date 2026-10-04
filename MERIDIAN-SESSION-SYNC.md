# Meridian session sync ledger

GitHub is source of truth.

## Current pointer (2026-10-04)

- Working branch: `meridian-agency-2-0` @ `49f5a706`
- `master` @ `05a6bbcd`. Ruleset `Protect master` (24443088) is active: no deletion, no force-push, pull request required, zero required reviews, no bypass. Direct push is blocked, including for the admin token.
- PR #2 open, mergeable=clean. Do not merge.
- Public UI: https://meridian-open.netlify.app/
- Railway runtime: https://meridian-production-4996.up.railway.app
- Railway health and `/data` volume are verified. Browser and phone voice remain unavailable until their required credentials and staging checks pass.
- CI: idle on current head. Latest listed runs are 2026-09-05.

## Locked decision

**Runtime host is Railway. Always.** Netlify is the static front. ElevenLabs on Netlify is preview TTS only — not the phone runtime.

Kenny: **Meridian front is fine for now.** Do not publish `/agency`, do not rebuild the site, do not switch hosts unless he explicitly asks.

Project: https://railway.com/project/1eb48be2-82d5-463e-8632-2ecf9f2175df

## Blocker

Phone voice is not live. Railway still needs `OPENAI_API_KEY` and `OPENAI_WEBHOOK_SECRET`; Twilio SIP/DID routing and a real inbound call remain unverified. ElevenLabs preview still needs `ELEVENLABS_API_KEY` plus `VOICE_ENABLE_ELEVENLABS=1` in Netlify Functions scope and a redeploy.

## Standing consent — permanent cross-chat continuity

Fetch on open. Commit before final. No merge to master. No secrets.

## 2026-09-23 — source-of-truth resync

- Resynced before continuing to branch head `5f2a2ec` (latest GitHub commit at time of work).
- GitHub branch `meridian-agency-2-0` remains the final source of truth; do not build from stale chat state.
- Confirmed Meridian 2.0 offer, proposal, onboarding, operations/system-tree, agency runtime, Voice/Sales/Booking, deployment, inbound routing, provider registry, and test layers are already integrated on this branch.
- Preserve the current Meridian front and existing voice work. No Railway changes and no merge to `master` without Kenny's explicit approval.
- Continue all new work from the current branch head and commit changes back to this branch before reporting completion.

## 2026-09-23 — ElevenLabs preview on Netlify

- Added `netlify/functions` proxy for `/api/voice/preview|voices|status`.
- Added `public/voice.html` and `/agents/voice` rewrite.
- Mapped ara/eve/leo/rex to public ElevenLabs voice IDs.
- Set `VOICE_ENABLE_ELEVENLABS=1` on Netlify site `meridian-open`. No API key stored.
- Next: Kenny pastes ElevenLabs key into Netlify, redeploys this branch, then `/api/voice/status` must show `elevenlabs: true`.

## 2026-09-21 — open new chat in build

- Kenny asked to remember this session and open a new build chat.
- No product code changed. Wrote session memory + this ledger only.
- Extra branches present and untouched: `claude/meridian-voice-fixes`, `meridian-voice-smoke-once`.

## 2026-09-14 — calendar receptionist connector

- Starting head: `44c43f9`
- Added signed n8n calendar connector contract, docs, Realtime cancel/reschedule tools, optional voice calendar integration.
- Deployment state unchanged: Railway down. No staging phone call.

## 2026-09-14 — live URL correction

- Probed historic Railway URLs: 404.
- Probed Netlify fronts: Meridian, ClaudeCraft, GiantBite, SaberClaw, Operator Suite all 200.

## 2026-09-14 — pause Meridian front work

- Kenny locked: Meridian is fine for now.
- Next Meridian action is only on explicit ask: Railway recreate, or `/agency` publish of meridian-2.html.


## 2026-09-30 — premium agent build and authorised runtime restoration

- Starting GitHub head: `6d6354f5013004725431aaaa4f8a6dc58c27ea68`, PR #2 remains the controlled build branch.
- Ken explicitly authorised front enhancements and creating the Railway/Netlify connection. Earlier front pause and Railway freeze are superseded for this scoped session. No merge or master change is authorised.
- Created Railway project `1eb48be2-82d5-463e-8632-2ecf9f2175df`, service `fe23148e-0c58-4e87-82c7-5dc0a95c9fcd`, environment `9dbfe413-b78a-4a9a-a974-eb371785cfde`. Runtime `https://meridian-production-4996.up.railway.app`.
- GitHub source branch connected; /data persistent volume 5 GB attached; /healthz HTTP 200 verified. OPS_TOKEN generated and retained only in Railway. Voice stays staging; browser demo remains off until credential setup.
- Added premium finishes without rebuilding the homepage; four complete agent detail pages, role samples, setup/API instructions and staging acceptance criteria. Receptionist/Booking/Service remain the voice trio; Sales remains available.
- Fixed missing homepage audio element and static agent routes. Device speech is no longer played before premium audio; explicit fallback only. ElevenLabs premium previews work on both server and Netlify when armed.
- Browser role is allowlisted; server-owned playbooks, model, voice and tool restrictions remain in force. Marin/Cedar role defaults and more natural conversation instruction added.
- Fixed the pre-existing service-demo label regression. Corrected missing n8n workflow import and unimplemented trio-price claims instead of claiming they exist.
- Tests: npm ci; baseline 96/97 (one pre-existing demo label failure); final node --test tests/*.test.mjs 102/102 pass; npm audit --omit=dev zero vulnerabilities; git diff --check pass. Browser screenshots unavailable because Chromium download failed; no visual browser claim.
- Prepared Fiverr/Upwork copy in docs/MARKETPLACE-PROFILES.md; accounts not created/published.
- Remaining gates: OpenAI API key and webhook secret on Railway; ElevenLabs key on Netlify; Twilio project/DID/trunk; real microphone and inbound call; verified calendar/CRM actions; client acceptance.
- Next: publish tested branch, verify live runtime/static routes; then enable staging browser demo after OPENAI_API_KEY is present. Never claim customer phone deployment passed until a real call is recorded.


## 2026-09-30 12:01 UTC — publication verified

- Product commit: `dcfdce4b422d55530b69cd8fe6ddda4f0eb8833b`.
- Railway initial tool created the service using master despite accepting a feature-branch argument. Live probes caught the mismatch. Explicit source branch correction deployed the product commit from meridian-agency-2-0. No master code or branch was changed.
- Correct Railway deployment: `2b2c8541-b31d-405f-bf17-ae784a8d9e05`, SUCCESS. Volume attached at /data.
- Netlify upload deployment: `6abcf91c683e8f065c24776f`, ready, published to https://meridian-open.netlify.app. Upload contains tested product source; Netlify reports commit_ref null for uploads.
- Verified live Netlify /agents/voice, /agents/sales, /agents/booking, /agents/service all 200 and include premium stylesheet. Railway booking page serves the new stylesheet.
- Verified /api/voice-demo/status 200 on both hosts, enabled:true, available:false, apiKeyConfigured:false. Browser demo is now enabled but correctly unavailable without OPENAI_API_KEY.
- Verified /meridian-voice-demo.html 200 through both hosts, role selector present, Permissions-Policy microphone=(self). Netlify API gateway reaches Railway.
- ElevenLabs Netlify status reports no key and flag inactive; the env-upsert connector reported success but a subsequent list was empty and live function still shows inactive. Owner must set ELEVENLABS_API_KEY plus VOICE_ENABLE_ELEVENLABS=1 in Netlify Functions scope, then redeploy. Do not claim the flag mutation succeeded in runtime.
- OpenAI belongs in Railway. Real PSTN voice and customer-system actions remain unverified. Fiverr/Upwork copy prepared only; profiles not created or published.
- Final source tests 102/102 pass; audit zero vulnerabilities. Visual browser inspection could not run (Chromium download unavailable); premium UI has HTTP/source verification only.
- Next: owner adds OPENAI_API_KEY to Railway, then verify a browser audio conversation; add webhook signing secret, Twilio SIP/DID and deterministic deployment routing; verify a real inbound call and each advertised customer integration before client activation.

## 2026-09-30 12:30 UTC — continuity and runtime-truth repair

- Starting GitHub head: `4d7ca0f23483f10c60cbef897ddf4a9c510e032b`; PR #2 remained open and mergeable. No `master`, Railway, Netlify or CI configuration change was made.
- Repaired the stale top-level handoff pointers that still described Railway as absent after its verified restoration.
- Removed two false references to a delivered `n8n/meridian-calendar-receptionist.json`; the signed calendar contract remains implemented, but the importable Google Calendar workflow is not committed and must not be sold as one-click.
- Removed retired Vapi/Retell fallback claims from the ElevenLabs status text. Phone voice remains OpenAI Realtime; ElevenLabs remains optional website sample audio.
- Added the standard `npm test` alias so the canonical test command runs the agency suite instead of failing with `Missing script: test`.
- Validation: `npm test` passed 102/102; `npm audit --omit=dev` reported zero vulnerabilities; `git diff --check` passed.
- Live probes: Railway `/healthz` returned `ok:true`, `status:degraded`; Railway and Netlify `/api/voice-demo/status` returned enabled but unavailable with `apiKeyConfigured:false`; Netlify ElevenLabs status returned key absent and flag unarmed.
- Exact next action is unchanged: add `OPENAI_API_KEY` to Railway, verify `available:true`, and run a real browser microphone conversation. Phone launch still requires the webhook secret, Twilio SIP/DID routing, a logged real inbound call and verified customer connectors.


## 2026-09-30 — current-session handoff: Meridian front, agents, content

- Kenny reaffirmed the standing continuity rule: **every Meridian session starts from GitHub and every material session ends with the verified work + handoff saved back to GitHub.**
- Source of truth remains `agentbridgehq-oss/meridian`, branch `meridian-agency-2-0`, PR #2. Do not merge `master` unless explicitly ordered. Never commit secrets.
- Current public front: https://meridian-open.netlify.app/ (Netlify project `meridian-open`, site id `60f796ca-2590-4af4-8870-c6bfeaeef5c8`).
- Current Netlify production upload deploy verified READY: `6abcf91c683e8f065c24776f`.
- Current Railway project/service/environment: `1eb48be2-82d5-463e-8632-2ecf9f2175df` / `fe23148e-0c58-4e87-82c7-5dc0a95c9fcd` / `9dbfe413-b78a-4a9a-a974-eb371785cfde`.
- Railway runtime: https://meridian-production-4996.up.railway.app and source branch is `meridian-agency-2-0`.
- This session is **Meridian only**. The Operator Suite was mentioned by mistake at the start and was left untouched.
- Verified current Meridian source already contains dedicated agent pages for Receptionist/Voice, Booking, Service and Sales with capability lists, setup/API instructions, voice preview surfaces and deployment guidance.
- Kenny's current product/UI direction:
  - remove any personal full-name exposure from the public opening area;
  - do **not** lead with price; delay pricing until after value has been demonstrated;
  - place a useful article/field note directly under the opening section;
  - keep articles fresh daily so returning visitors see new value;
  - Voice, Sales and Booking cards must each open a complete dedicated agent page/window with voice testing, expert capabilities, special-instruction intake, integrations, install/setup guidance and deployment requirements.
- Existing Meridian article backend is already present in `lib/articles.mjs` + `lib/openclaw-articles.mjs`; it currently defaults to a 2.5-day interval and ops-gated publication unless auto-publish is explicitly armed. Reuse and harden this system instead of creating a duplicate article engine.
- Current homepage source exposes price too early in the hero/card layer. That presentation change is **requested but not yet committed in this handoff**; do not claim it is live.
- Voice/provider truth remains unchanged: browser/phone voice must not be called customer-live until required OpenAI/Twilio/ElevenLabs credentials and the relevant real acceptance tests pass.
- Exact next work: make the Meridian front-end/content changes on `meridian-agency-2-0`, preserve runtime/payment/provider wiring, run tests, deploy the front, and verify all three primary agent cards/pages and voice preview paths end-to-end.


## 2026-09-30 — delayed pricing + daily value + agent setup completion

- Continued from head `70675330955e96cb3b113a4bacdf806bc597d1cc` on `meridian-agency-2-0`.
- Public-front source changes completed:
  - removed early $997 Full Stack price from the hero carousel;
  - removed $497 badges from the home agent cards and /agents listing;
  - kept commercial/pricing information later in the engagement sections;
  - primary Voice, Sales and Booking cards now open their dedicated pages in a new tab/window;
  - confirmed public homepage source has no “Kenny Hunter” full-name exposure.
- Added `public/js/daily-field-note.js`: deterministic America/Toronto daily field notes for Home, Receptionist, Sales, Booking and Service. This keeps the visible value section fresh without requiring an LLM key.
- Added a daily field note immediately under the public opening section and on each agent detail page.
- Added `public/js/agent-setup-brief.js` and role-specific setup forms to Receptionist, Sales, Booking and Service. Customers can define business type, must-do, must-never, human-handoff and special instructions.
- Updated `public/js/agency.js` so the agent brief carries through session storage into the Meridian proposal form and is cleared after successful submission.
- Added explicit expert-capability tags on all four agent detail pages. Existing studio voice preview, setup/API instructions, verification criteria and later engagement/pricing sections remain intact.
- Long-form article engine default interval changed from 2.5 days to 1 day when `MERIDIAN_ARTICLES=1` is enabled. Claude vet/publish gating remains intact.
- Netlify connected app reported `VOICE_ENABLE_ELEVENLABS=1` upserted in production Functions scope. `ELEVENLABS_API_KEY` is still absent and must be added by the owner.
- Railway variable-name inspection confirms `OPENAI_API_KEY` and `OPENAI_WEBHOOK_SECRET` are not configured. These remain owner-supplied secrets.
- Validation completed: all three new/changed browser JS files pass JavaScript syntax construction; source assertions confirmed daily-note/setup hooks, no public full-name exposure, and no early $497 card badges.
- Full `npm test` could not be rerun in the local container because outbound DNS to GitHub is blocked. Do not claim a fresh 102/102 run for this commit. Previous baseline remains 102/102 before this UI/content batch.
- Railway `redeploy` was intentionally not treated as a latest-code deploy: it redeployed the existing `dcfdce4...` snapshot. Current Railway runtime remains on that known-good product commit. No runtime replacement was forced.
- Netlify deploy connector requires running its uploader from a local repo directory. The latest front-end changes are committed but are **not yet published to the Netlify production site**.
- Exact owner runbook is saved at `docs/MERIDIAN-FINAL-STEPS-2026-09-30.md`.
- Next owner actions: add `ELEVENLABS_API_KEY` in Netlify Functions scope; add `OPENAI_API_KEY` in Railway (plus `OPENAI_WEBHOOK_SECRET` before PSTN launch); run the production Netlify deploy command from the repo root; then execute browser studio + microphone acceptance tests. Twilio SIP/DID and a real inbound call remain the phone-launch gate.


## 2026-09-30 16:09 UTC — voice pipeline continuation deployed

- Latest premium front, daily field notes and customer brief forms at d47b2de were preserved by integrating the pipeline build rather than overwriting concurrent branch changes. Product commit: `de957b2813eaabacc7ecad14c7295709ed481db1`. Master was not changed or merged.
- Added `/voice-connect.html`, a premium connection hub with live configuration checks, exact Railway/Netlify credential placement, role rehearsal links, a non-secret SIP destination builder and calendar bridge download. `/api/voice/connections` publishes only configuration booleans/public links, never secrets, phone numbers or client records. Credential presence is not live-call acceptance.
- Browser demos now have client and server 90-second end timers and reject untrackable provider call IDs. Provider hangup behavior is mock-tested; actual microphone audio/hangup remains credential-blocked.
- Delivered inactive importable n8n calendar bridge at `n8n/meridian-calendar-receptionist.json` and its public download. Uses native inbound/outbound Header Auth, configured HTTPS adapter, validated actions/caller confirmation/idempotency metadata, and explicit confirmed adapter responses. Real n8n import, downstream calendar OAuth, availability/create/reschedule/cancel and customer acceptance remain unverified. This is not a complete Google Calendar integration.
- Integrated source validation: node --test tests/*.test.mjs 109/109 pass, git diff --check pass. Production audit before integration: zero vulnerabilities; incoming changes did not alter dependency versions. No rendered visual/browser audio verification.
- Railway deployment `e6c39053-e204-4f8c-9182-bbb08009d6c3` SUCCESS, metadata confirms product commit de957b2. Volume/settings preserved. Railway agent initially reported an older deployment as success; independent deployment metadata and HTTP probes establish the actual new deployment.
- Netlify upload `6abd33f4300260cbfc0f53ab` ready. Two earlier upload attempts failed because of local dependency symlink/worktree metadata; clean Git archive resolved both. Uploaded source is exactly the tested product snapshot; commit_ref is null for uploads.
- Live runtime hub and configuration endpoint return 200. Netlify gateway reaches the new endpoint. Browser enabled but available:false; OpenAI key/webhook and Twilio account/credential all absent at the live probe. Phone liveCallVerified:null intentionally reports no public acceptance proof.
- Next: owner adds OPENAI_API_KEY in Railway and ELEVENLABS_API_KEY plus VOICE_ENABLE_ELEVENLABS=1 in Netlify Functions, redeploys, then performs real studio/microphone acceptance. Configure OpenAI webhook/Twilio routing and verified customer connectors before phone/client activation. Do not claim customer voice is live. Fiverr/Upwork profiles remain prepared copy only. See docs/VOICE-CONNECTION-PIPELINE.md.


## 2026-10-01 — portfolio launch audit and voice activation request

Ken authorized completing Meridian phone agents and deploying customer-ready receptionist/assistant workflows. Existing Twilio SIP + OpenAI Realtime architecture remains the implementation path; ElevenLabs remains optional website samples. No master merge authorized.

Fresh production GET /api/voice/connections returned HTTP 200, browser available:false, OpenAI key absent, webhook absent, Twilio account and credential absent, liveCallVerified:null. No live phone/microphone test or connector acceptance was performed. No runtime settings or secrets were changed. Twilio plugin discovery returned no matching plugin; account provisioning remains unresolved.

Next: provision dedicated provider credentials through secure account setup, configure Twilio number/SIP routing and signed webhook, then verify real microphone/inbound calls, interruption, calendar availability/book/reschedule/cancel, human transfer and failure recovery. Do not advertise unrestricted secretary capabilities or permanent availability without validated scope and operations.

Portfolio audit: Claudecraft paid checkout 404 and Stripe connector requires reauthentication; AgentBridge health/config 404; SaberClaw API health responds with HTML. Three Claudecraft free downloads returned 200. Separate recovery PRs: ClaudeCraft #5, agentbridge-final #6, operator-growth-engine #7. Growth Engine public release remains authorized but incomplete; GiantBite held for final adjustments. No sales, public visibility changes or agent activation claimed.


## 2026-10-03 — save packs and front map

- Head before this save: `89e6df70`.
- Wrote `docs/FRONT.md`, `docs/packs/*.pdf`, and set customer minute to $0.35 in `lib/voice-minute-markup.mjs`.
- Public UI unchanged: https://meridian-open.netlify.app/
- Master was not protected against push or deletion. No rulesets. Do not merge.
- Next: one staging call in the ledger before any customer invoice.

## 2026-10-04 — master ruleset active

- Kenny ordered protection of `master` only. Working branch `meridian-agency-2-0` stays writable.
- Created repository ruleset `Protect master` id `24443088`, enforcement active, target `refs/heads/master`.
- Rules verified on `master`: deletion blocked, non-fast-forward blocked, pull request required with zero approving reviews. No status checks. `current_user_can_bypass` is never. No bypass actors.
- PR #2 was not merged. `master` SHA remains `05a6bbcd`.
- Next: one staging call in the ledger before any customer invoice.
