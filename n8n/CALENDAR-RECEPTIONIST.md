# Meridian calendar receptionist connector

This is the customer-system half of the TikTok “AI Voice Receptionist” flow.

Meridian already owns the phone path:

`PSTN → Twilio SIP → OpenAI Realtime → meridian_check_availability / meridian_book_appointment`

n8n does **not** talk to the caller. n8n only answers signed tool calls with real Google Calendar truth.

## What Meridian already uses

| Layer | Owner |
|---|---|
| Answer the call | OpenAI Realtime + Twilio |
| Decide intent | Realtime model + Meridian sideband |
| Check availability | `meridian_check_availability` |
| Book only after caller confirms the slot | `meridian_book_appointment` |
| Cancel / reschedule | `meridian_cancel_appointment` / `meridian_reschedule_appointment` |
| Refuse to invent a booking | business-system adapter requires `{ ok: true, confirmed: true }` |

## What this workflow adds

Import `n8n/meridian-calendar-receptionist.json`. This is an **authenticated bridge to a verified HTTPS calendar adapter**, not a direct Google Calendar OAuth workflow. It is inactive and fails closed until its header credentials and adapter URL are configured.

1. Select Header Auth on Calendar Webhook with `Authorization: Bearer <the per-deployment connector secret>`.
2. Set the approved adapter endpoint in Configure Adapter URL. Caller payload cannot choose the endpoint.
3. Select the downstream Header Auth credential on Verified Calendar Adapter. Use the same secret if the adapter implements Meridian’s existing HMAC/bearer contract.
4. Connect the downstream adapter to the actual calendar and configure timezone, business hours, buffers and idempotent writes.
5. Verify availability/book/reschedule/cancel plus duplicate and unavailable-slot rejection. Activate only after those checks.

The template was structurally and behaviorally tested locally; it has not been imported into a running n8n account or connected to a real calendar.


It exposes one HTTPS webhook that handles:

1. `check_availability` — free/busy against Google Calendar, returns up to 8 bookable slots
2. `book_appointment` — creates the event only when the payload says the caller confirmed the slot
3. `cancel_appointment` — deletes by event id
4. `reschedule_appointment` — updates start/end on the existing event

Every success response is:

```json
{ "ok": true, "confirmed": true, "bookingId": "…", "start": "…", "end": "…", "slots": [] }
```

If Google Calendar does not actually write the event, return `confirmed: false`. Meridian will not tell the caller they are booked.

## What you need before this is real

Do not mark the calendar integration verified until every item below exists.

### Meridian side

- Railway service up and `/healthz` = 200
- Staging Twilio DID answering through OpenAI Realtime
- Deployment has `calendar` integration with:
  - `provider`: `n8n`
  - `status`: `verified`
  - `endpoint`: the n8n webhook HTTPS URL
  - `credentialConfigured`: `true`
  - evidence of a live book + cancel test
- Runtime secret in Railway, never in GitHub:

`MERIDIAN_CONNECTOR_<DEPLOYMENTID>_CALENDAR_SECRET`

Minimum 12 characters. Same value as the n8n env secret.

Voice-only deployments get calendar as an **optional** integration. Booking tools stay hidden until that integration is verified and the secret exists.

### n8n side

- n8n Cloud or self-host with a public HTTPS webhook
- Real calendar OAuth attached to the downstream adapter (this bridge has no Google Calendar nodes)
- Calendar the business actually uses (`primary` or a dedicated booking calendar)
- Env vars:

| Name | Purpose |
|---|---|
| `MERIDIAN_CONNECTOR_SECRET` | Same secret Meridian signs with |
| `GOOGLE_CALENDAR_ID` | Usually `primary` |
| `BUSINESS_TIMEZONE` | IANA tz, e.g. `America/Toronto` |
| `BUSINESS_OPEN` | `09:00` |
| `BUSINESS_CLOSE` | `17:00` |
| `BUSINESS_DAYS` | `1,2,3,4,5` Monday=1 |
| `DEFAULT_DURATION_MINUTES` | `60` |
| `BUFFER_MINUTES` | `15` |
| `MIN_NOTICE_MINUTES` | `120` |

### Business rules you must collect from the client

Same fields as `kits/booking/BOOKING-AGENT-KIT.md`:

- Appointment types + duration
- Buffer between jobs
- Blackout days
- Minimum notice
- Cancel / reschedule policy
- Timezone

## Fail-closed rules

- No slots in the response → agent offers a callback, not a fake time
- `callerConfirmedSlot` is not true → book action returns denied
- Google create/update/delete fails → `{ ok: false, confirmed: false }`
- HTTP, timeout, or unsigned request → Meridian reports the tool failed

## Verification evidence to paste into Deployment Core

1. POST `check_availability` for tomorrow → slots match the live calendar
2. POST `book_appointment` → event appears on Google Calendar
3. Realtime tool on a staging call says the same start time
4. Cancel the test event
5. Confirm the agent cannot say “you’re booked” when n8n returns `confirmed: false`

Until those five exist, this workflow is a connector draft — not a live receptionist.
