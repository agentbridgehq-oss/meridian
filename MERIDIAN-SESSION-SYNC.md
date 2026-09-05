# Meridian session sync ledger

GitHub is source of truth. Grok skill `meridian-session-sync` pulls this on session start and writes it on session end.

## Current pointer (2026-09-05 close)

- Working branch: `meridian-agency-2-0`
- Head at last Grok pull: `cb2935fc7340317c73485fc169ddaea92c11fc2a`
- Protected: `master` @ `05a6bbcd96ae5a951dadb122369100f4ba0673ea` (do not merge without explicit order)
- Vehicle: PR #2 open, mergeable=clean, 69 files, +6023/-25, 118 commits
- CI: `Meridian Tests` manual-only (`workflow_dispatch`). Do not restore push/PR triggers.
- Last isolated smoke: success on voice-smoke-once, workflow then deleted.

## Blocker

Railway offline. No staging PSTN call proven. Code is ahead of infra. Do not claim voice live.

## Next action

Stand up Railway (Node 22 + OPENAI_API_KEY + OPENAI_WEBHOOK_SECRET) and one Twilio staging DID. Call it. Then consider merge.

## Protocol

1. Session start — pull branches, last 5 commits on working branch, PR #2, latest Actions, this file, SESSION-MEMORY.md.
2. Session end — commit work to working branch only. Append a dated block here. Never push master. Never merge unless Kenny says merge.

## Standing consent

Kenny, 2026-09-05 — fetch-on-open and commit-on-close for Meridian sessions.
