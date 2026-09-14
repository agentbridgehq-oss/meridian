# Voice trio — ready-to-deploy workflows

Three voice agents. Same Realtime stack. Different playbooks.

Host remains Railway. These workflows do **not** go live until `/healthz` is 200 and one inbound call writes the Realtime ledger.

## Shared trunk

Caller → Twilio Elastic SIP → OpenAI Realtime (gpt-realtime-2.1) → Meridian sideband tools (fail closed) → verified calendar / CRM / human destination.

Rate card locked 2026-09-14:

- Setup $997 per agent (or Full Auto $1,497 for the trio on one number)
- Number $19 / mo
- 200 minutes included
- $0.20 / min after that

## 1. Receptionist

Required intake: business name, hours, services, greeting, transfer number, after-hours rule.

Tools: `meridian_record_call_outcome` always. Handoff when destination verified. Calendar tools when calendar adapter verified.

QA: hours match intake; unknown price refused; outcome recorded; transfer not spoken as success until provider confirms.

## 2. Booking

Required intake: services + duration, timezone, buffers, bookable hours.

Must have calendar adapter verified. Otherwise capture only.

Path: identify service → check_availability → offer two slots → caller confirms → book with caller_confirmed_slot true → speak success only if confirmed:true.

## 3. Service

Required intake: safety phrases, dispatch owner, no-ETA rule.

Path: name + callback + job ref → safety check → log problem in caller words → handoff or owner callback.

## Deploy order

1. Booking calendar connector
2. Receptionist on the main DID
3. Service on after-hours or a second greeting rule
