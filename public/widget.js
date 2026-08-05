/**
 * Meridian Agent Widget — one-line install on any website.
 *
 * <script src="https://YOUR-MERIDIAN/widget.js"
 *   data-agent="agent_xxx" data-token="mdnw_xxx"
 *   data-name="Acme HVAC" data-color="#0C0C0B"></script>
 *
 * Uses the PUBLIC widget token (chat-only, rate-limited). Never put your
 * secret mdn_ API key in a web page.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var agentId = script.getAttribute('data-agent');
  var token = script.getAttribute('data-token');
  if (!agentId || !token) {
    console.warn('[Meridian] widget needs data-agent and data-token');
    return;
  }
  var base = new URL(script.src).origin;
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var brandRaw = script.getAttribute('data-name') || 'Assistant';
  var brand = escapeHtml(brandRaw); // used in innerHTML below — never interpolate the raw value
  var color = script.getAttribute('data-color') || '#0C0C0B';
  var greeting = script.getAttribute('data-greeting') || ('Hi! I’m the ' + brandRaw + ' assistant. Hours, booking, or a question?');

  var css = [
    '.mdn-w *{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif}',
    '.mdn-bubble{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;background:' + color + ';color:#fff;border:none;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.25);z-index:999998;display:grid;place-items:center;transition:transform .15s}',
    '.mdn-bubble:hover{transform:scale(1.06)}',
    '.mdn-panel{position:fixed;bottom:88px;right:20px;width:min(360px,calc(100vw - 32px));height:min(480px,calc(100vh - 120px));background:#fff;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.28);z-index:999999;display:none;flex-direction:column;overflow:hidden}',
    '.mdn-panel.open{display:flex}',
    '.mdn-head{background:' + color + ';color:#fff;padding:14px 16px;font-weight:600;font-size:14px;display:flex;justify-content:space-between;align-items:center}',
    '.mdn-x{background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1}',
    '.mdn-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#F7F6F3}',
    '.mdn-msg{max-width:82%;padding:9px 12px;border-radius:12px;font-size:13.5px;line-height:1.45;white-space:pre-wrap}',
    '.mdn-msg.bot{background:#fff;border:1px solid rgba(0,0,0,.08);align-self:flex-start;border-bottom-left-radius:4px}',
    '.mdn-msg.me{background:' + color + ';color:#fff;align-self:flex-end;border-bottom-right-radius:4px}',
    '.mdn-form{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(0,0,0,.08);background:#fff}',
    '.mdn-in{flex:1;border:1px solid rgba(0,0,0,.15);border-radius:10px;padding:9px 12px;font-size:13.5px;outline:none}',
    '.mdn-in:focus{border-color:' + color + '}',
    '.mdn-send{background:' + color + ';color:#fff;border:none;border-radius:10px;padding:0 14px;font-size:13px;font-weight:600;cursor:pointer}',
    '.mdn-send:disabled{opacity:.5;cursor:default}',
    '.mdn-foot{font-size:10px;color:#9B9A96;text-align:center;padding:4px 0 8px;background:#fff}'
  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var root = document.createElement('div');
  root.className = 'mdn-w';
  root.innerHTML =
    '<button class="mdn-bubble" aria-label="Open chat">' +
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
    '</button>' +
    '<div class="mdn-panel" role="dialog" aria-label="' + brand + ' chat">' +
    '<div class="mdn-head"><span>' + brand + '</span><button class="mdn-x" aria-label="Close">×</button></div>' +
    '<div class="mdn-log"></div>' +
    '<form class="mdn-form"><input class="mdn-in" placeholder="Type a message…" maxlength="500"><button class="mdn-send" type="submit">Send</button></form>' +
    '<div class="mdn-foot">Powered by Meridian</div>' +
    '</div>';
  document.body.appendChild(root);

  var panel = root.querySelector('.mdn-panel');
  var log = root.querySelector('.mdn-log');
  var input = root.querySelector('.mdn-in');
  var send = root.querySelector('.mdn-send');
  var greeted = false;

  function add(text, who) {
    var m = document.createElement('div');
    m.className = 'mdn-msg ' + who;
    m.textContent = text;
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    return m;
  }

  root.querySelector('.mdn-bubble').addEventListener('click', function () {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      if (!greeted) { add(greeting, 'bot'); greeted = true; }
      input.focus();
    }
  });
  root.querySelector('.mdn-x').addEventListener('click', function () {
    panel.classList.remove('open');
  });

  root.querySelector('.mdn-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || send.disabled) return;
    add(text, 'me');
    input.value = '';
    send.disabled = true;
    var thinking = add('…', 'bot');
    fetch(base + '/api/v1/agents/' + encodeURIComponent(agentId) + '/widget-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgetToken: token, message: text })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        thinking.textContent = d.reply || d.error || 'Sorry — please call us directly.';
      })
      .catch(function () {
        thinking.textContent = 'Connection issue — please try again or call us.';
      })
      .then(function () {
        send.disabled = false;
        input.focus();
      });
  });
})();
