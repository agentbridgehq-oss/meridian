/**
 * Homepage voice studio — free try-it samples via /api/voice/preview.
 * Public previews always use demo TTS (never xAI — see voice-pipeline.mjs),
 * so status text must never claim "xAI"/"neural" for what's actually playing.
 */
(function () {
  const root = document.getElementById('voice-demo');
  if (!root) return;

  const statusEl = root.querySelector('[data-vd-status]');
  const listEl = root.querySelector('[data-vd-voices]');
  const textEl = root.querySelector('[data-vd-text]');
  const playBtn = root.querySelector('[data-vd-play]');
  const openGuide = root.querySelector('[data-vd-guide]');
  const audio = root.querySelector('[data-vd-audio]');
  let selected = 'eve';

  const DEFAULT_TEXT =
    "Thanks for calling. You've reached the Meridian demo receptionist. I can answer after hours, book appointments, and follow up with leads — how can I help you today?";

  if (textEl && !textEl.value) textEl.value = DEFAULT_TEXT;

  function setStatus(t) {
    if (statusEl) statusEl.textContent = t;
  }

  async function loadVoices() {
    setStatus('Loading voices…');
    try {
      const res = await fetch('/api/voice/voices');
      const data = await res.json();
      const voices = data.voices || data.catalog || [];
      if (!listEl) return;
      listEl.innerHTML = '';
      const pick = voices.length
        ? voices
        : [
            { id: 'eve', name: 'Eve', tagline: 'Energetic' },
            { id: 'ara', name: 'Ara', tagline: 'Warm' },
            { id: 'leo', name: 'Leo', tagline: 'Authoritative' },
            { id: 'rex', name: 'Rex', tagline: 'Professional' },
          ];
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
      const ready = data.hostedReady !== false;
      setStatus(
        ready
          ? data.message || 'Pick a voice and press Play for a free sample'
          : data.message || 'Catalog only — set XAI_API_KEY on Meridian for live audio',
      );
    } catch {
      setStatus('Could not load voice catalog');
    }
  }

  async function play() {
    const text = (textEl?.value || DEFAULT_TEXT).trim().slice(0, 220);
    if (!text) return;
    playBtn.disabled = true;
    setStatus('Generating sample…');
    try {
      const res = await fetch('/api/voice/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: selected, text }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok || !data.ok) {
        // Last-resort browser speech so the control never feels broken
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.rate = 1;
          window.speechSynthesis.speak(u);
          setStatus((data.error || 'Server preview offline') + ' · playing browser voice instead.');
          return;
        }
        setStatus(data.error || 'Preview failed — try again shortly.');
        return;
      }
      let src = data.audioUrl || data.url;
      if (!src && data.audioBase64) src = `data:${data.contentType || 'audio/mpeg'};base64,${data.audioBase64}`;
      if (!src && data.audio) src = `data:audio/mpeg;base64,${data.audio}`;
      if (!src) {
        setStatus('No audio in response');
        return;
      }
      if (audio) {
        audio.pause();
        audio.src = src;
        audio.hidden = false;
        await audio.play();
      }
      if (data.mode === 'xai') {
        setStatus(`Playing ${selected} · xAI neural · free sample (not usage-billed)`);
      } else if (data.mode === 'demo_fallback') {
        setStatus(
          `Playing demo voice · set XAI_API_KEY on Railway for premium ${selected} neural quality`,
        );
      } else {
        setStatus(`Playing ${selected} · free sample`);
      }
    } catch (e) {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
        setStatus('Network issue · browser voice fallback');
      } else {
        setStatus('Network error playing sample');
      }
    } finally {
      playBtn.disabled = false;
    }
  }

  if (playBtn) playBtn.addEventListener('click', play);
  if (openGuide) {
    openGuide.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.MeridianGuide) window.MeridianGuide.open('voice');
      else location.hash = '#ai-guide';
    });
  }

  // Reveal subtly when scrolled into view
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
      { threshold: 0.15 },
    );
    io.observe(root);
  } else {
    root.classList.add('vd-visible');
  }

  loadVoices();
})();
