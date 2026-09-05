#!/usr/bin/env node
/**
 * Meridian go-live preflight.
 * Prints presence booleans only. Never prints secret values.
 *
 * Usage:
 *   node scripts/go-live.mjs
 *   node scripts/go-live.mjs --url https://your-app.up.railway.app
 */
import { buildCoreReadinessReport } from '../lib/core-readiness.mjs';

const args = process.argv.slice(2);
const urlFlag = args.indexOf('--url');
const urlFromArgs = urlFlag >= 0 ? String(args[urlFlag + 1] || '').trim() : '';
const base = (urlFromArgs || process.env.PUBLIC_BASE_URL || process.env.MERIDIAN_PUBLIC_URL || '')
  .trim()
  .replace(/\/$/, '');

function pathStatus(probe) {
  return {
    path: probe.path,
    ok: probe.status >= 200 && probe.status < 300,
    status: probe.status,
    error: probe.error || null,
    snippet: probe.body ? String(probe.body).slice(0, 180) : null,
  };
}

async function probe(pathname) {
  const target = `${base}${pathname}`;
  const started = Date.now();
  try {
    const res = await fetch(target, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(12000) });
    const body = await res.text();
    return { path: pathname, status: res.status, ms: Date.now() - started, body };
  } catch (err) {
    return { path: pathname, status: 0, ms: Date.now() - started, error: err.message, body: '' };
  }
}

const report = buildCoreReadinessReport();
const probes = [];

if (base) {
  for (const pathname of ['/healthz', '/health', '/api/voice-demo/status']) {
    probes.push(pathStatus(await probe(pathname)));
  }
}

const health = probes.find(p => p.path === '/healthz') || probes.find(p => p.path === '/health');
const healthOk = Boolean(health?.ok);
const appMissing = probes.some(p => p.snippet && p.snippet.includes('Application not found'));

const out = {
  ok: report.stagingInfrastructureReady && (!base || healthOk),
  generatedAt: new Date().toISOString(),
  publicBaseUrl: base || null,
  infrastructure: {
    stagingInfrastructureReady: report.stagingInfrastructureReady,
    missingRequired: report.missingRequired,
    nextGate: report.nextGate,
  },
  probes: base ? probes : [],
  diagnosis: !base
    ? 'No PUBLIC_BASE_URL / --url. Env preflight only. Railway service still has to exist before a public probe can pass.'
    : appMissing
      ? 'Railway returned Application not found. The service or domain is gone. Recreate the meridian service, attach a domain, set secrets, then rerun this script.'
      : healthOk
        ? 'Process is reachable. Next is a real Twilio staging call, not more code.'
        : 'URL reachable but health did not return 2xx. Check Railway logs and Node 22 boot.',
  humanRemaining: [
    'Open Railway project meridian and confirm a running service exists',
    'Attach a public domain and set PUBLIC_BASE_URL to that exact origin',
    'Set OPENAI_API_KEY, OPENAI_WEBHOOK_SECRET, OPS_TOKEN, DATA_DIR=/data',
    'Add GitHub secret RAILWAY_TOKEN so Actions can redeploy without chat credentials',
    'Configure one Twilio staging DID only after /healthz returns 200',
  ],
};

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
if (!out.ok) process.exitCode = 1;
