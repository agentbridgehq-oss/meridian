import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export const REALTIME_CALL_STATES = Object.freeze([
  'incoming',
  'blocked',
  'authorized',
  'accepted',
  'sideband_connected',
  'active',
  'transfer_requested',
  'transferred',
  'completed',
  'failed',
]);

const SECRET_KEY = /(secret|password|api[_-]?key|(^|[_-])token($|[_-])|private[_-]?key|authorization|credentials?)/i;
const MAX_EVENTS_PER_CALL = 100;
const now = () => new Date().toISOString();
const clean = (value, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const clone = value => JSON.parse(JSON.stringify(value));

function callFile() {
  return process.env.MERIDIAN_REALTIME_CALL_FILE || path.join(
    process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(ROOT, 'data'),
    'realtime-calls.json',
  );
}

function maxRecords() {
  const value = Number(process.env.MERIDIAN_REALTIME_CALL_MAX_RECORDS || 1000);
  return Number.isInteger(value) && value >= 50 && value <= 10000 ? value : 1000;
}

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(callFile(), 'utf8'));
    if (Array.isArray(parsed?.calls)) return parsed;
  } catch {}
  return { version: 1, calls: [] };
}

function save(store) {
  const target = callFile();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const trimmed = {
    version: 1,
    calls: store.calls
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, maxRecords()),
  };
  fs.writeFileSync(temp, JSON.stringify(trimmed, null, 2), { mode: 0o600 });
  fs.renameSync(temp, target);
}

function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) continue;
    output[key] = scrub(child);
  }
  return output;
}

function event(type, detail = '', meta = {}) {
  return {
    id: `evt_${crypto.randomBytes(8).toString('hex')}`,
    type: clean(type, 120),
    detail: clean(detail, 2000),
    meta: scrub(meta),
    at: now(),
  };
}

function safeState(value) {
  const state = clean(value, 60);
  return REALTIME_CALL_STATES.includes(state) ? state : '';
}

export function recordRealtimeCallIncoming(input = {}) {
  const callId = clean(input.callId, 200);
  const deploymentId = clean(input.deploymentId, 200);
  const dialedNumber = clean(input.dialedNumber, 80);
  const environment = clean(input.environment, 40) || 'staging';
  if (!/^rtc_[A-Za-z0-9_-]+$/.test(callId)) return { ok: false, status: 400, error: 'A valid Realtime call ID is required.' };
  if (!deploymentId) return { ok: false, status: 400, error: 'deploymentId is required.' };
  if (!['staging', 'production'].includes(environment)) return { ok: false, status: 400, error: 'environment must be staging or production.' };

  const store = load();
  const existing = store.calls.find(item => item.callId === callId);
  if (existing) return { ok: true, created: false, call: clone(existing) };
  const at = now();
  const call = {
    callId,
    deploymentId,
    routeId: clean(input.routeId, 200),
    dialedNumber,
    environment,
    provider: clean(input.provider, 80) || 'openai-realtime',
    status: 'incoming',
    blockerCodes: [],
    toolCounts: {},
    transfer: { requested: false, confirmed: false, target: '', requestedAt: null, confirmedAt: null },
    lastError: '',
    startedAt: at,
    acceptedAt: null,
    sidebandConnectedAt: null,
    endedAt: null,
    updatedAt: at,
    events: [event('call.incoming', 'Verified incoming Realtime call was resolved to a Meridian deployment.', {
      routeId: clean(input.routeId, 200),
      dialedNumber,
      environment,
    })],
  };
  store.calls.push(call);
  save(store);
  return { ok: true, created: true, call: clone(call) };
}

export function getRealtimeCall(callId) {
  const call = load().calls.find(item => item.callId === callId);
  return call ? clone(call) : null;
}

export function listRealtimeCalls({ deploymentId, limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const wantedDeployment = clean(deploymentId, 200);
  return load().calls
    .filter(item => !wantedDeployment || item.deploymentId === wantedDeployment)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, safeLimit)
    .map(clone);
}

export function updateRealtimeCall(callId, input = {}) {
  const store = load();
  const index = store.calls.findIndex(item => item.callId === callId);
  if (index < 0) return { ok: false, status: 404, error: 'Realtime call not found.' };
  const call = store.calls[index];
  const nextState = input.status === undefined ? call.status : safeState(input.status);
  if (!nextState) return { ok: false, status: 400, error: 'Invalid Realtime call status.' };

  const at = now();
  call.status = nextState;
  if (Array.isArray(input.blockerCodes)) call.blockerCodes = [...new Set(input.blockerCodes.map(value => clean(value, 200)).filter(Boolean))].slice(0, 100);
  if (typeof input.lastError === 'string') call.lastError = clean(input.lastError, 1000);
  if (nextState === 'accepted' && !call.acceptedAt) call.acceptedAt = at;
  if (nextState === 'sideband_connected' && !call.sidebandConnectedAt) call.sidebandConnectedAt = at;
  if (['completed', 'failed', 'blocked'].includes(nextState) && !call.endedAt) call.endedAt = at;
  call.updatedAt = at;
  const type = clean(input.eventType, 120) || `call.${nextState}`;
  const detail = clean(input.detail, 2000);
  call.events.push(event(type, detail, input.meta || {}));
  call.events = call.events.slice(-MAX_EVENTS_PER_CALL);
  store.calls[index] = call;
  save(store);
  return { ok: true, call: clone(call) };
}

export function recordRealtimeToolResult(callId, input = {}) {
  const store = load();
  const index = store.calls.findIndex(item => item.callId === callId);
  if (index < 0) return { ok: false, status: 404, error: 'Realtime call not found.' };
  const call = store.calls[index];
  const toolName = clean(input.toolName, 160) || 'unknown_tool';
  const at = now();
  call.toolCounts[toolName] = (call.toolCounts[toolName] || 0) + 1;
  call.updatedAt = at;
  call.events.push(event('tool.completed', input.ok === true ? 'Tool completed.' : 'Tool failed.', {
    toolName,
    ok: input.ok === true,
    code: clean(input.code, 160),
    action: clean(input.action, 160),
  }));
  call.events = call.events.slice(-MAX_EVENTS_PER_CALL);
  store.calls[index] = call;
  save(store);
  return { ok: true, call: clone(call) };
}

export function recordRealtimeTransfer(callId, input = {}) {
  const store = load();
  const index = store.calls.findIndex(item => item.callId === callId);
  if (index < 0) return { ok: false, status: 404, error: 'Realtime call not found.' };
  const call = store.calls[index];
  const at = now();
  const confirmed = input.confirmed === true;
  call.transfer.requested = true;
  call.transfer.requestedAt ||= at;
  call.transfer.target = clean(input.target, 120);
  call.transfer.confirmed = confirmed;
  if (confirmed) call.transfer.confirmedAt = at;
  call.status = confirmed ? 'transferred' : 'transfer_requested';
  call.updatedAt = at;
  call.events.push(event(confirmed ? 'transfer.confirmed' : 'transfer.requested', confirmed ? 'Provider confirmed transfer.' : 'Provider transfer requested.', {
    target: call.transfer.target,
    confirmed,
  }));
  call.events = call.events.slice(-MAX_EVENTS_PER_CALL);
  store.calls[index] = call;
  save(store);
  return { ok: true, call: clone(call) };
}

export function realtimeCallSummary(call) {
  if (!call) return null;
  return {
    callId: call.callId,
    deploymentId: call.deploymentId,
    routeId: call.routeId,
    dialedNumber: call.dialedNumber,
    environment: call.environment,
    provider: call.provider,
    status: call.status,
    blockerCodes: call.blockerCodes,
    toolCounts: call.toolCounts,
    transfer: call.transfer,
    lastError: call.lastError,
    startedAt: call.startedAt,
    acceptedAt: call.acceptedAt,
    sidebandConnectedAt: call.sidebandConnectedAt,
    endedAt: call.endedAt,
    updatedAt: call.updatedAt,
  };
}
