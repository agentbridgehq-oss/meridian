# Meridian session sync ledger

GitHub is source of truth.

## Current pointer (2026-09-14)

- Working branch: `meridian-agency-2-0`
- Protected: `master` @ `05a6bbcd`
- PR #2 open. Do not merge.
- Public black UI: https://meridian-open.netlify.app/

## Locked decision

**Runtime host is Railway. Always.** Netlify is the static front while Railway is gone. Do not treat Netlify as the voice/runtime host.

Kenny: **Meridian front is fine for now.** Do not publish `/agency`, do not rebuild the site, do not switch hosts in this session.

Project: https://railway.com/project/3325e670-00e8-46e2-8d38-e1e4f77b8e66

## Blocker

Railway service gone. Voice is not live. Friday 2026-09-11 Railway plan has slipped.

## Standing consent — permanent cross-chat continuity

Fetch on open. Commit before final. No merge to master. No secrets.

## 2026-09-14 — calendar receptionist connector

- Starting head: `44c43f9`
- Added signed n8n calendar connector contract, docs, Realtime cancel/reschedule tools, optional voice calendar integration.
- Targeted tests pass locally for contract, deployment-core, realtime-tool-gateway, business-system-adapter.
- Deployment state unchanged: Railway down. No staging phone call.
- Next: recreate Railway per GO-LIVE.md, attach Google Calendar OAuth in n8n, verify one live book+cancel, then a Realtime staging call.

## 2026-09-14 — live URL correction

- Probed historic Railway URLs: 404.
- Probed Netlify fronts: Meridian, ClaudeCraft, GiantBite, SaberClaw, Operator Suite all 200.
- Rewrote LIVE-URLS.md and Ken-Live-Links.html to the working URLs.
- Grok project now mirrors `public/` + handoff docs for session continuity.

## 2026-09-14 — pause Meridian front work

- Kenny locked: Meridian is fine for now.
- Next Meridian action is only on explicit ask: Railway recreate, or `/agency` publish of meridian-2.html.
