/**
 * Meridian AI guide — ChatGPT-style hamburger + slide-out chat.
 * Loaded on public pages. Talks to POST /api/guide-chat.
 */
(function () {
  if (window.__meridianChatLoaded) return;
  window.__meridianChatLoaded = true;

  const css = `
  .mdn-chat-root { font-family: Inter, system-ui, sans-serif; }
  .mdn-hamburger {
    display: inline-flex; align-items: center; justify-content: center;
    width: 40px; height: 40px; border-radius: 10px; border: 1px solid rgba(12,12,11,0.12);
    background: #fff; cursor: pointer; padding: 0; flex-shrink: 0;
  }
  .mdn-hamburger:hover { background: #E8E6E1; }
  .mdn-hamburger span {
    display: block; width: 18px; height: 2px; background: #0C0C0B; border-radius: 1px;
    position: relative;
  }
  .mdn-hamburger span::before, .mdn-hamburger span::after {
    content: ''; position: absolute; left: 0; width: 18px; height: 2px;
    background: #0C0C0B; border-radius: 1px;
  }
  .mdn-hamburger span::before { top: -6px; }
  .mdn-hamburger span::after { top: 6px; }
  .mdn-chat-backdrop {
    position: fixed; inset: 0; background: rgba(12,12,11,0.35); z-index: 90;
    opacity: 0; pointer-events: none; transition: opacity .2s;
  }
  .mdn-chat-backdrop.open { opacity: 1; pointer-events: auto; }
  .mdn-chat-drawer {
    position: fixed; top: 0; left: 0; z-index: 100;
    width: min(440px, 100vw); height: 100%;
    background: #F7F6F3; border-right: 1px solid rgba(12,12,11,0.08);
    box-shadow: 24px 0 60px rgba(12,12,11,0.12);
    display: flex; flex-direction: column;
    transform: translateX(-100%); transition: transform .28s cubic-bezier(.2,.8,.2,1);
  }
  .mdn-chat-drawer.open { transform: translateX(0); }
  .mdn-chat-head {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 18px 18px 14px; border-bottom: 1px solid rgba(12,12,11,0.08);
    background: rgba(247,246,243,0.95); backdrop-filter: blur(12px);
  }
  .mdn-chat-brand { display: flex; align-items: center; gap: 9px; }
  .mdn-chat-brand-mark {
    width: 26px; height: 26px; border-radius: 7px; background: #0C0C0B;
    display: grid; place-items: center; flex-shrink: 0;
  }
  .mdn-chat-brand-mark svg { width: 13px; height: 13px; }
  .mdn-chat-head h2 {
    font-family: 'Instrument Serif', Georgia, serif; font-weight: 400;
    font-size: 1.25rem; letter-spacing: -0.02em; margin: 0;
  }
  .mdn-chat-status {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 0.68rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
    color: #6B6A66; margin-top: 2px;
  }
  .mdn-chat-status i {
    width: 5px; height: 5px; border-radius: 50%; background: #1F7A4C;
    box-shadow: 0 0 0 3px rgba(31,122,76,0.15); flex-shrink: 0;
  }
  .mdn-chat-nav {
    display: flex; flex-wrap: wrap; gap: 6px;
    padding: 12px 18px; border-bottom: 1px solid rgba(12,12,11,0.08);
    background: rgba(247,246,243,0.6);
  }
  .mdn-chat-nav a {
    font-size: 0.78rem; font-weight: 500; text-decoration: none; color: #0C0C0B;
    padding: 6px 11px; border-radius: 999px; border: 1px solid rgba(12,12,11,0.12);
    background: #fff; transition: background .15s;
  }
  .mdn-chat-nav a:hover { background: #E8E6E1; }
  .mdn-chat-foot {
    padding: 12px 18px calc(12px + env(safe-area-inset-bottom));
    border-top: 1px solid rgba(12,12,11,0.08);
    font-size: 0.72rem; color: #9B9A96; text-align: center;
  }
  .mdn-chat-foot a { color: #6B6A66; text-decoration: none; }
  .mdn-chat-foot a:hover { color: #0C0C0B; text-decoration: underline; }
  .mdn-chat-close {
    width: 36px; height: 36px; border-radius: 999px; border: 1px solid rgba(12,12,11,0.12);
    background: #fff; cursor: pointer; font-size: 1.1rem; line-height: 1; color: #0C0C0B;
  }
  .mdn-chat-close:hover { background: #E8E6E1; }
  .mdn-chat-msgs {
    flex: 1; overflow-y: auto; padding: 18px 16px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .mdn-bubble {
    max-width: 92%; padding: 12px 14px; border-radius: 16px;
    font-size: 0.92rem; line-height: 1.5; white-space: pre-wrap;
  }
  .mdn-bubble.ai {
    align-self: flex-start; background: #fff;
    border: 1px solid rgba(12,12,11,0.08);
    border-bottom-left-radius: 4px; color: #0C0C0B;
  }
  .mdn-bubble.user {
    align-self: flex-end; background: #0C0C0B; color: #F5F5F4;
    border-bottom-right-radius: 4px;
  }
  .mdn-bubble .who {
    font-size: 0.65rem; letter-spacing: 0.08em; text-transform: uppercase;
    opacity: 0.55; margin-bottom: 4px; font-weight: 600;
  }
  .mdn-suggest {
    display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 10px;
  }
  .mdn-suggest button {
    font: inherit; font-size: 0.75rem; font-weight: 500; cursor: pointer;
    padding: 7px 11px; border-radius: 999px; border: 1px solid rgba(12,12,11,0.12);
    background: #fff; color: #0C0C0B;
  }
  .mdn-suggest button:hover { background: #E8E6E1; }
  .mdn-chat-input {
    display: flex; gap: 8px; padding: 12px 14px;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
    border-top: 1px solid rgba(12,12,11,0.08); background: #fff;
  }
  .mdn-chat-input input {
    flex: 1; font: inherit; font-size: 0.95rem;
    padding: 12px 14px; border-radius: 999px;
    border: 1px solid rgba(12,12,11,0.14); background: #F7F6F3; outline: none;
  }
  .mdn-chat-input input:focus { outline: 2px solid #0C0C0B; outline-offset: 1px; }
  .mdn-chat-input button.send {
    font: inherit; font-weight: 600; font-size: 0.88rem; cursor: pointer;
    padding: 0 18px; border-radius: 999px; border: none;
    background: #0C0C0B; color: #fff;
  }
  .mdn-chat-input button.send:disabled { opacity: 0.5; cursor: wait; }
  .mdn-fab {
    position: fixed; bottom: 22px; right: 22px; z-index: 80;
    display: none; align-items: center; gap: 8px;
    padding: 12px 16px; border-radius: 999px; border: none;
    background: #0C0C0B; color: #fff; font: inherit; font-weight: 600; font-size: 0.88rem;
    cursor: pointer; box-shadow: 0 12px 40px rgba(0,0,0,0.2);
  }
  @media (max-width: 720px) {
    .mdn-fab { display: inline-flex; }
  }
  /* Fade strip behind the docked bar so scrolled page content never shows
     through its edges — fully transparent at top, solid page bg at bottom. */
  .mdn-openbar-backdrop {
    position: fixed; left: 0; right: 0; bottom: 0; height: 180px;
    z-index: 78; pointer-events: none;
    background: linear-gradient(to top, #F7F6F3 0px, #F7F6F3 140px, rgba(247,246,243,0) 180px);
    transition: opacity .2s;
  }
  .mdn-openbar-backdrop.hidden { opacity: 0; }
  /* Open composer bar — ChatGPT-style, docked bottom center (desktop) */
  .mdn-openbar {
    position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
    z-index: 79; width: min(660px, calc(100vw - 32px));
    display: flex; gap: 10px; align-items: center;
    background: #FFFFFF; border: 1px solid rgba(12,12,11,0.09);
    border-radius: 28px; padding: 15px 15px 15px 22px;
    box-shadow: 0 1px 2px rgba(12,12,11,0.04), 0 2px 6px rgba(12,12,11,0.05), 0 18px 48px rgba(12,12,11,0.11);
    transition: opacity .2s, transform .2s, border-color .18s, box-shadow .18s;
  }
  .mdn-openbar:focus-within {
    border-color: rgba(12,12,11,0.16);
    box-shadow: 0 1px 2px rgba(12,12,11,0.04), 0 2px 6px rgba(12,12,11,0.05), 0 18px 48px rgba(12,12,11,0.13), 0 0 0 4px rgba(12,12,11,0.045);
  }
  .mdn-openbar.hidden { opacity: 0; pointer-events: none; transform: translateX(-50%) translateY(8px); }
  .mdn-openbar .mdn-spark {
    flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%;
    background: #1F7A4C; box-shadow: 0 0 0 3px rgba(31,122,76,0.15);
  }
  .mdn-openbar input {
    flex: 1; border: none; outline: none; background: transparent;
    font: inherit; font-size: 1.05rem; color: #0C0C0B; min-width: 0;
    letter-spacing: -0.005em;
  }
  .mdn-openbar input::placeholder { color: #8B8A86; }
  .mdn-openbar button {
    display: grid; place-items: center; flex-shrink: 0;
    width: 36px; height: 36px; border-radius: 50%; border: none;
    background: #E8E6E1; color: #A6A49E; cursor: pointer;
    transition: background .16s, color .16s, transform .1s;
  }
  .mdn-openbar button:active { transform: scale(0.92); }
  .mdn-openbar.has-text button {
    background: #0C0C0B; color: #fff;
  }
  .mdn-openbar.has-text button:hover { background: #262624; }
  .mdn-openbar button svg { width: 15px; height: 15px; }
  @media (max-width: 720px) { .mdn-openbar { display: none; } }
  /* Action chips returned by the guide agent */
  .mdn-actions { display: flex; flex-wrap: wrap; gap: 6px; align-self: flex-start; max-width: 92%; }
  .mdn-actions button, .mdn-actions a {
    font: inherit; font-size: 0.78rem; font-weight: 600; cursor: pointer;
    padding: 8px 13px; border-radius: 999px; border: 1px solid rgba(12,12,11,0.14);
    background: #fff; color: #0C0C0B; text-decoration: none; display: inline-block;
  }
  .mdn-actions a { background: #0C0C0B; color: #fff; border-color: #0C0C0B; }
  .mdn-actions button:hover { background: #E8E6E1; }
  .mdn-actions a:hover { opacity: 0.85; }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const history = [];
  let guideState = {}; // round-tripped with /api/guide-chat — powers the onboarding concierge

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  // Inject hamburger into nav if present
  const nav = document.querySelector('header.nav, .nav');
  let hamBtn = null;
  if (nav) {
    hamBtn = el('button', 'mdn-hamburger');
    hamBtn.type = 'button';
    hamBtn.setAttribute('aria-label', 'Open AI guide chat');
    hamBtn.innerHTML = '<span></span>';
    const links = nav.querySelector('.nav-links');
    if (links) nav.insertBefore(hamBtn, links);
    else nav.appendChild(hamBtn);
  }

  const fab = el('button', 'mdn-fab');
  fab.type = 'button';
  fab.textContent = 'Ask Meridian AI';
  document.body.appendChild(fab);

  // Open composer bar — always visible (desktop); typing here opens the drawer
  const openBar = el('form', 'mdn-openbar');
  openBar.innerHTML = `
    <span class="mdn-spark" aria-hidden="true"></span>
    <input type="text" placeholder="Ask Meridian AI — or say “start” and I’ll set you up…" maxlength="2000" autocomplete="off" />
    <button type="submit" aria-label="Send">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
    </button>
  `;
  const openBarFade = el('div', 'mdn-openbar-backdrop');
  document.body.appendChild(openBarFade);
  document.body.appendChild(openBar);
  const openInput = openBar.querySelector('input');
  openInput.addEventListener('input', () => {
    openBar.classList.toggle('has-text', openInput.value.trim().length > 0);
  });

  const backdrop = el('div', 'mdn-chat-backdrop');
  const drawer = el('div', 'mdn-chat-drawer');
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-label', 'Meridian AI guide');

  drawer.innerHTML = `
    <div class="mdn-chat-head">
      <div class="mdn-chat-brand">
        <span class="mdn-chat-brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><path d="M4 12h16M12 4v16"/></svg>
        </span>
        <div>
          <h2>Meridian</h2>
          <span class="mdn-chat-status"><i aria-hidden="true"></i>AI Agency · Live</span>
        </div>
      </div>
      <button type="button" class="mdn-chat-close" aria-label="Close">×</button>
    </div>
    <nav class="mdn-chat-nav" aria-label="Meridian">
      <a href="/#agents">Agents</a>
      <a href="/#method">Method</a>
      <a href="/why-agents">Why agents</a>
      <a href="/#proposal">Proposal</a>
      <a href="/ops">Ops</a>
    </nav>
    <div class="mdn-chat-msgs" id="mdn-chat-msgs"></div>
    <div class="mdn-suggest" id="mdn-suggest"></div>
    <form class="mdn-chat-input" id="mdn-chat-form">
      <input type="text" id="mdn-chat-input" placeholder="Ask about Voice, Sales, Booking…" autocomplete="off" maxlength="2000" />
      <button type="submit" class="send">Send</button>
    </form>
    <div class="mdn-chat-foot">
      Meridian Agency · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/health">Status</a>
    </div>`;

  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);

  const msgs = drawer.querySelector('#mdn-chat-msgs');
  const form = drawer.querySelector('#mdn-chat-form');
  const input = drawer.querySelector('#mdn-chat-input');
  const sendBtn = form.querySelector('button.send');
  const suggest = drawer.querySelector('#mdn-suggest');

  function open() {
    drawer.classList.add('open');
    backdrop.classList.add('open');
    openBar.classList.add('hidden');
    openBarFade.classList.add('hidden');
    input.focus();
  }
  function close() {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    openBar.classList.remove('hidden');
    openBarFade.classList.remove('hidden');
  }

  openBar.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = openInput.value.trim();
    open();
    if (t) {
      openInput.value = '';
      openBar.classList.remove('has-text');
      send(t);
    }
  });

  if (hamBtn) hamBtn.addEventListener('click', open);
  fab.addEventListener('click', open);
  backdrop.addEventListener('click', close);
  drawer.querySelector('.mdn-chat-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  function addBubble(role, text) {
    const b = el('div', 'mdn-bubble ' + (role === 'user' ? 'user' : 'ai'));
    const who = el('div', 'who', role === 'user' ? 'You' : 'Meridian AI');
    const body = document.createElement('div');
    body.textContent = text;
    b.appendChild(who);
    b.appendChild(body);
    msgs.appendChild(b);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // Welcome
  addBubble(
    'ai',
    'Hi — I’m Meridian AI. I can guide you through Voice, Sales, and Booking agents, pricing, install, and connecting your phone system. What should we cover?',
  );
  history.push({
    role: 'assistant',
    content:
      'Hi — I’m Meridian AI. I can guide you through Voice, Sales, and Booking agents, pricing, install, and connecting your phone system.',
  });

  const chips = [
    'How does install work?',
    'What does Voice do?',
    'Pricing',
    'Guide me step by step',
  ];
  chips.forEach((label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => {
      input.value = label;
      form.requestSubmit();
    });
    suggest.appendChild(b);
  });

  function renderActions(actions) {
    const prev = msgs.querySelector('.mdn-actions');
    if (prev) prev.remove();
    if (!Array.isArray(actions) || !actions.length) return;
    const wrap = el('div', 'mdn-actions');
    actions.forEach((a) => {
      if (a.href) {
        const link = document.createElement('a');
        link.href = a.href;
        link.textContent = (a.label || 'Open') + ' ↗';
        link.target = a.href.startsWith('/') ? '_self' : '_blank';
        link.rel = 'noopener';
        wrap.appendChild(link);
      } else if (a.send) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = a.label || a.send;
        b.addEventListener('click', () => send(a.send));
        wrap.appendChild(b);
      }
    });
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  async function send(text) {
    const t = String(text || '').trim();
    if (!t) return;
    addBubble('user', t);
    history.push({ role: 'user', content: t });
    input.value = '';
    sendBtn.disabled = true;
    try {
      const res = await fetch('/api/guide-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: t, history: history.slice(-12), state: guideState }),
      });
      const data = await res.json();
      const reply = data.reply || data.error || 'Something went wrong — try again.';
      if (data.state && typeof data.state === 'object') guideState = data.state;
      addBubble('ai', reply);
      history.push({ role: 'assistant', content: reply });
      renderActions(data.actions);
    } catch {
      addBubble('ai', 'Network error. Check your connection and try again.');
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send(input.value);
  });
})();
