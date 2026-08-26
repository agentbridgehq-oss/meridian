# Meridian Premium Voice — always-on human neural speech

See **VOICE-STACK.md** for the locked vendor + cost matrix.

## Promise

1. **Sounds human** — paid installs: xAI neural (default **Ara**). Site Play: on-device voice instantly, studio sample if the server answers.
2. **Works every time** — Play never dead-ends. Brain: Claude → Groq → regex. Phone still gets `speak` text if hosted audio fails.
3. **Cash first (customer)** — prepaid packs/subs; empty balance = 402, no unpaid xAI.
4. **All PAYG (vendors)** — Claude, Groq, xAI usage-only.

## Reliability pipeline

```
Site Play
    → speechSynthesis immediately (mapped Ara/Eve female, Leo/Rex male)
    → POST /api/voice/preview (demo sample, never xAI)
        → audio arrives? swap onto <audio>
        → fail / bot / timeout? keep on-device voice, status stays honest

Paid call / { audio: true }
    → reserveTurn
    → Claude brain → Groq → regex
    → xAI TTS (retries × voice chain ara→eve→…, 12s budget)
        → fail? ElevenLabs if armed
            → fail? release hold, return speak text (Retell/Vapi still talks)
    → commitTurn on success
```

## Website demo

- Voice picker: `GET /api/voice/voices`
- Play sample: `POST /api/voice/preview` `{ "voiceId": "ara", "text": "…" }`
- Pages: homepage `#voice-demo` and `/agents/voice` `#voice-studio`
- Script: `public/js/voice-demo.js`

## Env checklist

| Key | Required for |
|-----|----------------|
| `XAI_API_KEY` | Premium neural TTS on paid turns |
| `ANTHROPIC_API_KEY` | Claude conversation |
| `GROQ_API_KEY` | Fast brain failover |
| `STRIPE_SECRET_KEY` | Packs / subs |
| `VOICE_PROVIDER=xai` | Force xAI hosted |
| `XAI_TTS_VOICE=ara` | Default human voice |

## Cost model

Phone default = Retell all-in ~$0.10–$0.20/min (no Meridian TTS fee).
Hosted xAI TTS = $15 / 1M chars, prepaid packs only. Target ~13× margin. Never reverse cash flow.
