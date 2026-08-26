/**
 * Meridian voice studio — homepage (#voice-demo) and /agents/voice (#voice-studio).
 * Play always speaks. Browser neural/OS voices first; server audio replaces if it arrives.
 */
(function () {
  const root =
    document.getElementById('voice-studio') || document.getElementById('voice-demo');
  if (!root) return;

  const statusEl = root.querySelector('[data-vd-status]');
  const listEl = root.querySelector('[data-vd-voices]');
  const textEl = root.querySelector('[data-vd-text]');
  const playBtn = root.querySelector('[data-vd-play]');
  const stopBtn = root.querySelector('[data-vd-stop]');
  const openGuide = root.querySelector('[data-vd-guide]');
  const audio = root.querySelector('[data-vd-audio]');
  let selected = localStorage.getItem('mdn_voice') || 'ara';
  let catalog = [];
  let playing = null;

  const DEFAULT_TEXT =
    "Thanks for calling. You've reached the Meridian demo receptionist. I can answer after hours, book appointments, and follow up with leads — how can I help you today?";

  if (textEl && !textEl.value) textEl.value = DEFAULT_TEXT;

  function setStatus(t) {
    if (statusEl) statusEl.textContent = t;
  }

  function genderOf(id) {
    const v = catalog.find((x) => (x.id || x.voice_id) === id);
    return (v && v.gender) || (/leo|rex|orion|helix|zagan/.test(id) ? 'male' : 'female');
  }

  function pickBrowserVoice(id) {
    if (!window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    const wantMale = genderOf(id) === 'male';
    const scored = voices.map((v) => {
      const n = (v.name + ' ' + v.lang).toLowerCase();
      let s = 0;
      if (/en[-_]?(us|gb|ca|au)|en$/.test(v.lang.toLowerCase())) s += 4;
      if (wantMale && /male|david|daniel|guy|james|george|alex|fred/.test(n)) s += 5;
      if (!wantMale && /female|samantha|siri|zira|karen|moira|aria|jenny|sara|natural/.test(n)) s += 5;
      if (/neural|natural|premium|enhanced|online/.test(n)) s += 3;
      if (/google|microsoft|apple/.test(n)) s += 1;
      return { v, s };
    });
    scored.sort((a, b) => b.s - a.s);
    return scored[0].v;
  }

  function stopAll() {
    try {
      window.speechSynthesis && window.speechSynthesis.cancel();
    } catch {}
    if (audio) {
      try {
        audio.pause();
        audio.removeAttribute('src');
      } catch {}
    }
    if (playing && playing.abort) playing.abort();
    playing = null;
  }

  function speakBrowser(text, id) {
    if (!window.speechSynthesis) return false;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickBrowserVoice(id);
    if (voice) u.voice = voice;
    u.rate = id === 'eve' ? 1.06 : id === 'leo' ? 0.96 : 1;
    u.pitch = genderOf(id) === 'male' ? 0.9 : 1.05;
    window.speechSynthesis.speak(u);
    return true;
  }

  async function loadVoices() {
    setStatus('Loading voices…');
    try {
      const res = await fetch('/api/voice/voices');
      const data = await res.json();
      catalog = data.voices || data.catalog || [];
      if (!listEl) return;
      listEl.innerHTML = '';
      const pick = catalog.length
        ? catalog
        : [
            { id: 'ara', name: 'Ara', tagline: 'Warm', gender: 'female' },
            { id: 'eve', name: 'Eve', tagline: 'Energetic', gender: 'female' },
            { id: 'leo', name: 'Leo', tagline: 'Authoritative', gender: 'male' },
            { id: 'rex', name: 'Rex', tagline: 'Professional', gender: 'male' },
          ];
      if (!pick.some((v) => (v.id || v.voice_id) === selected)) selected = pick[0].id || 'ara';
      pick.slice(0, 10).forEach((v) => {
        const id = v.id || v.voice_id;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vd-voice' + (id === selected ? ' active' : '');
        btn.innerHTML = `<strong>${v.name || id}</strong><span>${v.tagline || v.useCases || 'Voice'}</span>`;
        btn.addEventListener('click', () => {
          selected = id;
          listEl.querySelectorAll('.vd-voice').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          try {
            localStorage.setItem('mdn_voice', id);
          } catch {}
        });
        listEl.appendChild(btn);
      });
      setStatus('Pick a voice and press Play — sample starts immediately');
    } catch {
      setStatus('Catalog offline — Play still works with on-device voice');
    }
    try {
      window.speechSynthesis && window.speechSynthesis.getVoices();
    } catch {}
  }

  async function play() {
    const text = (textEl?.value || DEFAULT_TEXT).trim().slice(0, 220);
    if (!text) return;
    stopAll();
    playBtn && (playBtn.disabled = true);

    const started = speakBrowser(text, selected);
    setStatus(
      started
        ? `Playing ${selected} · on-device voice · fetching studio sample…`
        : 'Generating sample…',
    );

    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    playing = ac;
    try {
      const res = await fetch('/api/voice/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: selected, text }),
        signal: ac ? ac.signal : undefined,
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (data.useBrowser || data.mode === 'browser_handoff') {
        if (!started) speakBrowser(text, selected);
        setStatus(`Playing ${selected} · on-device preview`);
        return;
      }

      if (!res.ok || !data.ok) {
        if (!started) speakBrowser(text, selected);
        setStatus((data.error || 'Studio sample skipped') + ' · on-device voice playing');
        return;
      }

      let src = data.audioUrl || data.url;
      if (!src && data.audioBase64) src = `data:${data.contentType || 'audio/mpeg'};base64,${data.audioBase64}`;
      if (!src && data.audio) src = `data:audio/mpeg;base64,${data.audio}`;
      if (!src || !audio) {
        if (!started) speakBrowser(text, selected);
        setStatus(`Playing ${selected} · on-device preview`);
        return;
      }

      try {
        window.speechSynthesis && window.speechSynthesis.cancel();
      } catch {}
      audio.pause();
      audio.src = src;
      audio.hidden = false;
      await audio.play();
      if (data.mode === 'xai') {
        setStatus(`Playing ${selected} · xAI neural · free sample`);
      } else if (data.mode === 'demo_fallback') {
        setStatus(`Playing ${selected} · studio sample (premium neural on paid installs)`);
      } else {
        setStatus(`Playing ${selected} · studio sample`);
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      if (!started) speakBrowser(text, selected);
      setStatus('Network skip · on-device voice playing');
    } finally {
      playBtn && (playBtn.disabled = false);
    }
  }

  if (playBtn) playBtn.addEventListener('click', play);
  if (stopBtn) stopBtn.addEventListener('click', () => {
    stopAll();
    setStatus('Stopped');
  });
  if (openGuide) {
    openGuide.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.MeridianGuide) window.MeridianGuide.open('voice');
      else location.hash = '#ai-guide';
    });
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.addEventListener('voiceschanged', () => {});
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            root.classList.add('vd-visible');
            io.disconnect();
          }
        });
      },
      { threshold: 0.12 },
    );
    io.observe(root);
  } else {
    root.classList.add('vd-visible');
  }

  loadVoices();
})();
