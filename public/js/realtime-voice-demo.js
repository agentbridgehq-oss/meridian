(() => {
  const consent = document.querySelector('#voice-demo-consent');
  const start = document.querySelector('#voice-demo-start');
  const stop = document.querySelector('#voice-demo-stop');
  const status = document.querySelector('#voice-demo-status');
  const audio = document.querySelector('#voice-demo-audio');
  if (!consent || !start || !stop || !status || !audio) return;

  let pc = null;
  let localStream = null;
  let dataChannel = null;
  let sessionId = '';
  let available = false;
  let starting = false;

  function setStatus(message) {
    status.textContent = message;
  }

  function updateButtons() {
    const active = Boolean(pc);
    start.disabled = !available || !consent.checked || active || starting;
    stop.disabled = !active;
  }

  async function readJson(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  async function loadStatus() {
    try {
      const data = await readJson(await fetch('/api/voice-demo/status', { cache: 'no-store' }));
      available = data.demo?.available === true;
      if (available) {
        setStatus('Demo ready. Check consent, then start speaking.');
      } else if (data.demo?.enabled !== true) {
        setStatus('The voice demo is currently disabled while Meridian staging is being prepared.');
      } else {
        setStatus('The voice demo runtime is not ready yet.');
      }
    } catch {
      available = false;
      setStatus('Voice demo availability could not be confirmed.');
    }
    updateButtons();
  }

  function waitForIceGathering(peer, timeoutMs = 5000) {
    if (peer.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        peer.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      };
      const onChange = () => {
        if (peer.iceGatheringState === 'complete') finish();
      };
      const timer = setTimeout(finish, timeoutMs);
      peer.addEventListener('icegatheringstatechange', onChange);
    });
  }

  function closeLocalConnection() {
    try { dataChannel?.close(); } catch {}
    dataChannel = null;
    try { pc?.close(); } catch {}
    pc = null;
    for (const track of localStream?.getTracks?.() || []) {
      try { track.stop(); } catch {}
    }
    localStream = null;
    audio.srcObject = null;
    updateButtons();
  }

  async function endProviderSession() {
    const id = sessionId;
    sessionId = '';
    if (!id) return;
    try {
      await fetch(`/api/voice-demo/session/${encodeURIComponent(id)}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        keepalive: true,
      });
    } catch {}
  }

  function handleRealtimeEvent(raw) {
    let event;
    try { event = JSON.parse(raw); } catch { return; }
    if (event.type === 'session.created' || event.type === 'session.updated') {
      setStatus('Connected. Speak naturally; the demo will respond by voice.');
    } else if (event.type === 'error') {
      setStatus('The voice session reported an error. End the demo and try again later.');
    }
  }

  async function startDemo() {
    if (starting || pc) return;
    if (!available) return setStatus('The demo is not available yet.');
    if (!consent.checked) return setStatus('Consent is required before microphone access starts.');
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      return setStatus('This browser does not support the required microphone/WebRTC features.');
    }

    starting = true;
    updateButtons();
    setStatus('Requesting microphone access…');

    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      pc = new RTCPeerConnection();
      pc.ontrack = event => {
        const [stream] = event.streams || [];
        if (stream) audio.srcObject = stream;
      };
      pc.onconnectionstatechange = () => {
        const state = pc?.connectionState;
        if (state === 'connected') setStatus('Connected. Speak naturally; the demo will respond by voice.');
        if (state === 'failed') setStatus('The WebRTC connection failed. End the demo and try again later.');
      };
      for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

      // Meridian code treats this data channel as read-only. Model, tools,
      // instructions and deployment selection are fixed by the server route.
      dataChannel = pc.createDataChannel('oai-events');
      dataChannel.addEventListener('message', event => handleRealtimeEvent(event.data));
      dataChannel.addEventListener('open', () => setStatus('Realtime channel open. Finishing voice connection…'));
      dataChannel.addEventListener('error', () => setStatus('The Realtime event channel reported an error.'));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);
      const sdp = pc.localDescription?.sdp || '';
      if (!sdp) throw new Error('webrtc_offer_missing');

      setStatus('Connecting to the Meridian voice demo…');
      const data = await readJson(await fetch('/api/voice-demo/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp, consent: true }),
      }));
      sessionId = data.sessionId || '';
      await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      setStatus('Connected. Speak naturally; the demo will respond by voice.');
    } catch (error) {
      await endProviderSession();
      closeLocalConnection();
      const code = String(error?.message || 'voice_demo_start_failed');
      if (code === 'voice_demo_disabled') available = false;
      if (error?.name === 'NotAllowedError') {
        setStatus('Microphone permission was not granted. Allow microphone access to use the demo.');
      } else if (code === 'voice_demo_rate_limited') {
        setStatus('Demo limit reached for now. Try again later.');
      } else if (code === 'openai_sdk_missing' || code === 'voice_demo_provider_unavailable') {
        setStatus('The staging voice provider is not ready yet.');
      } else {
        setStatus('The voice demo could not start. No client system was changed.');
      }
    } finally {
      starting = false;
      updateButtons();
    }
  }

  async function stopDemo() {
    if (!pc && !sessionId) return;
    stop.disabled = true;
    setStatus('Ending demo…');
    await endProviderSession();
    closeLocalConnection();
    setStatus(available ? 'Demo ended. You can start another session.' : 'Demo ended.');
  }

  consent.addEventListener('change', updateButtons);
  start.addEventListener('click', startDemo);
  stop.addEventListener('click', stopDemo);
  window.addEventListener('pagehide', () => {
    const id = sessionId;
    sessionId = '';
    if (id && navigator.sendBeacon) {
      try { navigator.sendBeacon(`/api/voice-demo/session/${encodeURIComponent(id)}/end`, new Blob(['{}'], { type: 'application/json' })); } catch {}
    }
    closeLocalConnection();
  });

  loadStatus();
})();
