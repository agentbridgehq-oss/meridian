# Meridian Sales pipeline

**Status:** live API  
**Public:** `GET /api/sales/status`  
**Checkout DIY:** `/checkout/sales` ($497)  
**Full Auto:** `/checkout/auto_sales` ($997)

---

## Flow

```
Form / Meta / CRM lead
    → POST /api/v1/agents/:id/sales/lead  { consent: true, name, phone, message, … }
    → Claude sales brain + scorecard
    → { reply, scoring, leadId }
    → YOU send reply via Twilio / GHL / SMS (CASL)
    → Customer texts back
    → POST .../sales/turn { leadId, message }
    → next draft
```

Optional sequence bumps (still you send):

```json
{ "leadId": "slead_…", "advanceSequence": true }
```

---

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/agents/:id/sales/lead` | Ingest lead + instant draft |
| POST | `/api/v1/agents/:id/sales/turn` | Continue or advance sequence |
| GET | `/api/v1/agents/:id/sales/leads` | List leads |
| GET | `/api/v1/agents/:id/sales/leads/:leadId` | Lead detail |
| POST | `/api/v1/agents/:id/sales/score` | Scorecard only |
| GET | `/api/v1/agents/:id/sales/recipe` | n8n/Zapier steps |
| POST | `/api/v1/agents/:id/events` | `type: lead.created` → same as sales/lead |

---

## Scorecard (book if ≥ 6)

| Signal | Points |
|--------|--------|
| Right service | 2 |
| Timeline &lt; ~30 days | 2 |
| Budget signal | 2 |
| Decision maker | 2 |
| Contact phone/email | 1 |

---

## Containment + CASL

- Meridian **drafts** only — does not auto-SMS  
- `consent: true` required (opt-in or inbound)  
- No bank / inbox / account access (OpenClaw cage)

---

## Code

- `lib/sales-pipeline.mjs`  
- Expertise: `lib/expertise.mjs` → sales  
- Kit: `kits/sales/SALES-AGENT-KIT.md`  
