# Meridian Full Stack — Agency Playbook

**Meridian** is a standalone AI agency product. You purchased **all three agents** + this implementation playbook.

1. Voice Agent  
2. Sales / Lead Agent  
3. Appointment Scheduler  

This product is **not** ClaudeCraft. Own site, own API, own ops.

---

## Package menu (recommended retail)

| Package | Includes | Setup | Monthly |
|---------|----------|-------|---------|
| **Voice** | Phone AI receptionist | $997–$1,497 | $197–$297 |
| **Sales** | Instant lead follow-up | $797–$1,297 | $147–$247 |
| **Booking** | Scheduler + reminders | $797–$1,297 | $147–$247 |
| **Full stack** | All three + CRM wiring | $1,997–$3,497 | $397–$697 |

Adjust for niche (pools, clinics, trades, salons).

---

## 14-day delivery sprint (DFY)

| Day | Task |
|-----|------|
| 1 | Strategy call + intake |
| 2 | Accounts + numbers |
| 3–4 | Voice agent draft + test calls |
| 5–6 | Sales agent sequences |
| 7–8 | Booking + calendar |
| 9 | CRM stages |
| 10 | Full integration test |
| 11 | Client training (30 min) |
| 12 | Soft launch |
| 13 | Fix edge cases |
| 14 | Go live + first invoice |

---

## Order of install (critical)

1. **Booking** foundation (calendar truth)  
2. **Sales** (needs a place to put appointments)  
3. **Voice** (needs both booking + FAQs)  

---

## Vertical focus (like top agencies)

Pick **one** niche first:
- Home services / trades  
- Med spa / clinic  
- Auto / dealership  
- Pool / outdoor  
- Restaurant reservations (voice heavy)  

One niche = better ads, faster close, reusable scripts.

---

## Funnel to get clients

1. Short video: “We install AI that answers every call”  
2. Landing: your Meridian PUBLIC_BASE_URL  
3. Checkout kit OR strategy call (proposal form on site)  
4. Case study → next client  

---

## Platform pipeline (built into Meridian)

1. Lead opts in on site (`/api/funnel`)  
2. Auto proposal + intake link  
3. Client completes intake  
4. Meridian provisions agent API key (`mdn_…`)  
5. Dual delivery: Resend email + `MERIDIAN_WEBHOOK_URL`  

Cold outreach drafts require ops **approved_send** — never auto-blast.

---

## Compliance

- SMS/email: consent + STOP/unsubscribe  
- No fake reviews or invented ROI  
- Recordings: disclose where legally required  
- CASL / anti-spam: funnel consent only; outreach is approve-only  

---

**You now have the three agents + how to sell the stack.** Ship Day 1 intake on your next call.

— Meridian
