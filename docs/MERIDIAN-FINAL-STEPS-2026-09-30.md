# Meridian final owner steps — 2026-09-30

## Live links

- Public front: https://meridian-open.netlify.app/
- Voice / Receptionist: https://meridian-open.netlify.app/agents/voice
- Sales: https://meridian-open.netlify.app/agents/sales
- Booking: https://meridian-open.netlify.app/agents/booking
- Browser conversation demo: https://meridian-open.netlify.app/meridian-voice-demo.html
- Railway runtime: https://meridian-production-4996.up.railway.app

## What is complete in source

- Homepage no longer leads with $997 or $497 pricing.
- Primary Voice, Sales and Booking cards open dedicated agent setup pages in a new tab/window.
- Each primary agent page includes:
  - studio voice testing surface;
  - role-specific capabilities;
  - what Meridian connects;
  - what Meridian proves before launch;
  - setup/API instructions;
  - daily rotating field note;
  - customer special-instruction form;
  - must-do, must-never and human-handoff rules;
  - carry-through of those instructions into the proposal/scope builder.
- Service Agent received the same instruction/capability framework for consistency.
- Public opening source contains no “Kenny Hunter” full-name exposure.
- Daily field notes rotate locally by America/Toronto date without requiring an AI key.
- Existing long-form article engine now defaults to a one-day generation interval when it is enabled. Claude vet/publish gating remains intact.

## Owner action 1 — publish the latest front

The current Netlify production deploy predates these front-end commits. From a local copy of the repository on branch `meridian-agency-2-0`:

```powershell
git checkout meridian-agency-2-0
git pull origin meridian-agency-2-0
npx -y netlify-cli@latest deploy --prod --build --site 60f796ca-2590-4af4-8870-c6bfeaeef5c8
```

Run it from the Meridian repo root so `netlify.toml`, `public/` and the Netlify Functions are deployed together.

## Owner action 2 — add voice secrets

### Netlify — studio sample voices
Add in Netlify project `meridian-open`:

- `ELEVENLABS_API_KEY` — secret, Functions scope.
- `VOICE_ENABLE_ELEVENLABS=1` — Functions scope. The flag has been requested through the connected Netlify app; verify it after the production deploy.

Then redeploy the site.

### Railway — live browser conversation / phone core
Add in Railway project `Meridian`, service `meridian`:

- `OPENAI_API_KEY`
- `OPENAI_WEBHOOK_SECRET` (required before phone/PSTN launch)

Never place either value in GitHub or browser code.

## Owner action 3 — acceptance tests

### Browser / studio
1. Open /agents/voice and play a studio sample.
2. Open /agents/sales and play a studio sample.
3. Open /agents/booking and play a studio sample.
4. Enter special instructions and confirm they appear in the proposal builder.
5. Open /meridian-voice-demo.html and complete a real microphone conversation for Receptionist, Sales and Booking.

### Phone launch (only after browser checks)
Configure Twilio Elastic SIP / DID routing, then place a real inbound test call. Verify:
- correct greeting/business facts;
- interruption handling;
- transfer or callback fallback;
- booking/CRM actions only claim success after verified tools confirm them;
- call outcome is recorded.

Do not call phone voice customer-live until the real inbound call and required connected-system checks pass.
