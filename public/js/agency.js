/* Shared agency UI. Private project tokens stay in the URL fragment and memory. */
(() => {
  const stages = ['proposal','approval','intake','access','design','build','qa','go-live','operate','improve'];
  const label = s => s.replaceAll('-', ' ').replace(/^./, c => c.toUpperCase());
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  function renderProposal(root, p) {
    root.replaceChildren(el('h2', p.title), el('p', `${label(p.tier)} · ${p.status === 'approved' ? 'Approved scope — commercial agreement recorded' : 'Draft scope — commercial review required'}`, 'muted'), el('p', p.summary, 'lead'));
    const grid = el('div', undefined, 'grid');
    for (const [title, rows] of [['Delivery scope', p.deliverables], ['Integration plan', p.integrations.map(i => `${i.name}: ${i.status}`)], ['Acceptance checks', p.acceptanceChecks]]) {
      const card = el('article', undefined, 'card'), ul = el('ul'); card.append(el('h3', title));
      rows.forEach(row => ul.append(el('li', row))); card.append(ul); grid.append(card);
    }
    root.append(grid);
    if (p.quote) {
      const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: p.quote.currency });
      root.append(el('p', `Agreed fees (${p.quote.currency}): ${money.format(p.quote.setupFee)} setup · ${money.format(p.quote.monthlyFee)} monthly`, 'note'), el('p', p.quote.scopeNotes, 'muted'));
    } else root.append(el('p', p.commercialTerms, 'note'));
    const exclusions = el('ul', undefined, 'muted'); p.exclusions.forEach(x => exclusions.append(el('li', x)));
    root.append(exclusions, el('p', p.nextStep, 'muted'));
  }
  const form = document.querySelector('#agency-proposal');
  if (form) {
    const startedAt = Date.now(), params = new URLSearchParams(location.search);
    for (const [name, param] of [['primaryNeed','service'], ['tier','tier']]) {
      const select = form.elements.namedItem(name), value = params.get(param);
      if ([...select.options].some(o => o.value === value)) select.value = value;
    }
    form.addEventListener('submit', async event => {
      event.preventDefault(); const button = form.querySelector('button[type=submit]'), status = form.querySelector('.status');
      button.disabled = true; status.textContent = 'Saving your request and preparing the first scope…';
      const body = Object.fromEntries(new FormData(form));
      Object.assign(body, { flow: 'agency-v2', consent: form.elements.namedItem('consent').checked, _formStartedAt: startedAt });
      try {
        const response = await fetch('/api/funnel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await response.json();
        if (!response.ok || !data.project?.proposal || !/^\/meridian-onboarding\.html#[a-f0-9]{48}$/.test(data.onboardingPath || '')) throw new Error(data.error || 'Your request was not saved. Please try again.');
        renderProposal(document.querySelector('#proposal-content'), data.project.proposal);
        document.querySelector('#onboarding-link').href = data.onboardingPath;
        const result = document.querySelector('#proposal-result'); result.hidden = false;
        status.textContent = 'Request saved. Your first scope is below. Save the private onboarding link.';
        result.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        // Keep the submitted form disabled to prevent accidental duplicate project creation.
        button.textContent = 'Request saved';
      } catch (error) { status.textContent = error.message || 'Connection failed. Your inputs are still here; please retry.'; button.disabled = false; }
    });
    document.querySelector('#print-proposal').addEventListener('click', () => window.print());
  }
  const stageList = document.querySelector('#project-stages');
  if (stageList) {
    let token = location.hash.slice(1);
    const status = document.querySelector('#project-status');
    function drawStages(current) {
      stageList.replaceChildren(); stages.forEach((s, index) => {
        const item = el('li', label(s));
        if (s === current) item.setAttribute('aria-current', 'step');
        if (current && index < stages.indexOf(current)) item.className = 'complete';
        stageList.append(item);
      });
    }
    drawStages();
    async function refresh() {
      token = location.hash.slice(1);
      document.querySelector('#project-panel').hidden = true;
      drawStages();
      if (!/^[a-f0-9]{48}$/.test(token)) { status.textContent = 'Open your private link to view a project. These stages are a delivery overview.'; return; }
      status.textContent = 'Loading your project…';
      try {
        const response = await fetch('/api/agency/project', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        const p = data.project; drawStages(p.stage);
        document.querySelector('#project-panel').hidden = false;
        document.querySelector('#project-name').textContent = p.businessName;
        document.querySelector('#current-stage').textContent = label(p.stage);
        document.querySelector('#stage-guidance').textContent = p.guidance;
        document.querySelector('#intake-state').textContent = p.intakeReceived ? 'Your business intake has been saved.' : 'Business intake opens after approval.';
        document.querySelector('#project-intake').hidden = p.stage !== 'intake';
        renderProposal(document.querySelector('#project-proposal'), p.proposal);
        status.textContent = `Current stage: ${label(p.stage)}. Updated ${new Date(p.updatedAt).toLocaleString()}.`;
      } catch (error) { status.textContent = error.message || 'Could not load your project. Refresh to retry.'; }
    }
    document.querySelector('#refresh-project').addEventListener('click', refresh);
    window.addEventListener('hashchange', refresh);
    document.querySelector('#project-intake').addEventListener('submit', async event => {
      event.preventDefault(); const f = event.currentTarget, button = f.querySelector('button'), message = f.querySelector('.status');
      button.disabled = true; message.textContent = 'Saving…';
      try {
        const r = await fetch('/api/agency/project/intake', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(f))) });
        const data = await r.json(); if (!r.ok) throw new Error(data.error);
        message.textContent = 'Intake saved. Meridian will review it before access setup.'; await refresh();
      } catch (error) { message.textContent = error.message || 'Could not save intake. Please retry.'; }
      finally { button.disabled = false; }
    });
    refresh();
  }
})();
