# Meridian session sync ledger

GitHub is source of truth.

## Current pointer (2026-09-05)

- Working branch: `meridian-agency-2-0`
- Protected: `master` @ `05a6bbcd`
- PR #2 open. Do not merge.

## Decision this close

Kenny: wait on Railway deploy. Tried Vercel only as a UI look. Vercel preview create returned 403 on team `saber4` / project name `meridian-ui-preview`. Do not treat Vercel as the production host — Express + Realtime SIP will not run there.

## Blocker

Railway service gone. See `GO-LIVE.md`.

## How to see the UI without Railway

Local, from the repo folder on branch `meridian-agency-2-0`:

```
npm start
```

Open http://127.0.0.1:8891/meridian-2.html

## Standing consent

Fetch-on-open, commit-on-close. No merge to master unless Kenny says merge.
