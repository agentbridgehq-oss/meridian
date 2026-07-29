/**
 * Meridian interactive customer setup wizard
 * One block at a time → Next. Token-aware. OpenClaw autonomous queue.
 */
(function () {
  'use strict';

  const BASE = location.origin.replace(/\/$/, '');
  const token = (location.pathname.match(/^\/setup\/([a-f0-9]+)/i) || [])[1] || '';
  const storageKey = `mdn_setup_${token || 'manual'}`;

  const state = {
    step: 0,
    ctx: null,
    path: 'full', // website | api | webhooks | phone | full | autonomous
    done: {},
    testReply: '',
    autonomousJob: null,
    loading: true,
    error: '',
    // Voice picker
    voices: [],
    voicesLoaded: false,
    voicesLoading: false,
    voicesError: '',
    voicesSource: '',
    hostedReady: false,
    selectedVoiceId: 'eve',
    voiceFilter: '',
    voiceSaveMsg: '',
    voicePreviewMsg: '',
    previewingId: null,
  };

  const PATH_SKIP = {
    // voice step always shown (xAI picker) for every path
    website: { voice: true, website: true, api: false, webhooks: false, phone: false, autonomous: true },
    api: { voice: true, website: false, api: true, webhooks: true, phone: false, autonomous: true },
    webhooks: { voice: true, website: false, api: true, webhooks: true, phone: false, autonomous: true },
    phone: { voice: true, website: false, api: true, webhooks: false, phone: true, autonomous: true },
    full: { voice: true, website: true, api: true, webhooks: true, phone: true, autonomous: true },
    autonomous: { voice: true, website: true, api: true, webhooks: true, phone: true, autonomous: true },
  };

  function saveLocal() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          step: state.step,
          path: state.path,
          done: state.done,
          agentId: state.ctx?.agentId,
          selectedVoiceId: state.selectedVoiceId,
        }),
      );
    } catch (_) {}
  }

  function loadLocal() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || 'null');
    } catch {
      return null;
    }
  }

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      if (!btn) return;
      const p = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(() => (btn.textContent = p), 1500);
    });
  }

  function shouldShowStep(stepId) {
    if (['welcome', 'credentials', 'path', 'voice', 'knowledge', 'test', 'done'].includes(stepId)) return true;
    const map = PATH_SKIP[state.path] || PATH_SKIP.full;
    if (stepId === 'voice') return map.voice !== false;
    if (stepId === 'knowledge') return true;
    if (stepId === 'website') return map.website;
    if (stepId === 'api') return map.api;
    if (stepId === 'webhooks') return map.webhooks;
    if (stepId === 'phone') return map.phone;
    if (stepId === 'autonomous') return map.autonomous;
    return true;
  }

  function visibleSteps() {
    const steps = state.ctx?.steps || [];
    return steps.filter((s) => shouldShowStep(s.id));
  }

  async function loadContext() {
    state.loading = true;
    render();
    try {
      let ctx;
      if (token) {
        const res = await fetch(`${BASE}/api/setup/${token}`);
        ctx = await res.json();
        if (!res.ok) throw new Error(ctx.error || 'Guide not found');
      } else {
        ctx = await (await fetch(`${BASE}/api/setup/blank`)).json();
      }
      state.ctx = ctx;
      state.selectedVoiceId = ctx.selectedVoiceId || ctx.xaiVoiceId || 'eve';
      const saved = loadLocal();
      if (saved && saved.agentId === ctx.agentId) {
        state.step = Math.min(saved.step || 0, 99);
        state.path = saved.path || 'full';
        state.done = saved.done || {};
        if (saved.selectedVoiceId) state.selectedVoiceId = saved.selectedVoiceId;
      }
    } catch (e) {
      state.error = e.message || 'Failed to load setup';
    }
    state.loading = false;
    // clamp step into visible list
    const vis = visibleSteps();
    if (state.step >= vis.length) state.step = Math.max(0, vis.length - 1);
    render();
    // Prefetch voice catalog in background
    loadVoices().catch(() => {});
  }

  async function loadVoices() {
    if (state.voicesLoading) return;
    state.voicesLoading = true;
    state.voicesError = '';
    try {
      let data;
      if (token) {
        const res = await fetch(`${BASE}/api/setup/${token}/voices`);
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load voices');
      } else {
        const res = await fetch(`${BASE}/api/voice/voices`);
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load voices');
      }
      state.voices = data.voices || [];
      state.voicesSource = data.source || '';
      state.hostedReady = Boolean(data.hostedReady);
      if (data.selectedVoiceId) state.selectedVoiceId = data.selectedVoiceId;
      else if (!state.selectedVoiceId && data.defaultVoiceId) state.selectedVoiceId = data.defaultVoiceId;
      state.voicesLoaded = true;
    } catch (e) {
      state.voicesError = e.message || 'Failed to load voices';
      state.voicesLoaded = true;
    }
    state.voicesLoading = false;
    // Re-render only if currently on voice step
    const vis = visibleSteps();
    const cur = vis[state.step];
    if (cur?.id === 'voice') render();
  }

  async function saveKnowledgeStep() {
    const payload = {
      hours: document.getElementById('k-hours')?.value || '',
      services: document.getElementById('k-services')?.value || '',
      faqs: document.getElementById('k-faqs')?.value || '',
      knowledgeBase: document.getElementById('k-kb')?.value || '',
      humanTransfer: document.getElementById('k-transfer')?.value || '',
      calendarUrl: document.getElementById('k-cal')?.value || '',
      ownerNotifyEmail: document.getElementById('k-email')?.value || '',
      ownerNotifyPhone: document.getElementById('k-phone')?.value || '',
    };
    const status = document.getElementById('k-save-msg');
    if (status) status.textContent = 'Saving…';
    try {
      let res;
      if (token) {
        res = await fetch(`${BASE}/api/setup/${token}/knowledge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        const agentId = state.ctx?.agentId || document.getElementById('manual-agent')?.value?.trim();
        const apiKey = state.ctx?.apiKey || document.getElementById('manual-key')?.value?.trim();
        if (!agentId || !apiKey) throw new Error('Need agent credentials first');
        res = await fetch(`${BASE}/api/v1/agents/${encodeURIComponent(agentId)}/knowledge`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      state.done.knowledge = true;
      saveLocal();
      saveProgressRemote();
      if (status) status.textContent = 'Saved · truth layer live';
    } catch (e) {
      if (status) status.textContent = 'Error: ' + (e.message || 'failed');
    }
  }

  async function saveVoice(voiceId) {
    const id = (voiceId || state.selectedVoiceId || '').toLowerCase().trim();
    if (!id) return;
    state.selectedVoiceId = id;
    state.voiceSaveMsg = 'Saving…';
    render();
    try {
      let res;
      if (token) {
        res = await fetch(`${BASE}/api/setup/${token}/voice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voiceId: id }),
        });
      } else {
        const agentId = state.ctx?.agentId || document.getElementById('manual-agent')?.value?.trim();
        const apiKey = state.ctx?.apiKey || document.getElementById('manual-key')?.value?.trim();
        if (!agentId || !apiKey) {
          // Local-only pick until credentials exist
          state.voiceSaveMsg = `Selected ${id} (save credentials first to persist on your agent)`;
          state.done.voice = true;
          try {
            localStorage.setItem(
              storageKey,
              JSON.stringify({
                ...(loadLocal() || {}),
                step: state.step,
                path: state.path,
                done: state.done,
                agentId: state.ctx?.agentId,
                selectedVoiceId: id,
              }),
            );
          } catch (_) {}
          render();
          return;
        }
        res = await fetch(`${BASE}/api/setup/voice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, apiKey, voiceId: id }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save voice');
      state.selectedVoiceId = data.xaiVoiceId || id;
      if (state.ctx) state.ctx.selectedVoiceId = state.selectedVoiceId;
      state.voiceSaveMsg = `Saved · ${state.selectedVoiceId}`;
      state.done.voice = true;
      saveLocal();
      saveProgressRemote();
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            ...(loadLocal() || {}),
            step: state.step,
            path: state.path,
            done: state.done,
            agentId: state.ctx?.agentId,
            selectedVoiceId: state.selectedVoiceId,
          }),
        );
      } catch (_) {}
    } catch (e) {
      state.voiceSaveMsg = `Error: ${e.message}`;
    }
    render();
  }

  async function previewVoiceSample(voiceId) {
    const id = (voiceId || state.selectedVoiceId || 'eve').toLowerCase().trim();
    state.previewingId = id;
    state.voicePreviewMsg = `Loading sample · ${id}…`;
    render();
    try {
      const res = await fetch(`${BASE}/api/voice/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      if (!data.audioBase64) throw new Error('No audio returned');
      const mime = data.contentType || 'audio/mpeg';
      const audio = new Audio(`data:${mime};base64,${data.audioBase64}`);
      state.voicePreviewMsg = `Playing · ${id}`;
      render();
      await audio.play();
      audio.addEventListener('ended', () => {
        state.previewingId = null;
        state.voicePreviewMsg = `Heard · ${id}`;
        const vis = visibleSteps();
        if (vis[state.step]?.id === 'voice') render();
      });
    } catch (e) {
      state.previewingId = null;
      state.voicePreviewMsg = e.message || 'Preview unavailable';
      render();
    }
  }

  async function runTest() {
    const msg = document.getElementById('test-msg')?.value || 'What are your hours?';
    const btn = document.getElementById('btn-test');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Testing…';
    }
    try {
      let res;
      if (token) {
        res = await fetch(`${BASE}/api/setup/${token}/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg }),
        });
      } else {
        const agentId = document.getElementById('manual-agent')?.value?.trim();
        const apiKey = document.getElementById('manual-key')?.value?.trim();
        res = await fetch(`${BASE}/api/setup/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, apiKey, message: msg }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test failed');
      state.testReply = data.reply;
      state.done.test = true;
      saveLocal();
      saveProgressRemote();
    } catch (e) {
      state.testReply = `Error: ${e.message}`;
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Run test';
    }
    render();
  }

  async function saveProgressRemote() {
    if (!token) return;
    try {
      await fetch(`${BASE}/api/setup/${token}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: state.step,
          path: state.path,
          done: state.done,
        }),
      });
    } catch (_) {}
  }

  async function queueAutonomous() {
    const email = document.getElementById('auto-email')?.value?.trim() || '';
    const websiteUrl = document.getElementById('auto-site')?.value?.trim() || '';
    const phonePlatform = document.getElementById('auto-phone')?.value || 'retell';
    const outboundWebhook = document.getElementById('auto-hook')?.value?.trim() || '';
    const btn = document.getElementById('btn-auto');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Queuing OpenClaw…';
    }
    try {
      const url = token ? `${BASE}/api/setup/${token}/autonomous` : `${BASE}/api/setup/autonomous`;
      const body = token
        ? { email, websiteUrl, phonePlatform, outboundWebhook, path: state.path }
        : {
            email,
            websiteUrl,
            phonePlatform,
            outboundWebhook,
            path: state.path,
            agentId: document.getElementById('manual-agent')?.value?.trim(),
            apiKey: document.getElementById('manual-key')?.value?.trim(),
            businessName: document.getElementById('manual-name')?.value?.trim(),
          };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Queue failed');
      state.autonomousJob = data.job;
      state.done.autonomous = true;
      saveLocal();
      saveProgressRemote();
    } catch (e) {
      state.autonomousJob = { error: e.message };
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Start autonomous install';
    }
    render();
  }

  function applyManualCreds() {
    const agentId = document.getElementById('manual-agent')?.value?.trim();
    const apiKey = document.getElementById('manual-key')?.value?.trim();
    const businessName = document.getElementById('manual-name')?.value?.trim() || 'Your business';
    if (!agentId || !apiKey) {
      alert('Enter Agent ID and secret API key from your connect guide email.');
      return;
    }
    // Build local context endpoints
    state.ctx = state.ctx || {};
    state.ctx.agentId = agentId;
    state.ctx.apiKey = apiKey;
    state.ctx.businessName = businessName;
    state.ctx.base = BASE;
    state.ctx.endpoints = {
      agent: `${BASE}/api/v1/agents/${agentId}/agent`,
      chat: `${BASE}/api/v1/agents/${agentId}/chat`,
      voiceTurn: `${BASE}/api/v1/agents/${agentId}/voiceTurn`.replace('voiceTurn', 'voice-turn'),
      events: `${BASE}/api/v1/agents/${agentId}/events`,
    };
    state.ctx.widgetSnippet =
      '(Open your personal /guide link for the ready widget snippet with public token.)';
    state.done.credentials = true;
    saveLocal();
    next();
  }

  function markDone(id) {
    state.done[id] = true;
    saveLocal();
    saveProgressRemote();
    render();
  }

  function next() {
    const vis = visibleSteps();
    const cur = vis[state.step];
    if (cur) state.done[cur.id] = true;
    if (state.step < vis.length - 1) state.step += 1;
    saveLocal();
    saveProgressRemote();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function back() {
    if (state.step > 0) state.step -= 1;
    saveLocal();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function selectPath(p) {
    state.path = p;
    state.done.path = true;
    // reset step index into new visible list at "path" or next
    saveLocal();
    render();
  }

  function progressPct() {
    const vis = visibleSteps();
    if (!vis.length) return 0;
    return Math.round(((state.step + 1) / vis.length) * 100);
  }

  function renderBlock(step) {
    const c = state.ctx || {};
    const id = c.agentId || 'agent_…';
    const key = c.apiKey || 'mdn_…';
    const snip = c.widgetSnippet || '';

    if (step.id === 'welcome') {
      return `
        <div class="block-body">
          <p class="lead">This wizard walks you through connecting <strong>${escapeHtml(c.businessName || 'your business')}</strong>’s Meridian agent to your website, automations, and phone — one block at a time. Click <strong>Next</strong> when each block is done.</p>
          <div class="callout good">
            <b>Seamless promise</b>
            <p>Your agent is already built and smoke-tested. You only wire it to your systems. Secret keys never go in public pages.</p>
          </div>
          <ul class="bullets">
            <li>About 10–30 minutes depending on path</li>
            <li>Optional: fully autonomous OpenClaw pack at the end</li>
            <li>Phone number attach in Retell/Vapi is the only carrier step that stays manual</li>
          </ul>
        </div>`;
    }

    if (step.id === 'credentials') {
      if (c.apiKey) {
        return `
        <div class="block-body">
          <p class="lead">Save these somewhere safe (password manager). You’ll paste the secret key only into servers / phone tools / n8n — never into WordPress HTML.</p>
          <div class="field">
            <label>Business</label>
            <div class="mono box">${escapeHtml(c.businessName || '')}</div>
          </div>
          <div class="field">
            <label>Agent ID</label>
            <div class="mono box" id="cred-id">${escapeHtml(id)}</div>
            <button type="button" class="btn sm" data-copy-id="cred-id">Copy</button>
          </div>
          <div class="field">
            <label>Secret API key (mdn_) — save once</label>
            <div class="mono box secret" id="cred-key">${escapeHtml(key)}</div>
            <button type="button" class="btn sm" data-copy-id="cred-key">Copy key</button>
          </div>
          <div class="field">
            <label>Public widget token</label>
            <div class="mono box" id="cred-wt">${escapeHtml(c.widgetToken || '—')}</div>
            <button type="button" class="btn sm" data-copy-id="cred-wt">Copy</button>
          </div>
          <div class="callout warn">
            <b>Security</b>
            <p><code>mdn_</code> = secret. <code>mdnw_</code> = safe on your website. If the secret leaks, email Meridian ops to rotate.</p>
          </div>
          <label class="check"><input type="checkbox" data-mark="credentials" ${state.done.credentials ? 'checked' : ''}/> I saved my secret key offline</label>
        </div>`;
      }
      return `
        <div class="block-body">
          <p class="lead">No delivery token in this link. Paste credentials from your email connect guide, or open the magic link Meridian sent you.</p>
          <div class="field"><label>Business name</label><input id="manual-name" placeholder="Acme HVAC" /></div>
          <div class="field"><label>Agent ID</label><input id="manual-agent" placeholder="agent_…" class="mono" /></div>
          <div class="field"><label>Secret API key</label><input id="manual-key" placeholder="mdn_…" class="mono" type="password" /></div>
          <button type="button" class="btn dark" id="btn-manual-save">Save &amp; continue</button>
          <p class="hint">Have a <code>/guide/…</code> or <code>/setup/…</code> link? Open that instead — keys fill automatically.</p>
        </div>`;
    }

    if (step.id === 'path') {
      const opts = [
        { id: 'website', t: 'Website only', d: 'Chat bubble on my site — fastest' },
        { id: 'api', t: 'API / app', d: 'My software or backend will call Meridian' },
        { id: 'webhooks', t: 'Automations', d: 'n8n, Zapier, Make, CRM webhooks' },
        { id: 'phone', t: 'Phone first', d: 'Retell / Vapi line answering calls' },
        { id: 'full', t: 'Everything', d: 'Website + API + webhooks + phone' },
        { id: 'autonomous', t: 'Fully autonomous', d: 'OpenClaw packs install for me' },
      ];
      return `
        <div class="block-body">
          <p class="lead">Choose how you want to go live. We’ll only show the blocks you need.</p>
          <div class="path-pick">
            ${opts
              .map(
                (o) => `
              <button type="button" class="path-card ${state.path === o.id ? 'on' : ''}" data-path="${o.id}">
                <strong>${o.t}</strong>
                <span>${o.d}</span>
              </button>`,
              )
              .join('')}
          </div>
        </div>`;
    }

    if (step.id === 'voice') {
      if (!state.voicesLoaded && !state.voicesLoading) {
        loadVoices().catch(() => {});
      }
      const q = (state.voiceFilter || '').toLowerCase().trim();
      const list = (state.voices || []).filter((v) => {
        if (!q) return true;
        const hay = `${v.id} ${v.name} ${v.tagline || ''} ${v.useCases || ''}`.toLowerCase();
        return hay.includes(q);
      });
      const cards = list
        .map((v) => {
          const on = state.selectedVoiceId === v.id ? 'on' : '';
          const playing = state.previewingId === v.id ? 'playing' : '';
          return `
            <div class="voice-card ${on} ${playing}" data-voice-id="${escapeHtml(v.id)}">
              <div class="v-name">${escapeHtml(v.name || v.id)}</div>
              <div class="v-tag">${escapeHtml(v.tagline || 'Neural voice')}</div>
              <div class="v-use">${escapeHtml(v.useCases || '')}</div>
              <div class="v-actions">
                <button type="button" class="btn sm light" data-preview-voice="${escapeHtml(v.id)}">▶ Preview</button>
                <button type="button" class="btn sm dark" data-select-voice="${escapeHtml(v.id)}">
                  ${state.selectedVoiceId === v.id ? 'Selected ✓' : 'Use this'}
                </button>
                <span class="v-id">${escapeHtml(v.id)}</span>
              </div>
            </div>`;
        })
        .join('');
      return `
        <div class="block-body">
          <p class="lead">Pick the neural voice for <strong>Meridian-hosted</strong> speech (xAI). This is used when your stack requests audio with <code>audio: true</code>, or on the speak API. Phone lines still use Retell/Vapi native voices unless you wire hosted audio.</p>
          <div class="voice-toolbar">
            <input class="voice-search" id="voice-filter" type="search" placeholder="Search voices…" value="${escapeHtml(state.voiceFilter || '')}" />
            <button type="button" class="btn sm light" id="btn-reload-voices">Refresh list</button>
          </div>
          ${
            state.voicesLoading
              ? `<p class="voice-status">Loading voice catalog…</p>`
              : state.voicesError
                ? `<p class="voice-status err">${escapeHtml(state.voicesError)}</p>`
                : `<p class="voice-status">${list.length} voice${list.length === 1 ? '' : 's'}${
                    state.voicesSource ? ` · ${escapeHtml(state.voicesSource)}` : ''
                  } · Preview plays a free demo sample; your selected voice is used for real hosted speech.</p>`
          }
          <div class="voice-grid">${cards || '<p class="voice-status">No voices match your search.</p>'}</div>
          <div class="callout good">
            <b>Selected: ${escapeHtml(state.selectedVoiceId || 'eve')}</b>
            <p>Click <strong>Use this</strong> to save on your agent. Previews are free samples (rate-limited) and do not use your prepaid turn packs.</p>
          </div>
          ${
            state.voiceSaveMsg
              ? `<p class="voice-status ${state.voiceSaveMsg.startsWith('Error') ? 'err' : 'ok'}">${escapeHtml(state.voiceSaveMsg)}</p>`
              : ''
          }
          ${
            state.voicePreviewMsg
              ? `<p class="voice-status">${escapeHtml(state.voicePreviewMsg)}</p>`
              : ''
          }
          <label class="check"><input type="checkbox" data-mark="voice" ${state.done.voice ? 'checked' : ''}/> I picked and saved my preferred voice</label>
        </div>`;
    }

    if (step.id === 'knowledge') {
      return `
        <div class="block-body">
          <p class="lead">This is the <strong>truth layer</strong> competitors skip. The agent only answers from what you save here — no invented prices or hours.</p>
          <div class="field"><label>Business hours</label><input id="k-hours" placeholder="Mon–Fri 8–6" value="" /></div>
          <div class="field"><label>Services (how to talk about them)</label><textarea id="k-services" rows="3" placeholder="Drain cleaning from $149…" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--line);font:inherit"></textarea></div>
          <div class="field"><label>Top FAQs</label><textarea id="k-faqs" rows="3" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--line);font:inherit"></textarea></div>
          <div class="field"><label>Extra knowledge base</label><textarea id="k-kb" rows="3" placeholder="Parking, service area, policies…" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--line);font:inherit"></textarea></div>
          <div class="field"><label>Human / emergency transfer number</label><input id="k-transfer" placeholder="+1…" /></div>
          <div class="field"><label>Calendar / booking link</label><input id="k-cal" placeholder="https://calendly.com/…" /></div>
          <div class="field"><label>Owner alert email (emergencies &amp; human requests)</label><input id="k-email" type="email" placeholder="you@business.com" /></div>
          <div class="field"><label>Owner alert phone (optional SMS)</label><input id="k-phone" type="tel" /></div>
          <button type="button" class="btn dark" id="btn-save-knowledge">Save truth layer</button>
          <p class="hint" id="k-save-msg"></p>
          <div class="callout good"><b>Later</b><p>Full editor + website scrape + interaction history: <a href="/dashboard" target="_blank">/dashboard</a></p></div>
          <label class="check"><input type="checkbox" data-mark="knowledge" ${state.done.knowledge ? 'checked' : ''}/> Hours, transfer number, and owner email saved</label>
        </div>`;
    }

    if (step.id === 'website') {
      return `
        <div class="block-body">
          <p class="lead"><strong>Do this now:</strong> paste the snippet before <code>&lt;/body&gt;</code> on your live site (or site-wide footer).</p>
          <ol class="steps-ol">
            <li>Copy the snippet below</li>
            <li>WordPress: Insert Headers and Footers / footer HTML · Shopify: theme.liquid · Squarespace/Wix: site footer embed · Webflow: Footer custom code</li>
            <li>Publish / save</li>
            <li>Open your site in a private window — look for the chat bubble (bottom-right)</li>
            <li>Send: <em>What are your hours?</em></li>
          </ol>
          <pre class="code" id="code-widget">${escapeHtml(snip || 'Open /guide/… for filled snippet')}</pre>
          <button type="button" class="btn dark" data-copy-id="code-widget">Copy widget snippet</button>
          ${token ? `<a class="btn light" href="${BASE}/guide/${token}/widget.txt" download>Download .txt</a>` : ''}
          <label class="check"><input type="checkbox" data-mark="website" ${state.done.website ? 'checked' : ''}/> Bubble answers on my live site</label>
        </div>`;
    }

    if (step.id === 'api') {
      const chat = c.endpoints?.chat || `${BASE}/api/v1/agents/${id}/chat`;
      const agent = c.endpoints?.agent || `${BASE}/api/v1/agents/${id}/agent`;
      const curl = `curl -s -X POST "${agent}" \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d "{\\"message\\":\\"What are your hours?\\",\\"history\\":[]}"`;
      return `
        <div class="block-body">
          <p class="lead">Your server calls Meridian. Claude powers the reply. Store the key in env vars.</p>
          <ol class="steps-ol">
            <li>Put <code>MERIDIAN_AGENT_ID</code> and <code>MERIDIAN_API_KEY</code> in your secrets</li>
            <li>POST JSON <code>{"message":"…"}</code> to the Agent URL</li>
            <li>Show the user the <code>reply</code> field</li>
            <li>Keep short history (last 6–8 turns) for better sales conversations</li>
          </ol>
          <div class="field"><label>Claude Agent API URL</label><div class="mono box" id="api-agent">${escapeHtml(agent)}</div>
          <button type="button" class="btn sm" data-copy-id="api-agent">Copy URL</button></div>
          <div class="field"><label>Chat URL (simple)</label><div class="mono box" id="api-chat">${escapeHtml(chat)}</div></div>
          <pre class="code" id="code-curl">${escapeHtml(curl)}</pre>
          <button type="button" class="btn dark" data-copy-id="code-curl">Copy curl test</button>
          <p class="hint">Full Node/Python samples: <a href="/install#api" target="_blank">/install#api</a></p>
          <label class="check"><input type="checkbox" data-mark="api" ${state.done.api ? 'checked' : ''}/> API returns a correct business reply</label>
        </div>`;
    }

    if (step.id === 'webhooks') {
      const events = c.endpoints?.events || `${BASE}/api/v1/agents/${id}/events`;
      const ev = `curl -s -X POST "${events}" \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d "{\\"type\\":\\"lead.created\\",\\"payload\\":{\\"name\\":\\"Test\\",\\"phone\\":\\"+1\\"}}"`;
      return `
        <div class="block-body">
          <p class="lead">Two directions: your stack → Meridian, and Meridian → your CRM.</p>
          <h3>A) Inbound (you → Meridian)</h3>
          <ol class="steps-ol">
            <li>On new lead / call end, POST to Events URL</li>
            <li>Use types like <code>lead.created</code>, <code>call.ended</code>, <code>booking.requested</code></li>
          </ol>
          <pre class="code" id="code-ev">${escapeHtml(ev)}</pre>
          <button type="button" class="btn dark" data-copy-id="code-ev">Copy events curl</button>
          <h3>B) n8n one-click workflow</h3>
          <p>Import this JSON into n8n → activate once → point forms at the webhook.</p>
          ${
            token
              ? `<a class="btn dark" href="${BASE}/api/setup/${token}/n8n.json" download>Download n8n workflow</a>`
              : `<p class="hint">Open setup with your delivery token to download a filled n8n workflow.</p>`
          }
          <h3>C) Outbound (Meridian → you)</h3>
          <p>Give Meridian ops an HTTPS URL, or enter it in the Autonomous step. Meridian POSTs events with optional signature header.</p>
          <label class="check"><input type="checkbox" data-mark="webhooks" ${state.done.webhooks ? 'checked' : ''}/> Webhook or n8n path tested</label>
        </div>`;
    }

    if (step.id === 'phone') {
      const vt = c.endpoints?.voiceTurn || `${BASE}/api/v1/agents/${id}/voice-turn`;
      return `
        <div class="block-body">
          <p class="lead">Meridian answers with the right business brain. Retell/Vapi/Bland owns the phone number and voice.</p>
          <ol class="steps-ol">
            <li>Create an assistant on Retell or Vapi</li>
            <li>Download config below and paste the system prompt</li>
            <li>Add a tool/server: every user utterance → POST voice-turn → speak field <code>reply</code></li>
            <li>Auth header: <code>Bearer ${escapeHtml(key.startsWith('mdn_') ? key.slice(0, 12) + '…' : 'mdn_…')}</code></li>
            <li>Attach a phone number → place a real test call</li>
          </ol>
          <div class="field"><label>Voice-turn URL</label><div class="mono box" id="vt-url">${escapeHtml(vt)}</div>
          <button type="button" class="btn sm" data-copy-id="vt-url">Copy</button></div>
          <pre class="code" id="code-vt">POST ${escapeHtml(vt)}
Authorization: Bearer ${escapeHtml(key)}
{"message":"{{caller transcript}}","audio":false}</pre>
          <button type="button" class="btn dark" data-copy-id="code-vt">Copy template</button>
          <div class="row">
            ${
              token
                ? `<a class="btn light" href="${BASE}/guide/${token}/retell.json" download>⬇ Retell JSON</a>
                   <a class="btn light" href="${BASE}/guide/${token}/vapi.json" download>⬇ Vapi JSON</a>`
                : ''
            }
          </div>
          <div class="callout good"><b>Latency tip</b><p>Keep <code>audio:false</code> on phone for lowest lag — Retell/Vapi speaks Meridian’s text with a platform voice. Your saved xAI voice (<strong>${escapeHtml(state.selectedVoiceId || c.selectedVoiceId || 'eve')}</strong>) applies when you request Meridian-hosted audio.</p></div>
          <label class="check"><input type="checkbox" data-mark="phone" ${state.done.phone ? 'checked' : ''}/> Test call heard correct hours/services</label>
        </div>`;
    }

    if (step.id === 'autonomous') {
      const job = state.autonomousJob;
      return `
        <div class="block-body">
          <div class="callout good">
            <b>Want almost zero work? Pay for Full Auto Install</b>
            <p>Higher one-time fee → we provision, pack, and priority-queue OpenClaw. You only attach a phone number + paste the widget.</p>
            <p style="margin-top:10px">
              <a class="btn dark" href="/checkout/auto">Full Auto · $1,497</a>
              <a class="btn light" href="/checkout/auto_voice">Voice Auto · $997</a>
              <a class="btn light" href="/#full-auto">Compare tiers</a>
            </p>
          </div>
          <p class="lead"><strong>Or run free OpenClaw packaging now</strong> (included): packages widget, API, n8n, and phone configs, emails you, and notifies ops. Phone number attach in Retell/Vapi still requires your account.</p>
          <div class="field"><label>Your email</label><input id="auto-email" type="email" placeholder="you@business.com" value="${escapeHtml(c.email || '')}"/></div>
          <div class="field"><label>Website URL (optional)</label><input id="auto-site" placeholder="https://yoursite.com"/></div>
          <div class="field"><label>Phone platform</label>
            <select id="auto-phone">
              <option value="retell">Retell</option>
              <option value="vapi">Vapi</option>
              <option value="bland">Bland</option>
              <option value="later">I'll do phone later</option>
            </select>
          </div>
          <div class="field"><label>Your CRM/n8n webhook (optional outbound)</label><input id="auto-hook" placeholder="https://hooks.example.com/meridian"/></div>
          <button type="button" class="btn dark" id="btn-auto">Start autonomous install</button>
          ${
            job && !job.error
              ? `<div class="callout good"><b>Queued · ${escapeHtml(job.id || job.status || 'ok')}</b>
                 <p>OpenClaw is packaging your install. Status: <strong>${escapeHtml(job.status || 'queued')}</strong>.
                 ${job.packSummary?.setupUrl ? ` Wizard: ${escapeHtml(job.packSummary.setupUrl)}` : ''}
                 Check email if you provided one.</p></div>`
              : ''
          }
          ${job && job.error ? `<div class="callout warn"><b>Could not queue</b><p>${escapeHtml(job.error)}</p></div>` : ''}
          <label class="check"><input type="checkbox" data-mark="autonomous" ${state.done.autonomous ? 'checked' : ''}/> I started autonomous install or I’m doing manual only</label>
        </div>`;
    }

    if (step.id === 'test') {
      return `
        <div class="block-body">
          <p class="lead">Prove the agent answers with <em>your</em> business facts before you tell staff or customers.</p>
          <div class="field"><label>Test message</label>
            <input id="test-msg" value="What are your hours?" />
          </div>
          <button type="button" class="btn dark" id="btn-test">Run test</button>
          ${
            state.testReply
              ? `<div class="reply-box"><div class="label">Agent reply</div><p>${escapeHtml(state.testReply)}</p></div>`
              : ''
          }
          <ul class="bullets">
            <li>Hours match intake</li>
            <li>Booking asks a next step</li>
            <li>No invented prices</li>
            <li>Widget / phone tested if you installed them</li>
          </ul>
          <label class="check"><input type="checkbox" data-mark="test" ${state.done.test ? 'checked' : ''}/> Must-work tests passed</label>
        </div>`;
    }

    if (step.id === 'done') {
      return `
        <div class="block-body">
          <p class="lead">Nice work. Your Meridian agent is connected to your systems.</p>
          <ul class="bullets">
            <li>Keep the secret key offline</li>
            <li>Re-test after changing hours or services</li>
            <li>Top up voice packs only if you use hosted TTS audio</li>
            <li>Full reference anytime: <a href="/install" target="_blank">/install</a></li>
          </ul>
          <div class="row">
            <a class="btn dark" href="/dashboard">Open dashboard</a>
            <a class="btn light" href="/status">System status</a>
            ${token ? `<a class="btn light" href="/guide/${token}">Static connect guide</a>` : ''}
            <a class="btn light" href="/install">Full docs</a>
          </div>
        </div>`;
    }

    return `<div class="block-body"><p>Unknown step</p></div>`;
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function bind() {
    document.querySelectorAll('[data-copy-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const node = document.getElementById(btn.getAttribute('data-copy-id'));
        if (node) copyText(node.innerText || node.textContent, btn);
      });
    });
    document.querySelectorAll('[data-mark]').forEach((cb) => {
      cb.addEventListener('change', () => {
        state.done[cb.getAttribute('data-mark')] = cb.checked;
        saveLocal();
        saveProgressRemote();
      });
    });
    document.querySelectorAll('[data-path]').forEach((btn) => {
      btn.addEventListener('click', () => selectPath(btn.getAttribute('data-path')));
    });
    document.getElementById('btn-next')?.addEventListener('click', next);
    document.getElementById('btn-back')?.addEventListener('click', back);
    document.getElementById('btn-test')?.addEventListener('click', runTest);
    document.getElementById('btn-auto')?.addEventListener('click', queueAutonomous);
    document.getElementById('btn-manual-save')?.addEventListener('click', applyManualCreds);
    document.getElementById('btn-save-knowledge')?.addEventListener('click', saveKnowledgeStep);

    // Voice picker
    document.getElementById('btn-reload-voices')?.addEventListener('click', () => {
      state.voicesLoaded = false;
      loadVoices();
      render();
    });
    const filter = document.getElementById('voice-filter');
    if (filter) {
      filter.addEventListener('input', () => {
        state.voiceFilter = filter.value || '';
        // soft re-render without full step reset
        render();
        const f2 = document.getElementById('voice-filter');
        if (f2) {
          f2.focus();
          const len = f2.value.length;
          f2.setSelectionRange(len, len);
        }
      });
    }
    document.querySelectorAll('[data-select-voice]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveVoice(btn.getAttribute('data-select-voice'));
      });
    });
    document.querySelectorAll('[data-preview-voice]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        previewVoiceSample(btn.getAttribute('data-preview-voice'));
      });
    });
    document.querySelectorAll('.voice-card[data-voice-id]').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        state.selectedVoiceId = card.getAttribute('data-voice-id');
        render();
      });
    });
  }

  function render() {
    const root = document.getElementById('wizard');
    if (!root) return;

    if (state.loading) {
      root.innerHTML = `<div class="block"><p class="lead">Loading your setup…</p></div>`;
      return;
    }
    if (state.error) {
      root.innerHTML = `<div class="block"><p class="lead">Could not load setup</p><p>${escapeHtml(state.error)}</p>
        <p><a href="/setup">Start blank setup</a> · <a href="/install">Install docs</a></p></div>`;
      return;
    }

    const vis = visibleSteps();
    const step = vis[state.step] || vis[0];
    const pct = progressPct();
    const isLast = state.step >= vis.length - 1;
    const isFirst = state.step <= 0;

    root.innerHTML = `
      <div class="progress-wrap">
        <div class="progress-bar"><i style="width:${pct}%"></i></div>
        <div class="progress-meta">Step ${state.step + 1} of ${vis.length} · ${pct}%</div>
      </div>
      <div class="step-pills">
        ${vis
          .map(
            (s, i) =>
              `<span class="pill ${i === state.step ? 'on' : ''} ${state.done[s.id] || i < state.step ? 'did' : ''}">${i + 1}</span>`,
          )
          .join('')}
      </div>
      <article class="block appear">
        <div class="block-head">
          <div class="eyebrow">Meridian setup</div>
          <h1>${escapeHtml(step.title)}</h1>
          <p class="sub">${escapeHtml(step.subtitle || '')}</p>
        </div>
        ${renderBlock(step)}
        <div class="nav-row">
          <button type="button" class="btn light" id="btn-back" ${isFirst ? 'disabled' : ''}>Back</button>
          <button type="button" class="btn dark" id="btn-next">${isLast ? 'Finish' : 'Next →'}</button>
        </div>
      </article>
      <p class="foot-hint">Stuck? <a href="/install" target="_blank">Full install guide</a> · OpenClaw packs configs; phone number attach stays with you.</p>
    `;
    bind();
  }

  document.addEventListener('DOMContentLoaded', loadContext);
})();
