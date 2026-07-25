/**
 * Meridian AI Guide â€” ChatGPT-style side panel + open bar + assist popup.
 * Features: chat, web research, agent deploy shortcuts, xAI voice speak, deep-link to voice demo.
 * Loaded on public pages. Talks to POST /api/guide-chat.
 */
(function () {
  if (window.__meridianChatLoaded) return;
  window.__meridianChatLoaded = true;

  const css = `
  .mdn-chat-root { font-family: Inter, system-ui, sans-serif; }
  .mdn-hamburger {
    display: inline-flex; align-items: center; justify-content: center;
    width: 40px; height: 40px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12);
    background: #141413; cursor: pointer; padding: 0; flex-shrink: 0;
  }
  .mdn-hamburger:hover { background: #1C1C1A; }
  .mdn-hamburger span {
    display: block; width: 18px; height: 2px; background: #0A0A09; border-radius: 1px;
    position: relative;
  }
  .mdn-hamburger span::before, .mdn-hamburger span::after {
    content: ''; position: absolute; left: 0; width: 18px; height: 2px;
    background: #0A0A09; border-radius: 1px;
  }
  .mdn-hamburger span::before { top: -6px; }
  .mdn-hamburger span::after { top: 6px; }
  .mdn-nav-guide {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 0.875rem; font-weight: 600; text-decoration: none;
    color: #F5F5F4; padding: 8px 12px; border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.12); background: #141413; cursor: pointer;
    font-family: inherit;
  }
  .mdn-nav-guide:hover { background: #1C1C1A; }
  .mdn-nav-guide i {
    width: 6px; height: 6px; border-radius: 50%; background: #1F7A4C;
    box-shadow: 0 0 0 3px rgba(31,122,76,0.15);
  }
  .mdn-chat-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 90;
    opacity: 0; pointer-events: none; transition: opacity .2s;
  }
  .mdn-chat-backdrop.open { opacity: 1; pointer-events: auto; }
  .mdn-chat-drawer {
    position: fixed; top: 0; right: 0; z-index: 100;
    width: min(460px, 100vw); height: 100%;
    background: #0A0A09; border-left: 1px solid rgba(255,255,255,0.08);
    box-shadow: -24px 0 60px rgba(255,255,255,0.12);
    display: flex; flex-direction: column;
    transform: translateX(100%); transition: transform .28s cubic-bezier(.2,.8,.2,1);
  }
  .mdn-chat-drawer.open { transform: translateX(0); }
  .mdn-chat-head {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 16px 16px 12px; border-bottom: 1px solid rgba(255,255,255,0.08);
    background: rgba(247,246,243,0.95); backdrop-filter: blur(12px);
  }
  .mdn-chat-brand { display: flex; align-items: center; gap: 9px; }
  .mdn-chat-brand-mark {
    width: 28px; height: 28px; border-radius: 8px; background: #0A0A09;
    display: grid; place-items: center; flex-shrink: 0;
  }
  .mdn-chat-brand-mark svg { width: 13px; height: 13px; }
  .mdn-chat-head h2 {
    font-family: 'Instrument Serif', Georgia, serif; font-weight: 400;
    font-size: 1.2rem; letter-spacing: -0.02em; margin: 0;
  }
  .mdn-chat-status {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 0.65rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
    color: #A1A1AA; margin-top: 2px;
  }
  .mdn-chat-status i {
    width: 5px; height: 5px; border-radius: 50%; background: #1F7A4C;
    box-shadow: 0 0 0 3px rgba(31,122,76,0.15); flex-shrink: 0;
  }
  .mdn-feat-tabs {
    display: flex; gap: 4px; padding: 10px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.08); background: #141413;
    overflow-x: auto;
  }
  .mdn-feat-tabs button {
    font: inherit; font-size: 0.72rem; font-weight: 600; cursor: pointer;
    padding: 7px 11px; border-radius: 999px; border: 1px solid transparent;
    background: transparent; color: #A1A1AA; white-space: nowrap;
  }
  .mdn-feat-tabs button.active {
    background: #0A0A09; color: #fff; border-color: #F5F5F4;
  }
  .mdn-feat-tabs button:hover:not(.active) { background: #1C1C1A; color: #F5F5F4; }
  .mdn-panel { display: none; flex: 1; flex-direction: column; min-height: 0; }
  .mdn-panel.active { display: flex; }
  .mdn-feat-body {
    flex: 1; overflow-y: auto; padding: 16px;
    font-size: 0.9rem; line-height: 1.5; color: #A1A1AA;
  }
  .mdn-feat-body h3 {
    font-family: 'Instrument Serif', Georgia, serif; font-weight: 400;
    font-size: 1.25rem; color: #F5F5F4; margin: 0 0 8px;
  }
  .mdn-feat-body p { margin: 0 0 12px; }
  .mdn-feat-card {
    background: #141413; border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px; padding: 14px; margin-bottom: 10px;
  }
  .mdn-feat-card strong { display: block; color: #F5F5F4; margin-bottom: 4px; }
  .mdn-feat-card button, .mdn-feat-card a.btnish {
    display: inline-flex; margin-top: 10px; font: inherit; font-weight: 600; font-size: 0.82rem;
    padding: 9px 14px; border-radius: 999px; border: none; cursor: pointer;
    background: #0A0A09; color: #fff; text-decoration: none;
  }
  .mdn-feat-card a.btnish.light, .mdn-feat-card button.light {
    background: #141413; color: #F5F5F4; border: 1px solid rgba(255,255,255,0.14);
  }
  .mdn-chat-close {
    width: 36px; height: 36px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12);
    background: #141413; cursor: pointer; font-size: 1.1rem; line-height: 1; color: #F5F5F4;
  }
  .mdn-chat-close:hover { background: #1C1C1A; }
  .mdn-chat-msgs {
    flex: 1; overflow-y: auto; padding: 16px 14px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .mdn-bubble {
    max-width: 92%; padding: 12px 14px; border-radius: 16px;
    font-size: 0.92rem; line-height: 1.5; white-space: pre-wrap;
  }
  .mdn-bubble.ai {
    align-self: flex-start; background: #141413;
    border: 1px solid rgba(255,255,255,0.08);
    border-bottom-left-radius: 4px; color: #F5F5F4;
  }
  .mdn-bubble.user {
    align-self: flex-end; background: #F5F5F4; color: #0A0A09;
    border-bottom-right-radius: 4px;
  }
  .mdn-bubble .who {
    font-size: 0.65rem; letter-spacing: 0.08em; text-transform: uppercase;
    opacity: 0.55; margin-bottom: 4px; font-weight: 600;
  }
  .mdn-bubble .mdn-meta {
    margin-top: 8px; font-size: 0.68rem; color: #71717A;
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  }
  .mdn-bubble .mdn-speak {
    font: inherit; font-size: 0.68rem; font-weight: 600; cursor: pointer;
    padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12);
    background: #0A0A09; color: #F5F5F4;
  }
  .mdn-bubble .mdn-speak:hover { background: #1C1C1A; }
  .mdn-suggest {
    display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 10px;
  }
  .mdn-suggest button {
    font: inherit; font-size: 0.75rem; font-weight: 500; cursor: pointer;
    padding: 7px 11px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12);
    background: #141413; color: #F5F5F4;
  }
  .mdn-suggest button:hover { background: #1C1C1A; }
  .mdn-chat-input {
    display: flex; gap: 8px; padding: 12px 14px;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
    border-top: 1px solid rgba(255,255,255,0.08); background: #141413;
    align-items: center;
  }
  .mdn-chat-input .mdn-tools {
    display: flex; gap: 4px;
  }
  .mdn-chat-input .mdn-tools button {
    width: 34px; height: 34px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12);
    background: #0A0A09; cursor: pointer; font-size: 0.85rem;
  }
  .mdn-chat-input .mdn-tools button.on { background: #0A0A09; color: #fff; border-color: #F5F5F4; }
  .mdn-chat-input input {
    flex: 1; font: inherit; font-size: 0.95rem;
    padding: 12px 14px; border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.14); background: #0A0A09; outline: none; min-width: 0;
  }
  .mdn-chat-input input:focus { outline: 2px solid #0C0C0B; outline-offset: 1px; }
  .mdn-chat-input button.send {
    font: inherit; font-weight: 600; font-size: 0.88rem; cursor: pointer;
    padding: 0 16px; height: 42px; border-radius: 999px; border: none;
    background: #0A0A09; color: #fff;
  }
  .mdn-chat-input button.send:disabled { opacity: 0.5; cursor: wait; }
  .mdn-chat-foot {
    padding: 8px 16px calc(10px + env(safe-area-inset-bottom));
    border-top: 1px solid rgba(255,255,255,0.06);
    font-size: 0.7rem; color: #71717A; text-align: center;
  }
  .mdn-chat-foot a { color: #A1A1AA; text-decoration: none; }
  .mdn-fab {
    position: fixed; bottom: 22px; right: 22px; z-index: 80;
    display: none; align-items: center; gap: 8px;
    padding: 12px 16px; border-radius: 999px; border: none;
    background: #0A0A09; color: #fff; font: inherit; font-weight: 600; font-size: 0.88rem;
    cursor: pointer; box-shadow: 0 12px 40px rgba(0,0,0,0.2);
  }
  @media (max-width: 720px) {
    .mdn-fab { display: inline-flex; }
  }
  .mdn-openbar-backdrop {
    position: fixed; left: 0; right: 0; bottom: 0; height: 180px;
    z-index: 78; pointer-events: none;
    background: linear-gradient(to top, #0A0A09 0px, #0A0A09 140px, rgba(10,10,9,0) 180px);
    transition: opacity .2s;
  }
  .mdn-openbar-backdrop.hidden { opacity: 0; }
  .mdn-openbar {
    position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
    z-index: 79; width: min(660px, calc(100vw - 32px));
    display: flex; gap: 10px; align-items: center;
    background: #141413; border: 1px solid rgba(255,255,255,0.09);
    border-radius: 28px; padding: 15px 15px 15px 22px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.35), 0 18px 48px rgba(0,0,0,0.45);
    transition: opacity .2s, transform .2s, border-color .18s, box-shadow .18s;
  }
  .mdn-openbar:focus-within {
    border-color: rgba(255,255,255,0.16);
    box-shadow: 0 1px 2px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.35), 0 18px 48px rgba(0,0,0,0.5), 0 0 0 4px rgba(255,255,255,0.04);
  }
  .mdn-openbar.hidden { opacity: 0; pointer-events: none; transform: translateX(-50%) translateY(8px); }
  .mdn-openbar .mdn-spark {
    flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%;
    background: #1F7A4C; box-shadow: 0 0 0 3px rgba(31,122,76,0.15);
  }
  .mdn-openbar input {
    flex: 1; border: none; outline: none; background: transparent;
    font: inherit; font-size: 1.05rem; color: #F5F5F4; min-width: 0;
  }
  .mdn-openbar input::placeholder { color: #71717A; }
  .mdn-openbar button {
    display: grid; place-items: center; flex-shrink: 0;
    width: 36px; height: 36px; border-radius: 50%; border: none;
    background: #1C1C1A; color: #71717A; cursor: pointer;
  }
  .mdn-openbar.has-text button { background: #0A0A09; color: #fff; }
  .mdn-openbar button svg { width: 15px; height: 15px; }
  @media (max-width: 720px) { .mdn-openbar { display: none; } }
  .mdn-actions { display: flex; flex-wrap: wrap; gap: 6px; align-self: flex-start; max-width: 92%; }
  .mdn-actions button, .mdn-actions a {
    font: inherit; font-size: 0.78rem; font-weight: 600; cursor: pointer;
    padding: 8px 13px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.14);
    background: #141413; color: #F5F5F4; text-decoration: none; display: inline-block;
  }
  .mdn-actions a { background: #0A0A09; color: #fff; border-color: #F5F5F4; }
  /* Proactive assist popup */
  .mdn-assist {
    position: fixed; bottom: 100px; right: 22px; z-index: 85;
    width: min(320px, calc(100vw - 32px));
    background: #141413; border: 1px solid rgba(255,255,255,0.1);
    border-radius: 18px; padding: 16px 16px 14px;
    box-shadow: 0 20px 50px rgba(255,255,255,0.14);
    transform: translateY(12px); opacity: 0; pointer-events: none;
    transition: opacity .25s, transform .25s;
  }
  .mdn-assist.show { opacity: 1; pointer-events: auto; transform: translateY(0); }
  .mdn-assist h4 {
    font-family: 'Instrument Serif', Georgia, serif; font-weight: 400;
    font-size: 1.15rem; margin: 0 0 6px; color: #F5F5F4;
  }
  .mdn-assist p { margin: 0 0 12px; font-size: 0.88rem; color: #A1A1AA; line-height: 1.45; }
  .mdn-assist-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .mdn-assist-row button {
    font: inherit; font-weight: 600; font-size: 0.82rem; cursor: pointer;
    padding: 9px 14px; border-radius: 999px; border: none;
  }
  .mdn-assist-row .yes { background: #0A0A09; color: #fff; }
  .mdn-assist-row .no { background: #0A0A09; color: #F5F5F4; border: 1px solid rgba(255,255,255,0.12); }
  .mdn-assist .x {
    position: absolute; top: 10px; right: 12px; border: none; background: none;
    cursor: pointer; font-size: 1.1rem; color: #71717A;
  }
  body.mdn-guide-pad { padding-bottom: 100px; }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  document.body.classList.add('mdn-guide-pad');

  const history = [];
  let guideState = {};
  let researchMode = false;
  let preferredVoice = localStorage.getItem('mdn_voice') || 'eve';
  let audioEl = null;

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  // Nav: hamburger + AI Guide + Try voice
  const nav = document.querySelector('header.nav, .nav');
  let hamBtn = null;
  if (nav) {
    hamBtn = el('button', 'mdn-hamburger');
    hamBtn.type = 'button';
    hamBtn.setAttribute('aria-label', 'Open AI guide');
    hamBtn.innerHTML = '<span></span>';
    const links = nav.querySelector('.nav-links');
    if (links) {
      const guideBtn = el('button', 'mdn-nav-guide');
      guideBtn.type = 'button';
      guideBtn.innerHTML = '<i aria-hidden="true"></i> AI Guide';
      guideBtn.addEventListener('click', () => open('chat'));
      const voiceLink = document.createElement('a');
      voiceLink.className = 'ghost';
      voiceLink.href = '/#voice-demo';
      voiceLink.textContent = 'Try voice';
      // insert before Get Meridian if present
      const stack = links.querySelector('a.btn-dark, a[href="#stack"]');
      links.insertBefore(voiceLink, stack || null);
      links.insertBefore(guideBtn, stack || null);
      nav.insertBefore(hamBtn, links);
    } else {
      nav.appendChild(hamBtn);
    }
  }

  const fab = el('button', 'mdn-fab');
  fab.type = 'button';
  fab.textContent = 'Ask Meridian AI';
  document.body.appendChild(fab);

  const openBar = el('form', 'mdn-openbar');
  openBar.innerHTML = `
    <span class="mdn-spark" aria-hidden="true"></span>
    <input type="text" placeholder="Ask Meridian AI â€” research, deploy, or say startâ€¦" maxlength="2000" autocomplete="off" />
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
          <h2>Meridian AI</h2>
          <span class="mdn-chat-status"><i aria-hidden="true"></i>Guide Â· Web Â· Deploy Â· xAI voice</span>
        </div>
      </div>
      <button type="button" class="mdn-chat-close" aria-label="Close">Ã—</button>
    </div>
    <div class="mdn-feat-tabs" role="tablist">
      <button type="button" data-tab="chat" class="active">Chat</button>
      <button type="button" data-tab="deploy">Deploy</button>
      <button type="button" data-tab="voice">Voice</button>
      <button type="button" data-tab="research">Research</button>
    </div>
    <div class="mdn-panel active" data-panel="chat">
      <div class="mdn-chat-msgs" id="mdn-chat-msgs"></div>
      <div class="mdn-suggest" id="mdn-suggest"></div>
      <form class="mdn-chat-input" id="mdn-chat-form">
        <div class="mdn-tools">
          <button type="button" id="mdn-research-toggle" title="Force web research" aria-label="Web research">ðŸ”Ž</button>
        </div>
        <input type="text" id="mdn-chat-input" placeholder="Ask anything â€” pricing, install, industry tipsâ€¦" autocomplete="off" maxlength="2000" />
        <button type="submit" class="send">Send</button>
      </form>
    </div>
    <div class="mdn-panel" data-panel="deploy">
      <div class="mdn-feat-body">
        <h3>Deploy an agent</h3>
        <p>Same path as a guided install call â€” pick a kit, pay, get a connect guide. Or start setup in chat.</p>
        <div class="mdn-feat-card">
          <strong>Voice Agent</strong>
          24/7 phone answering for local business. Brain on Meridian Â· speak via Retell/Vapi Â· optional xAI premium TTS.
          <div>
            <button type="button" data-deploy-chat="I want the Voice Agent â€” start my setup">Start in chat</button>
            <a class="btnish light" href="/checkout/voice">Checkout $497</a>
          </div>
        </div>
        <div class="mdn-feat-card">
          <strong>Sales Agent</strong>
          Instant lead follow-up so hot leads donâ€™t go cold.
          <div>
            <button type="button" data-deploy-chat="I want the Sales Agent â€” start setup">Start in chat</button>
            <a class="btnish light" href="/checkout/sales">Checkout $497</a>
          </div>
        </div>
        <div class="mdn-feat-card">
          <strong>Booking Agent</strong>
          Calendar filling + no-show recovery.
          <div>
            <button type="button" data-deploy-chat="I want the Booking Agent â€” start setup">Start in chat</button>
            <a class="btnish light" href="/checkout/booking">Checkout $497</a>
          </div>
        </div>
        <div class="mdn-feat-card">
          <strong>Full stack</strong>
          Voice + Sales + Booking together.
          <div>
            <button type="button" data-deploy-chat="I want the full stack â€” start setup">Start in chat</button>
            <a class="btnish light" href="/checkout/stack">Checkout $997</a>
          </div>
        </div>
        <div class="mdn-feat-card">
          <strong>Setup wizard</strong>
          Step-by-step install after purchase.
          <div><a class="btnish" href="/setup">Open setup wizard</a></div>
        </div>
      </div>
    </div>
    <div class="mdn-panel" data-panel="voice">
      <div class="mdn-feat-body">
        <h3>xAI voice quality</h3>
        <p>Hear Meridianâ€™s premium neural voices (hosted xAI TTS). Free short samples â€” not billed as usage packs.</p>
        <div class="mdn-feat-card">
          <strong>Live demo on homepage</strong>
          Scroll to the voice studio â€” pick a voice and play a receptionist sample.
          <div><a class="btnish" href="/#voice-demo">Open voice demo â†“</a></div>
        </div>
        <div class="mdn-feat-card">
          <strong>Speak chat replies</strong>
          On any AI answer, tap <em>Hear</em> to play it in your preferred voice (${preferredVoice}).
          <div>
            <label style="font-size:0.8rem;color:#6B6A66">Preferred voice
              <select id="mdn-voice-select" style="display:block;margin-top:6px;width:100%;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,0.14)">
                <option value="eve">Eve â€” energetic</option>
                <option value="ara">Ara â€” warm</option>
                <option value="leo">Leo â€” authoritative</option>
                <option value="rex">Rex â€” professional</option>
                <option value="luna">Luna â€” gentle</option>
                <option value="carina">Carina â€” soft</option>
                <option value="orion">Orion â€” cinematic</option>
              </select>
            </label>
          </div>
        </div>
        <div class="mdn-feat-card">
          <strong>Phone agents</strong>
          Production phone still uses Retell/Vapi for calls. xAI is for premium hosted speech & demos.
        </div>
      </div>
    </div>
    <div class="mdn-panel" data-panel="research">
      <div class="mdn-feat-body">
        <h3>Web research</h3>
        <p>Ask industry, competitor, or â€œhow do Iâ€¦â€ questions. The guide can search the public web and answer with notes (no fake stats).</p>
        <div class="mdn-feat-card">
          <strong>Try a research question</strong>
          <button type="button" data-research="What should an HVAC company say on a missed after-hours call?">HVAC after-hours script</button>
          <button type="button" class="light" data-research="Best practices for dental office appointment reminder SMS CASL Canada">Dental SMS CASL tips</button>
        </div>
        <p style="font-size:0.8rem;color:#9B9A96">Toggle ðŸ”Ž in chat to force research mode on every message.</p>
      </div>
    </div>
    <div class="mdn-chat-foot">
      Meridian Agency Â· <a href="/privacy">Privacy</a> Â· <a href="/terms">Terms</a> Â· No fake social proof
    </div>`;

  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);

  // Assist popup
  const assist = el('div', 'mdn-assist');
  assist.innerHTML = `
    <button type="button" class="x" aria-label="Dismiss">Ã—</button>
    <h4>Need a hand?</h4>
    <p>Iâ€™m Meridian AI â€” I can explain agents, research your niche, demo xAI voice, or start a deploy.</p>
    <div class="mdn-assist-row">
      <button type="button" class="yes">Yes, help me</button>
      <button type="button" class="no">Not now</button>
    </div>`;
  document.body.appendChild(assist);

  const msgs = drawer.querySelector('#mdn-chat-msgs');
  const form = drawer.querySelector('#mdn-chat-form');
  const input = drawer.querySelector('#mdn-chat-input');
  const sendBtn = form.querySelector('button.send');
  const suggest = drawer.querySelector('#mdn-suggest');
  const researchToggle = drawer.querySelector('#mdn-research-toggle');
  const voiceSelect = drawer.querySelector('#mdn-voice-select');
  if (voiceSelect) {
    voiceSelect.value = preferredVoice;
    voiceSelect.addEventListener('change', () => {
      preferredVoice = voiceSelect.value;
      localStorage.setItem('mdn_voice', preferredVoice);
    });
  }

  function setTab(name) {
    drawer.querySelectorAll('.mdn-feat-tabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    drawer.querySelectorAll('.mdn-panel').forEach((p) => {
      p.classList.toggle('active', p.dataset.panel === name);
    });
  }

  drawer.querySelectorAll('.mdn-feat-tabs button').forEach((b) => {
    b.addEventListener('click', () => setTab(b.dataset.tab));
  });

  drawer.querySelectorAll('[data-deploy-chat]').forEach((b) => {
    b.addEventListener('click', () => {
      setTab('chat');
      send(b.getAttribute('data-deploy-chat'));
    });
  });
  drawer.querySelectorAll('[data-research]').forEach((b) => {
    b.addEventListener('click', () => {
      researchMode = true;
      researchToggle.classList.add('on');
      setTab('chat');
      send(b.getAttribute('data-research'));
    });
  });

  researchToggle.addEventListener('click', () => {
    researchMode = !researchMode;
    researchToggle.classList.toggle('on', researchMode);
  });

  function open(tab) {
    drawer.classList.add('open');
    backdrop.classList.add('open');
    openBar.classList.add('hidden');
    openBarFade.classList.add('hidden');
    assist.classList.remove('show');
    if (tab) setTab(tab);
    if (tab === 'chat' || !tab) input.focus();
  }
  function close() {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    openBar.classList.remove('hidden');
    openBarFade.classList.remove('hidden');
  }

  window.MeridianGuide = { open, close, send: (t) => { open('chat'); send(t); } };

  openBar.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = openInput.value.trim();
    open('chat');
    if (t) {
      openInput.value = '';
      openBar.classList.remove('has-text');
      send(t);
    }
  });

  if (hamBtn) hamBtn.addEventListener('click', () => open('chat'));
  fab.addEventListener('click', () => open('chat'));
  backdrop.addEventListener('click', close);
  drawer.querySelector('.mdn-chat-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  assist.querySelector('.yes').addEventListener('click', () => {
    localStorage.setItem('mdn_assist_seen', '1');
    open('chat');
  });
  assist.querySelector('.no').addEventListener('click', () => {
    localStorage.setItem('mdn_assist_seen', '1');
    assist.classList.remove('show');
  });
  assist.querySelector('.x').addEventListener('click', () => {
    localStorage.setItem('mdn_assist_seen', '1');
    assist.classList.remove('show');
  });

  // Show assist after scroll ~40% or 12s once per session/day
  if (!localStorage.getItem('mdn_assist_seen')) {
    let shown = false;
    const maybeShow = () => {
      if (shown) return;
      shown = true;
      assist.classList.add('show');
    };
    const onScroll = () => {
      const doc = document.documentElement;
      const scrolled = (window.scrollY + window.innerHeight) / Math.max(doc.scrollHeight, 1);
      if (scrolled > 0.35 || window.scrollY > 420) {
        maybeShow();
        window.removeEventListener('scroll', onScroll);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    setTimeout(maybeShow, 14000);
  }

  function addBubble(role, text, meta) {
    const b = el('div', 'mdn-bubble ' + (role === 'user' ? 'user' : 'ai'));
    const who = el('div', 'who', role === 'user' ? 'You' : 'Meridian AI');
    const body = document.createElement('div');
    body.textContent = text;
    b.appendChild(who);
    b.appendChild(body);
    if (role !== 'user') {
      const metaRow = el('div', 'mdn-meta');
      if (meta?.brain) {
        const tag = document.createElement('span');
        tag.textContent =
          meta.brain.provider === 'xai'
            ? 'xAI'
            : meta.brain.provider === 'anthropic'
              ? 'Claude'
              : 'Guide';
        metaRow.appendChild(tag);
      }
      if (meta?.webSearch?.ok) {
        const tag = document.createElement('span');
        tag.textContent = `Web Â· ${meta.webSearch.provider || 'search'}`;
        metaRow.appendChild(tag);
      }
      const hear = document.createElement('button');
      hear.type = 'button';
      hear.className = 'mdn-speak';
      hear.textContent = 'Hear (xAI)';
      hear.addEventListener('click', () => speakText(text));
      metaRow.appendChild(hear);
      b.appendChild(metaRow);
    }
    msgs.appendChild(b);
    msgs.scrollTop = msgs.scrollHeight;
  }

  async function speakText(text) {
    const slice = String(text).slice(0, 200);
    try {
      const res = await fetch('/api/voice/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceId: preferredVoice,
          text: slice,
        }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok || !data.ok) {
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(new SpeechSynthesisUtterance(slice));
          return;
        }
        addBubble('ai', data.error || 'Voice preview unavailable.');
        return;
      }
      let src = data.audioUrl || data.url;
      if (!src && data.audioBase64) {
        src = `data:${data.contentType || 'audio/mpeg'};base64,${data.audioBase64}`;
      }
      if (!src && data.audio) {
        src = `data:audio/mpeg;base64,${data.audio}`;
      }
      if (!src) {
        if (window.speechSynthesis) {
          window.speechSynthesis.speak(new SpeechSynthesisUtterance(slice));
          return;
        }
        addBubble('ai', 'Preview returned no audio payload.');
        return;
      }
      if (audioEl) audioEl.pause();
      audioEl = new Audio(src);
      await audioEl.play();
    } catch (e) {
      if (window.speechSynthesis) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(slice));
      } else {
        addBubble('ai', 'Could not play voice preview.');
      }
    }
  }

  addBubble(
    'ai',
    'Hi â€” Iâ€™m Meridian AI. I can guide Voice, Sales & Booking, search the web for niche answers, start an agent deploy, or play xAI voice samples. What do you need?',
  );
  history.push({
    role: 'assistant',
    content:
      'Hi â€” Iâ€™m Meridian AI. I can guide agents, research, deploy, and xAI voice.',
  });

  ['Start my setup', 'What does Voice do?', 'Pricing', 'Research HVAC scripts'].forEach((label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => {
      if (label.startsWith('Research')) researchMode = true;
      researchToggle.classList.toggle('on', researchMode);
      send(label === 'Research HVAC scripts' ? 'What should an HVAC company say on a missed after-hours call?' : label);
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
        link.textContent = (a.label || 'Open') + ' â†—';
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
        body: JSON.stringify({
          message: t,
          history: history.slice(-12),
          state: guideState,
          webSearch: researchMode,
          mode: researchMode ? 'research' : undefined,
        }),
      });
      const data = await res.json();
      const reply = data.reply || data.error || 'Something went wrong â€” try again.';
      if (data.state && typeof data.state === 'object') guideState = data.state;
      addBubble('ai', reply, { brain: data.brain, webSearch: data.webSearch });
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

  // Deep links
  if (location.hash === '#ai-guide' || location.search.includes('guide=1')) {
    setTimeout(() => open('chat'), 300);
  }
  if (location.hash === '#deploy') {
    setTimeout(() => open('deploy'), 300);
  }
})();
