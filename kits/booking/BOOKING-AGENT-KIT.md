# Appointment Scheduler Agent — Install Kit (Meridian)

**What you bought:** Playbook for an AI that books, confirms, reschedules, and reduces no-shows — by chat, SMS, or voice handoff.

**Support:** Meridian product · your PUBLIC_BASE_URL

---

## What this agent does

- Offers real open slots from calendar
- Books / reschedules / cancels with rules
- Sends reminders (24h + 1h)
- Fills cancellations from waitlist
- Logs every change

**Promise:** *Full calendar, fewer no-shows.*

---

## 1. Intake

| Field | Answer |
|-------|--------|
| Appointment types + duration | |
| Buffer between jobs | |
| Blackout days | |
| Min notice to book | |
| Deposit / cancel policy | |
| Reminder preference (SMS/email) | |
| Waitlist? Y/N | |
| Timezone | |

---

## 2. Stack

| Layer | Options |
|-------|---------|
| Calendar | Google Calendar, Outlook |
| Booking UI | Cal.com, Calendly, GHL calendar, custom |
| Reminders | Twilio SMS, email |
| Agent brain | This kit + Claude Project |

---

## 3. Scheduler system prompt

```
You are the scheduling agent for [BUSINESS].
Timezone: [TZ]. Services: [LIST with duration].
Rules: [MIN NOTICE], [BUFFERS], [CANCEL POLICY].
Never double-book. Never invent open slots — only offer times from the calendar tool.
Always confirm: service, date, time, location/link, what to bring.
If rescheduling: cancel old slot then book new.
If no slots: offer waitlist and 2 alternate days.
```

---

## 4. Reminder copy

**T-24h:** “Reminder: [Service] with [Biz] tomorrow at [time]. Reply C to confirm, R to reschedule.”

**T-1h:** “See you in 1 hour at [time] — [address/link].”

---

## 5. No-show recovery

1. Mark no-show in CRM  
2. Auto SMS: “Missed you today — want [A] or [B] this week?”  
3. After 2 no-shows: require deposit  

---

## 6. Go-live checklist

- [ ] Live calendar sync  
- [ ] Book test appointment end-to-end  
- [ ] Reschedule test  
- [ ] Reminder SMS received  
- [ ] Cancel policy shown before confirm  
- [ ] Owner gets daily schedule digest  

---

## 7. You selling this

> “No-shows and empty slots cost you more than ads. We install an AI scheduler that fills, confirms, and recovers missed appointments automatically.”

— Meridian · Booking Agent Kit
