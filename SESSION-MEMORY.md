# Session memory — Meridian Agency full chat (2026-07-19)

**Keep this chat/context permanent.** Resume with: “pull up Meridian”, “Meridian ads”, “live urls”, “know me”.

## Current deployment truth (read this first)

As of 2026-09-30, PR #2 on `meridian-agency-2-0` is the live build track. Railway runtime and the Netlify front are deployed from the tested feature branch. `master` remains protected and unmerged.

- Voice stack in PR #2 = PSTN → Twilio Elastic SIP → OpenAI Realtime (`gpt-realtime-2.1`) → Meridian tools. Browser demo = mic → WebRTC → Realtime.
- Website Play can use ElevenLabs via Netlify Functions when `VOICE_ENABLE_ELEVENLABS=1` + `ELEVENLABS_API_KEY` are set. That is preview only.
- Railway runtime https://meridian-production-4996.up.railway.app is live and its health check and `/data` volume are verified. Browser voice remains unavailable until `OPENAI_API_KEY` is configured; phone voice remains unverified until the webhook secret, Twilio SIP/DID routing and a real inbound call pass.
- Public fronts that answered 200: Meridian Netlify, ClaudeCraft Netlify, GiantBite Netlify, SaberClaw Netlify, Operator Suite Netlify. See `LIVE-URLS.md`.
- Older locked bullets below (Retell/Vapi and the former Railway outage) are historical. When they conflict with AGENTS.md, PR #2, GO-LIVE.md, LIVE-URLS.md or the latest dated entry in this file, the newer source wins.

## 2026-09-23 session — ElevenLabs preview path

- Kenny asked for the live front + ElevenLabs API + a free GitHub/open-source host.
- Verdict locked: GitHub Pages cannot host ElevenLabs. Netlify Functions can.
- Shipped on `meridian-agency-2-0`: `netlify/functions/*`, `netlify.toml`, `public/voice.html`, `public/_redirects`, voice-id mapping in `lib/elevenlabs.mjs`, `ELEVENLABS-PREVIEW.md`.
- Set Netlify env `VOICE_ENABLE_ELEVENLABS=1` on site `meridian-open`. Did **not** store an API key.
- Still required from Kenny: paste `ELEVENLABS_API_KEY` into Netlify secrets and redeploy this branch to `meridian-open`.
- Still not a phone product. Railway + Twilio + a real call remain the go-live gate.

## 2026-09-21 session — switch to new build chat

- Kenny closed this Grok thread and opened a new chat in build.
- No product files, no deploy, no merge. Repo already current @ `317690be`.
- Standing continuity still applies: next build chat reconstructs from GitHub (`AGENTS.md`, this file, `MERIDIAN-SESSION-SYNC.md`, `GO-LIVE.md`, PR #2), not from chat memory.
- Operator Suite remains a separate track: $97 CAD official store LOCKED; do not mix sales deploy work into Meridian build unless Kenny names both.
- Next Meridian action stays explicit-ask only: recreate Railway per GO-LIVE.md, or publish `/agency` of meridian-2.html.

## 2026-09-14 session — calendar receptionist connector

- Did not clone the TikTok n8n voice graph into Meridian. Voice stays PSTN → Twilio SIP → OpenAI Realtime.
- Shipped the customer-system half: signed n8n calendar connector docs/workflow + Realtime cancel/reschedule tools.
- Voice deployments get optional `calendar`. Tools stay hidden until the adapter is verified and the runtime secret exists.
- Optional calendar does not block voice activation.
- Still not live: Railway, Twilio staging DID, and a real book-on-call proof.

## 2026-09-14 session — Grok project snapshot + live fronts

- Starting head was `44c43f9`. Live-URL file rewrite committed first.
- CashFlow receptionist graph: use as n8n calendar connector spec, not a Vapi import.
- Project folder now holds a snapshot of `public/` plus handoff docs under the Grok artifacts project.
- `claudecraft.ca` 404. Use https://claudecraft-hq.netlify.app/
- Operator Suite official: https://the-operator-suite.netlify.app/
- **Kenny lock:** Meridian is fine for now. Do not publish `/agency` or rebuild the front until he asks.

## 2026-09-05 session — permanent GitHub continuity

- Kenny authorized a standing rule: every Meridian session starts by checking current GitHub state and ends by committing all completed, verified work plus the durable handoff before the final response.
- Clearing a conversation or opening a new chat is expected. The next agent reconstructs state from `AGENTS.md`, `MERIDIAN-SESSION-SYNC.md`, `SESSION-MEMORY.md`, `GO-LIVE.md`, PR #2, and the latest branch commits—not from chat memory.
- This standing authorization does not permit a merge to `master`, a Railway change, a CI-trigger change, or committing secrets/customer data.

## Product decisions locked

- Meridian = **own agency** on Railway (service currently missing — see GO-LIVE.md). Netlify `meridian-open` is the public black UI until Railway returns.
- Front is good enough for now (Kenny, 2026-09-14).
- Not under ClaudeCraft in **product architecture**
- Current voice path = OpenAI Realtime + Twilio SIP (PR #2). Retell/Vapi is historical.
- Website preview TTS may use ElevenLabs on Netlify when armed.
- 24/7 target: Railway. Not live until the service exists again.

## Repo / deploy

- GitHub: `https://github.com/agentbridgehq-oss/meridian`
- Working branch: `meridian-agency-2-0`
- PR: https://github.com/agentbridgehq-oss/meridian/pull/2
- Public UI now: https://meridian-open.netlify.app/
- Preview page: https://meridian-open.netlify.app/voice.html
- Go-live: `GO-LIVE.md`
- ElevenLabs preview: `ELEVENLABS-PREVIEW.md`

## Skills created/used

- `meridian-session-sync` — Grok fetch-on-open / commit-on-close


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
- Repaired stale handoff text that contradicted the restored Railway runtime, corrected false one-click calendar-workflow references, and removed retired Vapi/Retell fallback wording.
- Added the canonical `npm test` alias. Validation passed: 102/102 tests, zero production audit vulnerabilities and clean `git diff --check`.
- Live status remains credential-blocked, not code-blocked: Railway health is reachable but degraded; OpenAI browser demo is enabled and unavailable because the API key is absent; ElevenLabs is unconfigured and unarmed on Netlify.
- Next: owner adds `OPENAI_API_KEY` to Railway, then verify `available:true` and complete a real browser microphone conversation. Do not claim phone launch until webhook signing, Twilio SIP/DID routing, a logged real call and customer connector acceptance pass.


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
