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

## Standing consent

Fetch-on-open, commit-on-close. No merge to master unless Kenny says merge.

## 2026-09-05 — Node compatibility test

- Synced this workspace to `meridian-agency-2-0` at `a45dea3`.
- Updated the readiness test to enforce the declared Node.js 22+ runtime contract instead of rejecting newer supported Node releases.
- Full agency test suite passes on Node.js 24.
