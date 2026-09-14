import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDeployment } from './deployment-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export const INBOUND_ROUTE_ENVIRONMENTS = Object.freeze(['staging', 'production']);
const now = () => new Date().toISOString();
const clean = (value, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const clone = value => JSON.parse(JSON.stringify(value));

function routeFile() {
  return process.env.MERIDIAN_INBOUND_ROUTE_FILE || path.join(
    process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.join(ROOT, 'data'),
    'inbound-routes.json',
  );
}

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(routeFile(), 'utf8'));
    if (Array.isArray(parsed?.routes)) return parsed;
  } catch {}
  return { version: 1, routes: [] };
}

function save(store) {
  const target = routeFile();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(temp, target);
}

export function normalizeE164(value) {
  let input = clean(value, 120);
  if (!input) return '';
  input = input.replace(/^tel:/i, '');
  const match = input.match(/\+[1-9]\d{7,14}/);
  return match ? match[0] : '';
}

function headerValues(headers, name) {
  if (!Array.isArray(headers)) return [];
  const wanted = String(name || '').toLowerCase();
  return headers
    .filter(item => String(item?.name || '').toLowerCase() === wanted)
    .map(item => clean(item?.value, 2000))
    .filter(Boolean);
}

export function dialedNumberFromSipHeaders(headers) {
  // Twilio Elastic SIP Trunking documents that the original Twilio DID is
  // always conveyed in Diversion for trunking origination. Standard called-
  // party headers are safe fallbacks for other SIP ingress providers.
  for (const name of ['Diversion', 'P-Called-Party-ID', 'To']) {
    for (const value of headerValues(headers, name)) {
      const number = normalizeE164(value);
      if (number) return { number, sourceHeader: name };
    }
  }
  return { number: '', sourceHeader: '' };
}

function validateDeployment(deploymentId) {
  const deployment = getDeployment(deploymentId);
  if (!deployment) return { ok: false, status: 404, error: 'Deployment not found' };
  if (!deployment.capabilities?.includes('voice'))
    return { ok: false, status: 409, error: 'Inbound SIP routes require a voice-capable deployment.' };
  return { ok: true, deployment };
}

export function listInboundRoutes() {
  return load().routes.map(clone);
}

export function getInboundRoute(id) {
  const route = load().routes.find(item => item.id === id);
  return route ? clone(route) : null;
}

export function upsertInboundRoute(input = {}) {
  const deploymentId = clean(input.deploymentId, 160);
  const checked = validateDeployment(deploymentId);
  if (!checked.ok) return checked;
  const dialedNumber = normalizeE164(input.dialedNumber);
  if (!dialedNumber) return { ok: false, status: 400, error: 'dialedNumber must be E.164, including the leading +.' };
  const provider = clean(input.provider, 80) || 'twilio-sip';
  const environment = clean(input.environment, 40) || 'staging';
  if (!INBOUND_ROUTE_ENVIRONMENTS.includes(environment))
    return { ok: false, status: 400, error: 'environment must be staging or production.' };

  const store = load();
  const index = store.routes.findIndex(item => item.dialedNumber === dialedNumber && item.provider === provider && item.environment === environment);
  const at = now();
  const evidence = clean(input.evidence, 2000);

  if (index >= 0) {
    const current = store.routes[index];
    if (current.deploymentId !== deploymentId && current.enabled && input.replace !== true) {
      return {
        ok: false,
        status: 409,
        error: 'That inbound number already has an enabled route. Disable it or explicitly replace it.',
        route: clone(current),
      };
    }
    const next = {
      ...current,
      deploymentId,
      externalId: clean(input.externalId, 300) || current.externalId,
      evidence: evidence || current.evidence,
      updatedAt: at,
      revision: current.revision + 1,
    };
    store.routes[index] = next;
    save(store);
    return { ok: true, created: false, route: clone(next) };
  }

  const route = {
    id: `route_${crypto.randomBytes(10).toString('hex')}`,
    dialedNumber,
    deploymentId,
    provider,
    environment,
    enabled: false,
    externalId: clean(input.externalId, 300),
    evidence,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    enabledAt: null,
    disabledAt: null,
  };
  store.routes.push(route);
  save(store);
  return { ok: true, created: true, route: clone(route) };
}

export function setInboundRouteEnabled(id, enabled, input = {}) {
  const store = load();
  const index = store.routes.findIndex(item => item.id === id);
  if (index < 0) return { ok: false, status: 404, error: 'Inbound route not found' };
  const route = store.routes[index];
  const checked = validateDeployment(route.deploymentId);
  if (!checked.ok) return checked;
  const evidence = clean(input.evidence, 2000);
  if (enabled === true && evidence.length < 8)
    return { ok: false, status: 400, error: 'Verification evidence is required before enabling an inbound route.' };

  if (enabled === true) {
    const conflict = store.routes.find(item => item.id !== id && item.enabled && item.dialedNumber === route.dialedNumber && item.provider === route.provider && item.environment === route.environment);
    if (conflict) return { ok: false, status: 409, error: 'Another enabled route already owns this inbound number.', route: clone(conflict) };
  }

  const at = now();
  route.enabled = enabled === true;
  route.evidence = evidence || route.evidence;
  route.updatedAt = at;
  route.revision += 1;
  route.enabledAt = route.enabled ? at : route.enabledAt;
  route.disabledAt = route.enabled ? null : at;
  save(store);
  return { ok: true, route: clone(route) };
}

export function resolveInboundRouteByNumber(number, { environment } = {}) {
  const normalized = normalizeE164(number);
  if (!normalized) return null;
  const env = environment ? clean(environment, 40) : '';
  const route = load().routes.find(item => item.enabled && item.dialedNumber === normalized && (!env || item.environment === env));
  return route ? clone(route) : null;
}

export function resolveInboundRouteFromSipHeaders(headers, options = {}) {
  const dialed = dialedNumberFromSipHeaders(headers);
  if (!dialed.number) return { ok: false, status: 422, error: 'No E.164 called number found in approved SIP headers.' };
  const route = resolveInboundRouteByNumber(dialed.number, options);
  if (!route) return { ok: false, status: 404, error: 'No enabled Meridian inbound route matches the dialed number.', dialed };
  return { ok: true, route, dialed };
}
