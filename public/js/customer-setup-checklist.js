/* Device-local reminders only. Never marks a deployment ready. */
(() => {
  const checks = [...document.querySelectorAll('[data-setup-check]')];
  const progress = document.getElementById('setup-progress');
  if (!checks.length || !progress) return;
  const key = 'meridian_preparation_v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch {}
  const update = () => {
    progress.textContent = `${checks.filter(c => c.checked).length} of ${checks.length} preparation steps marked · launch still requires verification`;
    const value = Object.fromEntries(checks.map(c => [c.dataset.setupCheck, c.checked]));
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  };
  checks.forEach(c => { c.checked = saved[c.dataset.setupCheck] === true; c.addEventListener('change', update); });
  document.getElementById('reset-setup-checks')?.addEventListener('click', () => { checks.forEach(c => c.checked = false); update(); });
  document.getElementById('setup-help')?.addEventListener('click', () => window.MeridianGuide?.open('setup'));
  update();
})();
