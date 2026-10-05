(() => {
  const q = s => document.querySelector(s), refresh = q('#connection-refresh');
  let loading = false;
  function check(name, text, ready) { const el = q(`[data-check="${name}"]`); el.textContent = text; el.dataset.state = ready ? 'ready' : 'pending'; }
  async function load() {
    if (loading) return;
    loading = true; refresh.disabled = true;
    try {
      const response = await fetch('/api/voice/connections', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      const provider = data.phone?.provider === 'xai' ? 'xAI' : data.phone?.provider === 'openai' ? 'OpenAI rollback' : 'Unknown provider';
      check('phone', data.phone?.credentialsConfigured ? `${provider} credentials configured · real-call acceptance still required` : `${provider} configuration incomplete`, false);
      check('browser', data.browser?.available ? 'Legacy browser lab available · actions disabled' : 'Legacy browser lab unavailable · separate from xAI phone', Boolean(data.browser?.available));
      q('#connection-overall').textContent = provider + ' · configuration only';
      q('#connection-next').textContent = data.nextAction || 'Review private deployment readiness and real-call evidence.';
      q('#connection-checked').textContent = 'Last checked ' + new Date(data.checkedAt).toLocaleTimeString();
    } catch {
      check('phone', 'Runtime status could not be confirmed', false); check('browser', 'Runtime status could not be confirmed', false);
      q('#connection-overall').textContent = 'Status unavailable'; q('#connection-next').textContent = 'Retry the check. No connection is assumed.';
    } finally { loading = false; refresh.disabled = false; }
  }
  async function checkSamples() {
    try {
      const results = await Promise.all(['ara','eve','leo','rex'].map(async voice => {
        const r = await fetch(`/audio/${voice}.mp3`, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
        return r.ok && /^audio\//i.test(r.headers.get('content-type') || '');
      }));
      const ready = results.every(Boolean);
      check('studio', ready ? 'Four recorded samples available · not live call evidence' : 'Some recorded samples could not be confirmed', ready);
    } catch { check('studio', 'Recorded samples could not be confirmed', false); }
  }
  async function copy(id, button) { try { await navigator.clipboard.writeText(q(id).textContent); const before = button.textContent; button.textContent = 'Copied'; setTimeout(() => button.textContent = before, 1500); } catch { q('#sip-project-help').textContent = 'Select and copy the displayed address manually.'; } }
  const input = q('#sip-number'), sip = q('#copy-sip');
  input.addEventListener('input', () => {
    const value = input.value.trim(), valid = /^\+[1-9]\d{7,14}$/.test(value);
    q('#sip-destination').textContent = valid ? `sip:${value}@sip.voice.x.ai;transport=tls` : 'Enter a valid registered E.164 number. Never enter a secret key.';
    sip.disabled = !valid;
  });
  sip.addEventListener('click', () => copy('#sip-destination', sip));
  q('#copy-webhook').addEventListener('click', e => copy('#webhook-endpoint', e.currentTarget));
  refresh.addEventListener('click', load); load(); checkSamples();
})();
