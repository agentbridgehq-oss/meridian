# Meridian voice connection pipeline

The public setup hub is `/voice-connect.html`. Its live status comes from `/api/voice/connections`; Netlify forwards that request to Railway. Only configuration booleans and public role links are returned. Credential presence is not provider verification or client acceptance.

## Browser and sample paths

- OpenAI Realtime: Railway `OPENAI_API_KEY`. The server owns model, voice, role instructions and tool restrictions. Receptionist/Booking use Marin by default; Service/Sales use Cedar unless an approved environment override is present.
- ElevenLabs samples: Netlify Functions `ELEVENLABS_API_KEY` and `VOICE_ENABLE_ELEVENLABS=1`, followed by a deploy. Device speech is an explicit fallback.
- Public browser sessions have a 90-second client stop and a server hangup timer. A missing or untrackable provider call ID fails closed. The timer behavior is unit-tested with a mocked provider; actual provider audio and hangup need a credentialed acceptance run.

## Phone path

1. Save `OPENAI_WEBHOOK_SECRET` in Railway from the same OpenAI project as the API key.
2. Register `https://meridian-production-4996.up.railway.app/api/openai/webhooks/realtime` for incoming Realtime calls.
3. Configure the authorised Twilio SIP trunk with the same OpenAI project destination. The hub builds the address using a non-secret project ID; it never accepts a secret key.
4. Map the staging number deterministically to the approved deployment through private ops controls.
5. Prove inbound audio, interruption, logged outcome, human fallback, each advertised customer connector, rollback and client acceptance before activation.

## Calendar bridge

Import `n8n/meridian-calendar-receptionist.json`, also downloadable from `/workflows/meridian-calendar-receptionist.json`. It is inactive by default. Select native Header Auth credentials on the inbound webhook and outbound adapter node, configure the HTTPS adapter URL, and connect the actual calendar in that downstream adapter.

The bridge rejects missing or malformed actions, requires caller confirmation for booking/rescheduling, forwards idempotency and signature metadata, and reports success only for an explicit 2xx `ok:true, confirmed:true` adapter response. Errors/timeouts return an unconfirmed failure. The adapter remains responsible for calendar authorisation, availability, business rules and durable idempotency.

This is an authenticated bridge, not a completed Google Calendar integration. JSON structure and validation/confirmation behavior have been tested locally; importing into a real n8n instance and performing real calendar operations have not been verified.

## Latest source validation

2026-09-30: integrated the latest premium front, daily field notes and customer setup forms with the pipeline changes; `node --test tests/*.test.mjs` passed 109/109. Production dependency audit reported zero vulnerabilities before integration; the incoming changes did not change dependency versions. `git diff --check` passed. No rendered browser inspection or real voice call is claimed.
