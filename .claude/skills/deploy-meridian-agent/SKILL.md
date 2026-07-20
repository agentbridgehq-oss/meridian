---
name: deploy-meridian-agent
description: >
  Automatically deploy Meridian Voice/Sales/Booking agents for a client.
  Use when Claude Code (or any agent) should provision Meridian agents, generate
  Retell/Vapi configs, process deploy-queue, or "deploy agent" / "auto deploy"
  / "install voice agent" for Meridian Agency.
---

# Deploy Meridian agents (auto)

## Goal

Provision a live Meridian agent (API key + endpoints + platform configs) without hand-clicking intake.

## Paths

Repo: `C:\Users\hunte\github-clones\meridian`  
Live base: `https://meridian-production-2eb0.up.railway.app`  
Local base: `http://localhost:8891`

## Method A — CLI (preferred for Claude Code on disk)

```powershell
cd C:\Users\hunte\github-clones\meridian
npm run deploy:agent -- --email client@biz.com --name "Acme HVAC" --type full
# types: voice | sales | booking | full
npm run deploy:agent -- --config deploy/examples/hvac-full.json
```

Artifacts land in `data/deploys/<timestamp>_.../` including:
- `connection.secret.json` (apiKey once)
- `retell-config.json`, `vapi-config.json`
- `DEPLOY.md`

## Method B — Live API (works from anywhere with OPS_TOKEN)

```powershell
$base = "https://meridian-production-2eb0.up.railway.app"
$token = "<OPS_TOKEN from Railway or .env.railway>"
Invoke-RestMethod -Uri "$base/api/ops/deploy-agent" -Method POST `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body (@{
    email = "client@biz.com"
    businessName = "Acme HVAC"
    primaryNeed = "full"
    hours = "Mon-Fri 8-6"
    services = "AC and furnace"
    source = "claude-code"
  } | ConvertTo-Json)
```

## Method C — OpenClaw queue

1. Write jobs to `data/deploy-queue.json` (see `data/deploy-queue.example.json`).
2. Run:

```powershell
npm run openclaw:deploy
# or daily OpenClaw also drains the queue:
npm run openclaw
# or API:
# POST /api/ops/deploy-queue  Authorization: Bearer OPS_TOKEN
```

## After deploy

1. Smoke with returned `smoke` curl or POST `/voice-turn` with apiKey.
2. Import `retell-config.json` / `vapi-config.json` into phone platform.
3. Attach phone number and place a test call.
4. Do **not** commit `connection.secret.json` or apiKeys.

## Types

| type | Agent focus |
|------|-------------|
| voice | Phone receptionist |
| sales | Lead follow-up |
| booking | Scheduler |
| full | All three scope in one Meridian agent config |

## Safety

- Consent/source should be real clients only.
- Cold email still requires `approved_send` — deploy ≠ spam.
- Meridian stays its own product (not ClaudeCraft).
