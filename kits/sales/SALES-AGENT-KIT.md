# Sales / Lead Agent — Install Kit (Meridian)

**What you bought:** The complete playbook for an AI sales agent that follows up every lead in under 60 seconds — SMS, web chat, or email — and books the next step.

**Support:** Meridian product · your PUBLIC_BASE_URL

---

## What this agent does

- Instant reply to new leads (web form, Facebook, Google, SMS)
- Qualifies budget / timeline / service need
- Sends pricing or “next step” links
- Books a call or on-site estimate
- Re-engages cold leads on a schedule (CASL-aware / consent-based)

**Promise:** *No lead dies in the inbox.*

---

## 1. Intake

| Field | Answer |
|-------|--------|
| Lead sources | |
| CRM | |
| Offer / services | |
| Average ticket $ | |
| Qualification questions (3–5) | |
| Disqualify rules | |
| Booking link or calendar | |
| Human takeover rules | |
| Consent / SMS language | |

---

## 2. Stack

| Layer | Options |
|-------|---------|
| Inbox / SMS | Twilio, ManyChat, GHL conversations, WhatsApp Business API |
| CRM | GHL, HubSpot, Pipedrive, Airtable |
| Brain | Claude Project + this kit |
| Triggers | Form webhook, Meta lead ads, missed-call text-back |

---

## 3. Master sales agent prompt

```
You are the sales follow-up agent for [BUSINESS].
Goal: book [CALL / ESTIMATE / DEMO] within this conversation.
Tone: [TONE]. Short messages (SMS-length when on text).
Always: confirm name, need, timeline, budget band if relevant.
Never invent discounts, inventory, or legal claims.
If not a fit: politely disqualify and offer a resource.
If ready: give exact booking link or times: [LINK].
Compliance: only message people who opted in or initiated contact.
Human handoff if: price negotiation past [X], complaint, or 3+ objections.
```

---

## 4. Message sequences (opted-in only)

### Instant (0 min)
“Hey [Name] — got your request about [service]. I’m [Agent] with [Biz]. What’s the best time for a quick [call/estimate] this week?”

### +15 min if no reply
“Still happy to help on [service]. 2 openings: [A] or [B] — which works?”

### +24 h
“Quick bump — want me to hold a spot or send pricing first?”

### +72 h (last soft)
“Closing your file Friday unless you want me to keep it open — reply YES and I’ll book you.”

**Never** spam cold lists. CASL / consent required for marketing SMS.

---

## 5. Qualification scorecard

| Signal | Points |
|--------|--------|
| Right service | 2 |
| Timeline &lt; 30 days | 2 |
| Budget acknowledged | 2 |
| Decision maker | 2 |
| **Book if ≥ 6** | |

---

## 6. Live Meridian Sales API (production)

Base: `https://meridian-production-2eb0.up.railway.app`

```bash
# Ingest lead + get instant draft (you send via SMS/CRM)
curl -s -X POST "$BASE/api/v1/agents/AGENT_ID/sales/lead" \
  -H "Authorization: Bearer mdn_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane","phone":"+15550100","message":"Need quote this week","source":"web-form","consent":true}'

# Continue conversation
curl -s -X POST "$BASE/api/v1/agents/AGENT_ID/sales/turn" \
  -H "Authorization: Bearer mdn_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"leadId":"slead_…","message":"How much does it cost?"}'

# Draft next sequence bump (+15m / +24h / +72h)
curl -s -X POST "$BASE/api/v1/agents/AGENT_ID/sales/turn" \
  -H "Authorization: Bearer mdn_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"leadId":"slead_…","advanceSequence":true}'
```

Also: `type: "lead.created"` on `POST .../events` runs the same ingest.

Full Auto Sales install: `/checkout/auto_sales` · Docs: `SALES-PIPELINE.md` · Status: `/api/sales/status`

---

## 7. Go-live checklist

- [ ] Lead webhook fires into `sales/lead`  
- [ ] First draft reply generated &lt; 60 seconds  
- [ ] Your SMS/CRM actually sends the draft (CASL)  
- [ ] Booking link / two times work on mobile  
- [ ] Hot leads (`scoring.readyToBook`) notify a human  
- [ ] No cold lists — consent only  

- [ ] Unsubscribe / STOP honored  

---

## 7. You selling this

> “Most businesses answer leads in hours. We install an AI that replies in under a minute, qualifies, and books — so your ads stop wasting money.”

— Meridian · Sales Agent Kit
