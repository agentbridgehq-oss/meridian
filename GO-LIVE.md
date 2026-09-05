# Meridian go-live

**Host: Railway only. Always.**

Go-live is parked until Kenny fixes the Railway account on **Friday 2026-09-11**.

Do not deploy to Vercel, Render, Fly, or localhost-as-production.

Project: https://railway.com/project/3325e670-00e8-46e2-8d38-e1e4f77b8e66

Verified 2026-09-05 — both historic domains are dead:

- https://meridian-production-2eb0.up.railway.app → Application not found
- https://meridian-production-915d.up.railway.app → Application not found

## Friday checklist

1. Confirm Railway billing/account is good.
2. Recreate the `meridian` service from GitHub `agentbridgehq-oss/meridian`, branch `meridian-agency-2-0` (keep `master` frozen).
3. Volume `/data`, `DATA_DIR=/data`, public domain.
4. Variables: `PUBLIC_BASE_URL`, `OPS_TOKEN`, `OPENAI_API_KEY`, `OPENAI_WEBHOOK_SECRET`, `MERIDIAN_VOICE_ENVIRONMENT=staging`.
5. GitHub secrets: `RAILWAY_TOKEN` (project token) and `STAGING_URL`.
6. `node scripts/go-live.mjs --url https://<new-domain>`
7. Only after `/healthz` is 200: one Twilio staging DID and a real phone call.

Do not merge PR #2 until step 7 leaves a call in the Realtime ledger.

## Already automated

```bash
node scripts/core-readiness.mjs
node scripts/go-live.mjs --url https://YOUR-NEW-DOMAIN.up.railway.app
```

`Go Live Probe` GitHub Action is manual-only.
