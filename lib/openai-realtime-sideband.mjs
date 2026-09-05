import { createRealtimeSidebandController } from './realtime-sideband-controller.mjs';

function safeError(error) {
  return typeof error?.message === 'string' ? error.message.slice(0, 500) : 'Realtime sideband error.';
}

async function defaultRealtimeFactory(callID) {
  try {
    const { OpenAIRealtimeWebSocket } = await import('openai/realtime/websocket');
    return new OpenAIRealtimeWebSocket({ callID });
  } catch (error) {
    const wrapped = new Error('The current OpenAI Node SDK Realtime WebSocket helper is not installed in this runtime yet.');
    wrapped.code = 'openai_realtime_sdk_missing';
    wrapped.cause = error;
    throw wrapped;
  }
}

function onSocket(socket, type, handler) {
  if (typeof socket?.addEventListener === 'function') {
    socket.addEventListener(type, handler);
    return () => socket.removeEventListener?.(type, handler);
  }
  if (typeof socket?.on === 'function') {
    socket.on(type, handler);
    return () => socket.off?.(type, handler);
  }
  return () => {};
}

function onRealtime(rt, type, handler) {
  if (typeof rt?.on !== 'function') return () => {};
  rt.on(type, handler);
  return () => rt.off?.(type, handler);
}

export async function connectOpenAIRealtimeSideband({
  callId,
  deploymentId,
  realtimeFactory = defaultRealtimeFactory,
  controllerFactory = createRealtimeSidebandController,
} = {}) {
  if (!/^rtc_[A-Za-z0-9_-]+$/.test(String(callId || ''))) return { ok: false, code: 'invalid_call_id', error: 'A valid Realtime call ID is required.' };
  if (!deploymentId) return { ok: false, code: 'deployment_missing', error: 'deploymentId is required.' };

  let rt;
  try { rt = await realtimeFactory(callId); }
  catch (error) { return { ok: false, code: error?.code || 'sideband_connect_failed', error: safeError(error) }; }
  if (!rt || typeof rt.send !== 'function') return { ok: false, code: 'invalid_sideband_client', error: 'Realtime sideband factory did not return a usable client.' };

  const controller = controllerFactory({ deploymentId, sessionCallId: callId });
  const cleanups = [];
  let closed = false, ready = false, lastError = '';

  async function handleServerEvent(event) {
    const handled = await controller.handleServerEvent(event);
    for (const clientEvent of handled.clientEvents || []) {
      try { rt.send(clientEvent); }
      catch (error) {
        lastError = safeError(error);
        controller.markEnded({ failed: true, detail: 'Sideband could not return a tool result to OpenAI.', error: lastError });
        break;
      }
    }
  }

  for (const eventType of [
    'response.output_item.added',
    'response.function_call_arguments.done',
    'input_audio_buffer.dtmf_event_received',
    'input_audio_buffer.timeout_triggered',
    'output_audio_buffer.cleared',
  ]) {
    cleanups.push(onRealtime(rt, eventType, event => { void handleServerEvent(event); }));
  }
  cleanups.push(onRealtime(rt, 'session.updated', () => {
    ready = true;
    controller.markActive('OpenAI confirmed the Realtime sideband session update.');
  }));
  cleanups.push(onRealtime(rt, 'error', error => { lastError = safeError(error); }));

  cleanups.push(onSocket(rt.socket, 'open', () => { controller.markConnected('Official OpenAI Node SDK sideband WebSocket opened.'); }));
  cleanups.push(onSocket(rt.socket, 'close', () => {
    if (closed) return;
    closed = true;
    controller.markEnded({ failed: Boolean(lastError), detail: lastError ? 'Realtime sideband closed after an error.' : 'Realtime sideband closed.', error: lastError });
  }));

  return {
    ok: true,
    callId,
    deploymentId,
    controller,
    rt,
    get ready() { return ready; },
    get closed() { return closed; },
    get lastError() { return lastError; },
    close() {
      if (closed) return;
      closed = true;
      for (const cleanup of cleanups.splice(0)) { try { cleanup(); } catch {} }
      try { rt.close?.(); } catch {}
      controller.markEnded({ failed: false, detail: 'Meridian closed the Realtime sideband connection.' });
    },
  };
}
