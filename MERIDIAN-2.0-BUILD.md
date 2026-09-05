# Meridian 2.0 build

## What changed

The `meridian-agency-2-0` branch introduces a premium agency front door at `/meridian-2.html`.

Positioning: **AI operations that move the business forward.**

The page reframes Meridian from a narrow Voice/Sales/Booking vendor into a managed AI operations partner while retaining those capabilities as part of the broader system.

## Included

- Premium dark editorial agency UI
- Lead → Understand → Route → Automate → Specialist → QA → Client → Revenue operating visualization
- Six operating areas: acquire, convert, book, serve, operate, improve
- Horizontal service carousel
- Interactive workflow trace for missed calls, web leads, quote requests and appointments
- Diagnose / Deploy / Operate managed-service model
- Free Automation Opportunity Scan
- Existing `/api/funnel` integration for lead capture
- Responsive layout and reduced-motion support
- No fabricated client proof or unsupported guarantees

## Existing systems preserved

The build does not replace Meridian's existing agent pages, Express backend, Stripe paths, proposal funnel, OpenClaw workflows, CASL-aware approval controls, ops dashboard, or health endpoint.

## Next implementation phase

1. Promote the new front door to `/` after browser smoke testing.
2. Add dedicated paid-traffic landing pages for automation, revenue operations, voice, sales, booking, search and web.
3. Connect the Automation Opportunity Scan to a structured proposal response.
4. Run production smoke tests against `/health`, `/api/funnel`, Stripe checkout and agent routes.
5. Deploy only after the above checks pass.
