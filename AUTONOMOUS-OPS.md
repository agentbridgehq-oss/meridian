# Meridian autonomous operations

**Live URL (always on):** https://meridian-production-2eb0.up.railway.app/

Closing PowerShell / Grok does **not** stop Railway. That URL is permanent.

## What runs autonomously (on Railway)

| Capability | How |
|------------|-----|
| Site + checkout (Stripe) | Live Express app; `STRIPE_SECRET_KEY` from your Railway keys |
| Proposal funnel | `/api/funnel` after consent |
| AI guide chat | Hamburger slide-out → `/api/guide-chat` |
| Daily OpenClaw | Progress leads, draft outreach (approve-only), deploy queue, **email brief** to `SUPPORT_NOTIFY_EMAIL` |
| Auto-deploy agents | Queue + `/api/ops/deploy-agent` → verify → customer guide |
| Onboarding | Start → proposal → **[you approve money]** → intake → verify → guide |

## What stays human (by design)

1. **Money decisions** — approve price / Stripe intent (`/api/ops/leads/:id/approve-money`)
2. **Approve cold outreach** — `approved_send` before any blast
3. **Customer attaches phone number** in Retell/Vapi after they get the connect guide
4. **Your strategy** — which niches to market this week

## Daily brief

- Written to `/data/brief-YYYY-MM-DD.md` on the server  
- Emailed if `RESEND_API_KEY` + `SUPPORT_NOTIFY_EMAIL` set  
- Fetch: `GET /api/ops/brief` with `Authorization: Bearer OPS_TOKEN`  
- Trigger: `POST /api/openclaw/run` (ops) or wait for daily auto interval  

## Pull up after closing this chat

| Access | URL / path |
|--------|------------|
| Public site | https://meridian-production-2eb0.up.railway.app/ |
| Desktop | `OPEN-MERIDIAN.bat` |
| Code | `C:\Users\hunte\Downloads\Meridian-Complete-Code` |
| Claude Code | Open folder `github-clones\meridian` |

## Stripe

Meridian Railway uses the same **STRIPE_SECRET_KEY** (and Resend) as your ClaudeCraft Railway project. Checkout paths:

- `/checkout/voice` · `/checkout/sales` · `/checkout/booking` · `/checkout/stack`
