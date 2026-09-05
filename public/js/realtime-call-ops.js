(() => {
  let token = '', generation = 0;
  const login = document.querySelector('#ops-login');
  const lock = document.querySelector('#ops-lock');
  const root = document.querySelector('#ops-realtime-calls');
  const status = document.querySelector('#realtime-call-status');
  if (!login || !lock || !root || !status) return;

  const node = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };

  async function api(path) {
    const response = await fetch(path, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function formatTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  async function expandTimeline(details, callId, message) {
    if (details.dataset.loaded === '1') return;
    message.textContent = 'Loading call timeline…';
    try {
      const data = await api(`/api/ops/realtime-calls/${encodeURIComponent(callId)}`);
      const call = data.call;
      const pre = node('pre');
      pre.textContent = (call.events || []).map(event => {
        const meta = event.meta && Object.keys(event.meta).length ? ` ${JSON.stringify(event.meta)}` : '';
        return `${formatTime(event.at)} · ${event.type}${event.detail ? ` · ${event.detail}` : ''}${meta}`;
      }).join('\n') || 'No lifecycle events recorded.';
      details.append(pre);
      details.dataset.loaded = '1';
      message.textContent = '';
    } catch (error) { message.textContent = error.message; }
  }

  function callCard(call, deploymentMap) {
    const card = node('article', undefined, 'box');
    const deployment = deploymentMap.get(call.deploymentId);
    card.append(
      node('span', call.status, 'pill'),
      node('h3', deployment?.businessName || call.deploymentId),
      node('p', `${call.dialedNumber || 'No DID'} · ${call.environment} · ${call.provider}`, 'small'),
      node('p', `Call: ${call.callId}`, 'small'),
      node('p', `Started: ${formatTime(call.startedAt)} · Updated: ${formatTime(call.updatedAt)}`, 'small'),
    );

    if (call.blockerCodes?.length) {
      const blocked = node('div', undefined, 'note');
      blocked.append(node('strong', 'Blocked by'), node('p', call.blockerCodes.join(' · '), 'small'));
      card.append(blocked);
    }
    if (call.lastError) card.append(node('p', `Last error: ${call.lastError}`, 'status'));

    const toolEntries = Object.entries(call.toolCounts || {});
    if (toolEntries.length) card.append(node('p', `Tools: ${toolEntries.map(([name, count]) => `${name} × ${count}`).join(' · ')}`, 'small'));
    if (call.transfer?.requested) {
      card.append(node('p', `Transfer: ${call.transfer.confirmed ? 'confirmed' : 'requested'}${call.transfer.target ? ` → ${call.transfer.target}` : ''}`, 'small'));
    }

    const details = node('details');
    const summary = node('summary', 'Lifecycle timeline');
    const message = node('p', '', 'status');
    details.append(summary, message);
    details.addEventListener('toggle', () => {
      if (details.open) expandTimeline(details, call.callId, message);
    });
    card.append(details);
    return card;
  }

  async function load() {
    if (!token) return;
    const version = ++generation;
    root.replaceChildren(); status.textContent = 'Loading Realtime call audit…';
    try {
      const [callData, deploymentData] = await Promise.all([
        api('/api/ops/realtime-calls?limit=100'),
        api('/api/ops/deployments'),
      ]);
      if (version !== generation) return;
      const calls = callData.calls || [];
      const deploymentMap = new Map((deploymentData.deployments || []).map(item => [item.id, item]));
      calls.forEach(call => root.append(callCard(call, deploymentMap)));
      status.textContent = calls.length
        ? `${calls.length} audited call(s) · ${Object.entries(callData.counts || {}).map(([key, count]) => `${count} ${key}`).join(' · ')}`
        : 'No Realtime calls recorded yet.';
    } catch (error) {
      if (version === generation) status.textContent = error.message || 'Could not load Realtime call audit.';
    }
  }

  login.addEventListener('submit', () => {
    token = login.elements.namedItem('token').value;
    queueMicrotask(load);
  });
  lock.addEventListener('click', () => {
    generation += 1; token = ''; root.replaceChildren(); status.textContent = 'Realtime call audit locked.';
  });
})();
