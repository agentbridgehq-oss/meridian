# Ken — ALL apps, URLs, agents & operations (Grok CLI permanent memory)

**Updated:** 2026-07-19  
**Owner:** Ken (hunter) · Agent Bridge Technologies Inc. (Ontario)  
**Workspace:** `C:\Users\hunte`  
**GitHub org:** `agentbridgehq-oss` · **Deploy:** Railway  

**Resume phrases:** `know me`, `all apps`, `live urls`, `pull up Meridian`, `projects`, `/projects`

Grok CLI **must load this file** for future sessions. Do not invent URLs or claim apps offline without checking.

### How Grok CLI keeps this forever

| Layer | Path / setting | Role |
|-------|----------------|------|
| Global MEMORY | `~/.grok/memory/MEMORY.md` | Indexed first-turn injection |
| Master detail | **this file** | Full apps / URLs / agents / ops |
| Global rules | `~/.grok/AGENTS.md` | Loaded every session |
| Config | `[memory] enabled = true` in `~/.grok/config.toml` | Memory system on |
| Skill | `know-me` | Manual full reload |
| Handoff | `AGENT_HANDOFF_GROK_CLAUDE.md` | Portable Grok/Claude |

Copies also: home `ALL_APPS_URLS_AGENTS_OPS.md`, `Downloads\`, `github-clones\meridian\`.

---

## Hard policies (all products)

1. **No fake social proof** / invented customer counts  
2. **No patent / patent-pending claims** (especially AgentBridge)  
3. **CASL / never spam** — funnel consent; cold outreach `approved_send` only  
4. **Free tiers:** guest OK; email optional for free access  
5. **Confirm** before destructive git/Railway/billing ops  
6. **Grok TUI links often not clickable** — use `live-links` skill / Desktop `OPEN-MERIDIAN.bat` / `Start-Process`  
7. **End every completion** with Live URLs footer (Meridian first when relevant)  
8. **xAI billing:** prefer auto top-up OFF + invoiced spend $0; credits at https://console.x.ai/team/default/billing/credits  
9. **Grok always-approve:** Ken prefers `permission_mode = "default"` (not always-approve)

---

## Master product table

| App | Live URL | Local path | Railway / notes |
|-----|----------|------------|-----------------|
| **Meridian Agency** | https://meridian-production-2eb0.up.railway.app/ | `C:\Users\hunte\github-clones\meridian` | Project `meridian` · **24/7 cloud** · local `:8891` optional |
| **ClaudeCraft** | https://claudecraft.ca/ | `github-clones\claudecraft` + `claudecraft-standalone` | Skills, courses, Resend source of truth |
| **From Built to Bought** | https://claudecraft.ca/from-built-to-bought.html | same CC repo | Premium cream/serif sales page |
| **Central Command** | https://ultra-command-center-production.up.railway.app/ | `C:\Users\hunte\AgentOS` | AgentOS · `launch-agentos.ps1` · port 8890 local |
| **AgentBridge** | https://agentbridge-final-production.up.railway.app/ | `C:\Users\hunte\agentbridge-final` | Session continuity · **no patents** · agentbridge.ca DNS TBD |
| **SaberClaw** | https://saberclaw-production.up.railway.app/ | `C:\Users\hunte\saberclaw-app` | Embeddable agents SaaS · saberclaw.com may park |
| **GiantBiteAI** | https://giantbiteai-production.up.railway.app/ | `C:\Users\hunte\giantbiteai` | Cooking freemium · Stripe plans |

### Secondary / related

| Item | Path / URL |
|------|------------|
| Portfolio OpenClaw products | `C:\Users\hunte\CENTRAL-COMMAND\openclaw-portfolio\products.json` |
| Portable handoff | `C:\Users\hunte\AGENT_HANDOFF_GROK_CLAUDE.md` |
| Meridian complete code pack | `Downloads\Meridian-Complete-Code` + `.zip` |
| Desktop openers | `OPEN-MERIDIAN.bat`, `Ken-Live-Links.html`, `MERIDIAN-24-7.txt` |

---

## Meridian Agency (deep)

### URLs
- Home: https://meridian-production-2eb0.up.railway.app/
- Why agents: https://meridian-production-2eb0.up.railway.app/why-agents
- Ops: https://meridian-production-2eb0.up.railway.app/ops
- Health: https://meridian-production-2eb0.up.railway.app/health
- Guide (per customer token): `/guide/:token`
- Checkout: `/checkout/voice|sales|booking|stack`

### Agents (product)
1. **Voice** — 24/7 receptionist (platform TTS: Retell/Vapi/Bland)  
2. **Sales** — lead follow-up &lt; 1 min  
3. **Booking** — calendar / no-show recovery  
Install order: Booking → Sales → Voice  

### Ops / APIs
| Action | How |
|--------|-----|
| Guide chat (site AI) | `POST /api/guide-chat` · hamburger UI |
| Funnel | `POST /api/funnel` (consent) → proposal → awaiting_money |
| Approve money | `POST /api/ops/leads/:id/approve-money` + OPS_TOKEN |
| Full onboard | `npm run onboard` / `POST /api/ops/onboard` |
| Deploy agent | `npm run deploy:agent` / `POST /api/ops/deploy-agent` |
| OpenClaw daily | `npm run openclaw` · auto queue deploy · email brief |
| OpenClaw deploy queue | `data/deploy-queue.json` · `npm run openclaw:deploy` |
| Daily brief | `GET /api/ops/brief` · `data/brief-YYYY-MM-DD.md` |
| Must-work verify | Required before readyToSell / delivered |

### Railway env (Meridian) — names only
`STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_NOTIFY_EMAIL`, `OPS_TOKEN`, `PUBLIC_BASE_URL`, `DATA_DIR=/data`, `MERIDIAN_OPENCLAW_AUTO=1`, `VOICE_ENABLE_ELEVENLABS=0`

### Human gates only
Money approval · cold outreach approve · customer attaches phone in Retell/Vapi  

### Skills
- `deploy-meridian-agent`  
- `live-links`  
- `premium-video-ads`  
- Repo: `.claude/skills/deploy-meridian-agent`

---

## Other apps — agent / ops notes

### Central Command (AgentOS)
- Live HUD/command center  
- Contained OpenClaw (sandbox, no bank secrets, no --deliver abuse)  
- Local: `C:\Users\hunte\AgentOS` · `.\launch-agentos.ps1` · often port **8890**

### ClaudeCraft
- Digital products + launch course FBTB  
- Resend keys often sourced from CC Railway for other apps  
- Do not re-host Meridian agency under CC

### AgentBridge
- Continuity / pairing between AI tools  
- Never claim patents  
- Market Railway URL until agentbridge.ca DNS works

### SaberClaw
- Embeddable specialized agents, free + paid tiers  
- Guest/optional email free access policy  
- Prefer Railway URL if saberclaw.com parks

### GiantBiteAI
- Recipe/meal freemium · Stripe Regular/Pro  
- Use stripe-pricing-check skill when touching pricing

---

## Grok CLI skills (user) — permanent kit

| Skill | Path |
|-------|------|
| know-me | `~/.grok/skills/know-me` |
| live-links | `~/.grok/skills/live-links` |
| deploy-meridian-agent | `~/.grok/skills/deploy-meridian-agent` |
| premium-video-ads | `~/.grok/skills/premium-video-ads` |
| security, self-heal, researcher, projects, etc. | `~/.grok/skills/*` |

### Plugins enabled (config)
railway, frontend-design, feature-dev, code-review, code-simplifier, commit-commands, hookify, github, playwright, context7, linear, hyperframes  

---

## Video ads (permanent pipeline)

See `video_ads_voiceover_pipeline.md`:
- Multi-shot image_to_video + ffmpeg  
- **edge-tts** neural VO (Ava/Andrew) — never Windows robot SAPI for ads  
- TikTok: `Downloads\Meridian ad video.mp4` 9:16 1080x1920  
- VO must cover full video length  

---

## Always-on rules

| Layer | Survives laptop/PowerShell close? |
|-------|-----------------------------------|
| Railway public apps | **YES** |
| Local Meridian :8891 | Only while PC on (Startup + Watch task) |
| This Grok chat | No — use memory files below |

---

## Related memory files (load order for know-me)

1. `ALL_APPS_URLS_AGENTS_OPS.md` ← **this file**  
2. `session_2026-07-19_meridian_full_chat.md`  
3. `video_ads_voiceover_pipeline.md`  
4. `live_product_urls.md`  
5. `permanent_always_on.md`  
6. `AGENT_HANDOFF_GROK_CLAUDE.md`  

---

## Footer template (every Grok completion)

### Live URLs
- Meridian: https://meridian-production-2eb0.up.railway.app/
- Central Command: https://ultra-command-center-production.up.railway.app/
- ClaudeCraft: https://claudecraft.ca/
- From Built to Bought: https://claudecraft.ca/from-built-to-bought.html
- AgentBridge: https://agentbridge-final-production.up.railway.app/
- SaberClaw: https://saberclaw-production.up.railway.app/
- GiantBiteAI: https://giantbiteai-production.up.railway.app/
