# Session memory — Meridian Agency full chat (2026-07-19)

**Keep this chat/context permanent.** Resume with: “pull up Meridian”, “Meridian ads”, “live urls”, “know me”.

## Current vs stale (read this first)

As of 2026-09-05, PR #2 on `meridian-agency-2-0` is the live build track.

- Voice stack in PR #2 = PSTN → Twilio Elastic SIP → OpenAI Realtime (`gpt-realtime-2.1`) → Meridian tools. Browser demo = mic → WebRTC → Realtime.
- Railway production is **DOWN**. Both historic domains return Application not found. Do not paste those URLs as live.
- Older locked bullets below (Retell/Vapi, “24/7 Railway”) are historical. When they conflict with PR #2 + GO-LIVE.md, the new files win until Kenny re-locks.

## 2026-09-05 session — permanent GitHub continuity

- Kenny authorized a standing rule: every Meridian session starts by checking current GitHub state and ends by committing all completed, verified work plus the durable handoff before the final response.
- Clearing a conversation or opening a new chat is expected. The next agent reconstructs state from `AGENTS.md`, `MERIDIAN-SESSION-SYNC.md`, `SESSION-MEMORY.md`, `GO-LIVE.md`, PR #2, and the latest branch commits—not from chat memory.
- Every material session must record the UTC date, starting head, work completed, tests, deployment state, blockers, and exact next action. After committing, re-fetch PR #2 and report the resulting head SHA in the final response; a commit cannot contain its own SHA.
- If no material Meridian change or decision occurred, do not make an empty commit.
- This standing authorization does not permit a merge to `master`, a Railway change, a CI-trigger change, or committing secrets/customer data.

## 2026-09-05 session — go-live automation

- Probed `meridian-production-2eb0` and `meridian-production-915d` — both Railway 404 Application not found.
- Cannot recreate Railway from Grok (no Railway token in this environment).
- Shipped automated 80%: `scripts/go-live.mjs`, Node 22 nixpacks pin, manual Go Live Probe workflow, deploy.yml health probe, `GO-LIVE.md`.
- Human 20% remains: recreate Railway service, set secrets, add `RAILWAY_TOKEN` + `STAGING_URL` GitHub secrets, then first staging phone call.
- Do not merge PR #2 until `/healthz` is 200 on a real domain and a call is logged.

## 2026-09-05 session — Grok sync skill

- Fake-follower product idea scrapped.
- Standing rule: every Meridian session starts with a GitHub pull; every close commits work to `meridian-agency-2-0`.
- Skill on Grok: `meridian-session-sync`.
- Ledger file: `MERIDIAN-SESSION-SYNC.md`.
- CI stays manual-only. No merge to `master` without explicit order.

## 2026-09-05 session — Node compatibility test

- Readiness tests now accept Node.js 22 or newer, matching `package.json` and the runtime readiness check.
- The previous exact Node 22 assertion caused a false failure on Node.js 24.
- Full `npm run test:agency` suite passes after the correction.

## 2026-09-05 session — repository hardening audit

- Production dependency audit is clean after pinning transitive `qs` to the patched 6.16.0 release.
- Public guide mojibake was repaired and its production voice description now matches OpenAI Realtime + Twilio SIP.
- Runtime agent handoff now names GitHub branch `meridian-agency-2-0` as source of truth and explicitly records Railway production as down.
- Regression coverage prevents dead-host live claims and corrupted public guide text from returning.

## Product decisions locked

- Meridian = **own agency** on Railway (service currently missing — see GO-LIVE.md)
- Not under ClaudeCraft in **product architecture**
- Current voice path = OpenAI Realtime + Twilio SIP (PR #2). Retell/Vapi is historical.
- Stripe + Resend copied from ClaudeCraft Railway → Meridian
- Autonomous onboard: money human-gated; must-work verify before sellable
- 24/7 target: Railway. Not live until the service exists again.

## Repo / deploy

- Code: `C:\\Users\\hunte\\github-clones\\meridian`
- Railway project: `meridian` — https://railway.com/project/3325e670-00e8-46e2-8d38-e1e4f77b8e66
- GitHub: `https://github.com/agentbridgehq-oss/meridian`
- Working branch: `meridian-agency-2-0`
- PR: https://github.com/agentbridgehq-oss/meridian/pull/2
- Go-live: `GO-LIVE.md`

## Skills created/used

- `meridian-session-sync` — Grok fetch-on-open / commit-on-close

## Live URLs

- Meridian production: DOWN — recreate via GO-LIVE.md
- FBTB: https://claudecraft.ca/from-built-to-bought.html
- ClaudeCraft: https://claudecraft.ca/
