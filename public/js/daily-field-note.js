(() => {
  const library = {
    home: [
      ['Missed calls are a routing problem before they are a staffing problem.','Start by deciding what must happen after every unanswered call: identify intent, capture a callback number, offer an approved next step, and record the outcome. Automate only after that path is clear.','Missed-call recovery'],
      ['Do not automate a broken handoff.','If a lead moves from phone to CRM to calendar, define one owner and one source of truth first. The agent should move the work forward, not create another inbox to monitor.','Workflow design'],
      ['Your AI agent should know when to stop.','Good automation has an escalation rule. Define the questions it can answer, the actions it can confirm, and the exact situations that must go to a person.','Guardrails'],
      ['Booking quality starts with real availability.','A booking agent should never guess. It should read verified availability, offer eligible times, confirm only after the calendar accepts the booking, then record the result.','Booking operations'],
      ['Speed matters most after intent is clear.','Fast follow-up helps only when the first message is useful. Capture the reason for the enquiry, then respond with one relevant next step instead of a generic sequence.','Lead response'],
      ['A voice agent is only as good as its business facts.','Hours, service area, approved offers, transfer destinations and escalation rules should be reviewed before launch. Voice quality matters, but operational truth matters more.','Voice operations'],
      ['Measure outcomes, not conversations.','Track answered calls, qualified enquiries, confirmed appointments, successful transfers and unresolved exceptions. Those numbers tell you whether the agent is helping the business.','Agent measurement']
    ],
    voice: [
      ['Build the fallback before the greeting.','Before tuning tone, decide what happens when the caller asks something outside scope, requests a person, or a connected system is unavailable. A clean fallback protects trust.','Receptionist playbook'],
      ['Interruptibility makes a voice agent feel human.','Callers change direction mid-sentence. A strong receptionist should stop speaking, listen, keep the context, and continue without restarting the whole conversation.','Conversation design'],
      ['Never let the receptionist invent availability.','If the calendar is not verified, the agent should collect the request and offer a human callback. “I can check” is safer than pretending a slot exists.','Verified actions'],
      ['Train the receptionist on exceptions, not just FAQs.','Hours and services are easy. The real test is complaints, urgent requests, unclear questions, unavailable staff and failed transfers. Rehearse those before launch.','Acceptance testing'],
      ['A transfer is an outcome, not a button press.','Do not tell the caller a transfer succeeded until the provider confirms it. If it fails, capture the callback and explain the next step.','Call routing'],
      ['The best voice is calm, brief and specific.','Short acknowledgements, one question at a time and natural pauses usually outperform long scripted speeches. Keep the agent useful before making it impressive.','Voice quality'],
      ['Keep business facts separate from the model.','Store hours, services, service area, escalation numbers and approved answers as controlled business data. The model should use them, not invent replacements.','Knowledge control']
    ],
    sales: [
      ['Fast follow-up needs a reason to reply.','“Just checking in” is weak. Use the lead’s actual request, ask one useful qualification question, and offer one clear next step.','Sales follow-up'],
      ['Qualification should reduce work for both sides.','Ask only what changes the next action: need, timing, location, fit and the decision path. Extra questions create friction without improving the handoff.','Qualification'],
      ['Do not automate pressure.','A sales agent should not invent urgency, discounts or scarcity. It should explain the approved offer, answer factual questions and move a ready prospect toward a real next step.','Sales guardrails'],
      ['The handoff should carry context.','When a human takes over, send the reason for enquiry, answers already collected, timing and the agreed next step. The prospect should not have to start again.','CRM handoff'],
      ['Consent belongs in the workflow.','Record the channel and context that allow follow-up, respect opt-outs, and keep outbound automation inside the rules that apply to the business.','Consent'],
      ['Measure reply-to-next-step, not message volume.','More automated messages are not the goal. Track qualified replies, booked conversations, completed handoffs and unresolved leads.','Sales measurement'],
      ['One useful question beats a long sequence.','When intent is high, reduce the number of steps between the enquiry and the outcome. Let the agent ask the next best question, not every possible question.','Conversion design']
    ],
    booking: [
      ['A booking is not real until the calendar confirms it.','The agent can offer times, but it should only say “booked” after the connected calendar returns a confirmed result.','Booking integrity'],
      ['Define the rules before connecting the calendar.','Service duration, buffers, business hours, service area, staff assignment and blackout periods should be explicit before automation touches availability.','Scheduling rules'],
      ['Offer fewer, better choices.','Two or three eligible times are easier to answer than a long list. Keep the conversation moving and re-check availability before final confirmation.','Conversation design'],
      ['Rescheduling needs the same verification as booking.','Find the existing appointment, confirm the new eligible time, update the calendar, then state the result. Never assume the old slot moved successfully.','Rescheduling'],
      ['No-show recovery is a workflow, not a reminder.','Decide when to remind, what happens after a missed appointment, and when a person should step in. The agent should follow that policy consistently.','No-show recovery'],
      ['Timezone mistakes are operational mistakes.','Store the business timezone and confirm customer-facing times clearly. A technically successful booking at the wrong local time is still a failed outcome.','Scheduling accuracy'],
      ['Capture the reason for the appointment.','A useful booking record gives the team enough context to prepare. Collect only the information needed for the service and the next step.','Appointment context']
    ],
    service: [
      ['Service automation should make the next step obvious.','Capture the issue, identify urgency, look up only verified facts, and either resolve the routine request or route it to the right person.','Service operations'],
      ['Complaints need escalation rules.','Define which issues the agent may handle and which require a person immediately. The goal is a clear next step, not winning an argument.','Escalation'],
      ['Never invent job status.','If the connected system cannot verify a status, the agent should say so and offer the approved fallback instead of guessing.','Verified service data'],
      ['Record the outcome in the system of record.','A good service conversation leaves a useful ticket, note or callback task so the next person sees what happened.','Service handoff'],
      ['Keep sensitive details out of casual chat.','Collect only what is required for the service workflow and move protected or high-risk information into the approved secure process.','Data minimization'],
      ['Teach the agent the difference between urgent and important.','Emergency rules should be explicit. Routine frustration can be logged and routed; safety-critical situations need the approved immediate escalation.','Triage'],
      ['Measure resolution and escalation quality.','Track resolved routine requests, accurate escalations, callback completion and repeat contacts. Those are stronger signals than raw conversation count.','Service measurement']
    ]
  };

  function torontoDay() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).reduce((o, p) => (o[p.type] = p.value, o), {});
    return Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86400000);
  }

  document.querySelectorAll('[data-daily-field-note]').forEach((root) => {
    const context = root.dataset.noteContext || 'home';
    const notes = library[context] || library.home;
    const note = notes[((torontoDay() % notes.length) + notes.length) % notes.length];
    root.innerHTML =
      '<div class="daily-note-inner">' +
      '<div class="daily-note-top"><span>Today’s Meridian Field Note</span><span>' + escapeHtml(note[2]) + '</span></div>' +
      '<h2>' + escapeHtml(note[0]) + '</h2>' +
      '<p>' + escapeHtml(note[1]) + '</p>' +
      '<div class="daily-note-actions"><a href="/blog">Read Meridian insights →</a><a href="/agents">Explore the agents →</a></div>' +
      '</div>';
  });

  function escapeHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();