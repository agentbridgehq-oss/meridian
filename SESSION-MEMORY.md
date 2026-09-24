# Session memory — Meridian Agency full chat (2026-07-19)

**Keep this chat/context permanent.** Resume with: “pull up Meridian”, “Meridian ads”, “live urls”, “know me”.

## Current vs stale (read this first)

As of 2026-09-23, PR #2 on `meridian-agency-2-0` is still the live build track. Product head now includes ElevenLabs Netlify preview functions. Railway remains down.

- Voice stack in PR #2 = PSTN → Twilio Elastic SIP → OpenAI Realtime (`gpt-realtime-2.1`) → Meridian tools. Browser demo = mic → WebRTC → Realtime.
- Website Play can use ElevenLabs via Netlify Functions when `VOICE_ENABLE_ELEVENLABS=1` + `ELEVENLABS_API_KEY` are set. That is preview only.
- Railway production is **DOWN**. Do not paste `*.up.railway.app` as live.
- Public fronts that answered 200: Meridian Netlify, ClaudeCraft Netlify, GiantBite Netlify, SaberClaw Netlify, Operator Suite Netlify. See `LIVE-URLS.md`.
- Older locked bullets below (Retell/Vapi, “24/7 Railway”) are historical. When they conflict with PR #2 + GO-LIVE.md + LIVE-URLS.md + ELEVENLABS-PREVIEW.md, the new files win until Kenny re-locks.

## 2026-09-23 session — ElevenLabs preview path

- Kenny asked for the live front + ElevenLabs API + a free GitHub/open-source host.
- Verdict locked: GitHub Pages cannot host ElevenLabs. Netlify Functions can.
- Shipped on `meridian-agency-2-0`: `netlify/functions/*`, `netlify.toml`, `public/voice.html`, `public/_redirects`, voice-id mapping in `lib/elevenlabs.mjs`, `ELEVENLABS-PREVIEW.md`.
- Set Netlify env `VOICE_ENABLE_ELEVENLABS=1` on site `meridian-open`. Did **not** store an API key.
- Still required from Kenny: paste `ELEVENLABS_API_KEY` into Netlify secrets and redeploy this branch to `meridian-open`.
- Still not a phone product. Railway + Twilio + a real call remain the go-live gate.

## 2026-09-21 session — switch to new build chat

- Kenny closed this Grok thread and opened a new chat in build.
- No product files, no deploy, no merge. Repo already current @ `317690be`.
- Standing continuity still applies: next build chat reconstructs from GitHub (`AGENTS.md`, this file, `MERIDIAN-SESSION-SYNC.md`, `GO-LIVE.md`, PR #2), not from chat memory.
- Operator Suite remains a separate track: $97 CAD official store LOCKED; do not mix sales deploy work into Meridian build unless Kenny names both.
- Next Meridian action stays explicit-ask only: recreate Railway per GO-LIVE.md, or publish `/agency` of meridian-2.html.

## 2026-09-14 session — calendar receptionist connector

- Did not clone the TikTok n8n voice graph into Meridian. Voice stays PSTN → Twilio SIP → OpenAI Realtime.
- Shipped the customer-system half: signed n8n calendar connector docs/workflow + Realtime cancel/reschedule tools.
- Voice deployments get optional `calendar`. Tools stay hidden until the adapter is verified and the runtime secret exists.
- Optional calendar does not block voice activation.
- Still not live: Railway, Twilio staging DID, and a real book-on-call proof.

## 2026-09-14 session — Grok project snapshot + live fronts

- Starting head was `44c43f9`. Live-URL file rewrite committed first.
- CashFlow receptionist graph: use as n8n calendar connector spec, not a Vapi import.
- Project folder now holds a snapshot of `public/` plus handoff docs under the Grok artifacts project.
- `claudecraft.ca` 404. Use https://claudecraft-hq.netlify.app/
- Operator Suite official: https://the-operator-suite.netlify.app/
- **Kenny lock:** Meridian is fine for now. Do not publish `/agency` or rebuild the front until he asks.

## 2026-09-05 session — permanent GitHub continuity

- Kenny authorized a standing rule: every Meridian session starts by checking current GitHub state and ends by committing all completed, verified work plus the durable handoff before the final response.
- Clearing a conversation or opening a new chat is expected. The next agent reconstructs state from `AGENTS.md`, `MERIDIAN-SESSION-SYNC.md`, `SESSION-MEMORY.md`, `GO-LIVE.md`, PR #2, and the latest branch commits—not from chat memory.
- This standing authorization does not permit a merge to `master`, a Railway change, a CI-trigger change, or committing secrets/customer data.

## Product decisions locked

- Meridian = **own agency** on Railway (service currently missing — see GO-LIVE.md). Netlify `meridian-open` is the public black UI until Railway returns.
- Front is good enough for now (Kenny, 2026-09-14).
- Not under ClaudeCraft in **product architecture**
- Current voice path = OpenAI Realtime + Twilio SIP (PR #2). Retell/Vapi is historical.
- Website preview TTS may use ElevenLabs on Netlify when armed.
- 24/7 target: Railway. Not live until the service exists again.

## Repo / deploy

- GitHub: `https://github.com/agentbridgehq-oss/meridian`
- Working branch: `meridian-agency-2-0`
- PR: https://github.com/agentbridgehq-oss/meridian/pull/2
- Public UI now: https://meridian-open.netlify.app/
- Preview page: https://meridian-open.netlify.app/voice.html
- Go-live: `GO-LIVE.md`
- ElevenLabs preview: `ELEVENLABS-PREVIEW.md`

## Skills created/used

- `meridian-session-sync` — Grok fetch-on-open / commit-on-close
