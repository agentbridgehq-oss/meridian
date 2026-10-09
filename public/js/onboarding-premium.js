/* Process exploration stays separate from authenticated delivery status. */
(() => {
  const root = document.querySelector('#journey-controls');
  if (!root) return;
  const stages = [
    ['Proposal','Start with the right scope.','Your business goals become a clear, reviewable delivery plan.','Draft scope, deliverables and acceptance criteria.','Share your bottleneck, goals and existing systems.'],
    ['Approval','Agree before we begin.','Review what will be delivered and how success will be checked.','Written scope and commercial terms for review.','Confirm scope, terms and the approval owner.'],
    ['Intake','Give your system context.','The right business details make every workflow more useful.','Structured intake and a review of operating rules.','Supply hours, services, approved answers and escalation rules.'],
    ['Access','Connect with clear boundaries.','Each connection follows the access agreed in your scope.','Access coordination and integration requirements.','Invite approved providers with scoped permissions. Never share passwords here.'],
    ['Design','See the workflow take shape.','Review the handoffs, decisions and exceptions before the build.','Workflow design and responsibilities.','Review the design and confirm business rules.'],
    ['Build','Turn the plan into a system.','The approved workflow becomes a configured implementation.','Configuration and agreed integrations.','Resolve questions and review requested decisions.'],
    ['QA','Check the details that matter.','Acceptance evidence shows what works and what still needs attention.','Recorded acceptance checks and issue resolution.','Review results against the agreed criteria.'],
    ['Go-live','Roll out with a clear plan.','Launch follows acceptance, approval and a documented fallback.','Rollout, monitoring and rollback plan.','Approve the rollout and confirm escalation contacts.'],
    ['Operate','Keep the work moving.','The system is managed within the approved operating scope.','Monitoring, reporting and exception handling.','Review reports and flag business changes.'],
    ['Improve','Refine what comes next.','Measured results guide the next approved improvements.','Recommendations and scoped improvements.','Prioritize changes and approve additional scope.']
  ];
  let selected = 0;
  const buttons = stages.map((row, i) => {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'journey-step'; button.textContent = `${String(i + 1).padStart(2, '0')}  ${row[0]}`;
    button.setAttribute('aria-controls', 'journey-title');
    button.addEventListener('click', () => show(i)); root.append(button); return button;
  });
  function show(i) {
    selected = i;
    buttons.forEach((button, n) => button.setAttribute('aria-pressed', String(n === i)));
    const row = stages[i];
    ['journey-number','journey-title','journey-description','journey-delivery','journey-owner'].forEach((id, n) => {
      document.getElementById(id).textContent = n === 0 ? `${String(i + 1).padStart(2,'0')} / ${row[0]}` : row[n];
    });
    document.getElementById('journey-next').textContent = i === 9 ? 'Back to proposal ↺' : `Next: ${stages[i+1][0]} →`;
  }
  document.getElementById('journey-next').addEventListener('click', () => show((selected + 1) % stages.length)); show(0);
  const checks = [...document.querySelectorAll('[data-preparation]')];
  const key = 'meridian-personal-preparation-v1';
  try { const saved = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(saved)) checks.forEach(c => c.checked = saved.includes(c.dataset.preparation)); } catch {}
  function update(save = true) {
    const ready = checks.filter(c => c.checked);
    document.getElementById('preparation-count').textContent = `${ready.length} of ${checks.length} ready`;
    document.getElementById('preparation-progress').value = ready.length;
    if (save) { try { localStorage.setItem(key, JSON.stringify(ready.map(c => c.dataset.preparation))); } catch {} }
  }
  checks.forEach(c => c.addEventListener('change', () => update()));
  document.getElementById('preparation-reset').addEventListener('click', () => { checks.forEach(c => c.checked = false); update(); }); update(false);
})();
