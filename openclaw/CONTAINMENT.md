# Meridian OpenClaw — Containment Cage

**Policy version:** 2026-07-20-meridian-v1  
**Code:** `lib/openclaw-containment.mjs`  
**Status API:** `GET /api/openclaw/containment`

---

## Model

OpenClaw on Meridian is a **caged automation worker**, not a general computer agent.

| May touch | Must never touch |
|-----------|------------------|
| Meridian `DATA_DIR` / queues / briefs | Ken’s bank or any customer bank |
| Agent provision + install packs | Wise, PayPal, wallets, tax apps |
| Widget / API / n8n / phone **configs** | Email **inboxes** (Ken or customer) |
| Transactional product email (Resend templates) | Personal files (Desktop, Documents, password managers) |
| Draft outreach (human approve before send) | Customer account logins (Google, Meta, hosting, banks) |
| | Money movement, refunds, card charges |
| | Public social posts / `--deliver` blasts |
| | Production `.env` / SSH / Stripe secret exfiltration |

---

## Human-only forever

- Money, refunds, payouts  
- Reading inboxes  
- Logging into banks or third-party accounts  
- Approving cold outreach (`approved_send`)  
- Deleting production data  

---

## Enforcement layers

1. **Policy file (this doc)** — operators + agents  
2. **`lib/openclaw-containment.mjs`** — deny patterns, path sandbox, job sanitizer  
3. **Expert gate (mandatory)** — `lib/openclaw-expert-gate.mjs`  
   - Loads `openclaw/experts/meridian/<agent>.md` **every task** before work  
   - Hub policy: `~/.grok/openclaw-hub` + vendored `lib/openclaw-hub/`  
   - Fail closed if expert missing/empty  
4. **Entrypoints wrap** — `daily.mjs`, `deploy-agent.mjs`, install queue  
5. **No `--deliver`** — never pass deliver flags  
6. **API keys** — only used server-side to build packs; never emailed in full to third parties; not logged in ops job lists  

### Expert status

```http
GET /api/openclaw/experts
GET /api/openclaw/containment
POST /api/ops/openclaw/run   # body: { "agentId": "daily-ops" }
```

---

## What Full Auto Install may do

When a customer pays Full Auto:

- Create Meridian agent from checkout fields  
- Smoke-test chat  
- Generate widget snippet, Retell/Vapi JSON, n8n workflow  
- Email **product** connect links to the **buyer’s checkout email**  
- Queue priority install pack  

Full Auto still **cannot**:

- Log into the customer’s bank, Gmail, Shopify, or phone carrier  
- Attach a phone number for them (carrier account = customer)  
- Charge anyone except via Stripe Checkout they already completed  

---

## Ops check

```http
GET /api/openclaw/containment
```

```powershell
cd C:\Users\hunte\github-clones\meridian
node -e "import('./lib/openclaw-containment.mjs').then(m => console.log(m.containmentStatus()))"
```

---

## If something asks for bank/email/files

Reply and stop:

```text
BLOCKED BY CONTAINMENT — OpenClaw cannot access banks, inboxes, personal files, or account logins (yours or the customer’s). A human must do that outside Meridian.
```
