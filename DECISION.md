# Placement decision — Meridian Agency

**Date:** 2026-07-19  
**Call:** Meridian stays **its own agency and site**. Not under ClaudeCraft, SaberClaw, or AgentBridge.

## Research (product map)

| Product | Buyer | Job | Fit for Voice/Sales/Booking agency? |
|---------|--------|-----|-------------------------------------|
| **ClaudeCraft** | Claude users, solo builders | Skill packs + courses | **No** — education SKU, wrong offer shape |
| **SaberClaw** | Builders / small teams | Embeddable agents, free→paid API volume | **No** — platform SaaS for devs, not local-biz DFY |
| **AgentBridge** | Devs / multi-tool users | Session continuity across AI tools | **No** — continuity product; “voice bridge” ≠ receptionist agency |
| **Meridian** | Local businesses + operators who install for them | Missed calls, dead leads, empty calendars | **Yes** — this is the product |

## Why not fold into SaberClaw

- SaberClaw GTM: free tier, API keys, embed widgets, $20–$50/mo plans.
- Meridian GTM: $497 kits / ~$1k–$3k DFY installs, proposal + intake funnel, CASL approve-only outreach.
- Mixing confuses pricing, support, and brand. Domain (saberclaw.com) still not clean marketing surface.

## Why not fold into AgentBridge

- AgentBridge is **session continuity**, not an agency install stack.
- Different ICP, different claims policy (no patent language), different success metric.
- Putting “answer every call / book appointments” under AgentBridge would muddy both products.

## Why not ClaudeCraft

- Already tried embedding; wrong catalog and brand signal (“course site sells agency installs”).
- ClaudeCraft remains skills/courses only.

## Architecture that stays

| Layer | Home |
|-------|------|
| Code | `C:\Users\hunte\github-clones\meridian` only |
| Runtime | Own process/port (8891 local) · own Railway service when live |
| Brand | Meridian Agency |
| Stripe / Resend / webhooks | Meridian env only |
| ClaudeCraft | No Meridian SKUs, no Meridian APIs |

## Non-goals

- Do not re-add `/api/meridian/*` to ClaudeCraft.
- Do not ship Voice/Sales/Booking kits as SaberClaw or AgentBridge SKUs.
- Optional later: thin **cross-link** in portfolio marketing only after Meridian has a public URL — never shared billing.

## Deploy rule

Ship Meridian only after local E2E passes. Use a **new** Railway service from this repo. Do not attach to ClaudeCraft / AgentBridge / SaberClaw projects.
