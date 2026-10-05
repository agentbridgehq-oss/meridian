/* Premium samples first. Device speech is an explicit fallback, never substituted silently. */
(() => {
  const root = document.getElementById('voice-studio') || document.getElementById('voice-demo');
  if (!root) return;
  const q = selector => root.querySelector(selector);
  const status = q('[data-vd-status]'), list = q('[data-vd-voices]'), text = q('[data-vd-text]');
  const play = q('[data-vd-play]'), stop = q('[data-vd-stop]'), device = q('[data-vd-device]');
  const audio = q('[data-vd-audio]');
  const roles = {
    receptionist: { voice: 'ara', path: 'voice', text: "Thanks for calling Meridian's demo front desk. I'm your AI receptionist. I can help with a question or get the right person involved. What can I help you with?" },
    booking: { voice: 'eve', path: 'booking', text: "Hi, I'm Meridian's AI scheduling assistant. In a connected service, I check the calendar before offering a time. For this demo, what kind of appointment are you looking for?" },
    service: { voice: 'leo', path: 'service', text: "You've reached Meridian's AI service desk demo. Tell me what's happening, and I'll explain how I'd log the issue and route it to the team. Is this about an existing job?" },
    sales: { voice: 'rex', path: 'sales', text: "Hi, I'm Meridian's AI sales assistant. This is a demo of how I qualify new enquiries and help with the next step. What are you hoping to improve in your business?" },
  };
  let role = root.dataset.vdRole || 'receptionist', selected = roles[role]?.voice || 'ara';
  let request = null, generation = 0;
  const setStatus = value => { if (status) status.textContent = value; };
  function stopAll() {
    generation++;
    request?.abort(); request = null;
    window.speechSynthesis?.cancel();
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    if (play) play.disabled = false;
    root.classList.remove('is-speaking');
  }
  function selectRole(next) {
    if (!roles[next]) return;
    stopAll(); role = next; selected = roles[role].voice;
    if (text) text.value = roles[role].text;
    root.querySelectorAll('[data-vd-role]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.vdRole === role)));
    const detail = q('[data-vd-detail]');
    if (detail) detail.href = '/agents/' + roles[role].path;
    list?.querySelectorAll('button').forEach(b => { const active = b.dataset.voice === selected; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    setStatus('Ready to preview the ' + role + ' role.');
    if (device) device.hidden = true;
  }
  async function loadVoices() {
    let voices = [];
    try {
      const response = await fetch('/api/voice/voices', { cache: 'no-store' });
      if (response.ok) { const data = await response.json(); voices = data.voices || []; }
    } catch {}
    if (!voices.length) voices = [{ id:'ara', name:'Ara', tagline:'Warm front desk' },{ id:'eve', name:'Eve', tagline:'Clear scheduling' },{ id:'leo', name:'Leo', tagline:'Calm service' },{ id:'rex', name:'Rex', tagline:'Confident enquiries' }];
    if (list) {
      list.replaceChildren();
      voices.slice(0,10).forEach(v => {
        const id = v.id || v.voice_id, button = document.createElement('button');
        button.type = 'button'; button.dataset.voice = id; button.className = 'vd-voice';
        const name = document.createElement('strong'), label = document.createElement('span');
        name.textContent = v.name || id; label.textContent = v.tagline || 'Studio voice';
        button.append(name,label);
        button.addEventListener('click', () => {
          stopAll(); selected = id;
          list.querySelectorAll('button').forEach(b => { const active = b === button; b.classList.toggle('active',active); b.setAttribute('aria-pressed',String(active)); });
          setStatus('Voice selected. Press Play studio sample.');
        });
        list.appendChild(button);
      });
    }
    list?.querySelectorAll('button').forEach(b => { const active = b.dataset.voice === selected; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
  }
  const studio = { ara:'/audio/ara.mp3', eve:'/audio/eve.mp3', leo:'/audio/leo.mp3', rex:'/audio/rex.mp3' };
  async function playSample() {
    stopAll(); const run = generation;
    const sample = (text?.value || roles[role].text).trim().slice(0,220);
    if (!sample) return setStatus('Enter a short sample first.');
    if (play) play.disabled = true;
    if (device) device.hidden = true;
    const local = studio[selected] || studio[roles[role].voice];
    if (local && audio) {
      audio.src = local; audio.hidden = false;
      try {
        await audio.play();
        if (run !== generation) return;
        root.classList.add('is-speaking');
        setStatus('Playing ' + selected + ' · studio voice · ' + role);
        if (play) play.disabled = false;
        return;
      } catch {
        setStatus('Tap Play once more to start the studio voice.');
      }
    }
    setStatus('Preparing studio audio…');
    const controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(),30000);
    try {
      const response = await fetch('/api/voice/preview', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voiceId:selected,text:sample}),signal:controller.signal });
      const data = await response.json();
      if (run !== generation) return;
      if (!response.ok || !data.ok || data.useBrowser || data.mode === 'demo_fallback') throw new Error('studio_unavailable');
      const source = data.audioBase64 ? `data:${data.contentType || 'audio/mpeg'};base64,${data.audioBase64}` : data.audioUrl;
      if (!source || !audio) throw new Error('studio_unavailable');
      audio.src = source; audio.hidden = false;
      await audio.play();
      root.classList.add('is-speaking');
      setStatus('Playing ' + selected + ' · studio voice · ' + role);
    } catch {
      if (run !== generation) return;
      setStatus('Studio sample did not start. Press Play again.');
      if (device) device.hidden = false;
    } finally {
      clearTimeout(timeout);
      if (run === generation) { request = null; if (play) play.disabled = false; }
    }
  }
  play?.addEventListener('click',playSample);
  stop?.addEventListener('click',() => { stopAll(); setStatus('Stopped.'); });
  device?.addEventListener('click',() => {
    stopAll();
    if (!window.speechSynthesis) return setStatus('Device speech is unavailable in this browser.');
    const utterance = new SpeechSynthesisUtterance(text?.value || roles[role].text);
    const available = window.speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
    utterance.voice = available.find(v => /natural|neural|premium/i.test(v.name)) || available.find(v => v.lang === 'en-CA') || available[0];
    utterance.rate = 1.03; window.speechSynthesis.speak(utterance);
    setStatus('Playing device voice · lower quality fallback · not the production voice.');
  });
  root.querySelectorAll('[data-vd-role]').forEach(b => b.addEventListener('click',() => selectRole(b.dataset.vdRole)));
  audio?.addEventListener('ended',() => { root.classList.remove('is-speaking'); setStatus('Sample ended.'); });
  window.addEventListener('pagehide',stopAll);
  root.classList.add('vd-visible'); selectRole(role); loadVoices();
})();
