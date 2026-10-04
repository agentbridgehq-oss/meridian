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

export const CALL_LIMIT_NOTICE =
  'Politely tell the caller that you need to wrap up this call now, and that the team will follow up or they can call back. Keep it to one or two short sentences. Do not start any new task.';

export async function connectOpenAIRealtimeSideband({
  callId,
  deploymentId,
  realtimeFactory = defaultRealtimeFactory,
  controllerFactory = createRealtimeSidebandController,
  limitSeconds = 0,
  warnSeconds = 30,
  onLimit,
  onClosed,
  timers = { setTimeout, clearTimeout },
  callIdPattern = /^rtc_[A-Za-z0-9_-]+$/,
  providerLabel = 'OpenAI',
} = {}) {
  if (!callIdPattern.test(String(callId || ''))) return { ok: false, code: 'invalid_call_id', error: 'A valid Realtime call ID is required.' };
  if (!deploymentId) return { ok: false, code: 'deployment_missing', error: 'deploymentId is required.' };

  let rt;
  try { rt = await realtimeFactory(callId); }
  catch (error) { return { ok: false, code: error?.code || 'sideband_connect_failed', error: safeError(error) }; }
  if (!rt || typeof rt.send !== 'function') return { ok: false, code: 'invalid_sideband_client', error: 'Realtime sideband factory did not return a usable client.' };

  const controller = controllerFactory({ deploymentId, sessionCallId: callId });
  const cleanups = [];
  let closed = false, ready = false, lastError = '', limitReached = false, finished = false;

  // Usage allowance: polite wrap-up notice, then transfer/hang up via onLimit.
  const limitMs = Math.max(0, Number(limitSeconds) || 0) * 1000;
  if (limitMs > 0) {
    const warnAt = Math.max(0, limitMs - Math.max(0, Number(warnSeconds) || 0) * 1000);
    const warnTimer = timers.setTimeout(() => {
      try { rt.send({ type: 'response.create', response: { instructions: CALL_LIMIT_NOTICE } }); } catch {}
    }, warnAt);
    const limitTimer = timers.setTimeout(() => {
      limitReached = true;
      Promise.resolve().then(() => onLimit?.({ callId, deploymentId })).catch(() => {});
    }, limitMs);
    warnTimer?.unref?.();
    limitTimer?.unref?.();
    cleanups.push(() => { timers.clearTimeout(warnTimer); timers.clearTimeout(limitTimer); });
  }
  function finish() {
    if (finished) return;
    finished = true;
    for (const cleanup of cleanups.splice(0)) { try { cleanup(); } catch {} }
    Promise.resolve().then(() => onClosed?.({ callId, deploymentId, limitReached })).catch(() => {});
  }

  async function handleServerEvent(event) {
    const handled = await controller.handleServerEvent(event);
    for (const clientEvent of handled.clientEvents || []) {
      try { rt.send(clientEvent); }
      catch (error) {
        lastError = safeError(error);
        controller.markEnded({ failed: true, detail: `Sideband could not return a tool result to ${providerLabel}.`, error: lastError });
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
    controller.markActive(`${providerLabel} confirmed the Realtime sideband session update.`);
  }));
  cleanups.push(onRealtime(rt, 'error', error => { lastError = safeError(error); }));

  cleanups.push(onSocket(rt.socket, 'open', () => { controller.markConnected(providerLabel === 'OpenAI' ? 'Official OpenAI Node SDK sideband WebSocket opened.' : `${providerLabel} realtime WebSocket opened.`); }));
  cleanups.push(onSocket(rt.socket, 'close', () => {
    if (closed) return;
    closed = true;
    controller.markEnded({ failed: Boolean(lastError), detail: lastError ? 'Realtime sideband closed after an error.' : 'Realtime sideband closed.', error: lastError });
    finish();
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
    get limitReached() { return limitReached; },
    close() {
      if (closed) return;
      closed = true;
      try { rt.close?.(); } catch {}
      controller.markEnded({ failed: false, detail: 'Meridian closed the Realtime sideband connection.' });
      finish();
    },
  };
}
