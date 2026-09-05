# Meridian session sync ledger

GitHub is source of truth. Grok skill `meridian-session-sync` pulls this on session start and writes it on session end.

## Current pointer (2026-09-05 go-live session)

- Working branch: `meridian-agency-2-0`
- Head will move as this commit lands; previous pointer `49b1eb18`
- Protected: `master` @ `05a6bbcd96ae5a951dadb122369100f4ba0673ea`
- Vehicle: PR #2 open, mergeable=clean
- CI: `Meridian Tests` manual-only. New `Go Live Probe` is also manual-only.

## Blocker

Railway production is gone. Both `meridian-production-2eb0` and `meridian-production-915d` return Application not found. No public process to attach Twilio to.

## Shipped this session

- `scripts/go-live.mjs` + `npm run go-live`
- `nixpacks.toml` Node 22 pin
- `GO-LIVE.md` operator 20% checklist
- `ALWAYS-ON.md` corrected (no longer claims live)
- `.github/workflows/go-live.yml` manual probe
- `deploy.yml` post-up health probe when `STAGING_URL` secret exists

## Next action

Kenny recreates the Railway service from project https://railway.com/project/3325e670-00e8-46e2-8d38-e1e4f77b8e66 then runs `node scripts/go-live.mjs --url <new-domain>`.

## Standing consent

Kenny, 2026-09-05 — fetch-on-open and commit-on-close for Meridian sessions. No merge to master unless explicitly ordered.
