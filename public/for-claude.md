# Meridian Agency — Claude Code handoff (live)

**Paste this URL into Claude Code and say: “Load this handoff and work on Meridian.”**

Live handoff (always current): https://meridian-production-2eb0.up.railway.app/for-claude  
JSON status: https://meridian-production-2eb0.up.railway.app/api/handoff  
Site: https://meridian-production-2eb0.up.railway.app/

---

## What Meridian is

Independent AI **agency** product (Voice, Sales, Booking agents for local business).  
**Not** ClaudeCraft / SaberClaw / AgentBridge. Own brand, billing, data, Railway deploy.

## Live URLs

| Page | URL |
|------|-----|
| Home | https://meridian-production-2eb0.up.railway.app/ |
| Why agents | https://meridian-production-2eb0.up.railway.app/why-agents |
| Ops | https://meridian-production-2eb0.up.railway.app/ops |
| Health | https://meridian-production-2eb0.up.railway.app/health |
| Voice pricing API | https://meridian-production-2eb0.up.railway.app/api/pricing/voice |

## Local code (Windows — Ken)

```
C:\Users\hunte\github-clones\meridian
```

Key files: `server.mjs`, `engine.mjs`, `lib/`, `public/index.html`, `USAGE-BILLING.md`, `CLAUDE.md`, `AUTONOMOUS-OPS.md`

## Deploy

```powershell
cd C:\Users\hunte\github-clones\meridian
railway up --detach -m "your message"
```

Railway project: **meridian** · public domain port **8080** · volume **`/data`**.  
Do **not** delete the Railway project. Closing laptop does **not** take the site offline.

## Agents (product)

1. **Voice** — 24/7 receptionist  
2. **Sales** — lead follow-up  
3. **Booking** — calendar / no-shows  

Install order: Booking → Sales → Voice.

## Voice / TTS

- Default phone path: **platform** (Retell / Vapi / Bland) — customer speaks platform voice  
- Premium hosted: **xAI TTS** when `XAI_API_KEY` set + request `{ "audio": true }`  
- Metered billing: prepaid packs + subscription (see `USAGE-BILLING.md`)  
- Empty balance → **402** · no unpaid xAI calls · charge only after successful audio  

Checkout packs: `/checkout/voice-pack/starter|growth|scale`  
Subs: `/checkout/voice-sub` ($197/mo) · `/checkout/voice-pro` ($497/mo)

## Hard policies

- No fake social proof / invented customer counts  
- No patent claims  
- CASL — no spam; consent for outreach  
- Free tier guest OK elsewhere; Meridian kits are paid products  
- Confirm before destructive git / Railway delete / live billing experiments  

## Portable full stack handoff (all Ken products)

Local file: `C:\Users\hunte\AGENT_HANDOFF_GROK_CLAUDE.md`  
Grok master memory: `C:\Users\hunte\.grok\memory\ALL_APPS_URLS_AGENTS_OPS.md`

## Say this in Claude Code

> Open https://meridian-production-2eb0.up.railway.app/for-claude and use it as source of truth for Meridian. Work in `C:\Users\hunte\github-clones\meridian`. Keep Railway live.
