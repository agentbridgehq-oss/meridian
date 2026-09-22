/**
 * Agent-run customer onboarding.
 * Meridian ops does not sit in this loop. The customer still pays,
 * pastes a widget, forwards a number, or activates their calendar connector.
 * Those are customer clicks, not Kenny.
 */

import { VOICE_TRIO } from './expertise.mjs';

const EMAIL_RE = /[^\s@"']+@[^\s@"']+\.[^\s@"']{2,}/;

export const ONBOARD_STEPS = Object.freeze([
  'discover',
  'need',
  'business',
  'niche',
  'hours',
  'services',
  'area',
  'timezone',
  'transfer',
  'email',
  'consent',
  'briefing',
  'connect',
]);

const NEED_TO_ROLE = {
  voice: 'receptionist',
  booking: 'booking',
  service: 'service',
  sales: 'sales',
  full: 'full',
};

export function detectOnboardNeed(message) {
  const m = String(message || '').toLowerCase();
  if (/service|dispatch|status|complaint|warranty|repair/.test(m)) return 'service';
  if (/book|appoint|calendar|schedul|no-?show/.test(m)) return 'booking';
  if (/sales|lead|follow|quote/.test(m)) return 'sales';
  if (/voice|call|phone|receptionist|miss|front.?desk|answer/.test(m)) return 'voice';
  if (/full|stack|all|everything|three|trio|complete/.test(m)) return 'full';
  return null;
}

function clean(value, max = 400) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function roleFor(need) {
  return NEED_TO_ROLE[need] || 'receptionist';
}

function commercialFor(need) {
  if (need === 'booking') return VOICE_TRIO.booking;
  if (need === 'service') return VOICE_TRIO.service;
  if (need === 'full') {
    return {
      id: 'trio',
      name: 'Voice trio on one number',
      setupUsd: 1497,
      usageUsdPerMinute: 0.2,
      includedMinutes: 200,
      numberUsdPerMonth: 19,
    };
  }
  return VOICE_TRIO.receptionist;
}

export function greetingScript({ businessName, hours, role }) {
  const name = businessName || 'the business';
  if (role === 'booking') {
    return `Thanks for calling ${name}. This is the booking desk. Are you looking to set a time, move one, or cancel?`;
  }
  if (role === 'service') {
    return `Thanks for calling ${name}. This is the service desk. Are you checking on a job, reporting a problem, or need dispatch?`;
  }
  return `Thanks for calling ${name}. You've reached the front desk. How can I help you today?`;
}

export function afterHoursScript({ businessName, hours }) {
  const name = businessName || 'the business';
  const h = hours || 'the hours on file';
  return `${name} is closed right now. Our hours are ${h}. I can take a message, book the next open slot if the calendar is connected, or note an urgent callback.`;
}

export function callForwardInstructions({ businessName }) {
  return [
    `Forward your existing business number to the Meridian DID we issue after payment.`,
    `Most carriers: call-forward busy + no-answer + unconditional after hours.`,
    `Keep the original number. Do not port it in v1.`,
    `Test: call the public number from a second phone. You should hear the ${businessName || 'business'} greeting.`,
  ];
}

export function calendarConnectorRecipe() {
  return {
    accept: { ok: true, confirmed: true },
    deny: { ok: false, confirmed: false, code: 'slot_unavailable' },
    actions: ['check_availability', 'book_appointment', 'cancel_appointment', 'reschedule_appointment'],
    auth: 'Bearer secret or X-Meridian-Signature: sha256=HMAC',
    note: 'Activate the workflow once. Until it returns confirmed:true, the voice agent will not say the booking succeeded.',
  };
}

export function widgetSnippet({ base, agentId, widgetToken, businessName }) {
  const b = String(base || '').replace(/\/$/, '');
  if (!agentId || !widgetToken || !b) return null;
  const name = String(businessName || 'Assistant').replace(/"/g, '&quot;');
  return `<script src="${b}/widget.js" data-agent="${agentId}" data-token="${widgetToken}" data-name="${name}"></script>`;
}

export function smokeQuestions({ hours, services }) {
  return [
    { ask: 'What are your hours?', expect: hours || 'approved hours only' },
    { ask: 'What services do you offer?', expect: services || 'approved services only' },
    { ask: 'Can you book me for tomorrow at 3?', expect: 'checks calendar or takes a callback — never invents a hold' },
    { ask: 'How much does it cost?', expect: 'refuses unapproved prices' },
  ];
}

export function webPersonEmail({ businessName, snippet }) {
  const body = snippet
    ? `Please paste this before </body> on every public page:\n\n${snippet}\n`
    : 'A one-line widget snippet will be in the connect guide after payment.';
  return `Subject: Add the ${businessName || 'business'} chat widget\n\n${body}\nDo not put any secret API key on the website.`;
}

export function generateCustomerPack(input = {}) {
  const need = input.need || 'voice';
  const role = roleFor(need);
  const commercial = commercialFor(need);
  const businessName = clean(input.businessName, 160);
  const hours = clean(input.hours, 200);
  const services = clean(input.services, 400);
  const niche = clean(input.niche, 80);
  const area = clean(input.area, 160);
  const timezone = clean(input.timezone, 80) || 'America/Toronto';
  const transfer = clean(input.transfer, 40);
  const missing = [];
  if (!businessName) missing.push('businessName');
  if (!hours) missing.push('hours');
  if (!services) missing.push('services');

  return {
    ok: missing.length === 0,
    missing,
    role,
    need,
    businessName,
    commercial,
    facts: { hours, services, niche, area, timezone, transfer: transfer || null },
    scripts: {
      greeting: greetingScript({ businessName, hours, role }),
      afterHours: afterHoursScript({ businessName, hours }),
      transferRule: transfer
        ? `If the caller asks for a person, request handoff to ${transfer}. Do not say the transfer succeeded until the provider confirms.`
        : 'No transfer number yet. Take a message and a callback number.',
    },
    customerActions: [
      'Pay the published setup so the agent can provision.',
      'Paste the website widget, or send the generated email to whoever edits the site.',
      'Forward the public business number to the issued DID. Do not port in v1.',
      'If booking is included, activate the calendar connector and confirm one test slot.',
    ],
    meridianDoesWithoutKenny: [
      'Collect business facts in chat.',
      'Write greeting, after-hours, and transfer rules.',
      'Issue widget token, API key, and connect guide after payment.',
      'Run text smoke tests before marking delivered.',
      'Answer setup questions from this pack.',
    ],
    stillCustomerClick: [
      'Payment',
      'Website paste or host login',
      'Call-forward on their carrier',
      'Calendar OAuth / n8n Activate',
    ],
    calendar: calendarConnectorRecipe(),
    smoke: smokeQuestions({ hours, services }),
    widgetSnippet: widgetSnippet(input),
    webPersonEmail: webPersonEmail({ businessName, snippet: widgetSnippet(input) }),
    briefing:
      `${businessName || 'Your business'} — ${commercial.name}. ` +
      `Setup ${commercial.setupUsd} USD. Number ${commercial.numberUsdPerMonth}/mo includes ${commercial.includedMinutes} minutes, then ${commercial.usageUsdPerMinute.toFixed(2)}/min. ` +
      `Hours: ${hours || 'not set'}. Services: ${services || 'not set'}. Timezone: ${timezone}.`,
  };
}

export function answerSetupQuestion(message, pack) {
  const m = String(message || '').toLowerCase();
  if (/price|cost|how much|minute|billing/.test(m) && pack?.commercial) {
    const c = pack.commercial;
    return `Setup is ${c.setupUsd} USD. The number is ${c.numberUsdPerMonth} USD per month with ${c.includedMinutes} minutes included, then ${c.usageUsdPerMinute.toFixed(2)} USD per minute. Vendor cost is not itemized on your invoice.`;
  }
  if (/widget|website|paste|embed/.test(m)) {
    return pack?.widgetSnippet
      ? `Paste this before </body>:\n${pack.widgetSnippet}`
      : 'After payment the connect guide has the exact widget line. I can also generate an email for your web person.';
  }
  if (/forward|phone|did|twilio|number/.test(m)) {
    return callForwardInstructions({ businessName: pack?.businessName }).join(' ');
  }
  if (/calendar|book|google|outlook|n8n/.test(m)) {
    return 'Booking stays off the spoken path until your calendar connector returns { ok: true, confirmed: true }. Import the recipe, activate it once, then I will treat real slots as bookable.';
  }
  if (/hour/.test(m) && pack?.facts?.hours) return `Approved hours: ${pack.facts.hours}. The agent will not invent different hours.`;
  if (/service/.test(m) && pack?.facts?.services) return `Approved services: ${pack.facts.services}. Anything else is "I don't have that confirmed."`;
  if (/transfer|human|owner/.test(m)) return pack?.scripts?.transferRule || 'No transfer number on file.';
  if (/greet/.test(m) && pack?.scripts?.greeting) return pack.scripts.greeting;
  return null;
}

export function extractEmail(message) {
  const match = String(message || '').match(EMAIL_RE);
  return match ? match[0].toLowerCase() : '';
}
