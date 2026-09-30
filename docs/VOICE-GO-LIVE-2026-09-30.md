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
