(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const traces = [
    ['Missed call is captured', 'Identify caller intent from available context', 'Route to reception or approved callback flow', 'Request booking or escalate to the owner', 'Record the outcome for review'],
    ['Web form captures a consented enquiry', 'Check the lead against qualification rules', 'Assign the opportunity to the right pipeline', 'Prepare or send an approved response', 'Record delivery and follow-up status'],
    ['Quote request enters the workflow', 'Collect service, timing and scope details', 'Prepare a draft for commercial review', 'Confirm price and scope before acceptance', 'Move the approved request to onboarding'],
    ['Customer requests an appointment', 'Check service rules and calendar availability', 'Offer eligible times in the correct timezone', 'Confirm only after the calendar accepts', 'Record the booking or escalate a failure'],
  ];
  const choices = [...document.querySelectorAll('.choice')];
  const steps = [...document.querySelectorAll('.trace .step')];
  const play = document.querySelector('#demo-play');
  const status = document.querySelector('#demo-status');
  let selected = 0, current = -1, timer = null, playing = false;
  function pause() {
    clearTimeout(timer); timer = null; playing = false;
    play.textContent = current === steps.length - 1 ? 'Replay workflow →' : current < 0 ? 'Play workflow →' : 'Continue workflow →';
  }
  function render() {
    steps.forEach((step, i) => {
      const dot = document.createElement('i');
      step.replaceChildren(dot, document.createTextNode(traces[selected][i]));
      step.classList.toggle('current', i === current);
      step.classList.toggle('done', i < current);
      step.classList.remove('on');
      if (i === current) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current');
    });
    status.textContent = current < 0 ? 'Ready · 5 steps' : current === 4 ? 'Complete · outcome recorded' : `Step ${current + 1} of 5`;
  }
  function advance() {
    if (!playing) return;
    current++; render();
    if (current === steps.length - 1) pause();
    else timer = setTimeout(advance, 1300);
  }
  choices.forEach((button, index) => {
    button.addEventListener('click', () => {
      pause(); selected = index; current = -1;
      choices.forEach((choice, i) => { choice.classList.toggle('sel', i === index); choice.setAttribute('aria-pressed', String(i === index)); });
      document.querySelector('#traceTitle').textContent = button.querySelector('strong').textContent.toUpperCase();
      render(); pause();
    });
  });
  choices[0]?.click();
  play?.addEventListener('click', () => {
    if (playing) { pause(); return; }
    if (current === steps.length - 1) current = -1;
    if (reduce.matches) { current = steps.length - 1; render(); pause(); return; }
    playing = true; play.textContent = 'Pause workflow'; advance();
  });
  document.querySelector('#demo-reset')?.addEventListener('click', () => { pause(); current = -1; render(); });
  // Keep playback user-controlled and stop when it is no longer visible.
  const demoObserver = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) pause(); }, { threshold: 0 });
  demoObserver.observe(document.querySelector('#demo'));
  const nav = document.querySelector('#primary-nav');
  const menu = document.querySelector('.menu-toggle');
  function closeMenu() { menu.setAttribute('aria-expanded', 'false'); nav.classList.remove('is-open'); }
  menu?.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open)); nav.classList.toggle('is-open', open);
  });
  nav?.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); } });
  const layerText = [
    ['Capture', 'A call, form or enquiry becomes a clear starting point. No scattered inboxes or lost handoffs.'],
    ['AI context', 'Interpret the request using available context and your business rules before choosing the next action.'],
    ['Decision', 'Send the request to the right workflow. Unclear or sensitive requests go to a person.'],
    ['Workflow', 'Connect approved actions across your CRM, calendar and communication tools.'],
    ['Expertise', 'Bring in a specialist when the request needs judgment, context or a commercial decision.'],
    ['Control', 'Check the output, respect approvals and verify integrations before calling the action complete.'],
    ['Delivery', 'Keep the customer informed and record the handoff so your team can see what happened.'],
    ['Outcome', 'Track the result and use it to improve the process. Business outcomes depend on the actual workflow.'],
  ];
  const nodes = [...document.querySelectorAll('.flow .nb')];
  nodes.forEach((button, index) => button.addEventListener('click', () => {
    nodes.forEach((node, i) => node.setAttribute('aria-pressed', String(i === index)));
    document.querySelector('.layer-detail .k').textContent = `${String(index + 1).padStart(2,'0')} · ${layerText[index][0]}`;
    document.querySelector('.layer-detail p').textContent = layerText[index][1];
  }));
  nodes[0]?.click();
  const rail = document.querySelector('#services-rail');
  const cards = [...rail.querySelectorAll('.svc')];
  const prev = document.querySelector('#services-prev'), next = document.querySelector('#services-next');
  function railUpdate() {
    const start = rail.getBoundingClientRect().left;
    const index = cards.reduce((best, card, i) => Math.abs(card.getBoundingClientRect().left - start) < Math.abs(cards[best].getBoundingClientRect().left - start) ? i : best, 0);
    document.querySelector('.rail-position').textContent = `${String(index + 1).padStart(2, '0')} / 07 · Swipe to explore`;
    prev.disabled = rail.scrollLeft <= 2; next.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2;
  }
  for (const [button, direction] of [[prev,-1],[next,1]]) button.addEventListener('click', () => rail.scrollBy({ left: direction * (cards[0].getBoundingClientRect().width + 13), behavior: reduce.matches ? 'instant' : 'smooth' }));
  rail.addEventListener('scroll', railUpdate, {passive:true});
  rail.addEventListener('keydown', event => {
    if (event.target !== rail || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
    event.preventDefault(); (event.key === 'ArrowLeft' ? prev : next).click();
  });
  window.addEventListener('resize', railUpdate, {passive:true}); railUpdate();
  document.querySelector('#scan-router').addEventListener('submit', event => {
    event.preventDefault(); location.assign(`/meridian-analysis.html?service=${encodeURIComponent(event.currentTarget.elements.namedItem('service').value)}`);
  });
  const mobilePlan = document.querySelector('.mobile-plan');
  let heroVisible = true, scanVisible = false, finalVisible = false;
  function ctaUpdate() { mobilePlan.hidden = heroVisible || scanVisible || finalVisible; }
  const ctaObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.target.matches('.hero-stage')) heroVisible = entry.isIntersecting;
      if (entry.target.id === 'scan') scanVisible = entry.isIntersecting;
      if (entry.target.matches('.final')) finalVisible = entry.isIntersecting;
    }); ctaUpdate();
  });
  ['.hero-stage','#scan','.final'].forEach(selector => ctaObserver.observe(document.querySelector(selector)));
  if (!reduce.matches) {
    const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('reveal-enter'); reveal.unobserve(entry.target); }
    }), {threshold:.12});
    document.querySelectorAll('.head, .scan, .system').forEach(el => reveal.observe(el));
  }
  // Canvas is decorative only. Native scrolling is never intercepted.
  const canvas = document.querySelector('#signal-canvas');
  const ctx = canvas?.getContext('2d');
  let visible = true, frame = null, width = 0, height = 0, last = 0;
  function size() {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width; height = bounds.height;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function draw(time) {
    frame = null;
    if (!visible || document.hidden) return;
    if (time - last >= 32 || reduce.matches) {
      last = time; ctx.clearRect(0,0,width,height);
      const cx = width * .82, cy = height * .28;
      [width * .19, width * .27, width * .36].forEach((radius,i) => {
        ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.strokeStyle='#bff7d720';ctx.lineWidth=1;ctx.stroke();
        const angle = reduce.matches ? i*2 : time/19000*(i%2 ? -1 : 1) + i*2;
        ctx.beginPath();ctx.arc(cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius,3,0,Math.PI*2);ctx.fillStyle='#bff7d7';ctx.fill();
      });
    }
    if (!reduce.matches) frame = requestAnimationFrame(draw);
  }
  function resume() { if (frame === null && visible && !document.hidden && ctx) frame = requestAnimationFrame(draw); }
  function stop() { if (frame !== null) cancelAnimationFrame(frame); frame = null; }
  if (ctx) {
    size(); resume();
    const canvasObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) resume(); else stop(); });
    canvasObserver.observe(canvas);
    new ResizeObserver(() => { size(); resume(); }).observe(canvas);
    reduce.addEventListener('change', () => { stop(); resume(); if (reduce.matches) pause(); });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); stop(); } else resume(); });
})();
