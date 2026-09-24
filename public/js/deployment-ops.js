(() => {
  let token = '', generation = 0, providerMap = {};
  const login = document.querySelector('#ops-login');
  const lock = document.querySelector('#ops-lock');
  const root = document.querySelector('#ops-deployments');
  const status = document.querySelector('#deployment-status');
  if (!login || !lock || !root || !status) return;

  const node = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const authHeaders = (json = false) => ({ Authorization: `Bearer ${token}`, ...(json ? { 'Content-Type': 'application/json' } : {}) });
  async function api(path, options = {}) {
    const response = await fetch(path, { cache: 'no-store', ...options, headers: { ...authHeaders(Boolean(options.body)), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.data = data; error.status = response.status; throw error;
    }
    return data;
  }
  const option = (value, text, selected = false) => { const o = node('option', text); o.value = value; o.selected = selected; return o; };
  const formMessage = () => { const p = node('p', '', 'status'); p.setAttribute('role', 'status'); return p; };

  function providerChoices(kind, current) {
    return Object.values(providerMap).filter(p => Array.isArray(p.kinds) && p.kinds.includes(kind)).sort((a,b) => Number(b.recommended) - Number(a.recommended) || a.label.localeCompare(b.label)).map(p => option(p.id, `${p.label}${p.recommended ? ' · recommended' : ''}`, p.id === current));
  }

  function runtimePanel(manifest, deployment) {
    const box = node('div', undefined, 'box');
    box.append(node('div', 'Control plane', 'ey'));
    const runtime = manifest.controlPlane || {};
    if (runtime.agentId) {
      box.append(node('p', `Runtime agent: ${runtime.agentId}`), node('p', `Provisioned: ${runtime.provisionedAt || 'recorded'}`, 'small'));
      const endpoints = node('pre'); endpoints.textContent = Object.entries(runtime.endpoints || {}).map(([k,v]) => `${k}: ${v}`).join('\n'); box.append(endpoints);
      return box;
    }
    box.append(node('p', 'No managed runtime is provisioned yet. This creates the Meridian control-plane agent; it does not verify OpenAI or telephony.'));
    if (deployment.capabilities.some(x => ['voice','sales','booking'].includes(x))) {
      const button = node('button', 'Provision control-plane runtime', 'btn primary'), message = formMessage();
      button.type = 'button';
      button.addEventListener('click', async () => {
        button.disabled = true; message.textContent = 'Provisioning…';
        try {
          const out = await api(`/api/ops/deployments/${encodeURIComponent(deployment.id)}/provision-runtime`, { method: 'POST', body: '{}' });
          message.textContent = out.created ? 'Runtime created. Save the one-time connection key now.' : (out.note || 'Runtime already exists.');
          if (out.oneTimeSecret?.agentApiKey) {
            const secretBox = node('div', undefined, 'note');
            secretBox.append(node('strong', 'One-time connection key — copy it to the selected provider secret store now.'));
            const value = node('textarea', undefined, 'field'); value.readOnly = true; value.rows = 2; value.value = out.oneTimeSecret.agentApiKey; secretBox.append(value);
            const copy = node('button', 'Copy key', 'btn'); copy.type = 'button';
            copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(value.value); copy.textContent = 'Copied'; } catch { value.select(); } });
            secretBox.append(copy); box.append(secretBox);
          }
          await load();
        } catch (e) { message.textContent = e.message; button.disabled = false; }
      });
      box.append(button, message);
    }
    return box;
  }

  function integrationPanel(deployment) {
    const details = node('details'); details.open = true; details.append(node('summary', 'Provider integrations'));
    const wrap = node('div', undefined, 'project-list');
    Object.values(deployment.integrations || {}).forEach(integration => {
      const box = node('form', undefined, 'box form');
      box.append(node('div', integration.kind.replaceAll('_',' '), 'ey'));
      const providerLabel = node('label', 'Provider');
      const provider = node('select', undefined, 'field'); provider.name = 'provider';
      provider.append(option('', 'Choose provider', !integration.provider));
      providerChoices(integration.kind, integration.provider).forEach(o => provider.append(o));
      if (integration.provider && ![...provider.options].some(o => o.value === integration.provider)) provider.append(option(integration.provider, `${integration.provider} · existing`, true));
      providerLabel.append(provider); box.append(providerLabel);

      const statusLabel = node('label', 'Verification state');
      const state = node('select', undefined, 'field'); state.name = 'state';
      ['pending','configured','verified','failed','disabled'].forEach(s => state.append(option(s, s, s === integration.status))); statusLabel.append(state); box.append(statusLabel);

      const credLabel = node('label', undefined, 'check'), credential = node('input'); credential.type = 'checkbox'; credential.checked = integration.credentialConfigured === true;
      credLabel.append(credential, node('span', integration.requiresCredential ? 'Provider credential is stored in the provider/Railway secret store.' : 'No external credential is required for this integration.'));
      if (!integration.requiresCredential) { credential.checked = true; credential.disabled = true; }
      box.append(credLabel);

      const evidenceLabel = node('label', 'Configuration / verification evidence'); const evidence = node('textarea', undefined, 'field'); evidence.rows = 3; evidence.maxLength = 4000; evidence.value = integration.evidence || ''; evidenceLabel.append(evidence); box.append(evidenceLabel);
      const currentProvider = providerMap[integration.provider || provider.value];
      if (currentProvider?.env?.length) box.append(node('p', `Expected secret names: ${currentProvider.env.join(', ')}`, 'small'));
      const message = formMessage(), submit = node('button', 'Save integration', 'btn primary'); box.append(submit, message);
      box.addEventListener('submit', async event => {
        event.preventDefault(); submit.disabled = true; message.textContent = 'Saving…';
        try {
          await api(`/api/ops/deployments/${encodeURIComponent(deployment.id)}/integrations/${encodeURIComponent(integration.kind)}`, { method:'PATCH', body: JSON.stringify({ provider: provider.value, status: state.value, credentialConfigured: integration.requiresCredential ? credential.checked : true, evidence: evidence.value }) });
          await load();
        } catch (e) { message.textContent = e.message; submit.disabled = false; }
      });
      wrap.append(box);
    });
    details.append(wrap); return details;
  }

  function qaPanel(deployment) {
    const details = node('details'); details.append(node('summary', 'Acceptance checks'));
    const wrap = node('div', undefined, 'project-list');
    (deployment.checks || []).forEach(check => {
      const form = node('form', undefined, 'box form'); form.append(node('h3', check.label));
      const stateLabel = node('label', 'Result'), state = node('select', undefined, 'field'); state.append(option('pass','Pass',check.status === 'passed'), option('fail','Fail',check.status === 'failed')); stateLabel.append(state); form.append(stateLabel);
      const evLabel = node('label','Evidence'), ev = node('textarea', undefined, 'field'); ev.rows=3; ev.value=check.evidence || ''; ev.required=true; ev.minLength=8; evLabel.append(ev); form.append(evLabel);
      const byLabel = node('label','Checked by'), by = node('input', undefined, 'field'); by.value=check.checkedBy || 'Meridian QA'; byLabel.append(by); form.append(byLabel);
      const submit=node('button','Record QA result','btn primary'), message=formMessage(); form.append(submit,message);
      form.addEventListener('submit', async event => { event.preventDefault(); submit.disabled=true; try { await api(`/api/ops/deployments/${encodeURIComponent(deployment.id)}/checks/${encodeURIComponent(check.id)}`, { method:'PATCH', body:JSON.stringify({passed:state.value==='pass',evidence:ev.value,checkedBy:by.value}) }); await load(); } catch(e){ message.textContent=e.message; submit.disabled=false; } });
      wrap.append(form);
    }); details.append(wrap); return details;
  }

  function goLivePanel(deployment) {
    const details = node('details'); details.append(node('summary','Rollback, acceptance & live controls'));
    const wrap = node('div', undefined, 'project-list');

    const rollback = node('form', undefined, 'box form'); rollback.append(node('h3','Rollback plan'));
    const ownerLabel=node('label','Rollback owner'), owner=node('input',undefined,'field'); owner.value=deployment.rollback?.owner || ''; ownerLabel.append(owner); rollback.append(ownerLabel);
    const sumLabel=node('label','Rollback procedure'), summary=node('textarea',undefined,'field'); summary.rows=3; summary.value=deployment.rollback?.summary || ''; sumLabel.append(summary); rollback.append(sumLabel);
    const rbButton=node('button','Record rollback plan','btn primary'), rbMessage=formMessage(); rollback.append(rbButton,rbMessage);
    rollback.addEventListener('submit',async e=>{e.preventDefault();rbButton.disabled=true;try{await api(`/api/ops/deployments/${encodeURIComponent(deployment.id)}/rollback`,{method:'PUT',body:JSON.stringify({documented:true,owner:owner.value,summary:summary.value})});await load();}catch(err){rbMessage.textContent=err.message;rbButton.disabled=false;}}); wrap.append(rollback);

    const accept = node('form', undefined, 'box form'); accept.append(node('h3','Client acceptance'));
    const byLabel=node('label','Accepted by'), by=node('input',undefined,'field'); by.value=deployment.clientAcceptance?.acceptedBy || ''; byLabel.append(by); accept.append(byLabel);
    const evLabel=node('label','Acceptance evidence'), ev=node('textarea',undefined,'field'); ev.rows=3; ev.value=deployment.clientAcceptance?.evidence || ''; evLabel.append(ev); accept.append(evLabel);
    const acButton=node('button','Record client acceptance','btn primary'), acMessage=formMessage(); accept.append(acButton,acMessage);
    accept.addEventListener('submit',async e=>{e.preventDefault();acButton.disabled=true;try{await api(`/api/ops/deployments/${encodeURIComponent(deployment.id)}/acceptance`,{method:'PUT',body:JSON.stringify({accepted:true,acceptedBy:by.value,evidence:ev.value})});await load();}catch(err){acMessage.textContent=err.message;acButton.disabled=false;}}); wrap.append(accept);

    const health = node('form', undefined, 'box form'); health.append(node('h3','Health evidence'));
    const healthState=node('select',undefined,'field'); ['healthy','degraded','down','unknown'].forEach(s=>healthState.append(option(s,s,s===deployment.health?.status))); const hsLabel=node('label','Current health');hsLabel.append(healthState);health.append(hsLabel);
    const hdLabel=node('label','Probe detail'), hd=node('textarea',undefined,'field');hd.rows=2;hd.value=deployment.health?.detail || '';hdLabel.append(hd);health.append(hdLabel);
    const hButton=node('button','Record health','btn'),hMessage=formMessage();health.append(hButton,hMessage);health.addEventListener('submit',async e=>{e.preventDefault();hButton.disabled=true;try{await api(`/api/ops/deployments/${encodeURIComponent(deployment.id)}/health`,{method:'PUT',body:JSON.stringify({status:healthState.value,detail:hd.value})});await load();}catch(err){hMessage.textContent=err.message;hButton.disabled=false;}});wrap.append(health);

    const control = node('div', undefined, 'box'); control.append(node('h3','Production control'));
    const controlMessage=formMessage();
    if (deployment.status === 'live') {
      const pause=node('button','Emergency pause','btn'); pause.type='button'; pause.addEventListener('click',async()=>{const reason=window.prompt('Record the reason for pausing this production deployment:');if(!reason)return;pause.disabled=true;try{await api(`/api/ops/deployments/${encodeURIComponent(deployment.id)}/pause`,{method:'POST',body:JSON.stringify({reason})});await load();}catch(err){controlMessage.textContent=err.message;pause.disabled=false;}});control.append(pause);
    } else {
      const activate=node('button','Activate production','btn primary');activate.type='button';activate.disabled=!deployment.readiness?.canActivate;activate.title=activate.disabled?'Resolve every blocker first.':'All hard gates are complete.';activate.addEventListener('click',async()=>{activate.disabled=true;try{await api(`/api/ops/deployments/${encodeURIComponent(deployment.id)}/activate`,{method:'POST',body:JSON.stringify({evidence:'Activated from Meridian Deployment Core operator workspace.'})});await load();}catch(err){controlMessage.textContent=err.message;activate.disabled=false;}});control.append(activate);
    }
    control.append(controlMessage); wrap.append(control); details.append(wrap); return details;
  }

  async function renderDeployment(summary, version) {
    const [detailData, manifestData] = await Promise.all([
      api(`/api/ops/deployments/${encodeURIComponent(summary.id)}`),
      api(`/api/ops/deployments/${encodeURIComponent(summary.id)}/manifest`),
    ]);
    if (version !== generation) return;
    const deployment = detailData.deployment, manifest = manifestData.manifest;
    const card=node('article',undefined,'card');
    card.append(node('span',deployment.status,'pill'),node('h2',deployment.businessName));
    const meta=node('pre');meta.textContent=`Service: ${deployment.service} · ${deployment.tier || 'custom'}\nReadiness: ${deployment.readiness.percent}% (${deployment.readiness.complete}/${deployment.readiness.total})\nHealth: ${deployment.health?.status || 'unknown'}\nUpdated: ${deployment.updatedAt}`;card.append(meta);
    const architecture=node('div',undefined,'note');architecture.append(node('strong','Target architecture'),node('p',manifest.architecture.inbound),node('p',manifest.architecture.realtimeModel?`Realtime model: ${manifest.architecture.realtimeModel}`:`Text model: ${manifest.architecture.textModel}`,'small'));card.append(architecture);
    if (deployment.blockers?.length) { const d=node('details');d.append(node('summary',`${deployment.blockers.length} go-live blocker(s)`));const pre=node('pre');pre.textContent=deployment.blockers.join('\n');d.append(pre);card.append(d); }
    card.append(runtimePanel(manifest,deployment),integrationPanel(deployment),qaPanel(deployment),goLivePanel(deployment));
    root.append(card);
  }

  async function load() {
    if (!token) return;
    const version=++generation;root.replaceChildren();status.textContent='Loading Deployment Core…';
    try {
      const [providers, list] = await Promise.all([api('/api/ops/deployment-providers'),api('/api/ops/deployments')]);
      if(version!==generation)return;providerMap=providers.providers || {};
      status.textContent=list.deployments.length?`${list.deployments.length} deployment(s) · ${Object.entries(list.counts||{}).map(([k,v])=>`${v} ${k}`).join(' · ')}`:'No deployment records yet. A record is created automatically when an approved project enters build.';
      for(const deployment of list.deployments) await renderDeployment(deployment,version);
    } catch(e){if(version===generation)status.textContent=e.message || 'Could not load Deployment Core.';}
  }

  // This script loads before agency-ops.js so it captures the value before the
  // existing project workspace clears the password field after unlock.
  login.addEventListener('submit', event => {
    event.preventDefault();
    token = login.elements.namedItem('token').value;
    queueMicrotask(load);
  });
  lock.addEventListener('click',()=>{generation++;token='';providerMap={};root.replaceChildren();status.textContent='Deployment Core locked.';});
})();
