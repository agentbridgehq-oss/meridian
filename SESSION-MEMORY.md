# Session memory — Meridian Agency full chat (2026-07-19)

**Keep this chat/context permanent.** Resume with: “pull up Meridian”, “Meridian ads”, “live urls”, “know me”.

## Current vs stale (read this first)

As of 2026-09-14, PR #2 on `meridian-agency-2-0` is the live build track.

- Voice stack in PR #2 = PSTN → Twilio Elastic SIP → OpenAI Realtime (`gpt-realtime-2.1`) → Meridian tools. Browser demo = mic → WebRTC → Realtime.
- Railway production is **DOWN**. Do not paste `*.up.railway.app` as live.
- Public fronts that answered 200: Meridian Netlify, ClaudeCraft Netlify, GiantBite Netlify, SaberClaw Netlify, Operator Suite Netlify. See `LIVE-URLS.md`.
- Older locked bullets below (Retell/Vapi, “24/7 Railway”) are historical. When they conflict with PR #2 + GO-LIVE.md + LIVE-URLS.md, the new files win until Kenny re-locks.

## 2026-09-14 session — Grok project snapshot + live fronts

- Starting head was `44c43f9`. Live-URL file rewrite committed first.
- CashFlow receptionist graph: use as n8n calendar connector spec, not a Vapi import.
- Project folder now holds a snapshot of `public/` plus handoff docs under the Grok artifacts project.
- `claudecraft.ca` 404. Use https://claudecraft-hq.netlify.app/
- Operator Suite official: https://the-operator-suite.netlify.app/
- Next: either publish `meridian-2.html` onto meridian-open Netlify, or recreate Railway per GO-LIVE.md.

## 2026-09-05 session — permanent GitHub continuity

- Kenny authorized a standing rule: every Meridian session starts by checking current GitHub state and ends by committing all completed, verified work plus the durable handoff before the final response.
- Clearing a conversation or opening a new chat is expected. The next agent reconstructs state from `AGENTS.md`, `MERIDIAN-SESSION-SYNC.md`, `SESSION-MEMORY.md`, `GO-LIVE.md`, PR #2, and the latest branch commits—not from chat memory.
- This standing authorization does not permit a merge to `master`, a Railway change, a CI-trigger change, or committing secrets/customer data.

## Product decisions locked

- Meridian = **own agency** on Railway (service currently missing — see GO-LIVE.md). Netlify `meridian-open` is the public black UI until Railway returns.
- Not under ClaudeCraft in **product architecture**
- Current voice path = OpenAI Realtime + Twilio SIP (PR #2). Retell/Vapi is historical.
- 24/7 target: Railway. Not live until the service exists again.

## Repo / deploy

- GitHub: `https://github.com/agentbridgehq-oss/meridian`
- Working branch: `meridian-agency-2-0`
- PR: https://github.com/agentbridgehq-oss/meridian/pull/2
- Public UI now: https://meridian-open.netlify.app/
- Go-live: `GO-LIVE.md`

## Skills created/used

- `meridian-session-sync` — Grok fetch-on-open / commit-on-close
