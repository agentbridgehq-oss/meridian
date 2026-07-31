# Meridian Voice — usage billing (cash first · never reverse)

**Model:** customer pays **first** (prepaid packs or monthly included turns).  
Meridian **reserves** a turn, **then** calls xAI, **then** commits.  
If TTS fails → turn is **refunded** to the customer.  
You never run xAI against unpaid balance.

**Default: no postpaid overage** (`VOICE_ALLOW_OVERAGE=0`). Included sub turns are prepaid monthly cash. When used up → buy a pack (pay first).

Your list prices stay **far above** estimated xAI cost so unit economics stay profitable.

---

## How you never “owe X before you got paid”

| Step | Who pays | When |
|------|----------|------|
| 1. Pack / Voice Premium | **Customer → you** (Stripe) | **Before** any neural TTS |
| 2. `reserveTurn` | Internal hold | Balance must exist |
| 3. xAI TTS | **You → xAI** | Only after hold succeeds |
| 4. Commit / release | Ledger | Success keeps debit; fail refunds hold |
| Free site “Play sample” | Nobody / demo TTS | **Never** uses `XAI_API_KEY` |

If balance is empty → **402 payment_required** → **no xAI call**.

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
- With `audio: true` → **reserveTurn** → xAI TTS → **commit** (or **release** if TTS fails).
- **Voice picker** (free demo audio only): `GET /api/voice/voices` · `POST /api/voice/preview` — **does not call xAI**, does not debit packs.
- Platform path (`audio` omitted/false): Retell/Vapi speak text — **$0 Meridian TTS**, no xAI.

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
XAI_API_KEY=xai-…                    # server-only TTS (never in browser)
VOICE_PROVIDER=xai                   # optional; auto if key present
XAI_TTS_VOICE=ara                    # premium human default (warm receptionist)
XAI_TTS_RETRIES=3
XAI_TTS_FALLBACK_VOICES=ara,eve,carina,luna,orion,rex,sal
# Brain PAYG
ANTHROPIC_API_KEY=sk-ant-…           # Claude primary
GROQ_API_KEY=gsk_…                   # fast failover when Claude fails
GROQ_MODEL=llama-3.3-70b-versatile
# Optional margin knobs (cents)
VOICE_CENTS_PER_TURN=55              # customer list per turn
VOICE_COST_CENTS_PER_TURN=4          # your cost estimate for ROI
VOICE_ALLOW_OVERAGE=0                # keep 0 so you never fund unpaid overage
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
