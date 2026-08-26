# Meridian production voice stack (locked)

Goal: no dead air. Preview always plays. Paid calls use a cheap, low-latency phone path. Premium neural is optional and prepaid.

## What broke

The Voice agent page sent people to `/#voice-demo` with no player on the page.
Public preview depended on Google Translate TTS from Railway. When that or the bot filter hiccuped, Play felt dead.

## What is live now

1. Play starts **on-device speech immediately** (never waits on a vendor).
2. Server sample upgrades the audio if it arrives.
3. If server sample fails, Play still sounds — status says so. No red dead-end.
4. `/agents/voice` has its own studio (`#voice-studio`).

## Locked production stack (agency default)

Use this unless a client already owns a different phone platform.

| Layer | Default | Why | 2026 all-in |
|-------|---------|-----|-------------|
| Phone orchestration | **Retell AI** | Lowest landed inbound cost, HIPAA on standard, ~600ms | **$0.10–$0.20 / min** |
| Brain | **Meridian `/voice-turn`** → Claude, Groq failover, regex last | Facts stay in the knowledge pack | tokens only |
| Phone TTS/STT | **Retell native** | Bundled. Do not stack ElevenLabs on every minute | included |
| Premium hosted speech | **xAI Grok TTS** (Ara default) | Best humanness for branded audio / web speak | **$15 / 1M chars** |
| Speech-to-speech (optional premium) | **xAI Grok Voice Think Fast 1.0** | Only if client prepays for live duplex | **$0.05 / min** (2.0 is $0.08) |
| Failover TTS | ElevenLabs only if `VOICE_ENABLE_ELEVENLABS=1` | Quality backup, not default (adds ~$0.04–$0.08/min) | armed only |
| Telephony | Retell managed, or Twilio if they already have numbers | Don't double-pay SIP | ~$0.01 / min if BYO |
| Calendar | Google Calendar via booking kit first | Voice last in install order | — |

Do **not** default clients to Vapi + ElevenLabs + Deepgram + Claude Sonnet. That stack lands **$0.25–$0.33/min**. Fine for custom builds; wrong for $497 kits.

## When to use each phone vendor

| Vendor | Use when |
|--------|----------|
| **Retell** | Default inbound receptionist (HVAC, clinic, trades) |
| **Bland** | High-volume outbound scripts, predictable $0.11–$0.14/min |
| **Vapi** | Client engineer wants BYO STT/TTS/SIP and will pay the stack |
| **Twilio ConversationRelay** | Client already lives in Twilio |

## Cash rules (do not break)

- Site Play / preview: **never** debit xAI. On-device + demo sample only.
- `{ "audio": true }` on `/voice-turn` or `/speak`: **reserveTurn** first. Empty balance → 402.
- Phone path: Meridian returns `speak` text. Retell speaks it. No Meridian TTS charge.

## Env that must be on Railway

```
ANTHROPIC_API_KEY=     # brain. Without this, regex-only replies.
XAI_API_KEY=           # premium hosted TTS for paying installs
GROQ_API_KEY=          # brain failover
VOICE_PROVIDER=xai
XAI_TTS_VOICE=ara
STRIPE_SECRET_KEY=     # packs / kits
```

Do not set `VOICE_ENABLE_ELEVENLABS=1` until a client is paying for that layer.

## Health

- `GET /api/voice/voices` — catalog + `hostedReady`
- `POST /api/voice/preview` — sample or `{ useBrowser: true }`
- `GET /api/voice/status` — provider mode

If Play is silent: check browser autoplay, then Railway logs for `/api/voice/preview`. The page must still speak via `speechSynthesis`.
