/**
 * Meridian OpenClaw Expert Gate
 * Every OpenClaw task MUST load experts/<app>/<agent>.md before running.
 * Combines global hub containment + Meridian cage.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import {
  runOpenClawAgent,
  loadExpertTraining,
  hubStatus,
  recentExpertRuns,
  GLOBAL_POLICY_VERSION,
} from './openclaw-hub/runtime.mjs';
import {
  containmentPreamble,
  containmentStatus,
  assertSafeText,
  withContainment,
} from './openclaw-containment.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MERIDIAN_EXPERTS = path.resolve(__dirname, '..', 'openclaw', 'experts');
const MERIDIAN_DATA =
  process.env.DATA_DIR || process.env.MERIDIAN_DATA_DIR || path.resolve(__dirname, '..', 'data');

export function meridianExpertsDir() {
  return MERIDIAN_EXPERTS;
}

/**
 * Run a Meridian OpenClaw agent with mandatory expert training load.
 * @param {string} agentId - e.g. daily-ops | deploy-agent | install-pack
 * @param {Function} taskFn - async (ctx) => result
 * @param {object} [payload]
 * @param {string} [taskBrief]
 */
export async function runMeridianOpenClaw(agentId, taskFn, { payload = {}, taskBrief = '' } = {}) {
  return runOpenClawAgent({
    appId: 'meridian',
    agentId,
    taskFn,
    payload,
    taskBrief,
    expertsDir: MERIDIAN_EXPERTS,
    appContainmentPreamble: containmentPreamble(),
    assertAppSafe: (text) => assertSafeText(text, 'meridian_job'),
    logDir: path.join(MERIDIAN_DATA, 'openclaw-audit'),
  });
}

/**
 * Preflight: prove expert loads (for health/status).
 */
export function preflightExpert(agentId) {
  return loadExpertTraining({
    appId: 'meridian',
    agentId,
    expertsDir: MERIDIAN_EXPERTS,
  });
}

export function expertGateStatus() {
  const agents = [
    'daily-ops',
    'deploy-agent',
    'install-pack',
    'health-probe',
    'sales-pipeline',
    'usage-report',
    'knowledge-refresh',
    'content-articles',
    'outreach-casl',
  ];
  const loaded = [];
  const failed = [];
  for (const id of agents) {
    try {
      const e = preflightExpert(id);
      loaded.push({ id, path: e.expertPath, hash: e.expertHash, chars: e.expertChars });
    } catch (err) {
      failed.push({ id, error: err.message, code: err.code });
    }
  }
  return {
    ok: failed.length === 0,
    product: 'meridian',
    policyVersion: GLOBAL_POLICY_VERSION,
    expertGate: 'mandatory_every_task',
    expertsDir: MERIDIAN_EXPERTS,
    hub: hubStatus(),
    containment: containmentStatus(),
    experts: { loaded, failed },
    recentRuns: recentExpertRuns(15),
  };
}

/**
 * Wrap legacy inner function with expert gate + containment.
 */
export async function withExpertAndContainment(agentId, label, fn, opts = {}) {
  return runMeridianOpenClaw(
    agentId,
    async (ctx) => {
      // Stamp expert context into process env for this tick (debug only, no secrets)
      process.env.OPENCLAW_LAST_EXPERT = ctx.expert.expertPath;
      process.env.OPENCLAW_LAST_EXPERT_HASH = ctx.expert.expertHash;
      process.env.OPENCLAW_LAST_RUN_ID = ctx.runId;
      // Nested containment — withContainment returns a function; invoke immediately
      const guarded = withContainment(label || agentId, async () => fn(ctx));
      return guarded();
    },
    opts,
  );
}

export { loadExpertTraining, runOpenClawAgent, GLOBAL_POLICY_VERSION };
