# Meridian session sync ledger

GitHub is source of truth.

## Current pointer (2026-09-30)

- Working branch: `meridian-agency-2-0`
- Protected: `master` @ `05a6bbcd`
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
