(() => {
  const traces = [
    ['Missed call is captured', 'Identify caller intent from available context', 'Route to reception or approved callback flow', 'Request booking or escalate to the owner', 'Record the outcome for review'],
    ['Web form captures a consented enquiry', 'Check the lead against qualification rules', 'Assign the opportunity to the right pipeline', 'Prepare or send an approved response', 'Record delivery and follow-up status'],
    ['Quote request enters the workflow', 'Collect service, timing and scope details', 'Prepare a draft for commercial review', 'Confirm price and scope before acceptance', 'Move the approved request to onboarding'],
    ['Customer requests an appointment', 'Check service rules and calendar availability', 'Offer eligible times in the correct timezone', 'Confirm only after the calendar accepts', 'Record the booking or escalate a failure'],
  ];
  document.querySelectorAll('.choice').forEach((button, index) => {
    button.setAttribute('aria-pressed', String(index === 0));
    button.addEventListener('click', () => {
      document.querySelectorAll('.choice').forEach(b => { b.classList.remove('sel'); b.setAttribute('aria-pressed', 'false'); });
      button.classList.add('sel'); button.setAttribute('aria-pressed', 'true');
      document.querySelector('#traceTitle').textContent = button.querySelector('strong').textContent.toUpperCase();
      document.querySelectorAll('.trace .step').forEach((step, i) => { const dot = document.createElement('i'); step.replaceChildren(dot, document.createTextNode(traces[index][i])); });
    });
  });
  document.querySelector('.choice').click();
  const rail = document.querySelector('#services-rail');
  for (const [id, direction] of [['services-prev',-1],['services-next',1]]) document.getElementById(id).addEventListener('click', () => rail.scrollBy({ left: direction * rail.clientWidth * .8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
  document.querySelector('#scan-router').addEventListener('submit', event => {
    event.preventDefault(); location.assign(`/meridian-proposal.html?service=${encodeURIComponent(event.currentTarget.elements.namedItem('service').value)}`);
  });
  // Make the hero command surface feel alive without interfering with controls.
  const hero = document.querySelector('.hero-stage');
  const consolePanel = document.querySelector('.hero-console');
  if (hero && consolePanel && !matchMedia('(prefers-reduced-motion: reduce)').matches && matchMedia('(pointer:fine)').matches) {
    hero.addEventListener('pointermove', event => {
      const r = hero.getBoundingClientRect();
      const x = (event.clientX - r.left) / r.width - .5;
      const y = (event.clientY - r.top) / r.height - .5;
      consolePanel.style.transform = `perspective(1000px) rotateY(${-4 + x * 4}deg) rotateX(${2 - y * 3}deg) translate3d(${x * 5}px,${y * 5}px,0)`;
    });
    hero.addEventListener('pointerleave', () => { consolePanel.style.transform = ''; });
  }
  const agents = [...document.querySelectorAll('.hero-console .agent')];
  if (agents.length && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let agentIndex = 0;
    setInterval(() => {
      agents.forEach((agent, i) => agent.classList.toggle('active', i === agentIndex));
      agentIndex = (agentIndex + 1) % agents.length;
    }, 1700);
  }

})();