/**
 * xAI Grok Voice provider adapter (SIP + realtime WebSocket + call control).
 *
 * Mirrors openai-provider-adapter.mjs so the ingress / webhook route / sideband
 * stay provider-agnostic. Rollback = MERIDIAN_AI_PROVIDER=legacy.
 *
 * Docs (retrieved 2026-10-04):
 *   https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech/sip
 *   https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech
 *
 * Differences from OpenAI SIP that matter here:
 *   - call_id is a UUID (not rtc_…).
 *   - There is NO documented accept/reject endpoint. "Accepting" = opening
 *     wss://api.x.ai/v1/realtime?call_id=… and sending session.update + response.create.
 *     "Rejecting" = refer (when a verified human line exists) or hangup.
 *   - Webhook signed with webhook-id / webhook-timestamp / webhook-signature
 *     headers. The docs do not spell out the algorithm; we implement the
 *     Standard Webhooks scheme those header names come from
 *     (HMAC-SHA256 over `${id}.${timestamp}.${body}`, `v1,<base64>`). VERIFY LIVE.
 *
 * Every network dependency (fetch, WebSocket) is injectable; tests never call xAI.
 */
import crypto from 'crypto';
import { createRealtimeSidebandController } from './realtime-sideband-controller.mjs';
import { connectOpenAIRealtimeSideband } from './openai-realtime-sideband.mjs';
import { XAI_REALTIME_URL, xaiVoiceModel } from './xai-realtime-config.mjs';

export const XAI_CALL_ID_PATTERN = /^[A-Za-z0-9-]{8,128}$/;
const API_BASE = () => (process.env.XAI_API_BASE || 'https://api.x.ai/v1').replace(/\/$/, '');
const WEBHOOK_TOLERANCE_SECONDS = 300;

function configured(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0;
}

function codedError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

export function xaiVoiceProviderStatus() {
  return {
    provider: 'xai',
    apiKeyConfigured: configured('XAI_API_KEY'),
    webhookSecretConfigured: configured('XAI_WEBHOOK_SECRET'),
    realtimeModel: xaiVoiceModel(),
    transport: 'sip:{number}@sip.voice.x.ai;transport=tls',
  };
}

function apiKey() {
  if (!configured('XAI_API_KEY')) throw codedError('xai_api_key_missing', 'XAI_API_KEY is not configured in the runtime environment.');
  return process.env.XAI_API_KEY.trim();
}

function header(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : String(v || '');
}

function secretKeys(secret) {
  const s = String(secret || '').trim();
  if (s.startsWith('whsec_')) return [Buffer.from(s.slice(6), 'base64')];
  const keys = [Buffer.from(s, 'utf8')];
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length % 4 === 0) keys.push(Buffer.from(s, 'base64'));
  return keys;
}

/** Sign like Standard Webhooks — exported for tests and local tooling. */
export function signXaiWebhook({ id, timestamp, body, secret }) {
  const key = secretKeys(secret)[0];
  return `v1,${crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}

export async function verifyXaiWebhook(rawBody, headers, { secret = process.env.XAI_WEBHOOK_SECRET, now = Date.now() } = {}) {
  if (!secret || !String(secret).trim()) throw codedError('xai_webhook_secret_missing', 'XAI_WEBHOOK_SECRET is not configured in the runtime environment.');
  if (typeof rawBody !== 'string' || !rawBody.length) throw codedError('xai_webhook_raw_body_missing', 'xAI webhook verification requires the unparsed raw JSON body.');
  const id = header(headers, 'webhook-id');
  const timestamp = header(headers, 'webhook-timestamp');
  const signatures = header(headers, 'webhook-signature');
  if (!id || !timestamp || !signatures) throw codedError('xai_webhook_headers_missing', 'Missing webhook-id / webhook-timestamp / webhook-signature.');
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > WEBHOOK_TOLERANCE_SECONDS) throw codedError('xai_webhook_timestamp_invalid', 'Webhook timestamp outside tolerance.');
  const provided = signatures.split(' ').map(s => s.trim()).filter(Boolean).map(s => (s.includes(',') ? s.split(',').slice(1).join(',') : s));
  const content = `${id}.${timestamp}.${rawBody}`;
  const ok = secretKeys(secret).some(key => {
    const expected = Buffer.from(crypto.createHmac('sha256', key).update(content).digest('base64'));
    return provided.some(sig => {
      const got = Buffer.from(sig);
      return got.length === expected.length && crypto.timingSafeEqual(got, expected);
    });
  });
  if (!ok) throw codedError('xai_webhook_signature_invalid', 'xAI webhook signature mismatch.');
  try {
    return JSON.parse(rawBody);
  } catch {
    throw codedError('xai_webhook_json_invalid', 'xAI webhook body is not JSON.');
  }
}

async function callControl(callId, action, body, { fetchImpl = globalThis.fetch, timeoutMs = 45000 } = {}) {
  if (!XAI_CALL_ID_PATTERN.test(String(callId || ''))) throw codedError('xai_call_id_invalid', 'A valid xAI call_id is required.');
  const res = await fetchImpl(`${API_BASE()}/realtime/calls/${encodeURIComponent(callId)}/${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw codedError(`xai_${action}_failed`, String(data?.error || `xAI ${action} failed with HTTP ${res.status}`).slice(0, 300), { httpStatus: res.status });
  }
  return { ok: true, callId };
}

/** Blocks until the transfer resolves; 200 = destination answered (per xAI docs). */
export async function referXaiRealtimeCall({ callId, targetUri, fetchImpl } = {}) {
  if (!/^(tel|sip):/i.test(String(targetUri || ''))) throw codedError('xai_refer_target_invalid', 'target_uri must be tel: or sip:.');
  await callControl(callId, 'refer', { target_uri: targetUri }, { fetchImpl });
  return { ok: true, callId, targetUri };
}

export async function hangupXaiRealtimeCall({ callId, fetchImpl } = {}) {
  await callControl(callId, 'hangup', {}, { fetchImpl, timeoutMs: 15000 });
  return { ok: true, callId };
}

/**
 * xAI has no reject endpoint. A declined call is transferred to the verified
 * team line when one is supplied (cap path), otherwise hung up. The SIP status
 * the OpenAI path would send is recorded only for audit.
 */
export async function rejectXaiRealtimeCall({ callId, statusCode = 603, transferUri = '', fetchImpl } = {}) {
  if (transferUri) {
    try {
      await referXaiRealtimeCall({ callId, targetUri: transferUri, fetchImpl });
      return { ok: true, callId, statusCode, action: 'transferred' };
    } catch {
      /* fall through to hangup */
    }
  }
  await hangupXaiRealtimeCall({ callId, fetchImpl });
  return { ok: true, callId, statusCode, action: 'hangup' };
}

/* ------------------------------------------------------------------ */
/* Realtime WebSocket → `rt` interface used by the shared sideband      */
/* ------------------------------------------------------------------ */

const STICKY = new Set(['session.updated']);

/**
 * Wrap a WebSocket into { send, on, off, close, socket }. Events that arrive
 * before the sideband subscribes are buffered and flushed on first subscribe,
 * so nothing is lost between "accept" and "attach".
 */
export function wrapXaiRealtimeSocket(ws) {
  const listeners = new Map();
  const socketListeners = { open: new Set(), close: new Set() };
  const buffer = [];
  const sticky = new Map();
  let opened = false, closedFlag = false, flushScheduled = false, subscribed = false;

  const dispatch = event => {
    for (const fn of listeners.get(event.type) || []) { try { fn(event); } catch {} }
  };
  const onMessage = msg => {
    const raw = typeof msg?.data === 'string' ? msg.data : Buffer.isBuffer(msg?.data) ? msg.data.toString('utf8') : String(msg?.data ?? msg ?? '');
    let event;
    try { event = JSON.parse(raw); } catch { return; }
    if (!event?.type) return;
    if (STICKY.has(event.type)) sticky.set(event.type, event);
    if (!subscribed) { buffer.push(event); return; }
    dispatch(event);
  };
  const add = (type, fn) => (typeof ws.addEventListener === 'function' ? ws.addEventListener(type, fn) : ws.on?.(type, fn));
  add('message', onMessage);
  add('open', () => { opened = true; for (const fn of socketListeners.open) { try { fn(); } catch {} } });
  add('close', () => { closedFlag = true; for (const fn of socketListeners.close) { try { fn(); } catch {} } });
  add('error', err => { const message = err?.message || 'xAI realtime socket error'; const e = { type: 'error', message, error: { message } }; if (subscribed) dispatch(e); else buffer.push(e); });

  const socket = {
    addEventListener(type, fn) {
      if (!socketListeners[type]) return;
      socketListeners[type].add(fn);
      if (type === 'open' && opened) queueMicrotask(() => fn());
      if (type === 'close' && closedFlag) queueMicrotask(() => fn());
    },
    removeEventListener(type, fn) { socketListeners[type]?.delete(fn); },
    get readyState() { return ws.readyState; },
  };

  return {
    provider: 'xai',
    socket,
    get opened() { return opened; },
    whenOpen(timeoutMs = 10000) {
      if (opened) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(codedError('xai_realtime_connect_timeout', 'xAI realtime WebSocket did not open in time.')), timeoutMs);
        t.unref?.();
        socket.addEventListener('open', () => { clearTimeout(t); resolve(); });
        socket.addEventListener('close', () => { clearTimeout(t); reject(codedError('xai_realtime_closed', 'xAI realtime WebSocket closed before opening.')); });
      });
    },
    send(event) { ws.send(JSON.stringify(event)); },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      if (STICKY.has(type) && sticky.has(type) && subscribed) queueMicrotask(() => fn(sticky.get(type)));
      if (!subscribed && !flushScheduled) {
        flushScheduled = true;
        // Sideband registers all handlers synchronously; flush after that loop.
        queueMicrotask(() => { subscribed = true; for (const e of buffer.splice(0)) dispatch(e); });
      }
    },
    off(type, fn) { listeners.get(type)?.delete(fn); },
    close() { try { ws.close(); } catch {} },
  };
}

export function openXaiRealtimeSocket(callId, { WebSocketImpl = globalThis.WebSocket, url = XAI_REALTIME_URL } = {}) {
  if (!XAI_CALL_ID_PATTERN.test(String(callId || ''))) throw codedError('xai_call_id_invalid', 'A valid xAI call_id is required.');
  if (typeof WebSocketImpl !== 'function') throw codedError('xai_websocket_missing', 'No WebSocket implementation available (Node 22+ required).');
  const target = `${url}?call_id=${encodeURIComponent(callId)}`;
  const ws = new WebSocketImpl(target, { headers: { Authorization: `Bearer ${apiKey()}` } });
  return wrapXaiRealtimeSocket(ws);
}

/** Live connections opened by accept, handed to the sideband on attach. */
const connections = new Map();
export function _xaiConnectionsForTest() { return connections; }

/**
 * "Accept" an xAI SIP call: join over WebSocket, configure the session, start speaking.
 * body = plan.acceptBody = { model, session } from buildXaiRealtimeConfig.
 */
export async function acceptXaiRealtimeCall({ callId, body, WebSocketImpl, openTimeoutMs = 10000 } = {}) {
  const rt = openXaiRealtimeSocket(callId, { WebSocketImpl });
  try {
    await rt.whenOpen(openTimeoutMs);
    rt.send({ type: 'session.update', session: body?.session || {} });
    const first = typeof body?.firstUtterance === 'string' ? body.firstUtterance.trim() : '';
    rt.send({
      type: 'response.create',
      ...(first
        ? { response: { instructions: `Begin with this exact sentence and do not add words before it: ${first}` } }
        : {}),
    });
  } catch (error) {
    rt.close();
    throw error;
  }
  connections.set(callId, rt);
  rt.socket.addEventListener('close', () => connections.delete(callId));
  return { ok: true, callId };
}

/** Shared sideband (tools, call limit warn/stop, metering close) on the accepted xAI socket. */
export async function connectXaiRealtimeSideband(options = {}) {
  return connectOpenAIRealtimeSideband({
    ...options,
    callIdPattern: XAI_CALL_ID_PATTERN,
    providerLabel: 'xAI',
    realtimeFactory: options.realtimeFactory || (async callId => {
      const rt = connections.get(callId);
      if (!rt) throw codedError('xai_realtime_not_accepted', 'No accepted xAI realtime connection for this call.');
      return rt;
    }),
    controllerFactory: options.controllerFactory || (opts => createRealtimeSidebandController({ ...opts, referCall: referXaiRealtimeCall })),
  });
}
