# Meridian session sync ledger

GitHub is source of truth.

## Current pointer (2026-09-05)

- Working branch: `meridian-agency-2-0`
- Protected: `master` @ `05a6bbcd`
- PR #2 open. Do not merge.

## Locked decision

**Host is Railway. Always.** Not Vercel. Not a laptop. Not another PaaS.

Kenny is straightening the Railway account on **Friday 2026-09-11**. Do not attempt production deploy before that. Do not switch hosts while waiting.

Project: https://railway.com/project/3325e670-00e8-46e2-8d38-e1e4f77b8e66

## Until Friday

- Keep shipping on `meridian-agency-2-0` if needed
- UI locally: `npm start` → http://127.0.0.1:8891/meridian-2.html
- Friday: recreate service per `GO-LIVE.md`, then probe `/healthz`

## Blocker

Railway service gone. Both old public domains return Application not found.

## Standing consent — permanent cross-chat continuity

Kenny authorized this workflow for every Meridian session, including after he clears a conversation or opens a new chat:

- **Fetch on open:** inspect PR #2, confirm the head of `meridian-agency-2-0`, then read `AGENTS.md`, this ledger, `SESSION-MEMORY.md`, and `GO-LIVE.md`.
- **Commit before final:** save every completed and verified file change plus every material decision to `meridian-agency-2-0` before sending the session's final response.
- **Write the handoff:** record the UTC date, starting head, work completed, tests, deployment state, blockers, and exact next action in this ledger and `SESSION-MEMORY.md`.
- **Confirm the save:** after the commit, re-fetch PR #2 and report the resulting head SHA to Kenny. The commit cannot contain its own SHA because changing its contents would create a different SHA; the next session verifies the reported head directly from GitHub.
- **No empty commits:** when a session produces no material Meridian change or decision, no GitHub commit is required.
- **No secrets:** credentials and customer data never belong in GitHub or the handoff files.

GitHub carries continuity across cleared chats. Chat memory is only a convenience. A closed browser cannot run a post-close commit, so the commit must happen before the final response.

No merge to `master` unless Kenny explicitly says merge. No Railway change without Kenny's separate authorization.

## 2026-09-05 — Node compatibility test

- Synced this workspace to `meridian-agency-2-0` at `a45dea3`.
- Updated the readiness test to enforce the declared Node.js 22+ runtime contract instead of rejecting newer supported Node releases.
- Full agency test suite passes on Node.js 24.

## 2026-09-05 — repository hardening audit

- Removed the active `qs` denial-of-service advisories with a compatible dependency override; `npm audit --omit=dev` now reports zero vulnerabilities.
- Repaired corrupted UTF-8 characters in the public Meridian guide.
- Updated active guide and handoff copy to the PR #2 OpenAI Realtime + Twilio SIP architecture.
- Removed false production-live instructions from the runtime coding-agent handoff while Railway remains down.
- Added regression tests for runtime truth and public guide encoding.

## 2026-09-05 — permanent session-save rule

- Reconfirmed GitHub as Meridian's cross-chat memory and permanent source of truth.
- Added the mandatory fetch-on-open, commit-before-final, handoff-update, PR-head verification, and final-SHA reporting sequence.
- The rule applies to ChatGPT, Work, Codex, Claude, Grok, Copilot, and any future coding agent.
- Kept `master`, Railway, manual-only CI, credentials, and customer data outside this authorization.

## 2026-09-05 — self-referential SHA correction

- Corrected the handoff wording so repository records capture the starting head and session facts, while post-commit verification and the final response carry the resulting head SHA.
- This avoids an impossible requirement for a commit to contain its own hash.
