# Meridian Voice — usage billing (guaranteed high ROI)

**Model:** customers pay **as they go** (prepaid packs) or **subscription + overage**.  
Meridian calls **xAI TTS only after** balance is confirmed, and **charges only after** audio succeeds.

Your list prices are set **far above** estimated provider cost so unit economics stay profitable by design.

---

## How profit is locked in

| Layer | Who pays | When |
|-------|----------|------|
| xAI TTS | **You** (XAI_API_KEY on Railway) | Only after customer has balance |
| Customer | **Them** via Stripe pack or sub | Before / as they use turns |
| Margin | List price ≫ cost est. | Default ~**$0.55/turn** customer vs ~**$0.04** cost est. |

If balance is empty → API returns **402 payment_required** → **no xAI call** → no surprise cost on your xAI bill.

---

## Customer products

### 1) Pay-as-you-go packs (cash first)

| Pack | Turns | Price | ≈ $/turn |
|------|-------|-------|----------|
| Starter | 100 | **$49** | $0.49 |
| Growth | 500 | **$199** | $0.40 |
| Scale | 2,000 | **$697** | $0.35 |

Checkout:
- `/checkout/voice-pack/starter`
- `/checkout/voice-pack/growth`
- `/checkout/voice-pack/scale`

Optional: `?agentId=agent_xxx` to credit the right account.

### 2) Subscriptions (high MRR)

| Plan | Monthly | Included | Overage |
|------|---------|----------|---------|
| Voice Premium | **$197** | 300 turns | $0.55/turn |
| Voice Pro | **$497** | 1,200 turns | $0.45/turn |

Checkout:
- `/checkout/voice-sub`
- `/checkout/voice-pro`

Overage creates Stripe **invoice items** on the customer (billed with their next invoice).

### 3) One-time Voice Kit (existing)

`/checkout/voice` — **$497** install kit (platform phone path). Hosted xAI still needs pack or sub.

---

## API (metered)

```http
POST /api/v1/agents/:id/speak
Authorization: Bearer mdn_…
{ "text": "Thanks for calling…", "audio": true }
```

```http
POST /api/v1/agents/:id/voice-turn
Authorization: Bearer mdn_…
{ "transcript": "What are your hours?", "audio": true }
```

- Without `audio: true` → text/`say` only, **no Meridian TTS fee** (Retell/Vapi speak it).
- With `audio: true` → balance check → xAI TTS → debit on success.

```http
GET /api/v1/agents/:id/billing
GET /api/pricing/voice
```

Ops ROI (your eyes only):

```http
GET /api/ops/billing/roi
X-Meridian-Token: $OPS_TOKEN
```

---

## Railway env

```bash
STRIPE_SECRET_KEY=sk_live_…          # required for real charges
XAI_API_KEY=xai-…                    # server-only TTS
VOICE_PROVIDER=xai                   # optional; auto if key present
XAI_TTS_VOICE=eve
# Optional margin knobs (cents)
VOICE_CENTS_PER_TURN=55              # customer list per turn
VOICE_COST_CENTS_PER_TURN=4          # your cost estimate for ROI
VOICE_SUB_MONTHLY_CENTS=19700
VOICE_SUB_INCLUDED_TURNS=300
# Optional fixed Stripe Price IDs
STRIPE_PRICE_VOICE_SUB=price_…
STRIPE_PRICE_VOICE_PRO=price_…
STRIPE_WEBHOOK_SECRET=whsec_…        # recommended
```

Webhook must receive at least:
- `checkout.session.completed`
- `customer.subscription.updated` / `deleted`

Point Stripe webhook to: `https://<meridian>/api/stripe/webhook`

---

## Data files (volume `/data`)

- `billing-accounts.json` — prepaid balances, plans, Stripe IDs, lifetime revenue/cost
- `usage-ledger.json` — per-turn audit trail

---

## Operator rules

1. Never put `XAI_API_KEY` in the browser or customer kits.  
2. Prefer **prepaid packs** for pure pay-as-you-go (zero risk of free speech).  
3. Keep `VOICE_CENTS_PER_TURN` ≥ **5×** `VOICE_COST_CENTS_PER_TURN`.  
4. Watch ROI: `GET /api/ops/billing/roi`.  
5. Cap your own xAI auto top-up so a bug cannot drain you.

---

## What “guaranteed high ROI” means here

- **No free premium TTS** — empty balance = hard stop.  
- **Cash-first packs** — customer money hits Stripe before turns exist.  
- **Subs** — monthly fee covers a block of turns at high ARPU; overage still marked up.  
- **Charge after success** — failed xAI responses do not debit the customer (and you don’t get paid for air — but you also don’t invent fake usage).

Tune dollars in env; do not lower customer price below cost multiple without a deliberate decision.
