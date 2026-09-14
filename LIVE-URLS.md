# Ken — live product URLs

**Updated:** 2026-09-14
**Rule:** GitHub + this file beat chat memory. Probe before calling a host live.

Railway production for Meridian, SaberClaw, GiantBite, and AgentBridge is **down** (Application not found). Do not paste `*.up.railway.app` as live.

## Clickable fronts (HTTP 200 on 2026-09-14)

### Live URLs
- [Meridian black storefront](https://meridian-open.netlify.app/)
- [Meridian agents](https://meridian-open.netlify.app/agents.html)
- [Meridian letter / why-agents](https://meridian-open.netlify.app/why-agents.html)
- [ClaudeCraft](https://claudecraft-hq.netlify.app/)
- [GiantBiteAI](https://giantbite-ai.netlify.app/)
- [SaberClaw](https://saberclaw-app.netlify.app/)
- [The Operator Suite](https://the-operator-suite.netlify.app/)

### Source of truth
- Meridian code: [agentbridgehq-oss/meridian](https://github.com/agentbridgehq-oss/meridian) branch `meridian-agency-2-0`
- Agency black UI file: [public/meridian-2.html](https://github.com/agentbridgehq-oss/meridian/blob/meridian-agency-2-0/public/meridian-2.html) — not yet on the Netlify deploy (Netlify still serves the kit storefront as `/`)
- Operator Suite official store only: https://the-operator-suite.netlify.app/ — do not send buyers to Manus / $47

### Dead — do not use
- https://meridian-production-915d.up.railway.app/
- https://meridian-production-2eb0.up.railway.app/
- https://claudecraft.ca/ (404 as of 2026-09-14)
- https://saberclaw-production.up.railway.app/
- https://giantbiteai-production.up.railway.app/
- https://agentbridge-final-production.up.railway.app/
