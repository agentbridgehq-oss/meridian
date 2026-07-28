# Meridian n8n

| Workflow | Purpose |
|----------|---------|
| `meridian-premium-voice-agent.json` | Webhook voice turn → Meridian PAYG voice-turn (required for phone/CRM glue) |
| `meridian-ops-daily.json` | Daily containment + OpenClaw daily-ops + health probe |

Customer Full Auto install packs also **generate** n8n JSON per agent (`/api/setup/:token/n8n.json`).

Skill: `meridian-premium-voice` · Policy: `openclaw/CONTAINMENT.md`
