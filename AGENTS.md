# Meridian Agency — agent boot file

AI agents: read docs/STATUS-AND-HANDOFF.md first.

Read this before you answer. GitHub is source of truth. Chat history, cleared conversations, and temporary workspaces are not.

## Mandatory start (every session, every agent)

You are ChatGPT, Claude, Grok, Codex, or any other agent in this repo. On the first message of a session, and again whenever Kenny asks about status, live, Railway, voice, PR, or next step:

1. Use the GitHub connection. Do not trust memory.
2. Read `MERIDIAN-SESSION-SYNC.md` on branch `meridian-agency-2-0`.
3. Read `SESSION-MEMORY.md` and `GO-LIVE.md` on that same branch.
4. List the latest commits on `meridian-agency-2-0` and confirm PR #2 head SHA.
5. Then answer. If GitHub is unavailable, say so in one line and stop claiming live status.

Working branch: `meridian-agency-2-0`  
Protected branch: `master` — do not merge unless Kenny says merge.  
PR: https://github.com/agentbridgehq-oss/meridian/pull/2

## Mandatory end

Before sending the final response for any Meridian task that changed files or made or confirmed a decision:

1. Save all completed, verified code, docs, configuration, and decisions to `meridian-agency-2-0`.
2. Run the relevant tests and record the exact result. Never describe untested work as verified.
3. Update `MERIDIAN-SESSION-SYNC.md` and `SESSION-MEMORY.md` with the UTC date, completed work, commit or branch, tests, deployment state, blockers, and exact next action.
4. Commit the handoff, re-fetch PR #2, and confirm its new head SHA.
5. Put that commit SHA in the final response to Kenny.

Do not leave work only in chat or wait for the browser window to close. Closing or clearing a chat cannot trigger a later commit, so finish the GitHub handoff before the final response. A new chat must be able to reconstruct the full project state from GitHub alone. If nothing material changed, do not create an empty commit.

## Current production truth — 2026-10-05

Launch code for disclosure, SMS compliance, and draft legal/contact pages is on `meridian-agency-2-0` after the 2026-10-05 01:30 UTC pass (`npm test` 220/220) and is **not deployed**. PR #2 was merged earlier the same day; do not treat that merge as this pass, and do not merge again unless Kenny says so. Production health is reachable and degraded; `live` phone acceptance is still unproven. Read the newest MERIDIAN-SESSION-SYNC.md entry before the historical block below.

## Historical production pointer — 2026-10-04

Latest tested/deployed product: `23fd69ed5b8aca4b751a4ff30406984215bab071`; 213/213 tests. Railway deployment `e48f1e19-abe1-464b-a8bd-72095ae46eeb` SUCCESS; Netlify `6ac2780a8b3b09cc5e4a3484` ready. Current phone stack is xAI Grok Voice + Twilio SIP. Credentials configured does not prove acceptance: public `liveCallVerified:null`. Full customer launch remains blocked on routing, real-call/calendar acceptance, provisioning and legal/contact/disclosure gates. Read newest MERIDIAN-SESSION-SYNC.md entry; older credential/provider statements below are historical. Daily 03:30 Toronto owner brief is enabled; it does not grant spending/deploy/merge authority.

## Historical production truth — 2026-09-30

Latest tested product: `de957b2813eaabacc7ecad14c7295709ed481db1`, deployed on Railway and Netlify. Connection hub `/voice-connect.html`; public configuration endpoint `/api/voice/connections`; 109/109 tests. Importable n8n bridge now exists, but downstream calendar and real-call acceptance remain unverified. See docs/VOICE-CONNECTION-PIPELINE.md and the latest handoff entries.

Ken authorised restoration. Runtime https://meridian-production-4996.up.railway.app is deployed successfully from meridian-agency-2-0; /healthz 200 and /data volume verified.

Project: https://railway.com/project/1eb48be2-82d5-463e-8632-2ecf9f2175df

Netlify https://meridian-open.netlify.app serves the premium front and proxies runtime API/demo routes to Railway. OpenAI key is absent at the last probe. Browser demo is enabled but unavailable until the key is configured. Phone voice is NOT verified: require OpenAI webhook secret, Twilio SIP/DID and a real inbound ledger call before client launch. See GO-LIVE.md and docs/VOICE-GO-LIVE-2026-09-30.md.

## Do not

- Restore push/PR auto CI on `Meridian Tests`
- Commit secrets
- Deploy by inventing a Railway token
- Treat Retell/Vapi or old OpenAI docs as the current default voice stack (current provider is xAI Grok Voice + Twilio SIP; legacy is rollback)

See [CLAUDE.md](./CLAUDE.md), [DECISION.md](./DECISION.md), [GO-LIVE.md](./GO-LIVE.md).
