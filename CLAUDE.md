# Meridian Agency — Claude Code / Grok handoff

Independent AI agency (Voice, Sales, Booking). **Not** ClaudeCraft, SaberClaw, or AgentBridge.

## Same project for Claude Code + Grok + Railway

| Layer | Location |
|-------|----------|
| **Code (only copy)** | `C:\Users\hunte\github-clones\meridian` |
| **Claude Code memory** | `C:\Users\hunte\.claude\projects\C--Users-hunte-github-clones-meridian\memory\` |
| **Pull phrases** | `pull meridian` · `/pull-last-session meridian` |
| **Live handoff URL** | https://meridian-production-2eb0.up.railway.app/for-claude |
| **Claude Agent API** | https://meridian-production-2eb0.up.railway.app/api/brain/status · `CLAUDE-AGENT-API.md` |

Open Claude Code **from this folder** so the session attaches to the Meridian project:

```powershell
cd C:\Users\hunte\github-clones\meridian
claude
```

## Permanent public URL (always use this for “is it live?”)

https://meridian-production-2eb0.up.railway.app/

| | |
|--|--|
| Health | https://meridian-production-2eb0.up.railway.app/health |
| Ops | https://meridian-production-2eb0.up.railway.app/ops |
| Railway project | `meridian` (linked in this directory) |
| Dashboard | https://railway.com/project/3325e670-00e8-46e2-8d38-e1e4f77b8e66 |

## Local (optional — laptop only)

```powershell
cd C:\Users\hunte\github-clones\meridian
.\start-meridian.ps1
# http://localhost:8891
```

Startup shortcut + `MeridianAgency-Watch` task keep local up after login. **Public traffic does not depend on the laptop.**

## Deploy / operate from Claude Code or Grok

```powershell
cd C:\Users\hunte\github-clones\meridian
railway whoami
railway status
railway up --detach -m "describe change"
railway logs --lines 100
railway variable list
railway domain list
```

Requires: Railway CLI logged in (`railway login`) as the same account (agentbridgehq@gmail.com).

Optional: Railway plugin / MCP (`https://mcp.railway.com`) for dashboard-style ops.

## Env (set on Railway, not only local)

| Variable | Required for |
|----------|----------------|
| `PUBLIC_BASE_URL` | Correct intake/proposal links (already set to Railway URL) |
| `OPS_TOKEN` | `/ops` + admin APIs |
| `DATA_DIR=/data` | Leads on volume |
| `RESEND_API_KEY` | Proposal/connect emails |
| `STRIPE_SECRET_KEY` | Checkout + usage packs/subs |
| `ANTHROPIC_API_KEY` | **Claude Agent API** brain (required for real chat) |
| `MERIDIAN_LLM_MODEL` | Optional Claude model override |
| `XAI_API_KEY` | Premium hosted TTS (server-only) |
| `VOICE_CENTS_PER_TURN` | Customer per-turn list price (default 55) |
| See `USAGE-BILLING.md` | Pay-as-you-go + subscription ROI model |
| `MERIDIAN_WEBHOOK_URL` | Dual delivery webhooks |

Local secrets: `.env` or `.env.railway` (gitignored). Never commit keys.

## Voice pipeline (ElevenLabs optional)

```
transcript → Meridian brain → TTS (platform default OR ElevenLabs if key set)
```

| Env | Effect |
|-----|--------|
| `XAI_API_KEY` set | Hosted xAI TTS + live voice catalog + free previews |
| No `XAI_API_KEY` | Catalog still shown (fallback); hosted audio/previews off; phone uses platform TTS |
| `VOICE_ENABLE_ELEVENLABS=1` + key | ElevenLabs plug-in instead of / alongside xAI |

**Full voice picker:** setup wizard step · intake select · `GET /api/voice/voices` ·
`POST /api/voice/preview` · `PUT /api/v1/agents/:id/voice` → saves `config.xaiVoiceId`.

**Product edge (2026 competitive pack):** see `PRODUCT-EDGE.md`
- Truth layer + knowledge scrape · interaction log · owner alerts (email/SMS)
- Unified turn pipeline · health probes · `/status` · `/security` · `/dashboard`
- Call-ended summary · missed-call SMS · emergency transfer signals

```http
GET  /api/status                    # public platform status
GET  /api/voice/status
GET  /api/voice/voices
POST /api/voice/preview
POST /api/v1/agents/:id/voice-turn
POST /api/v1/agents/:id/speak
GET  /api/v1/agents/:id/dashboard
PUT  /api/v1/agents/:id/knowledge
POST /api/v1/agents/:id/call-ended
POST /api/v1/agents/:id/missed-call
POST /api/v1/agents/:id/health
PUT  /api/v1/agents/:id/voice
```

## Autonomous onboarding (start → sale)

Almost fully autonomous. **Money is the only hard human gate — and a customer
paying via Stripe IS the money decision**, so the public path needs zero humans.

```
consent funnel → proposal → [YOU approve money OR customer pays Stripe] → intake → provision
  → must-work verify (required) → customer API/webhook guide → ready to sell
```

### Seamless chat path (added 2026-07-19)

The site guide agent (`lib/guide-chat.mjs`, stateful via `state` round-trip on
`POST /api/guide-chat`) runs a full discovery call in chat: need → business →
industry → hours → services → email → explicit consent → shows THE WORK + THE
PRICE → Accept/decline. Details save to the lead as `chatIntake`. On Stripe
payment (`/api/stripe/webhook` or the `/api/checkout/confirm` success redirect),
the server AUTO-PROVISIONS from `chatIntake` — client goes payment → live
connect guide, no intake form. Leads without `chatIntake` still get intake.
UI: `public/js/meridian-chat.js` — docked open composer bar + slide-out drawer
with action chips (additive; site design untouched).

### Website widget (get the agent onto customer sites)

- Agents carry a public `widgetToken` (`mdnw_…`, safe for web pages; secret
  `mdn_` key never goes client-side). Backfill: `ensureWidgetToken(agentId)`.
- `POST /api/v1/agents/:id/widget-chat` — CORS + rate-limited (20/min/IP).
- `GET /widget.js` — one-line embed, branded chat bubble on any customer site.
- Guide extras (delivery-token-gated): `/guide/:token/widget.txt`,
  `/guide/:token/retell.json`, `/guide/:token/vapi.json`.

### Autopilot (hourly; `MERIDIAN_AUTOPILOT=0` disables)

`lib/autopilot.mjs`: re-verifies live agents (webhook on failure), drains deploy
queue, drafts money-gate follow-ups (approve-gated, never auto-sent), re-sends
intake links to paid-but-stalled customers. Ops: `POST /api/ops/autopilot/run`,
`GET /api/ops/autopilot/last`. Extra env: `STRIPE_WEBHOOK_SECRET` (optional —
signature-verified webhooks; without it the success-redirect confirm still works).

```powershell
# Stop at money gate
npm run onboard -- --email a@b.com --name "Acme" --type full

# After money approved + auto intake fields → verified guide
npm run onboard -- --email a@b.com --name "Acme" --approve-money --hours "Mon-Fri 9-5" --services "HVAC"
```

Ops API:
- `POST /api/ops/onboard` — full pipeline  
- `POST /api/ops/leads/:id/approve-money` — human money decision  
- Customer guide: `GET /guide/:deliveryToken`  

**Must-work:** agent is not `readyToSell` / `delivered` unless smoke tests pass (hours, booking, price, greeting, auth).

## Auto-deploy agents (Claude Code / OpenClaw / Grok)

```powershell
cd C:\Users\hunte\github-clones\meridian
npm run deploy:agent -- --email client@biz.com --name "Acme HVAC" --type full
npm run deploy:agent -- --config deploy/examples/hvac-full.json
npm run openclaw:deploy   # drains data/deploy-queue.json
```

Live API (needs `OPS_TOKEN`):

```http
POST /api/ops/deploy-agent
Authorization: Bearer <OPS_TOKEN>
{"email":"...","businessName":"...","primaryNeed":"full"}
```

Skill: `.claude/skills/deploy-meridian-agent/SKILL.md`  
Artifacts: `data/deploys/*` (secrets — do not commit)

## Do not

- Attach this app to ClaudeCraft / SaberClaw / AgentBridge Railway projects
- Auto cold-email without `approved_send`
- Claim Meridian is part of ClaudeCraft
- Require ElevenLabs for voice to “work”
- Commit `connection.secret.json` or raw `mdn_` keys

## Stack

- `server.mjs` + `engine.mjs` + `public/*` + `kits/*`
- Port: Railway injects `PORT` (domain targets 8080)
- Start: `npm start` via `railway.toml`
