# Meridian voice deployment checkpoint — 2026-09-30

## Connected infrastructure

- Runtime: https://meridian-production-4996.up.railway.app
- Railway project: 1eb48be2-82d5-463e-8632-2ecf9f2175df
- Service: fe23148e-0c58-4e87-82c7-5dc0a95c9fcd
- Environment: 9dbfe413-b78a-4a9a-a974-eb371785cfde
- GitHub source: agentbridgehq-oss/meridian, branch meridian-agency-2-0. Master remains untouched.
- Persistent volume: 95156c20-904c-4fb6-869b-d693f11fa184, /data (5 GB).
- Static front: https://meridian-open.netlify.app
- Netlify site: 60f796ca-2590-4af4-8870-c6bfeaeef5c8
- Netlify routes API calls to Railway; dedicated ElevenLabs preview functions remain on Netlify.

## Where each credential belongs

| Credential | Location | Purpose |
|---|---|---|
| OPENAI_API_KEY | Railway → meridian → Variables | Realtime browser and phone sessions |
| OPENAI_WEBHOOK_SECRET | Railway → meridian → Variables | Verify OpenAI incoming-call events |
| ELEVENLABS_API_KEY | Netlify → meridian-open → Environment variables (Functions scope) | Premium website sample audio |
| VOICE_ENABLE_ELEVENLABS=1 | Netlify | Explicitly enable paid sample generation |
| Twilio credentials | Railway | Phone/SIP integration and approved transfer operations |
| Customer connector secrets | Railway | Signed customer calendar/CRM adapters |

The generated OPS_TOKEN is stored only in Railway secret configuration. Do not put secrets in GitHub, a browser bundle, this file or chat.

## OpenAI webhook

Create an OpenAI project webhook with the incoming Realtime call event at:

https://meridian-production-4996.up.railway.app/api/openai/webhooks/realtime

Store its signing secret as OPENAI_WEBHOOK_SECRET on Railway. Use the same OpenAI project for the API key and SIP trunk configuration. Configure Twilio Elastic SIP using OpenAI's project SIP destination and an authorised staging DID; configure deterministic deployment routing before enabling inbound acceptance.

## Readiness is not a live-call claim

/healthz returning 200 proves server availability. It can report degraded legacy provider status while Realtime credentials are still missing. Verify /api/voice-demo/status for browser session availability. The browser demo is isolated: tools are disabled and business actions cannot occur.

Before customer activation: real inbound call; natural response/interruption; durable call ledger; transfer success/failure; verified availability/book/cancel if advertised; client acceptance and rollback ownership. Missing calendar workflow remains a blocker to one-click n8n import. Use a verified custom adapter or implement and test the missing workflow first.


## 2026-09-30 12:01 UTC — publication verified

- Product commit: `dcfdce4b422d55530b69cd8fe6ddda4f0eb8833b`.
- Railway initial tool created the service using master despite accepting a feature-branch argument. Live probes caught the mismatch. Explicit source branch correction deployed the product commit from meridian-agency-2-0. No master code or branch was changed.
- Correct Railway deployment: `2b2c8541-b31d-405f-bf17-ae784a8d9e05`, SUCCESS. Volume attached at /data.
- Netlify upload deployment: `6abcf91c683e8f065c24776f`, ready, published to https://meridian-open.netlify.app. Upload contains tested product source; Netlify reports commit_ref null for uploads.
- Verified live Netlify /agents/voice, /agents/sales, /agents/booking, /agents/service all 200 and include premium stylesheet. Railway booking page serves the new stylesheet.
- Verified /api/voice-demo/status 200 on both hosts, enabled:true, available:false, apiKeyConfigured:false. Browser demo is now enabled but correctly unavailable without OPENAI_API_KEY.
- Verified /meridian-voice-demo.html 200 through both hosts, role selector present, Permissions-Policy microphone=(self). Netlify API gateway reaches Railway.
- ElevenLabs Netlify status reports no key and flag inactive; the env-upsert connector reported success but a subsequent list was empty and live function still shows inactive. Owner must set ELEVENLABS_API_KEY plus VOICE_ENABLE_ELEVENLABS=1 in Netlify Functions scope, then redeploy. Do not claim the flag mutation succeeded in runtime.
- OpenAI belongs in Railway. Real PSTN voice and customer-system actions remain unverified. Fiverr/Upwork copy prepared only; profiles not created or published.
- Final source tests 102/102 pass; audit zero vulnerabilities. Visual browser inspection could not run (Chromium download unavailable); premium UI has HTTP/source verification only.
- Next: owner adds OPENAI_API_KEY to Railway, then verify a browser audio conversation; add webhook signing secret, Twilio SIP/DID and deterministic deployment routing; verify a real inbound call and each advertised customer integration before client activation.
