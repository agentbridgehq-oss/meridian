import crypto from 'node:crypto';

const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const SUPPORTED_PROVIDERS = new Set(['webhook','n8n']);

function clean(value, max = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function connectorSecretEnvName(deploymentId, kind) {
  const dep = String(deploymentId || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const integration = String(kind || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return `MERIDIAN_CONNECTOR_${dep}_${integration}_SECRET`;
}

export function businessAdapterStatus(deployment, kind) {
  const integration = deployment?.integrations?.[kind];
  if (!integration) return { ready: false, reason: 'integration_missing' };
  if (integration.status !== 'verified') return { ready: false, reason: 'integration_not_verified' };
  if (!SUPPORTED_PROVIDERS.has(integration.provider)) return { ready: false, reason: 'provider_adapter_missing' };
  if (!clean(integration.endpoint, 2000)) return { ready: false, reason: 'endpoint_missing' };
  const secretEnv = connectorSecretEnvName(deployment.id, kind);
  const secretConfigured = typeof process.env[secretEnv] === 'string' && process.env[secretEnv].trim().length >= 12;
  if (integration.requiresCredential !== false && !secretConfigured) return { ready: false, reason: 'connector_secret_missing', secretEnv };
  return { ready: true, provider: integration.provider, endpoint: integration.endpoint, secretEnv, secretConfigured };
}

function safeEndpoint(raw) {
  try {
    const url = new URL(raw);
    if (url.username || url.password) return null;
    if (url.protocol === 'https:') return url;
    if (process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['127.0.0.1','localhost','::1'].includes(url.hostname)) return url;
  } catch {}
  return null;
}

function safeResult(body = {}) {
  const out = { ok: body.ok === true, confirmed: body.confirmed === true };
  for (const key of ['recordId','bookingId','start','end','message']) {
    const value = clean(body[key], key === 'message' ? 1000 : 300);
    if (value) out[key] = value;
  }
  if (typeof body.available === 'boolean') out.available = body.available;
  if (Array.isArray(body.slots)) {
    out.slots = body.slots.slice(0, 12).map(slot => ({
      start: clean(slot?.start, 120),
      end: clean(slot?.end, 120),
      label: clean(slot?.label, 200),
    })).filter(slot => slot.start);
  }
  return out;
}

export async function executeBusinessSystemAction({ deployment, kind, action, data = {}, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const status = businessAdapterStatus(deployment, kind);
  if (!status.ready) return { ok: false, code: status.reason, message: 'The verified customer-system adapter is not ready.' };
  const endpoint = safeEndpoint(status.endpoint);
  if (!endpoint) return { ok: false, code: 'unsafe_connector_endpoint', message: 'The customer-system endpoint must use HTTPS.' };
  const secret = status.secretConfigured ? process.env[status.secretEnv].trim() : '';
  const idempotencyKey = crypto.randomUUID();
  const payload = JSON.stringify({
    version: 1,
    action: clean(action, 120),
    deploymentId: deployment.id,
    projectId: deployment.projectId,
    businessName: deployment.businessName,
    idempotencyKey,
    data,
  });
  const signature = secret ? crypto.createHmac('sha256', secret).update(payload).digest('hex') : '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Math.min(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 30_000)));
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
        'x-meridian-action': clean(action, 120),
        'x-meridian-idempotency-key': idempotencyKey,
        ...(signature ? { 'x-meridian-signature': `sha256=${signature}`, authorization: `Bearer ${secret}` } : {}),
      },
      body: payload,
      signal: controller.signal,
    });
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) return { ok: false, code: 'connector_response_too_large', message: 'Customer-system response exceeded the safe size limit.' };
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { return { ok: false, code: 'connector_invalid_json', message: 'Customer-system response was not valid JSON.' }; }
    if (!response.ok) return { ok: false, code: 'connector_http_error', message: `Customer-system request failed with HTTP ${response.status}.` };
    const result = safeResult(body);
    if (!result.ok || !result.confirmed) return { ok: false, code: 'connector_not_confirmed', message: 'Customer system did not explicitly confirm the action.' };
    return { ...result, provider: status.provider, idempotencyKey };
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, code: 'connector_timeout', message: 'Customer-system request timed out.' };
    return { ok: false, code: 'connector_unavailable', message: 'Customer-system request could not be completed.' };
  } finally {
    clearTimeout(timeout);
  }
}
