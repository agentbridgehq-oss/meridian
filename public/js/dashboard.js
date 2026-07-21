/**
 * Meridian customer agent dashboard
 */
(function () {
  'use strict';

  const BASE = location.origin.replace(/\/$/, '');
  const state = { agentId: '', apiKey: '', data: null };

  function $(id) {
    return document.getElementById(id);
  }

  function msg(text, ok) {
    const el = $('app-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'msg show ' + (ok ? 'ok' : 'err');
  }

  function authHeaders() {
    return {
      Authorization: 'Bearer ' + state.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async function api(path, opts) {
    const res = await fetch(BASE + path, {
      ...opts,
      headers: { ...authHeaders(), ...(opts?.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
    return data;
  }

  function renderStats(stats, health) {
    const s = stats || {};
    const h = health?.last;
    $('stats').innerHTML =
      '<div class="stat"><b>' +
      (s.total ?? 0) +
      '</b><span>Turns (7d)</span></div>' +
      '<div class="stat"><b>' +
      (s.bookings ?? 0) +
      '</b><span>Booking intent</span></div>' +
      '<div class="stat"><b>' +
      (s.transfers ?? 0) +
      '</b><span>Transfer signals</span></div>' +
      '<div class="stat"><b>' +
      (s.emergencies ?? 0) +
      '</b><span>Emergencies</span></div>' +
      '<div class="stat"><b>' +
      (h?.ok === false ? 'Fail' : h?.ok ? 'OK' : '—') +
      '</b><span>Last probe</span></div>' +
      '<div class="stat"><b>' +
      (s.fallbacks ?? 0) +
      '</b><span>Fallback brain</span></div>';
  }

  function renderIx(items) {
    const list = items || [];
    if (!list.length) {
      $('ix-list').innerHTML = '<p class="sub">No activity yet. Send a test chat from setup.</p>';
      return;
    }
    $('ix-list').innerHTML = list
      .map(function (i) {
        return (
          '<div class="ix"><div class="meta">' +
          escapeHtml(i.at || '') +
          ' · ' +
          escapeHtml(i.channel || '') +
          (i.intent?.priority ? ' · ' + escapeHtml(i.intent.priority) : '') +
          (i.brainSource ? ' · ' + escapeHtml(i.brainSource) : '') +
          '</div><div><strong>In:</strong> ' +
          escapeHtml((i.message || '').slice(0, 200)) +
          '</div><div><strong>Out:</strong> ' +
          escapeHtml((i.reply || '').slice(0, 200)) +
          '</div></div>'
        );
      })
      .join('');
  }

  function fillKnowledge(cfg) {
    cfg = cfg || {};
    $('k-hours').value = cfg.hours || '';
    $('k-services').value = cfg.services || '';
    $('k-faqs').value = cfg.faqs || '';
    $('k-kb').value = cfg.knowledgeBase || '';
    $('k-transfer').value = cfg.humanTransfer || '';
    $('k-cal').value = cfg.calendarUrl || '';
    $('k-email').value = cfg.ownerNotifyEmail || '';
    $('k-phone').value = cfg.ownerNotifyPhone || '';
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loadAll() {
    const dash = await api('/api/v1/agents/' + encodeURIComponent(state.agentId) + '/dashboard');
    const agent = await api('/api/v1/agents/' + encodeURIComponent(state.agentId));
    state.data = { dash, agent };
    $('biz-name').textContent = dash.businessName || agent.businessName || 'Agent';
    $('biz-id').textContent = state.agentId;
    renderStats(dash.stats, dash.health);
    renderIx(dash.recent);
    fillKnowledge(agent.config);
    $('login-card').classList.add('hidden');
    $('app').classList.remove('hidden');
    try {
      sessionStorage.setItem(
        'mdn_dash',
        JSON.stringify({ agentId: state.agentId, apiKey: state.apiKey }),
      );
    } catch (_) {}
  }

  async function onLoad() {
    $('login-err').classList.remove('show');
    state.agentId = ($('agentId').value || '').trim();
    state.apiKey = ($('apiKey').value || '').trim();
    if (!state.agentId || !state.apiKey) {
      $('login-err').textContent = 'Enter Agent ID and secret key.';
      $('login-err').classList.add('show');
      return;
    }
    $('btn-load').disabled = true;
    try {
      await loadAll();
      msg('Dashboard loaded', true);
    } catch (e) {
      $('login-err').textContent = e.message || 'Login failed';
      $('login-err').classList.add('show');
    }
    $('btn-load').disabled = false;
  }

  async function saveKnowledge() {
    try {
      await api('/api/v1/agents/' + encodeURIComponent(state.agentId) + '/knowledge', {
        method: 'PUT',
        body: JSON.stringify({
          hours: $('k-hours').value,
          services: $('k-services').value,
          faqs: $('k-faqs').value,
          knowledgeBase: $('k-kb').value,
          humanTransfer: $('k-transfer').value,
          calendarUrl: $('k-cal').value,
          ownerNotifyEmail: $('k-email').value,
          ownerNotifyPhone: $('k-phone').value,
        }),
      });
      msg('Knowledge saved — agent truth layer updated', true);
    } catch (e) {
      msg(e.message, false);
    }
  }

  async function scrape() {
    const url = $('k-url').value.trim();
    if (!url) {
      msg('Enter a website URL first', false);
      return;
    }
    try {
      const data = await api('/api/v1/agents/' + encodeURIComponent(state.agentId) + '/knowledge/scrape', {
        method: 'POST',
        body: JSON.stringify({ url, save: false }),
      });
      if (data.summary) {
        const cur = $('k-kb').value;
        $('k-kb').value = (cur ? cur + '\n\n' : '') + 'Website draft (' + (data.url || url) + '):\n' + data.summary;
        msg('Draft loaded into knowledge base — review and Save', true);
      } else msg('No text extracted', false);
    } catch (e) {
      msg(e.message, false);
    }
  }

  async function probe() {
    try {
      const data = await api('/api/v1/agents/' + encodeURIComponent(state.agentId) + '/health', {
        method: 'POST',
        body: '{}',
      });
      msg(
        data.ok
          ? 'Probe OK · ' + (data.probe?.ms || '?') + 'ms · ' + (data.probe?.brainSource || '')
          : 'Probe failed — check reply path',
        data.ok,
      );
      await loadAll();
    } catch (e) {
      msg(e.message, false);
    }
  }

  async function emailSummary() {
    try {
      const data = await api('/api/v1/agents/' + encodeURIComponent(state.agentId) + '/summary', {
        method: 'POST',
        body: JSON.stringify({ email: $('k-email').value || undefined }),
      });
      if (data.emailed?.ok) msg('Summary emailed to owner', true);
      else if (data.emailed?.skipped) msg('No owner email set — showing summary only. ' + (data.summary || '').slice(0, 120), false);
      else msg(data.emailed?.error || 'Email may have failed — check Resend', false);
    } catch (e) {
      msg(e.message, false);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    try {
      const saved = JSON.parse(sessionStorage.getItem('mdn_dash') || 'null');
      if (saved?.agentId) {
        $('agentId').value = saved.agentId;
        $('apiKey').value = saved.apiKey || '';
      }
    } catch (_) {}
    // URL ?agent=&key= only for setup deep-links (discouraged long-term)
    const q = new URLSearchParams(location.search);
    if (q.get('agent')) $('agentId').value = q.get('agent');
    if (q.get('key')) $('apiKey').value = q.get('key');

    $('btn-load').addEventListener('click', onLoad);
    $('btn-refresh')?.addEventListener('click', function () {
      loadAll().then(function () {
        msg('Refreshed', true);
      }).catch(function (e) {
        msg(e.message, false);
      });
    });
    $('btn-probe')?.addEventListener('click', probe);
    $('btn-summary')?.addEventListener('click', emailSummary);
    $('btn-save-k')?.addEventListener('click', saveKnowledge);
    $('btn-scrape')?.addEventListener('click', scrape);
  });
})();
