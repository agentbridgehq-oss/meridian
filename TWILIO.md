# Twilio + Meridian free tokens

Twilio is the phone pipe. Meridian is the brain.
Do not buy Retell for Ken's own trial line. Do not turn on `{ "audio": true }` — that spends xAI packs.

## What you already had

| Piece | Status |
|-------|--------|
| Outbound SMS / missed-call text-back | `lib/notify.mjs` (env only) |
| Brain tokens | `ANTHROPIC_API_KEY` → Groq failover (`GROQ_API_KEY`) |
| Inbound SMS / inbound voice | now in `lib/twilio-channel.mjs` |

Trial units (Twilio, ~30 days): ~100 SMS, ~75 voice minutes, only to 5 verified numbers, same country as signup.

## Railway env

```
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM_NUMBER=+1XXXXXXXXXX
TWILIO_WEBHOOK_TOKEN=long-random
TWILIO_AGENT_MAP={"+1XXXXXXXXXX":"agent_YOURID"}
MERIDIAN_SMS_ALERTS=1
```

Keep `ANTHROPIC_API_KEY` and `GROQ_API_KEY`. Those are the free tokens.

## Console wiring

1. Verify your cell as a Caller ID (trial cannot text strangers).
2. Keep the trial number.
3. Messaging webhook POST: `https://YOUR_BASE/api/twilio/sms/AGENT_ID?token=TWILIO_WEBHOOK_TOKEN`
4. Voice webhook POST: `https://YOUR_BASE/api/twilio/voice/AGENT_ID?token=TWILIO_WEBHOOK_TOKEN`
5. Text the trial number from the verified cell.

Status: `GET /api/twilio/status`

## Cash / token rules

- Inbound SMS + Gather/Say voice = $0 Meridian TTS. Brain tokens only.
- Owner alerts use the same Twilio trial SMS bucket.
- STOP / START handled. Canada CASL: no cold SMS blast off this number.
- After trial: upgrade + Toll-Free verify (CA) before any client production.

## Server mount (one-time)

In `server.mjs`:

```js
import { registerTwilioRoutes } from './lib/twilio-routes.mjs';
```

After `app.use(express.urlencoded({ extended: true }))`:

```js
registerTwilioRoutes(app, { BASE });
```

Then `railway up`.
