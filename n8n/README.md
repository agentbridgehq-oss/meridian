# Meridian n8n

| Workflow | Purpose |
|----------|---------|
| `meridian-premium-voice-agent.json` | Webhook voice turn → Meridian PAYG voice-turn (required for phone/CRM glue) |
| `CALENDAR-RECEPTIONIST.md` | Contract for a signed calendar connector; no importable Google Calendar workflow is committed yet |
| `meridian-ops-daily.json` | Daily containment + OpenClaw daily-ops + health probe |

Calendar receptionist install: `n8n/CALENDAR-RECEPTIONIST.md`.

Customer Full Auto install packs also **generate** n8n JSON per agent (`/api/setup/:token/n8n.json`).

Skill: `meridian-premium-voice` · Policy: `openclaw/CONTAINMENT.md`
