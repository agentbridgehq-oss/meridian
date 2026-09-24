(() => {
  let token = '', generation = 0;
  const login = document.querySelector('#ops-login');
  const lock = document.querySelector('#ops-lock');
  const root = document.querySelector('#ops-inbound-routes');
  const status = document.querySelector('#inbound-routing-status');
  if (!login || !lock || !root || !status) return;

  const node = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const option = (value, text, selected = false) => {
    const n = node('option', text); n.value = value; n.selected = selected; return n;
  };
  async function api(path, options = {}) {
    const response = await fetch(path, {
      cache: 'no-store',
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function routeCard(route, deploymentMap) {
    const card = node('article', undefined, 'box');
    const deployment = deploymentMap.get(route.deploymentId);
    card.append(
      node('span', route.enabled ? 'enabled' : 'disabled', 'pill'),
      node('h3', route.dialedNumber),
      node('p', deployment?.businessName || route.deploymentId),
      node('p', `${route.provider} · ${route.environment}`, 'small'),
    );
    if (route.evidence) card.append(node('p', `Evidence: ${route.evidence}`, 'small'));

    const evidenceLabel = node('label', route.enabled ? 'Disable evidence / reason' : 'Verification evidence');
    const evidence = node('textarea', undefined, 'field');
    evidence.rows = 2; evidence.maxLength = 2000; evidence.placeholder = route.enabled ? 'Why is this route being disabled?' : 'What verified this DID and SIP route?';
    evidenceLabel.append(evidence); card.append(evidenceLabel);

    const button = node('button', route.enabled ? 'Disable route' : 'Enable verified route', route.enabled ? 'btn' : 'btn primary');
    button.type = 'button';
    const message = node('p', '', 'status'); message.setAttribute('role', 'status');
    button.addEventListener('click', async () => {
      if (!route.enabled && evidence.value.trim().length < 8) {
        message.textContent = 'Record verification evidence before enabling this number.'; return;
      }
      button.disabled = true; message.textContent = route.enabled ? 'Disabling…' : 'Enabling…';
      try {
        await api(`/api/ops/inbound-routes/${encodeURIComponent(route.id)}/${route.enabled ? 'disable' : 'enable'}`, {
          method: 'POST', body: JSON.stringify({ evidence: evidence.value }),
        });
        await load();
      } catch (error) { message.textContent = error.message; button.disabled = false; }
    });
    card.append(button, message);
    return card;
  }

  function createRouteForm(deployments) {
    const voice = deployments.filter(d => Array.isArray(d.capabilities) && d.capabilities.includes('voice'));
    const form = node('form', undefined, 'box form');
    form.append(node('h3', 'Assign inbound number'));
    if (!voice.length) {
      form.append(node('p', 'No voice-capable Deployment Core records are available yet.', 'small'));
      return form;
    }

    const deploymentLabel = node('label', 'Client deployment');
    const deployment = node('select', undefined, 'field');
    voice.forEach(item => deployment.append(option(item.id, `${item.businessName} · ${item.status}`)));
    deploymentLabel.append(deployment); form.append(deploymentLabel);

    const numberLabel = node('label', 'Twilio inbound number (E.164)');
    const number = node('input', undefined, 'field');
    number.type = 'tel'; number.required = true; number.placeholder = '+17055550123'; number.pattern = '\\+[1-9][0-9]{7,14}';
    numberLabel.append(number); form.append(numberLabel);

    const environmentLabel = node('label', 'Environment');
    const environment = node('select', undefined, 'field');
    environment.append(option('staging', 'Staging', true), option('production', 'Production'));
    environmentLabel.append(environment); form.append(environmentLabel);

    const evidenceLabel = node('label', 'Assignment note');
    const evidence = node('textarea', undefined, 'field'); evidence.rows = 2; evidence.maxLength = 2000; evidence.placeholder = 'Optional assignment evidence. The route still starts disabled.';
    evidenceLabel.append(evidence); form.append(evidenceLabel);

    const submit = node('button', 'Create disabled route', 'btn primary');
    const message = node('p', '', 'status'); message.setAttribute('role', 'status');
    form.append(submit, message);
    form.addEventListener('submit', async event => {
      event.preventDefault(); submit.disabled = true; message.textContent = 'Creating…';
      try {
        const out = await api(`/api/ops/deployments/${encodeURIComponent(deployment.value)}/inbound-routes`, {
          method: 'POST',
          body: JSON.stringify({
            dialedNumber: number.value,
            provider: 'twilio-sip',
            environment: environment.value,
            evidence: evidence.value,
          }),
        });
        message.textContent = `Route ${out.route.dialedNumber} created disabled. Verify the Twilio trunk before enabling.`;
        number.value = ''; evidence.value = '';
        await load();
      } catch (error) { message.textContent = error.message; submit.disabled = false; }
    });
    return form;
  }

  async function load() {
    if (!token) return;
    const version = ++generation;
    root.replaceChildren(); status.textContent = 'Loading inbound voice routing…';
    try {
      const [routeData, deploymentData] = await Promise.all([
        api('/api/ops/inbound-routes'),
        api('/api/ops/deployments'),
      ]);
      if (version !== generation) return;
      const deployments = deploymentData.deployments || [];
      const routes = routeData.routes || [];
      const deploymentMap = new Map(deployments.map(item => [item.id, item]));
      root.append(createRouteForm(deployments));
      routes.forEach(route => root.append(routeCard(route, deploymentMap)));
      status.textContent = routes.length
        ? `${routes.length} inbound route(s) · ${routes.filter(r => r.enabled).length} enabled`
        : 'No inbound phone routes yet. Assign a staging number to a voice deployment first.';
    } catch (error) {
      if (version === generation) status.textContent = error.message || 'Could not load inbound voice routing.';
    }
  }

  login.addEventListener('submit', () => {
    token = login.elements.namedItem('token').value;
    queueMicrotask(load);
  });
  lock.addEventListener('click', () => {
    generation += 1; token = ''; root.replaceChildren(); status.textContent = 'Inbound voice routing locked.';
  });
})();
