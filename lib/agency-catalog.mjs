/** Shared service scope: marketing, proposal drafts and delivery planning. */
import { VOICE_TRIO } from './expertise.mjs';

export const services = {
  automation: { name: 'AI Automation', headline: 'Give repetitive work a better system.', intro: 'Connect the forms, inboxes and tools your business already uses. Start with one recurring handoff and build a workflow you can measure.', outcome: 'Less re-entry. Clearer handoffs.', deliverables: ['Map one recurring workflow and its exceptions', 'Connect the agreed source and destination systems', 'Add failure alerts, retry rules and an owner runbook'], integrations: ['Forms and inbox', 'CRM or business database', 'Approved workflow platform'], checks: ['A valid event reaches the destination once', 'Invalid input is rejected with a clear reason', 'Failures alert the nominated owner'], agentNeed: null },
  'revenue-ops': { name: 'Revenue Operations', headline: 'Make the next sales step unmistakable.', intro: 'Bring capture, qualification, follow-up and reporting into one agreed process. Give every opportunity an owner and a next action.', outcome: 'A pipeline your business can follow.', deliverables: ['Map lead sources, stages and ownership', 'Configure qualification and routing rules', 'Build a pipeline report and exception queue'], integrations: ['Lead forms', 'CRM', 'Email and calendar'], checks: ['Each lead is assigned to the right owner', 'Duplicate submissions do not duplicate opportunities', 'Pipeline reporting agrees with source records'], agentNeed: 'full' },
  voice: { name: 'Receptionist Voice', headline: 'Answer every call like a trained front desk.', intro: 'The Receptionist Voice Agent greets, triages, captures, books when the calendar is verified, and hands off with context. It speaks only approved business facts.', outcome: 'Missed calls become logged next steps.', deliverables: ['Configure greeting, hours, services and transfer rules', 'Train receptionist playbook on the live Realtime session', 'Connect phone trunk and optional calendar or CRM adapters', 'QA: hours, emergency path, capture, and no invented prices'], integrations: ['Phone provider (Twilio SIP)', 'Business knowledge', 'Calendar or CRM when verified'], checks: ['Greeting and hours match intake', 'Human-transfer and emergency paths behave as agreed', 'Call outcomes are recorded', 'Unverified booking is never claimed as booked'], agentNeed: 'voice', demo: '/meridian-voice-demo.html' },
  sales: { name: 'Sales', headline: 'Keep good leads moving.', intro: 'Use Meridian’s Sales Agent to qualify inbound interest, support replies and keep approved follow-up connected to your pipeline.', outcome: 'Consistent follow-up with clear boundaries.', deliverables: ['Define qualification criteria and reply guidance', 'Configure consent-aware follow-up and routing', 'Record outcomes and escalation requests'], integrations: ['CRM', 'Approved email or messaging provider', 'Lead capture'], checks: ['Unsubscribed contacts receive no follow-up', 'Uncertain answers escalate instead of inventing claims', 'Lead stage changes are recorded correctly'], agentNeed: 'sales', demo: '/agent-sales.html' },
  booking: { name: 'Booking Voice', headline: 'Turn the next step into a confirmed slot.', intro: 'The Booking Voice Agent checks real availability, offers two times, books only after the caller confirms, and can cancel or reschedule through the verified calendar connector.', outcome: 'Appointments that exist on the real calendar.', deliverables: ['Define services, duration, buffers and timezone', 'Verify calendar adapter check / book / cancel / reschedule', 'Confirmation and fallback copy', 'QA: refuse unconfirmed slots and double-books'], integrations: ['Verified calendar connector', 'Business services and hours', 'Confirmation channel'], checks: ['Unavailable slots cannot be booked', 'Timezone and duration are correct', 'Duplicate requests cannot double-book a slot', 'Spoken success only after calendar confirmed:true'], agentNeed: 'booking', demo: '/agent-booking.html' },
  service: { name: 'Service Voice', headline: 'Handle status, complaints and dispatch without fake ETAs.', intro: 'The Service Voice Agent logs job issues, safety flags, and owner callbacks. It does not diagnose beyond approved facts or invent arrival times.', outcome: 'Every service call leaves a usable record.', deliverables: ['Define safety, warranty and dispatch rules', 'Train service playbook on the live Realtime session', 'Connect CRM or job board when verified', 'QA: safety handoff, no invented ETA, outcome recorded'], integrations: ['Phone provider', 'Job or CRM adapter when verified', 'Human dispatch number'], checks: ['Safety language routes to emergency services plus owner', 'No invented arrival window', 'Complaints are logged in the caller’s words', 'Handoff only when destination is verified'], agentNeed: 'service', demo: '/agent-service.html' },
  search: { name: 'Search Growth', headline: 'Help buyers find the right answer.', intro: 'Identify technical issues and unanswered customer questions. Build a focused search improvement plan connected to your actual services.', outcome: 'A measured plan for search visibility.', deliverables: ['Audit agreed pages and technical search basics', 'Map service pages to real buyer questions', 'Prepare a prioritized content and measurement plan'], integrations: ['Website CMS', 'Search reporting access', 'Analytics'], checks: ['Published pages are crawlable as intended', 'Claims and service details are approved', 'Baseline and reporting definitions are documented'], agentNeed: null },
  web: { name: 'Web & Digital', headline: 'Make your website part of the operation.', intro: 'Build a clear conversion path, then connect the enquiry to the tools and people responsible for the next step.', outcome: 'A website that hands work forward.', deliverables: ['Design the agreed service or conversion pages', 'Connect enquiry capture to the selected workflow', 'Verify mobile usability and submission failure states'], integrations: ['Website hosting or CMS', 'Forms and CRM', 'Analytics'], checks: ['Mobile and keyboard paths are usable', 'Real submissions reach the destination', 'Errors preserve customer input and explain recovery'], agentNeed: null },
};
export const stages = ['proposal', 'approval', 'intake', 'access', 'design', 'build', 'qa', 'go-live', 'operate', 'improve'];
export const stageGuidance = {
  proposal: 'Review the recommended scope. Pricing and timing are confirmed after discovery.',
  approval: 'Confirm the written scope, commercial terms and permission to begin.',
  intake: 'Share business hours, services, workflow rules and the owner responsible for approvals.',
  access: 'Grant least-privilege access through the provider’s invitation or connection flow. Never paste passwords here.',
  design: 'Agree the workflow, exception rules and acceptance checks.',
  build: 'Configure the agreed systems and record what was built.',
  qa: 'Run acceptance checks and record evidence, including failure and escalation paths.',
  'go-live': 'Confirm client acceptance, rollout instructions and a rollback plan.',
  operate: 'Monitor the delivered system and route exceptions to its owner.',
  improve: 'Review measured performance and prioritize the next agreed improvement.',
};

function voiceCommercial(need) {
  if (need === 'voice') return VOICE_TRIO.receptionist;
  if (need === 'booking') return VOICE_TRIO.booking;
  if (need === 'service') return VOICE_TRIO.service;
  return null;
}

export function draftProposal(input) {
  const service = services[input.service];
  const commercial = voiceCommercial(service.agentNeed);
  return {
    kind: 'managed_operations', status: 'scope_required', service: input.service,
    title: `${service.name} — ${input.businessName}`, tier: input.tier,
    summary: service.outcome, deliverables: service.deliverables,
    integrations: service.integrations.map(name => ({ name, status: 'Not connected — access review required' })),
    acceptanceChecks: service.checks,
    agentNeed: service.agentNeed,
    voiceTrio: commercial ? {
      agent: commercial.name,
      setupUsd: commercial.setupUsd,
      numberUsdPerMonth: commercial.numberUsdPerMonth,
      includedMinutes: commercial.includedMinutes,
      usageUsdPerMinute: commercial.usageUsdPerMinute,
      note: 'Usage is metered after included minutes. Vendor cost is not passed through line-by-line.',
    } : null,
    commercialTerms: commercial
      ? `Voice install ${commercial.setupUsd} USD. Number ${commercial.numberUsdPerMonth} USD/mo includes ${commercial.includedMinutes} minutes. Additional minutes ${commercial.usageUsdPerMinute.toFixed(2)} USD. Provider usage is Meridian COGS, not a customer pass-through.`
      : 'Custom scope. Setup, recurring management, provider usage and delivery timing must be agreed in writing before work begins.',
    exclusions: ['Third-party subscriptions and usage are quoted separately unless included in a voice minute plan', 'Additional workflows require an agreed scope change', 'Revenue, rankings and lead volume are not guaranteed', 'Voice is not live until a staging inbound call is logged'],
    nextStep: 'Meridian reviews your request and confirms the scope and commercial terms.',
    deployWorkflow: commercial ? '/docs/VOICE-TRIO-WORKFLOWS.md' : null,
  };
}
