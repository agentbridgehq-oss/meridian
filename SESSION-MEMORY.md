# Session memory — Meridian Agency full chat (2026-07-19)

**Keep this chat/context permanent.** Resume with: “pull up Meridian”, “Meridian ads”, “live urls”, “know me”.

## Current vs stale (read this first)

As of 2026-09-05, PR #2 on `meridian-agency-2-0` is the live build track.

- Voice stack in PR #2 = PSTN → Twilio Elastic SIP → OpenAI Realtime (`gpt-realtime-2.1`) → Meridian tools. Browser demo = mic → WebRTC → Realtime.
- Railway production is **not proven live** for this branch. Do not treat the Railway URL below as evidence that 2.0 voice works.
- Older locked bullets below (Retell/Vapi, “24/7 Railway”) are historical. When they conflict with PR #2, PR #2 wins until Kenny re-locks.

## 2026-09-05 session — Grok sync skill

- Fake-follower product idea scrapped.
- Standing rule: every Meridian session starts with a GitHub pull; every close commits work to `meridian-agency-2-0`.
- Skill on Grok: `meridian-session-sync`.
- Ledger file: `MERIDIAN-SESSION-SYNC.md`.
- CI stays manual-only. No merge to `master` without explicit order.
- Next work: Railway + Twilio staging phone call, not more agency features.

## Product decisions locked

- Meridian = **own agency** on Railway: https://meridian-production-2eb0.up.railway.app/
- Not under ClaudeCraft in **product architecture** (UI no longer says “not ClaudeCraft”)
- Voice pipeline = **platform-only** (Retell/Vapi); ElevenLabs optional, off
- Stripe + Resend copied from ClaudeCraft Railway → Meridian
- Autonomous onboard: money human-gated; must-work verify before sellable; customer API/webhook guide
- Auto-deploy: CLI / OpenClaw queue / `POST /api/ops/deploy-agent`
- AI guide chat: hamburger slide-out → `/api/guide-chat`
- 24/7: **Railway** (laptop off). Local: Startup + MeridianAgency-Watch on login
- Code pack: `Downloads\\Meridian-Complete-Code` + zip
- From Built to Bought: premium Meridian-style UI live on claudecraft.ca

## Repo / deploy

- Code: `C:\\Users\\hunte\\github-clones\\meridian`
- Railway project: `meridian` (do not delete)
- Docs: `AUTONOMOUS-OPS.md`, `CLAUDE.md`, `ALWAYS-ON.md`, `DECISION.md`
- GitHub: `https://github.com/agentbridgehq-oss/meridian`
- Working branch: `meridian-agency-2-0`
- PR: https://github.com/agentbridgehq-oss/meridian/pull/2

## Video ads (this chat)

- Multi-shot Meridian promo with VO → TikTok 9:16 export in Downloads as **Meridian ad video.mp4**
- Permanent VO/video pipeline: `video_ads_voiceover_pipeline.md`
- Premium plugins installed: hyperframes, frontend-design, feature-dev, code-review, railway, github, playwright, etc.

## Skills created/used

- `live-links` — open sites / Ken-Live-Links.html (Grok TUI links not clickable)
- `deploy-meridian-agent` — auto deploy/onboard agents
- `imagine` — image + multi-shot video assembly
- `meridian-session-sync` — Grok fetch-on-open / commit-on-close (2026-09-05)

## Footer rule

End completions with live URLs (markdown). Meridian first. Chat links may not open in TUI — use Desktop OPEN-MERIDIAN.bat or live-links skill.

## Live URLs

- Meridian: https://meridian-production-2eb0.up.railway.app/
- Why agents: https://meridian-production-2eb0.up.railway.app/why-agents
- FBTB: https://claudecraft.ca/from-built-to-bought.html
- ClaudeCraft: https://claudecraft.ca/
- Central Command: https://ultra-command-center-production.up.railway.app/
