# Meridian go-live — current checkpoint 2026-10-05 01:34 UTC

**Customer launch: NO-GO.** Netlify front `6ac2fe64cc0fa7500ffd2a0b` is live with the draft legal and contact pages. Railway did not redeploy: Actions run 37251822796 failed because GitHub secret `RAILWAY_TOKEN` is empty. Phone disclosure and SMS compliance are in git at `84fdc8e` and are not on the phone server yet.

## Previous checkpoint — 2026-10-05

**Customer launch: NO-GO.** The disclosure and SMS compliance copy is in `meridian-agency-2-0` and covered by `npm test` (220/220) plus `node scripts/launch-acceptance.mjs`. It is not on Railway or Netlify until Kenny approves a redeploy. A live phone call, SMS STOP/START/HELP, human transfer, and a real calendar booking are still unproven. Privacy/terms/contact in source are drafts, not an approved legal sign-off.

## Previous checkpoint — 2026-10-04

**Customer launch: NO-GO pending acceptance. Website/backend corrections are deployed.**

Tested product `23fd69ed5b8aca4b751a4ff30406984215bab071`: 213/213 tests; Railway `e48f1e19-abe1-464b-a8bd-72095ae46eeb` SUCCESS; Netlify `6ac2780a8b3b09cc5e4a3484` ready. Current xAI credentials are configured; `liveCallVerified:null`. Plan checkout routes reach Stripe; no payment or real call was executed. See latest MERIDIAN-SESSION-SYNC.md for verified evidence and remaining gates.

Required before customer activation: main-line routing and SMS callback, completed AI/recording/processing disclosure, real inbound/fallback call, verified package provisioning and customer calendar actions, remaining SMS controls, approved privacy/terms/DPA and dedicated contact. Owner must settle SLA, turnaround, guarantee and Rescue scope. Daily 03:30 Toronto owner decision brief is enabled; full business operation is not yet autonomous.

## Historical checkpoint — 2026-09-30

Ken authorised runtime restoration. Railway project and service now exist.

Runtime: https://meridian-production-4996.up.railway.app
Project: https://railway.com/project/1eb48be2-82d5-463e-8632-2ecf9f2175df

See [current connection and credential guide](docs/VOICE-GO-LIVE-2026-09-30.md).

HTTP 200 health and persistent storage are verified. Real phone voice remains unverified until credentials, SIP routing and a staging call pass. No master merge is authorised. Netlify stays the static front; Railway stays the phone runtime.

The older checklist below is historical. The former project is not accessible to the connected Railway account.

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
