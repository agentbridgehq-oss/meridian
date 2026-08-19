# Keep Meridian always accessible

## What is already permanent

| Layer | Status | Depends on your laptop? |
|-------|--------|-------------------------|
| **Railway production** | Live, `sleepApplication: false` | **No** |
| Public URL | https://meridian-production-915d.up.railway.app/ | **No** |
| Volume `/data` | Attached for leads/agents | **No** |
| Local `:8891` | Optional; Startup + watch task | Yes |

**If you never open PowerShell or Grok again, the public site still runs on Railway.**

Closing PowerShell, this chat, or the laptop **does not** take Meridian offline. Only deleting the Railway project, exhausting billing, or a failed redeploy can.

Canonical domain: `meridian-production-915d.up.railway.app`.  
Do **not** use `meridian-production-2eb0` — that hostname is unbound and returns Railway 404.

## What you must do (once / occasional)

1. **Keep Railway paid / trial valid**  
   Free tiers can sleep or stop if the workspace hits limits. Check https://railway.com/dashboard and billing for workspace **agentbridgehq-oss's Projects**.

2. **Do not delete the `meridian` project**  
   Dashboard: https://railway.com/project/3325e670-00e8-46e2-8d38-e1e4f77b8e66

3. **Optional but recommended — connect GitHub** (so deploys work without local CLI)  
   In Railway: Service → Settings → Source → connect repo + **master** branch. After that, push = redeploy.

4. **Save secrets outside this chat**  
   - Railway Variables (already has `OPS_TOKEN`, `PUBLIC_BASE_URL`, `DATA_DIR`)  
   - Confirm `PUBLIC_BASE_URL=https://meridian-production-915d.up.railway.app`  
   - Add when you need them: `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `MERIDIAN_WEBHOOK_URL`  
   - Local copy of `OPS_TOKEN`: `meridian\.env.railway` (gitignored)

5. **Bookmark the URL**  
   Phone, browser, notes — you do not need CLI to *use* the site.

## Claude Code — run / fix Meridian anytime

```text
cd C:\Users\hunte\github-clones\meridian
```

Claude Code will read `CLAUDE.md` in this folder.

```powershell
railway login          # once per machine if not logged in
railway status
railway up --detach -m "your change"
railway logs --lines 100
```

Same folder works in Grok Build. Railway plugin optional for MCP tools.

## You do NOT need

- This Grok session open  
- PowerShell open all day  
- Laptop on for customers to reach Meridian  

Laptop auto-start is only for **localhost:8891** development.
