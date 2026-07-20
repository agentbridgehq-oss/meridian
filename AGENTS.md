# Meridian Agency

See [CLAUDE.md](./CLAUDE.md) and [DECISION.md](./DECISION.md).

**Public always-on URL:** https://meridian-production-2eb0.up.railway.app/

Deploy from this folder only: `railway up --detach`. Own Railway project — never merge under ClaudeCraft.

## Auto-deploy agents

```powershell
npm run deploy:agent -- --email a@b.com --name "Biz" --type full
npm run deploy:agent -- --remote --token $env:OPS_TOKEN --name "Biz" --type voice
npm run openclaw:deploy
```

Skill: `.claude/skills/deploy-meridian-agent` · Grok: `deploy-meridian-agent`
