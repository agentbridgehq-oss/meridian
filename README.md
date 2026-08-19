# Meridian Agency

**Independent AI agency** — Voice, Sales, and Booking agents for local business.

## Placement (locked)

| Put here? | Product | Why |
|-----------|---------|-----|
| **YES** | **Meridian** (this repo) | Agency GTM: kits + DFY installs for missed calls / dead leads / calendar |
| No | ClaudeCraft | Skills + courses only |
| No | SaberClaw | Builder embeddable agents / API SaaS — different ICP |
| No | AgentBridge | Session continuity between AI tools — different job |

See [DECISION.md](./DECISION.md).

## Stack

| Path | Purpose |
|------|---------|
| `/` | Sales site + consent proposal funnel |
| `/intake/:token` | Client intake → provisions agent API (`mdn_*`) |
| `/ops` | Ops dashboard (`OPS_TOKEN`) |
| `/checkout/voice\|sales\|booking\|stack` | Stripe kits ($497 / $997) |
| `/api/funnel` | Lead → proposal |
| `/api/v1/agents/:id/*` | Client agent API |
| `/health` | Health + funnel stats |

**Delivery:** Resend and/or `MERIDIAN_WEBHOOK_URL`.  
**OpenClaw:** daily progression; cold outreach is **approve-only** (CASL).

## Local

```powershell
cd C:\Users\hunte\github-clones\meridian
copy .env.example .env
npm install
npm start
# http://localhost:8891
```

## Deploy (live)

| | |
|--|--|
| **URL** | https://meridian-production-915d.up.railway.app |
| **Project** | Railway `meridian` (own project — not ClaudeCraft) |
| **Health** | https://meridian-production-915d.up.railway.app/health |
| **Volume** | `/data` (`DATA_DIR=/data`) |
| **Secrets** | Local `.env.railway` (gitignored) has `OPS_TOKEN` |

Canonical public domain is `915d`. `meridian-production-2eb0` is unbound (Railway 404) — do not use it.

Redeploy from this directory:

```powershell
cd C:\Users\hunte\github-clones\meridian
railway up --detach -m "update"
```

Optional env (Railway dashboard or `railway variable set`):
`RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `MERIDIAN_WEBHOOK_URL`, `EMAIL_FROM`.

## Port map

| Product | Default |
|---------|---------|
| Meridian | **8891** |
| Central Command | 8890 |
| ClaudeCraft | its deploy |

## Compliance

- Funnel requires consent.
- Outreach needs `approved_send` before send.
- Never auto cold-blast.
