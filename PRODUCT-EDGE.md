# Meridian product edge (research → plan → shipped)

**Updated:** 2026-07-20  
**Purpose:** Competitive edge for SMB AI receptionist / voice agency — reliability, security, self-update, features that close deals.

---

## 1. Competitive research (summary)

### Who sets the bar

| Segment | Leaders | What buyers pay for |
|---------|---------|---------------------|
| Voice infra | Retell, Vapi, Bland | Low latency, SIP, tools, scale |
| No-code deploy | Synthflow, Thoughtly, Goodcall | Live in minutes, templates |
| SMB “business in a box” | My AI Front Desk, Brilo-class | Voice + chat + SMS + CRM summaries ~$65–$149/mo |
| Hybrid trust | Smith.ai (+ Ruby human) | AI + live human, warm transfer, legal/med intake |
| Enterprise CC | PolyAI, large CX AI | Languages, SLA, SOC2/HIPAA narrative |

### Table-stakes features (2026 tests + G2/Reddit)

1. Answer every call / chat 24/7  
2. Sub‑~600ms feel (phone path owned by Retell/Vapi)  
3. Off-script recovery (LLM, not rigid IVR)  
4. Live booking / calendar intent  
5. Human / warm transfer with context  
6. **Call/chat summary to owner/CRM in ~60s** (often cited as real ROI)  
7. After-hours + missed-call recovery (SMS)  
8. CRM/webhook logging  
9. Compliance story (SOC2/HIPAA when relevant; honest CA posture for Meridian)  
10. Knowledge base so agent doesn’t invent facts  

### Meridian positioning (do not abandon)

- **Brain + agency product**, not a clone of Retell  
- Claude truth layer + install wizard + packs + contained OpenClaw  
- xAI voice picker + metered hosted TTS  
- Ontario / CASL / PIPEDA-minded trust  

---

## 2. Gap analysis (before this build)

| Area | Was | Gap |
|------|-----|-----|
| Reliability | Fallback regex | No probes, no public status story |
| Security page | Privacy/terms only | No customer-facing security posture |
| Knowledge | Hours/services/faqs fields | No KB docs, scrape, anti-hallucination block |
| Interactions | Webhooks only | No dashboard history |
| Alerts | Email on purchase | No emergency/human owner ping |
| SMS | None | Missed-call / confirm not wired |
| Voice picker | Partial | Shipped prior session |
| Customer portal | Guide + setup | No dashboard |

---

## 3. High-level plan (executed)

### Phase A — Never-break core
- Unified turn pipeline (intent → brain → log → alerts)  
- Stronger system prompt (truth rules + knowledge block)  
- Empty-reply guard + emergency transfer injection  
- Synthetic health probes (cron + per-agent API)  
- Public `/status` + `/api/status`  

### Phase B — Competitive SMB features
- Interaction log + stats  
- Owner email/SMS notify (Resend + optional Twilio)  
- Call-ended summary + missed-call textback APIs  
- Knowledge CRUD + website scrape (SSRF-safe)  
- Customer dashboard UI  
- Setup wizard: voice + knowledge/alerts  

### Phase C — Trust surface
- `/security` page (honest: no fake SOC2)  
- Key split documented (`mdn_` / `mdnw_`)  
- Contained OpenClaw still enforced  

### Phase D — Deferred (not fake-shipped)
- Full Google Calendar OAuth book-on-call (needs customer OAuth product work)  
- Hybrid human staff (partner, not payroll)  
- SOC 2 Type II (when MRR funds audit)  
- Full bilingual FR product packs  

---

## 4. What shipped (code map)

| Module | Role |
|--------|------|
| `lib/knowledge.mjs` | Truth layer, scrape, intent (emergency/human/spam/booking) |
| `lib/interactions.mjs` | Turn log + stats + summary text |
| `lib/notify.mjs` | Resend email + Twilio SMS |
| `lib/reliability.mjs` | Platform status + probes |
| `lib/turn-pipeline.mjs` | Unified customer turn |
| `lib/agent-brain.mjs` | Prompt = expertise + truth + facts + KB |
| `server.mjs` | Routes for dashboard, knowledge, SMS, call-ended, health, status |
| `public/status.html` | Public status UI |
| `public/security.html` | Security posture |
| `public/dashboard.html` + `js/dashboard.js` | Customer portal |
| Setup wizard | Voice picker + knowledge step |

### Customer URLs

| URL | Purpose |
|-----|---------|
| `/status` | Live system status |
| `/security` | Trust / security |
| `/dashboard` | Agent portal (mdn_ key) |
| `/setup` · `/setup/:token` | Install wizard |
| `/api/status` | Status JSON |

### Env (optional polish)

```
ANTHROPIC_API_KEY=…          # Claude brain
XAI_API_KEY=…                # hosted TTS + previews
RESEND_API_KEY=…             # owner emails
EMAIL_FROM=…
TWILIO_ACCOUNT_SID=…         # SMS
TWILIO_AUTH_TOKEN=…
TWILIO_FROM_NUMBER=…
MERIDIAN_SMS_ALERTS=1        # SMS owner on high priority
MERIDIAN_HEALTH_PROBE=1      # default on
MERIDIAN_HEALTH_PROBE_MS=900000
```

---

## 5. How to demo competitive edge in one call

1. Open `/status` → show operational + graceful notes  
2. Open `/security` → keys, containment, no fake badges  
3. `/setup` → pick voice → save truth layer + owner email  
4. Test chat: “What are your hours?” → correct facts  
5. Test: “This is an emergency gas leak” → transfer language + owner alert path  
6. `/dashboard` → see interaction + probe health  
7. Phone still: Retell speaks Meridian `reply` with `audio:false`  

---

## 6. Content engine (shipped)

Long-form **Insights** articles every ~2.5 days:

1. Claude **drafts** long-form + image plan (inline SVG figures)  
2. Claude **vets** (approve / needs_fix / reject)  
3. Auto **fix + re-vet** (max 2 rounds)  
4. Status **ready** → ops **Publish** in `/ops` (or `MERIDIAN_ARTICLES_AUTO_PUBLISH=1`)  
5. Live at `/blog` and `/blog/:slug`  

Env: `MERIDIAN_ARTICLES=1`, optional `MERIDIAN_ARTICLE_INTERVAL_DAYS=2.5`

## 7. Next builds (when you want more edge)

1. Google Calendar tool call (real free/busy)  
2. Weekly knowledge refresh email (“approve these 3 FAQ diffs”) — engine exists; enable `MERIDIAN_KNOWLEDGE_REFRESH=1`  
3. EN/FR bilingual agent templates  
4. White-label multi-client workspace  
5. Outbound appointment reminder SMS campaigns (CASL consent first)  

---

*Meridian Agency — independent product. Not ClaudeCraft / SaberClaw / AgentBridge.*
