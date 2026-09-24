# Meridian session sync ledger

GitHub is source of truth.

## Current pointer (2026-09-23)

- Working branch: `meridian-agency-2-0` — ElevenLabs Netlify preview shipped this session
- Protected: `master` @ `05a6bbcd`
- PR #2 open, mergeable=clean. Do not merge.
- Public black UI: https://meridian-open.netlify.app/
- Preview page added: `/voice.html` (live after Netlify redeploy of this branch)
- CI: idle on current head. Latest listed runs are 2026-09-05.

## Locked decision

**Runtime host is Railway. Always.** Netlify is the static front while Railway is gone. ElevenLabs on Netlify is preview TTS only — not the phone runtime.

Kenny: **Meridian front is fine for now.** Do not publish `/agency`, do not rebuild the site, do not switch hosts unless he explicitly asks.

Project: https://railway.com/project/3325e670-00e8-46e2-8d38-e1e4f77b8e66

## Blocker

Railway service gone. Phone voice is not live. ElevenLabs preview still needs `ELEVENLABS_API_KEY` in Netlify and a redeploy of `meridian-agency-2-0` onto `meridian-open`.

## Standing consent — permanent cross-chat continuity

Fetch on open. Commit before final. No merge to master. No secrets.

## 2026-09-23 — ElevenLabs preview on Netlify

- Added `netlify/functions` proxy for `/api/voice/preview|voices|status`.
- Added `public/voice.html` and `/agents/voice` rewrite.
- Mapped ara/eve/leo/rex to public ElevenLabs voice IDs.
- Set `VOICE_ENABLE_ELEVENLABS=1` on Netlify site `meridian-open`. No API key stored.
- Next: Kenny pastes ElevenLabs key into Netlify, redeploys this branch, then `/api/voice/status` must show `elevenlabs: true`.

## 2026-09-21 — open new chat in build

- Kenny asked to remember this session and open a new build chat.
- No product code changed. Wrote session memory + this ledger only.
- Extra branches present and untouched: `claude/meridian-voice-fixes`, `meridian-voice-smoke-once`.

## 2026-09-14 — calendar receptionist connector

- Starting head: `44c43f9`
- Added signed n8n calendar connector contract, docs, Realtime cancel/reschedule tools, optional voice calendar integration.
- Deployment state unchanged: Railway down. No staging phone call.

## 2026-09-14 — live URL correction

- Probed historic Railway URLs: 404.
- Probed Netlify fronts: Meridian, ClaudeCraft, GiantBite, SaberClaw, Operator Suite all 200.

## 2026-09-14 — pause Meridian front work

- Kenny locked: Meridian is fine for now.
- Next Meridian action is only on explicit ask: Railway recreate, or `/agency` publish of meridian-2.html.
