(() => {
  document.querySelectorAll('[data-agent-setup-brief]').forEach((form) => {
    const role = form.dataset.agentRole || 'voice';
    const status = form.querySelector('[data-setup-status]');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const fd = new FormData(form);
      const brief = {
        role,
        businessType: String(fd.get('businessType') || '').trim(),
        mustDo: String(fd.get('mustDo') || '').trim(),
        mustNever: String(fd.get('mustNever') || '').trim(),
        handoff: String(fd.get('handoff') || '').trim(),
        specialInstructions: String(fd.get('specialInstructions') || '').trim(),
        savedAt: new Date().toISOString()
      };
      try {
        sessionStorage.setItem('meridianAgentBrief', JSON.stringify(brief));
        if (status) status.textContent = 'Saved. Opening your Meridian scope builder…';
      } catch {
        if (status) status.textContent = 'Opening the scope builder. Your browser may not preserve this brief.';
      }
      location.assign('/meridian-proposal.html?service=' + encodeURIComponent(role) + '&prefill=agent');
    });
  });
})();