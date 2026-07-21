# Voice Agent — Install Kit (Meridian)

**What you bought:** The complete playbook to deploy a 24/7 AI voice agent that answers calls, books appointments, and answers FAQs for a local business.

**Support:** Meridian product · your PUBLIC_BASE_URL

---

## What this agent does for clients

- Answers every call (including after hours)
- Books / reschedules into a calendar
- Answers top FAQs in natural language
- Captures name, phone, reason for call
- Escalates emergencies to a human number

**Promise clients care about:** *Never miss another paying call.*

---

## Delivery options

### A) DIY (client self-install with this kit)
Use sections 1–6. Takes 1–3 days if numbers + calendar ready.

### B) Done-for-you (you as the agency)
Use this kit as your SOP. Charge setup + monthly. Typical market:
- Setup: $997–$2,497
- Monthly: $197–$497 (usage + monitoring)

---

## 1. Intake (copy this form)

| Field | Answer |
|-------|--------|
| Business name | |
| Industry / niche | |
| Service area | |
| Business hours | |
| Phone to forward | |
| Emergency / human transfer number | |
| Calendar (Google/Outlook) | |
| Top 10 FAQs | |
| Services + prices (or “from” pricing) | |
| Booking rules (min notice, duration) | |
| Words never to say | |
| Brand tone (friendly / pro / short) | |

---

## 2. Tech stack (recommended)

| Layer | Tool options |
|-------|----------------|
| Phone number | Twilio, or client’s forwarded line |
| Voice AI (default) | **Vapi, Retell, Bland** — full telephony + STT + TTS |
| Voice polish (optional) | **ElevenLabs** plug-in via Meridian (same pipeline if key missing) |
| Calendar | Google Calendar / Outlook |
| CRM | GoHighLevel, HubSpot, spreadsheet start |
| Brain | Meridian agent API + this kit |

### Platform voice (default for phone) + xAI picker (hosted audio)

**Phone (default):**

```
Caller transcript → POST Meridian /voice-turn
                  → reply + platform.say (speak this in Retell/Vapi)
                  → webhooks → CRM
```

**Hosted xAI speech (metered):** customer picks a voice in the setup wizard (full catalog from xAI). Saved as `config.xaiVoiceId`. Request with `{ "audio": true }`.

**Voice picker**

| Surface | Path |
|---------|------|
| Setup wizard | `/setup/<token>` → **Pick your voice** |
| Catalog API | `GET /api/voice/voices` (public) |
| Free sample | `POST /api/voice/preview` `{ "voiceId": "carina" }` |
| Save preference | `PUT /api/v1/agents/{id}/voice` `{ "voiceId": "luna" }` |
| List + selected | `GET /api/v1/agents/{id}/voices` |

**Go-live with Retell/Vapi**

1. Complete Meridian intake → get `agentId` + `mdn_` API key  
2. Pick xAI voice in setup wizard (optional for phone-native TTS)  
3. `GET /api/v1/agents/{id}/voice-spec` → system prompt + endpoints  
4. Each caller turn: `POST /voice-turn` with transcript  
5. Speak the `reply` / `platform.say` field with the platform’s native voice  
6. Or request Meridian audio: `{ "audio": true }` (uses saved `xaiVoiceId`, requires pack/sub)  

```http
POST /api/v1/agents/{id}/voice-turn
Authorization: Bearer mdn_…
{"message":"What are your hours?"}

# → mode: platform, reply, platform.retell / platform.vapi helpers
```

```http
GET /api/voice/status
GET /api/voice/voices
GET /api/v1/agents/{id}/voice-spec
GET /api/v1/agents/{id}/voices
```

---

## 3. Voice agent system prompt (paste into your voice platform)

```
You are the phone receptionist for [BUSINESS NAME], a [NICHE] serving [AREA].
Hours: [HOURS]. Outside hours, take a message and offer to book the next open slot.
Tone: [TONE]. Keep answers under 2 sentences when possible.
Never invent prices, availability, or medical/legal advice.
If asked something unknown: "I'll have the team confirm that — can I take your name and number?"
Always collect: full name, phone, reason for call, preferred time.
Booking rules: [RULES].
Transfer to human if: emergency, angry customer after 2 turns, or they ask for a manager.
Human transfer number: [NUMBER].
End every successful booking with: date, time, what to bring/expect.
```

---

## 4. Call flow (checklist)

1. Greeting: “Thanks for calling [NAME], this is [Agent name]. How can I help?”
2. Intent: book / price / hours / reschedule / other  
3. Collect details  
4. Check calendar / propose 2 times  
5. Confirm booking  
6. SMS/email confirm (if wired)  
7. Log in CRM  

---

## 5. Claude Project standing rules

Create Project: `Voice Agent — [Client]`

```
Never invent hours, prices, or appointments.
Client facts: [paste intake]
Update log: after every change to FAQs or hours.
```

---

## 6. Go-live checklist

- [ ] Number purchased / forwarding tested  
- [ ] Test call from unknown phone  
- [ ] Booking lands on real calendar  
- [ ] Human transfer works  
- [ ] After-hours path tested  
- [ ] Client approved 3 sample calls  
- [ ] Monthly monitoring plan (who watches transcripts)  

---

## 7. Sales script (you selling this agent)

> “You’re missing calls when you’re on jobs. We install an AI receptionist that answers 24/7, books into your calendar, and texts you the lead. Setup once, then a small monthly so it stays trained.”

---

## 8. What “done” looks like

Client can say: *“We don’t miss calls anymore and the calendar fills itself.”*

— Meridian · Voice Agent Kit
