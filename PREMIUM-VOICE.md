# Meridian Premium Voice — always-on human neural speech

## Promise

1. **Sounds human** — xAI neural voices (default **Ara**).
2. **Works every time** — TTS retries + multi-voice fallback; brain Claude → Groq → regex; phone still gets `speak` text if audio fails.
3. **Cash first (customer)** — prepaid packs/subs; empty balance = 402, no unpaid xAI.
4. **All PAYG (vendors)** — Claude, Groq, and xAI are **usage-only** (no seat licenses in-app):
   - **xAI** — pay per TTS call when audio is generated
   - **Claude** — pay per token when brain runs
   - **Groq** — pay per token only on failover
5. Ops: `GET /api/ops/billing/vendor-payg` + ROI includes `vendorPayg`

## Reliability pipeline

```
Caller transcript
    → Claude brain (ANTHROPIC_API_KEY)
        → fail? Groq (GROQ_API_KEY)
            → fail? regex must-work
    → if audio:true
        → reserveTurn (balance required)
        → xAI TTS (retries × voice chain ara→eve→…)
            → fail? ElevenLabs if armed
                → fail? release hold, still return speak text
        → commitTurn on success
```

## Website demo

- Voice picker: `GET /api/voice/voices`
- Play sample: `POST /api/voice/preview` `{ "voiceId": "ara", "text": "…" }`
- Agent studio: `POST /api/voice/preview-agent` actions `script|line|turn`
- Homepage: `public/js/voice-demo.js` · never dead-ends (browser speech last)

## n8n

| Workflow | Use |
|----------|-----|
| `n8n/meridian-premium-voice-agent.json` | Webhook voice turns (PAYG on Meridian) |
| `n8n/meridian-ops-daily.json` | Daily OpenClaw + health (ops token) |

Import both only when Meridian is healthy. Skill: `~/.grok/skills/meridian-premium-voice`  
Portfolio matrix: `CENTRAL-COMMAND/n8n/AUTONOMOUS-N8N-MATRIX.md`

## Env checklist

| Key | Required for |
|-----|----------------|
| `XAI_API_KEY` | Premium neural TTS |
| `ANTHROPIC_API_KEY` | Claude conversation |
| `GROQ_API_KEY` | Fast brain failover |
| `STRIPE_SECRET_KEY` | Packs / subs |
| `VOICE_PROVIDER=xai` | Force xAI hosted |
| `XAI_TTS_VOICE=ara` | Default human voice |

## Cost model

See `USAGE-BILLING.md`. Target ~13× margin on TTS turns. Never reverse cash flow.
