# Meridian Agency — Marketing Plan (regenerated)

**Updated:** 2026-07-20  
**Product:** Meridian Agency — Voice · Sales · Booking  
**Live site:** https://meridian-production-2eb0.up.railway.app/  
**Owner:** Ken · Agent Bridge Technologies Inc. (Ontario)

---

## Verdict on the plan you pasted

**Strong yes — use it as the spine.** It matches how Meridian should sell: intent → dedicated landing → short form → proposal/checkout → install. A few Meridian-specific upgrades:

| Your plan | Meridian adjustment |
|-----------|---------------------|
| 2 landing pages | **Yes** — never send paid traffic to homepage |
| Search + LinkedIn/Meta | **Search first 30 days** (intent); Meta for local service verticals; LinkedIn only if ICP = multi-location / franchise |
| Outbound 100 prospects | **CASL:** funnel consent preferred; cold email only **approve-only** drafts, no blast |
| Auto proposal | **Already built** — `/api/funnel` + guide chat + Stripe |
| Full Auto Install | **Upsell** on landers: DIY kit vs Full Auto ($997–$2,497) |
| Measurement | Add **paid install rate** + **time-to-live agent** (Meridian’s real success metric) |

**Start with:** Search ads + one Meta campaign + one CASL-safe outbound list of 100 + **two dedicated landers**. Prove CPL and CAC in 30 days before scaling.

---

## 1. Ideal Customer Profile (ICP)

### Primary ICP (validate first)

| Attribute | Definition |
|-----------|------------|
| **Who** | Local service businesses in Canada / US that **miss calls or lose leads** |
| **Verticals (wave 1)** | HVAC, plumbing, electrical, roofing, dental/medspa, salons, auto repair |
| **Size** | Owner-operated to ~20 staff; $300k–$5M revenue |
| **Trigger** | After-hours calls, no-shows, leads going cold, “I need a receptionist I can’t afford” |
| **Buyer** | Owner / GM who can approve $497–$2,500 in a week |
| **Not ICP** | Pure software teams wanting API toys (→ SaberClaw); course buyers (→ ClaudeCraft) |

### Secondary ICP (days 31–90)

- **Operators / small agencies** who install agents for local clients (buy Full Stack $997 + resell DFY)
- Multi-location local brands (then LinkedIn makes sense)

### Primary goal funnel

```
Traffic → Qualified lead (name/email/phone + consent)
       → Proposal / checkout (kit or Full Auto)
       → Paid
       → Agent live (setup wizard / install)
```

**North-star metrics**

| Metric | Target (first 30 days) |
|--------|-------------------------|
| CPL (paid) | Under **$40–80** depending on vertical |
| Lead → paid | **8–15%** |
| CAC | Under **~⅓ of first invoice** (e.g. CAC &lt; $300 if AOV ~$1k) |
| Time lead → live agent | **&lt; 7 days** for DIY; **&lt; 48h** Full Auto path |

---

## 2. Budget & 30-day validation rule

| Item | Recommendation |
|------|----------------|
| **30-day paid test budget** | **$1,500–$3,000** total |
| **Channel 1 (must)** | Google Search — **60–70%** of budget |
| **Channel 2** | Meta — **30–40%** (local service creatives) |
| **LinkedIn** | Skip until ICP = chains / multi-location |
| **Outbound** | Time cost only; **no spam**; approve-only |
| **Rule** | If CPL or CAC fails week 3–4, **kill or rewrite ICP** before scaling |

---

## 3. Channel comparison (Meridian)

| Channel | Cost | Speed | Precision | Best for Meridian |
|---------|------|-------|-----------|-------------------|
| **Search Ads** | Med–High | Fast | High | **Primary** — “AI receptionist for plumbers” intent |
| **Meta Ads** | Low–Med | Fast | High | Local verticals, video/creative tests |
| **LinkedIn** | High | Med | Very high | Multi-location / B2B operators only |
| **Organic / SEO** | Low | Slow | Low | Why-agents article + local pages (parallel) |
| **Cold email** | Low | Med | Med | Top 100 list, **CASL / approve-only** |
| **TikTok / short video** | Low–Med | Fast | Med | Creative tests (use VIDEO-ADS-PIPELINE) |

---

## 4. Offers (match ads → landers → checkout)

| Offer | Price | Land for |
|-------|-------|----------|
| Voice / Sales / Booking kit | $497 each | Intent “missed calls” / “lead follow-up” / “no-shows” |
| Full Stack kit | $997 | “All three agents” |
| **Full Auto Install** | $997–$2,497 | “Do it for me” / high-intent |
| Free | Proposal + Why agents | Warm content, not paid search |

**Never** send paid traffic to homepage. Use dedicated landers only.

---

## 5. Landing pages (build these)

### LP-A — “Never miss another call” (Voice-led)

- Promise: 24/7 answer + book  
- CTA: Get proposal / Buy Voice / Full Auto Voice  
- Proof: product screens, how it works (platform + Meridian brain)  
- Form: **name, phone, email, consent** only  
- URL pattern: `/go/voice` or `/lp/missed-calls`  

### LP-B — “Full stack for local business” (proposal-led)

- Promise: Voice + Sales + Booking in one install  
- CTA: Full Stack $997 / Full Auto $1,497  
- Same short form + consent  
- URL: `/go/stack` or `/lp/full-stack`  

**Rules:** Headline mirrors ad. One primary CTA. No nav rabbit holes. Mobile-first.

---

## 6. Tracking (days 0–7)

| Tool | Use |
|------|-----|
| **GA4** | Landers + checkout funnels |
| **Meta Pixel** | Meta campaigns |
| **Google Ads conversion** | Purchase / lead |
| **UTMs** | Every ad and outbound link |
| **Stripe** | Revenue source of truth |
| Optional LinkedIn Insight | Only if LinkedIn runs |

Events to fire: `lead_submit`, `checkout_start`, `purchase`, `agent_live`.

---

## 7. 30–60–90 day plan

### Days 0–7 — Setup

1. Ship **LP-A** and **LP-B** (mirror ad promises).  
2. Wire GA4 + Pixel + UTMs + Stripe conversion.  
3. Short form → existing Meridian funnel / guide chat (consent).  
4. Confirm checkout: `/checkout/voice`, `/checkout/stack`, `/checkout/auto`.  
5. Write **3 search ad groups** + **3 Meta creatives** (vertical: pick **one** vertical first, e.g. HVAC or plumbing).  
6. Build **outbound list of 100** (one city + one vertical); CASL playbook only.  

### Days 8–30 — Validate

1. **Search ads** live: keywords like  
   - `AI receptionist for [vertical]`  
   - `after hours phone answering [city]`  
   - `automated booking agent for [vertical]`  
2. **Meta** one campaign: same vertical, local radius, creative A/B.  
3. **Outbound:** 100 prospects, approve-only emails + optional voicemail; CTA = 1-page proposal.  
4. Weekly: kill losers, double winners.  
5. Target: enough paid leads to estimate **CPL, lead→paid, CAC**.  

### Days 31–60 — Optimize & automate

1. A/B: headlines, CTA, form (3 fields vs 4).  
2. Auto path already partially live:  
   - Lead → proposal / chat intake  
   - Stripe → provision → setup wizard  
3. Hot leads: human review for Full Auto / high ticket.  
4. Content loop (no fake stats): expand `/why-agents`, vertical FAQ pages, short TikTok/Reels from VIDEO-ADS-PIPELINE.  
5. Meridian Sales agent: form → `/sales/lead` draft follow-up (customer sends SMS).  

### Days 61–90 — Scale

1. Scale only channels with **CPL + CAC** in range.  
2. Add second vertical only after first works.  
3. Retention: onboarding email, install checklist, setup wizard completion.  
4. Operator ICP: Full Stack for resellers.  

---

## 8. Outbound playbook (CASL)

| Do | Don’t |
|----|--------|
| Use public business contact where appropriate | Bought lists / spam |
| One clear value + proposal CTA | Feature dumps |
| Approve every cold send | Auto-blast OpenClaw |
| STOP / unsubscribe path | Fake social proof |

OpenClaw: **draft only**; human `approved_send`.

---

## 9. Ad message angles (no invented stats)

1. **Missed call = missed job** — Voice agent answers 24/7.  
2. **Lead goes cold in minutes** — Sales agent replies in under a minute.  
3. **Calendar holes** — Booking agent confirms and recovers no-shows.  
4. **Hire less admin, not another full-time front desk** — Full Auto install.  

Always pair: **problem → agent → clear price or proposal**.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Wrong ICP → high CAC | One vertical, $1.5–3k test, kill fast |
| Ad ≠ landing | Separate LP per promise |
| Checkout friction | Test Stripe Full Auto + kits before spend |
| CASL / spam claims | Consent funnel; approve-only cold |
| Fake social proof | **Forbidden** — product demos only |
| Scaling before proof | 30-day CAC gate before budget double |

---

## 11. Decision defaults (if you don’t answer further)

| Question | Default |
|----------|---------|
| ICP wave 1 | **HVAC + plumbing**, single metro |
| Primary paid channel | **Google Search** |
| Secondary | **Meta** |
| 30-day budget | **$2,000** |
| Primary offer on search | Voice kit + Full Auto upsell |
| Success gate | CAC &lt; $350 and ≥ 3 paid installs |

---

## 12. This week’s execution checklist

- [ ] Choose vertical + city  
- [ ] Build LP-A + LP-B  
- [ ] GA4 + Pixel + UTMs  
- [ ] Search campaign live (small budget)  
- [ ] Meta campaign live (small budget)  
- [ ] 100-prospect list + approved outbound sequence  
- [ ] Stripe smoke test (kit + auto)  
- [ ] Weekly scorecard: spend, leads, CPL, paid, CAC  

---

## Related product URLs

| Asset | URL |
|-------|-----|
| Home | https://meridian-production-2eb0.up.railway.app/ |
| Why agents | …/why-agents |
| Install | …/install |
| Setup wizard | …/setup |
| Full Auto | …/#full-auto |
| Checkout stack | …/checkout/stack |
| Checkout auto | …/checkout/auto |

---

## Bottom line

Your plan is the right shape: **intent ads → dedicated landers → short form → paid install → measure CAC.**  
Meridian already has the backend funnel (proposal, Stripe, Full Auto, setup wizard, sales pipeline). Marketing job now is **ICP focus + landers + 30-day paid proof**, not more product features.

**Next if you want execution:** pick vertical + city + budget, and we build LP-A/LP-B copy and first ad sets.
