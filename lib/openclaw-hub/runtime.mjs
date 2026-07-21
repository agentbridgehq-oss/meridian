/**
 * OpenClaw Hub — Expert Gate Runtime
 *
 * EVERY agent job MUST:
 *  1. Load expert training .md from disk (fresh every run)
 *  2. Pass global (+ app) containment
 *  3. Then run the task function with expert context
 *
 * Fail closed if expert missing/empty or containment violated.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  GLOBAL_POLICY_VERSION,
  globalContainmentPreamble,
  assertGlobalSafeText,
  globalContainmentStatus,
  violatesGlobalContainment,
} from './containment.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HUB_ROOT = path.resolve(__dirname, '..');
const DEFAULT_EXPERTS = path.join(HUB_ROOT, 'experts');

/** In-memory audit (also append to log file when logDir set) */
const recentRuns = [];

/**
 * Resolve expert file path for app + agentId.
 * Search order:
 *  1. options.expertsDir / app / agentId.md
 *  2. hub experts / app / agentId.md
 *  3. options.expertsDir / shared / agentId.md
 *  4. hub experts / shared / agentId.md
 */
export function resolveExpertPath(appId, agentId, expertsDir) {
  const app = String(appId || 'shared').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const agent = String(agentId || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!agent) return null;

  const roots = [expertsDir, DEFAULT_EXPERTS].filter(Boolean).map((r) => path.resolve(r));
  const candidates = [];
  for (const root of roots) {
    candidates.push(path.join(root, app, `${agent}.md`));
    candidates.push(path.join(root, 'shared', `${agent}.md`));
  }
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/**
 * Load expert training doc — ALWAYS from disk every call (no skip).
 */
export function loadExpertTraining({ appId, agentId, expertsDir, maxChars = 48000 } = {}) {
  const expertPath = resolveExpertPath(appId, agentId, expertsDir);
  if (!expertPath) {
    const err = new Error(
      `EXPERT GATE FAIL: no training doc for agent "${agentId}" in app "${appId}". Create experts/${appId}/${agentId}.md`,
    );
    err.code = 'OPENCLAW_EXPERT_MISSING';
    throw err;
  }

  let text;
  try {
    text = fs.readFileSync(expertPath, 'utf8');
  } catch (e) {
    const err = new Error(`EXPERT GATE FAIL: cannot read ${expertPath}: ${e.message}`);
    err.code = 'OPENCLAW_EXPERT_MISSING';
    throw err;
  }

  text = String(text || '').trim();
  if (text.length < 80) {
    const err = new Error(`EXPERT GATE FAIL: expert doc too short/empty: ${expertPath}`);
    err.code = 'OPENCLAW_EXPERT_EMPTY';
    throw err;
  }

  // Policy-mode check: expert docs may list denials; block only if they instruct forbidden access
  const bad = violatesGlobalContainment(text, 'policy');
  if (bad) {
    const err = new Error(`EXPERT GATE FAIL: training doc violates containment: ${bad}`);
    err.code = 'OPENCLAW_CONTAINMENT';
    throw err;
  }

  const body = text.slice(0, maxChars);
  const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);

  return {
    ok: true,
    appId,
    agentId,
    expertPath,
    expertText: body,
    expertHash: hash,
    expertChars: body.length,
    loadedAt: new Date().toISOString(),
    policyVersion: GLOBAL_POLICY_VERSION,
  };
}

/**
 * Build full system/context block for the agent run.
 */
export function buildExpertContext(expert, { appContainmentPreamble = '', taskBrief = '' } = {}) {
  return [
    globalContainmentPreamble(),
    appContainmentPreamble ? `\n${appContainmentPreamble}\n` : '',
    '═══════════════════════════════════════════════════════════════',
    `EXPERT TRAINING — LOADED THIS RUN (required every task)`,
    `Agent: ${expert.agentId} · App: ${expert.appId}`,
    `File: ${expert.expertPath}`,
    `Hash: ${expert.expertHash} · Chars: ${expert.expertChars}`,
    `Loaded: ${expert.loadedAt}`,
    'You are NOW the expert described below. Follow it for THIS task only.',
    '═══════════════════════════════════════════════════════════════',
    '',
    expert.expertText,
    '',
    taskBrief
      ? `═══════════════════════════════════════════════════════════════\nTASK BRIEF\n═══════════════════════════════════════════════════════════════\n${taskBrief}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Run an OpenClaw agent job with mandatory expert load + containment.
 *
 * @param {object} opts
 * @param {string} opts.appId - meridian | claudecraft | giantbiteai | agentbridge | voxly
 * @param {string} opts.agentId - maps to experts/<app>/<agentId>.md
 * @param {Function} opts.taskFn - async (ctx) => result ; ctx has expert, context, payload
 * @param {object} [opts.payload]
 * @param {string} [opts.expertsDir] - app-local experts root
 * @param {string} [opts.appContainmentPreamble]
 * @param {string} [opts.taskBrief]
 * @param {Function} [opts.assertAppSafe] - extra app-level check (text) => void|throw
 * @param {string} [opts.logDir] - write audit JSON lines
 */
export async function runOpenClawAgent(opts = {}) {
  const appId = String(opts.appId || '').toLowerCase();
  const agentId = String(opts.agentId || '').toLowerCase();
  const runId = `oc_${crypto.randomBytes(6).toString('hex')}`;
  const startedAt = new Date().toISOString();

  if (!appId || !agentId) {
    throw Object.assign(new Error('runOpenClawAgent requires appId + agentId'), {
      code: 'OPENCLAW_BAD_REQUEST',
    });
  }
  if (typeof opts.taskFn !== 'function') {
    throw Object.assign(new Error('runOpenClawAgent requires taskFn'), { code: 'OPENCLAW_BAD_REQUEST' });
  }

  // 1) Global containment on payload + brief
  const probe = JSON.stringify(opts.payload || {}) + String(opts.taskBrief || '');
  assertGlobalSafeText(probe, 'job_payload');
  if (typeof opts.assertAppSafe === 'function') {
    opts.assertAppSafe(probe);
  }

  // 2) MUST load expert every time
  const expert = loadExpertTraining({
    appId,
    agentId,
    expertsDir: opts.expertsDir,
  });

  const context = buildExpertContext(expert, {
    appContainmentPreamble: opts.appContainmentPreamble || '',
    taskBrief: opts.taskBrief || '',
  });

  // 3) Context is expert policy + task — already validated in policy mode above.
  // Do not re-scan full context in strict mode (deny-lists contain the word "bank").

  const ctx = {
    runId,
    appId,
    agentId,
    expert,
    context,
    payload: opts.payload || {},
    containment: globalContainmentStatus(),
    startedAt,
  };

  let result;
  let error = null;
  try {
    result = await opts.taskFn(ctx);
  } catch (e) {
    error = e;
  }

  const finishedAt = new Date().toISOString();
  const audit = {
    runId,
    appId,
    agentId,
    expertPath: expert.expertPath,
    expertHash: expert.expertHash,
    expertLoaded: true,
    policyVersion: GLOBAL_POLICY_VERSION,
    contained: true,
    ok: !error,
    error: error ? error.message : null,
    code: error?.code || null,
    startedAt,
    finishedAt,
  };

  recentRuns.unshift(audit);
  if (recentRuns.length > 200) recentRuns.length = 200;

  if (opts.logDir) {
    try {
      fs.mkdirSync(opts.logDir, { recursive: true });
      const logFile = path.join(opts.logDir, 'openclaw-expert-runs.jsonl');
      fs.appendFileSync(logFile, JSON.stringify(audit) + '\n');
    } catch {
      /* non-fatal */
    }
  }

  if (error) throw error;

  return {
    ok: true,
    runId,
    expert: {
      path: expert.expertPath,
      hash: expert.expertHash,
      chars: expert.expertChars,
      loadedAt: expert.loadedAt,
    },
    containment: globalContainmentStatus(),
    result,
    audit,
  };
}

export function recentExpertRuns(limit = 20) {
  return recentRuns.slice(0, limit);
}

export function hubStatus() {
  return {
    hubRoot: HUB_ROOT,
    expertsDir: DEFAULT_EXPERTS,
    policyVersion: GLOBAL_POLICY_VERSION,
    containment: globalContainmentStatus(),
    expertGate: 'mandatory_every_task',
    recentRuns: recentRuns.length,
  };
}

export { GLOBAL_POLICY_VERSION, globalContainmentPreamble, globalContainmentStatus };
