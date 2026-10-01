(() => {
  let token = '', generation = 0;
  const login = document.querySelector('#ops-login'), root = document.querySelector('#ops-projects'), status = document.querySelector('#ops-status');
  const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  async function load() {
    const version = ++generation;
    root.replaceChildren(); status.textContent = 'Loading projects…';
    try {
      const response = await fetch('/api/ops/agency/projects', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const data = await response.json(); if (version !== generation) return;
      if (!response.ok) throw new Error(data.error);
      status.textContent = data.projects.length ? `${data.projects.length} managed project(s).` : 'No managed projects yet.';
      data.projects.forEach(project => {
        const card = node('article', undefined, 'card'), context = node('pre');
        card.append(node('span', project.stage, 'pill'), node('h2', project.businessName));
        context.textContent = `Contact: ${project.input.name} · ${project.input.email}\nService: ${project.input.service} · ${project.input.tier}\nWebsite: ${project.input.businessWebsite || 'Not supplied'}\nVolume: ${project.input.volume || 'Not supplied'}\nCurrent systems: ${project.input.systems || 'Not supplied'}\nGoals: ${project.input.goals || 'Not supplied'}`;
        card.append(context, node('p', project.guidance, 'note'));
        if (project.intake) card.append(node('pre', `Intake\nOwner: ${project.intake.owner}\nHours: ${project.intake.hours}\nServices: ${project.intake.services}\nRules: ${project.intake.rules}`));
        const link = node('a', 'Open client onboarding', 'btn'); link.href = project.onboardingPath; card.append(link);
        const details = node('details'), evidence = node('pre'); details.append(node('summary', 'Recorded delivery evidence'));
        evidence.textContent = project.evidence.map(h => `${h.at} · ${h.stage}\n${h.evidence || 'Request received'}`).join('\n\n'); details.append(evidence); card.append(details);
        const next = project.stages[project.stages.indexOf(project.stage) + 1];
        if (next) {
          const form = node('form'), fieldLabel = node('label', `Evidence required before moving to ${next}`), field = node('textarea', undefined, 'field');
          field.name = 'evidence'; field.required = true; field.minLength = 12; field.maxLength = 4000; field.rows = 3; fieldLabel.append(field); form.append(fieldLabel);
          const gates = { approval: ['commercialApproved','Client has approved the written scope and commercial agreement.'], qa: ['qaPassed','All agreed acceptance checks passed; evidence is recorded above.'], 'go-live': ['clientAccepted','Client acceptance and the rollout/rollback plan are recorded above.'] };
          if (gates[project.stage]) {
            const [name, text] = gates[project.stage], label = node('label', undefined, 'check'), check = node('input');
            check.type = 'checkbox'; check.name = name; check.required = true; label.append(check, node('span', text)); form.append(label);
          }
          if (project.stage === 'approval') {
            for (const [name, title] of [['setupFee','Agreed setup fee'],['monthlyFee','Agreed monthly fee']]) {
              const label = node('label', title), input = node('input', undefined, 'field'); input.name = name; input.type = 'number'; input.min = '0'; input.step = '0.01'; input.required = true; label.append(input); form.append(label);
            }
            const currencyLabel = node('label','Currency'), currency = node('select', undefined, 'field'); currency.name = 'currency';
            ['CAD','USD'].forEach(c => { const option = node('option',c); option.value=c; currency.append(option); }); currencyLabel.append(currency); form.append(currencyLabel);
            const scopeLabel = node('label','Final scope, provider costs, support coverage and timing'), scope = node('textarea', undefined, 'field'); scope.name='scopeNotes'; scope.required=true; scope.minLength=12; scope.maxLength=4000; scopeLabel.append(scope); form.append(scopeLabel);
          }
          const button = node('button', `Record completion → ${next}`, 'btn primary'), message = node('p', '', 'status'); message.setAttribute('role','status'); form.append(button, message);
          form.addEventListener('submit', async event => {
            event.preventDefault(); button.disabled = true;
            const body = { stage: next, evidence: field.value };
            if (project.stage === 'approval') Object.assign(body, { setupFee:Number(form.elements.namedItem('setupFee').value), monthlyFee:Number(form.elements.namedItem('monthlyFee').value), currency:form.elements.namedItem('currency').value, scopeNotes:form.elements.namedItem('scopeNotes').value });
            form.querySelectorAll('input[type=checkbox]').forEach(c => body[c.name] = c.checked);
            try {
              const r = await fetch(`/api/ops/agency/projects/${encodeURIComponent(project.id)}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
              const d = await r.json(); if (!r.ok) throw new Error(d.error); await load();
            } catch (error) { message.textContent = error.message || 'Could not update the project.'; button.disabled = false; }
          });
          card.append(form);
        }
        root.append(card);
      });
    } catch (error) { if (version === generation) status.textContent = error.message || 'Could not load projects.'; }
  }
  login.addEventListener('submit', event => { event.preventDefault(); token = login.elements.namedItem('token').value; login.reset(); load(); });
  document.querySelector('#ops-lock').addEventListener('click', () => { generation++; token = ''; login.reset(); root.replaceChildren(); status.textContent = 'Workspace locked.'; });
})();
