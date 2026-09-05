# Meridian go-live — what is automated vs what only you can do

Verified 2026-09-05 from this session:

- `https://meridian-production-2eb0.up.railway.app` → Railway `Application not found`
- `https://meridian-production-915d.up.railway.app` → Railway `Application not found`

The old production service is gone. Code on `meridian-agency-2-0` cannot become live until a Railway service exists again.

Project bookmark: https://railway.com/project/3325e670-00e8-46e2-8d38-e1e4f77b8e66

## Automated (run anytime, no secrets in git)

```bash
node scripts/core-readiness.mjs
node scripts/go-live.mjs --url https://YOUR-NEW-DOMAIN.up.railway.app
```

`npm run go-live` wraps the probe. It prints presence booleans only.

GitHub Action `Go Live Probe` is manual-only (`workflow_dispatch`). It will not spam phone alerts.

## Your 20 percent (cannot be done from this chat)

1. Open the Railway project. If the service was deleted, create a new service from GitHub repo `agentbridgehq-oss/meridian`, branch `meridian-agency-2-0` for staging (keep `master` frozen).
2. Attach a volume at `/data`. Set `DATA_DIR=/data`.
3. Generate a public Railway domain. Copy it.
4. Variables (values stay in Railway, never in git):
   - `PUBLIC_BASE_URL` = `https://<that-domain>` with no trailing slash
   - `OPS_TOKEN` = long random
   - `OPENAI_API_KEY`
   - `OPENAI_WEBHOOK_SECRET`
   - `MERIDIAN_VOICE_ENVIRONMENT=staging`
   - `MERIDIAN_VOICE_DEMO_ENABLED=0` until the first phone call works
   - Twilio vars only after health is green
5. GitHub repo secret `RAILWAY_TOKEN` = Railway **project** token. Then Actions can redeploy.
6. Run `node scripts/go-live.mjs --url https://<that-domain>`.
7. Only when `/healthz` is 200: buy/assign one staging DID, point Twilio SIP at OpenAI Realtime per `PREMIUM-VOICE.md` / `TWILIO.md`, call it from your phone.

Do not merge PR #2 until step 7 leaves a call in the Realtime ledger.

## What this chat will never do

- Recreate a deleted Railway service without a Railway token in this environment
- Paste or store API keys
- Merge to `master`
- Re-enable push/PR CI on Meridian Tests
