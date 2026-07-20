/**
 * Meridian Guide Agent — a human-on-a-call style concierge for the public site.
 *
 * Not just FAQ: it RUNS the onboarding process end-to-end in chat:
 *   discover need → capture email + explicit consent → generate real proposal
 *   → hand over checkout link (payment auto-advances the pipeline)
 *   → intake → connect guide → website widget / Retell / Vapi install help.
 *
 * Stateful via a `state` object the client echoes back each turn.
 * Money stays a customer decision (they pay); consent is explicit (CASL).
 */

import { upsertLead, runAgentOnLead, getLead, setStage, listLeads, BASE } from '../engine.mjs';

const EMAIL_RE = /[^\s@"']+@[^\s@"']+\.[^\s@"']{2,}/;

function detectNeed(m) {
  if (/voice|call|phone|receptionist|miss/.test(m)) return 'voice';
  if (/sales|lead|follow/.test(m)) return 'sales';
  if (/book|appoint|calendar|schedul|no-?show/.test(m)) return 'booking';
  if (/full|stack|all|everything|three|complete/.test(m)) return 'full';
  return null;
}

const NEED_LABEL = {
  voice: 'Voice Agent (24/7 phone answering)',
  sales: 'Sales Agent (instant lead follow-up)',
  booking: 'Booking Agent (calendar filling + no-show recovery)',
  full: 'Full Stack (Voice + Sales + Booking)',
};

/** FAQ answers — used for off-script questions at any step. */
function faq(m) {
  if (/price|cost|how much|\$|pricing/.test(m)) {
    return 'Kits: $497 each (Voice, Sales, or Booking). Full stack is $997. Done-for-you installs run $997–$3,497 setup + monthly monitoring. I can build you an exact proposal right here — just say "start".';
  }
  if (/widget|website chat|embed|my site|my website/.test(m)) {
    return 'Every Meridian agent comes with a one-line website widget — paste a single <script> tag on your site and your agent answers visitors 24/7. The exact snippet (with your keys pre-filled) is in your connect guide after setup.';
  }
  if (/retell|vapi|bland|twilio|platform|phone system/.test(m)) {
    return 'For phone: connect Retell, Vapi, or Bland. Your connect guide includes ready-to-import config files for each — the platform speaks with its native voice while Meridian holds your business brain (hours, services, booking rules).';
  }
  if (/security|safe|casl|spam|privacy|consent/.test(m)) {
    return 'Consent is required before anything is sent. API keys are shown once and stored hashed. Cold outreach requires human approval — Meridian never auto-blasts. Website widget uses a separate public token so your secret key never touches a web page.';
  }
  if (/why|benefit|worth|roi/.test(m)) {
    return 'Local businesses lose money three ways: missed after-hours calls, slow lead follow-up, empty calendars. Meridian installs an agent for each gap. Deep dive: /why-agents';
  }
  if (/human|person|talk to|support|real/.test(m)) {
    return 'I can complete your whole setup right here — same steps a human would run on an onboarding call. If you ever want a person, leave your email via "Get a proposal" and Meridian ops follows up.';
  }
  return null;
}

export function guideChat(message, history = [], state = {}) {
  const msg = String(message || '').trim();
  const m = msg.toLowerCase();
  const s = { step: 'discover', ...state };

  const out = (reply, patch = {}, actions = []) => ({
    reply,
    state: { ...s, ...patch },
    actions,
  });

  if (!msg) {
    return out(
      "Hi — I'm your Meridian guide. I can set you up completely right here in chat: pick your agent, get a real proposal, pay, and I'll walk you through putting the agent on your website and phone. Ready?",
      { step: 'discover' },
      [{ send: 'Start my setup' }, { send: 'What does it cost?' }, { send: 'How does it work?' }],
    );
  }

  // ── Global commands work at any step ──────────────────────────────────────
  if (/^(start|start my setup|get started|begin|sign me up|let'?s go)/i.test(msg)) {
    return out(
      "Great — let's do this like a proper onboarding call.\n\nFirst: what's hurting most right now?\n1. Missed phone calls → Voice Agent\n2. Leads going cold → Sales Agent\n3. Empty calendar / no-shows → Booking Agent\n4. All of it → Full Stack",
      { step: 'need' },
      [{ send: 'Missed calls' }, { send: 'Cold leads' }, { send: 'No-shows' }, { send: 'All of it' }],
    );
  }

  // ── Step: choose need ─────────────────────────────────────────────────────
  if (s.step === 'need' || (s.step === 'discover' && detectNeed(m))) {
    const need = detectNeed(m) || (/(all|everything|4)/.test(m) ? 'full' : null);
    if (need) {
      return out(
        `Perfect — ${NEED_LABEL[need]}.\n\nWhat's your business name? (So your proposal and agent are branded right.)`,
        { step: 'business', need },
      );
    }
    if (s.step === 'need') {
      return out(
        'No wrong answer — which sounds most like you: missed calls, leads going cold, empty calendar, or all of it?',
        {},
        [{ send: 'Missed calls' }, { send: 'Cold leads' }, { send: 'No-shows' }, { send: 'All of it' }],
      );
    }
  }

  // ── Step: business name ───────────────────────────────────────────────────
  if (s.step === 'business') {
    const businessName = msg.replace(/^(it'?s|we'?re|called|my business is)\s+/i, '').slice(0, 80);
    return out(
      `${businessName} — got it.\n\nWhat industry are you in? (plumbing, HVAC, dental, salon, roofing… anything)`,
      { step: 'niche', businessName },
    );
  }

  // ── Step: industry ────────────────────────────────────────────────────────
  if (s.step === 'niche') {
    return out(
      `Nice. What are your business hours? (e.g. "Mon–Fri 8–6, Sat 9–1" — your agent will quote these to every caller)`,
      { step: 'hours', niche: msg.slice(0, 60) },
    );
  }

  // ── Step: hours ───────────────────────────────────────────────────────────
  if (s.step === 'hours') {
    return out(
      `Got it. Last detail: what are your main services? (short list is perfect — e.g. "drain cleaning, water heaters, emergency repair")`,
      { step: 'services', hours: msg.slice(0, 120) },
    );
  }

  // ── Step: services ────────────────────────────────────────────────────────
  if (s.step === 'services') {
    return out(
      `Perfect — I have everything I need to build your project.\n\nWhat's your work email? Your proposal and agent credentials get delivered there. (Nothing is charged from chat — you'll see the full project and price first.)`,
      { step: 'email', services: msg.slice(0, 200) },
    );
  }

  // ── Step: email ───────────────────────────────────────────────────────────
  if (s.step === 'email') {
    const match = msg.match(EMAIL_RE);
    if (!match) {
      return out("That doesn't look like an email — try again? (e.g. you@yourbusiness.com)");
    }
    return out(
      `Thanks. One legal box to tick (Canadian anti-spam law): do you consent to Meridian emailing ${match[0]} about your proposal and setup? Reply YES to continue.`,
      { step: 'consent', email: match[0].toLowerCase() },
      [{ send: 'YES' }],
    );
  }

  // ── Step: consent → create the real lead + proposal ───────────────────────
  if (s.step === 'consent') {
    if (!/^y(es|ep|eah)?\b|consent|agree|ok/i.test(msg)) {
      return out(
        'No problem — I need an explicit YES to email you. You can also keep asking me questions here without giving an email.',
        { step: 'discover' },
      );
    }
    const lead = upsertLead({
      email: s.email,
      businessName: s.businessName || '',
      niche: s.niche || '',
      primaryNeed: s.need || 'full',
      consent: true,
      source: 'guide_agent_chat',
      stage: 'new',
      // Everything collected on this "call" — payment auto-builds the agent from
      // these details, so the client never fills a separate intake form.
      chatIntake: {
        businessName: s.businessName || '',
        niche: s.niche || '',
        hours: s.hours || '',
        services: s.services || '',
        primaryNeed: s.need || 'full',
        tone: 'professional',
        collectedVia: 'guide_agent_chat',
      },
    });
    runAgentOnLead(lead.id);
    setStage(lead.id, 'awaiting_money', { moneyStatus: 'pending' });
    const fresh = getLead(lead.id);
    const p = fresh?.proposal || {};
    const checkoutUrl = `${BASE}${p.kitCheckout || '/checkout/stack'}?lead=${lead.id}`;
    const intakeUrl = `${BASE}/intake/${fresh?.intakeToken}`;

    // Scope of work — the client sees exactly what gets built, with their details
    const scope = (p.agents || []).map((a) => {
      if (/voice/i.test(a)) return `• Voice Agent — answers ${s.businessName || 'your'} calls 24/7, quotes your hours (${s.hours || 'as provided'}), routes emergencies, takes bookings`;
      if (/sales/i.test(a)) return `• Sales Agent — replies to every new ${s.niche || ''} lead in under a minute, qualifies, and books the next step`;
      if (/book/i.test(a)) return `• Booking Agent — fills your calendar around ${s.hours || 'your hours'}, confirms twice, recovers no-shows`;
      return `• ${a}`;
    }).join('\n');

    return out(
      `Here's your proposed project, ${s.businessName || 'friend'}:\n\n` +
        `THE WORK\n${scope}\n` +
        `• Trained on your services: ${s.services || 'as provided'}\n` +
        `• Delivered live + smoke-tested, with: one-line website widget, phone configs (Retell/Vapi), API + CRM webhooks\n\n` +
        `THE PRICE\n• Setup: $${p.setupUsd} · Monthly: $${p.monthlyUsd}\n\n` +
        `Your call — accept and your agent builds itself the moment payment clears (no forms, I already have your details). A copy of everything goes to ${s.email}.`,
      { step: 'decision', leadId: lead.id, intakeUrl, checkoutUrl },
      [
        { label: 'Accept — pay & go live', href: checkoutUrl },
        { send: 'Change something' },
        { send: 'Not now' },
      ],
    );
  }

  // ── Step: accept / decline the proposed project ───────────────────────────
  if (s.step === 'decision') {
    if (/accept|yes|deal|let'?s do it|approve|i'?m in/i.test(m)) {
      return out(
        `Excellent. Complete payment here and your agent starts building immediately:\n${s.checkoutUrl}\n\nAfter payment you're redirected straight to your live connect guide — API key, website widget snippet, phone configs. Nothing else to fill out.`,
        { step: 'paid_wait' },
        [{ label: 'Pay & go live', href: s.checkoutUrl }],
      );
    }
    if (/change|edit|different|adjust|wrong/i.test(m)) {
      return out(
        `No problem — what should I change? Say "hours", "services", "business name", or "agent type" and give me the new value.`,
        { step: 'revise' },
        [{ send: 'Change hours' }, { send: 'Change services' }, { send: 'Change agent type' }],
      );
    }
    if (/not now|no thanks|later|too much|decline/i.test(m)) {
      return out(
        `Totally fine — your proposal stays saved against ${s.email}, no charge, no spam. Come back anytime and say "I'm back" or use the checkout link whenever you're ready. Anything else I can answer?`,
        { step: 'discover' },
        [{ send: 'What does the price include?' }, { send: 'How fast is setup?' }],
      );
    }
  }

  // ── Step: revise details then re-present ──────────────────────────────────
  if (s.step === 'revise') {
    if (/hour/i.test(m)) return out('New hours?', { step: 'revise_hours' });
    if (/service/i.test(m)) return out('New services list?', { step: 'revise_services' });
    if (/agent|type/i.test(m)) {
      return out('Which setup instead — Voice, Sales, Booking, or Full stack?', { step: 'need' });
    }
    if (/name/i.test(m)) return out('New business name?', { step: 'business' });
    return out('Tell me what to change: hours, services, business name, or agent type.');
  }
  if (s.step === 'revise_hours' || s.step === 'revise_services') {
    const patch = s.step === 'revise_hours' ? { hours: msg.slice(0, 120) } : { services: msg.slice(0, 200) };
    // Re-run the consent step logic to rebuild proposal with updated details
    return guideChat('YES', history, { ...s, ...patch, step: 'consent' });
  }

  // ── Step: after proposal — guide through payment/intake/install ───────────
  if (s.step === 'paid_wait') {
    if (/after i pay|what happens|then what|next/.test(m)) {
      return out(
        `The moment your payment clears:\n1. You're redirected straight into your intake form (5 min).\n2. Submitting intake provisions your agent instantly — no waiting on a human.\n3. It runs must-pass smoke tests (hours, booking, pricing, greeting).\n4. You get your connect guide: secret API key (shown once), a one-line website widget snippet, and Retell/Vapi config downloads.\n5. Paste the widget on your site → your agent is LIVE for visitors immediately.\n\nWant the checkout link again?`,
        {},
        [{ label: 'Pay & start install', href: s.checkoutUrl || `${BASE}/#agents` }],
      );
    }
    if (/paid|i paid|payment done|done paying|purchased/.test(m)) {
      const lead = s.leadId ? getLead(s.leadId) : null;
      if (lead && ['money_approved', 'intake_received', 'agent_connected', 'verified', 'delivered'].includes(lead.stage)) {
        return out(
          lead.stage === 'money_approved'
            ? `Confirmed — payment is in. Your intake form is ready:\n${s.intakeUrl}\n\nFill it out and your agent provisions itself the second you submit.`
            : `You're past payment — current stage: ${lead.stage}. ${lead.deliveryToken ? `Your connect guide: ${BASE}/guide/${lead.deliveryToken}` : `Complete intake here: ${s.intakeUrl}`}`,
          {},
          [{ label: 'Open intake', href: s.intakeUrl }],
        );
      }
      return out(
        `I don't see the payment yet — it can take a minute. If you paid, you were redirected to your intake form automatically. Otherwise:\n${s.checkoutUrl || BASE + '/#agents'}\n\nStuck? Your intake link works as soon as payment lands: ${s.intakeUrl}`,
        {},
        [{ label: 'Checkout', href: s.checkoutUrl || `${BASE}/#agents` }],
      );
    }
  }

  // ── Install help for customers (any step) ─────────────────────────────────
  if (/install|connect|wire|set ?up|onboard|how (does|do).*(work|install)/.test(m)) {
    return out(
      'Full flow, exactly as it runs:\n1. Proposal (I build it here in chat — say "start").\n2. You pay — checkout auto-unlocks intake, no human needed.\n3. 5-minute intake → agent provisions itself + passes smoke tests.\n4. Connect guide: website widget (1 line of HTML), Retell/Vapi phone configs (downloadable), API + webhooks for your CRM.\n5. Paste widget → live on your site. Import config → live on your phone line.\n\nWhere are you in that flow?',
      {},
      [{ send: 'Start my setup' }, { send: 'I already have a guide link' }],
    );
  }
  if (/guide link|delivery|connect guide|lost my (key|guide)/.test(m)) {
    return out(
      'Your connect guide URL looks like ' + BASE + '/guide/… and was emailed when your agent went live. It has your widget snippet, Retell/Vapi downloads, and endpoints. Lost it? Reply with the email you signed up with and ops will re-send it (a human confirms identity first — keys are sensitive).',
    );
  }

  // ── FAQ fallbacks ─────────────────────────────────────────────────────────
  const fa = faq(m);
  if (fa) {
    const nudge =
      s.step === 'need' ? '\n\n(We were picking your agent — missed calls, cold leads, no-shows, or all of it?)' :
      s.step === 'business' ? "\n\n(We were on your business name — what's it called?)" :
      s.step === 'email' ? "\n\n(We were on your work email — what is it?)" :
      s.step === 'consent' ? '\n\n(Reply YES when ready to continue your setup.)' : '';
    return out(fa + nudge);
  }

  if (/hello|hi\b|hey|good (morning|afternoon|evening)/.test(m)) {
    return out(
      "Welcome to Meridian. I'm the guide agent — I can answer anything, or run your entire setup right here like a human onboarding call: proposal → payment → intake → agent live on your website and phone. Say \"start\" when ready.",
      {},
      [{ send: 'Start my setup' }, { send: 'Pricing' }, { send: 'How does install work?' }],
    );
  }

  return out(
    'I can explain pricing, the agents (Voice, Sales, Booking), or run your complete setup in this chat — proposal, payment, intake, then getting the agent onto your website (one-line widget) and phone (Retell/Vapi). Try "start" or ask me anything.',
    {},
    [{ send: 'Start my setup' }, { send: 'What does it cost?' }],
  );
}
