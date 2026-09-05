# Meridian session sync ledger

GitHub is source of truth. Grok skill `meridian-session-sync` pulls this on session start and writes it on session end.

ChatGPT Work / Codex / Claude must also pull this file first. Boot rules live in `AGENTS.md`, `.claude/CLAUDE.md`, and `.github/copilot-instructions.md`.

## Current pointer (2026-09-05 close)

- Working branch: `meridian-agency-2-0`
- Head after this commit (check SHA on save)
- Protected: `master` @ `05a6bbcd96ae5a951dadb122369100f4ba0673ea`
- Vehicle: PR #2 open
- CI: Meridian Tests manual-only. Go Live Probe manual-only.

## Blocker

Railway production is gone. Both historic public domains return Application not found.

## Shipped

- Go-live probe + Node 22 pin + corrected ALWAYS-ON + GO-LIVE.md
- Agent boot: `AGENTS.md` now orders every agent to pull GitHub before answering
- `.github/copilot-instructions.md` and `.claude/CLAUDE.md` say the same thing

## Next action

Kenny recreates Railway service, then any agent can `npm run go-live -- --url <domain>`.

In ChatGPT Work, open repo `agentbridgehq-oss/meridian` on branch `meridian-agency-2-0` and say: pull GitHub first.

## Standing consent

Kenny, 2026-09-05 — fetch-on-open and commit-on-close. No merge to master unless explicitly ordered.
