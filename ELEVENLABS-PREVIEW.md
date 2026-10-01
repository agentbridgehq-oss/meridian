# ElevenLabs preview — what is required

This is the **website Play button**, not the phone stack.

| Layer | Host | Status after this commit |
|---|---|---|
| Storefront | https://meridian-open.netlify.app/ | Live |
| Preview page | https://meridian-open.netlify.app/voice.html | Live after this branch deploys |
| Preview API | Netlify Functions `/api/voice/*` | Code shipped; needs env |
| Phone runtime | Railway + Twilio + OpenAI Realtime | Still down |

## Official API used

`POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`  
Header: `xi-api-key`  
Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert

Existing server client: `lib/elevenlabs.mjs`  
Netlify twin: `netlify/functions/_eleven.mjs`

## Arm it (no key in Git)

In Netlify site `meridian-open` → Environment variables:

```
VOICE_ENABLE_ELEVENLABS=1
ELEVENLABS_API_KEY=          # from elevenlabs.io → Profile → API keys
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
PUBLIC_SITE_ORIGIN=https://meridian-open.netlify.app
```

Optional voice overrides:

```
ELEVENLABS_VOICE_ARA=21m00Tcm4TlvDq8ikWAM
ELEVENLABS_VOICE_EVE=EXAVITQu4vr4xnSDxMaL
ELEVENLABS_VOICE_LEO=JBFqnCBsd6RMkjVDRZzb
ELEVENLABS_VOICE_REX=pNInz6obpgDQGcFmaJgB
```

Then redeploy `meridian-agency-2-0` to `meridian-open`.

## Prove it

1. https://meridian-open.netlify.app/api/voice/status — `elevenlabs: true`
2. https://meridian-open.netlify.app/voice.html — Play swaps to studio audio
3. If key missing, Play still uses browser speech. That is intentional.

## Limits

- 220 characters per preview
- 8 previews / IP / minute on the function
- Free ElevenLabs tier is ~10 minutes/month and **non-commercial**
- Do not put the key in `public/` or this repo

## What this does not do

Does not answer a phone. Does not replace PR #2 Realtime. Does not make Railway live.
