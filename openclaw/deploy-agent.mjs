/**
 * OpenClaw entry — auto-deploy Meridian agents from queue or args.
 *
 * Queue file: data/deploy-queue.json
 *   { "jobs": [ { "email", "businessName", "primaryNeed", ... } ] }
 *
 * Usage:
 *   node openclaw/deploy-agent.mjs
 *   node openclaw/deploy-agent.mjs --file data/deploy-queue.json
 *   npm run openclaw:deploy
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { deployAgent } from '../lib/deploy-agent.mjs';
import {
  sanitizeOpenClawJob,
  containedWriteFile,
  assertSafePath,
  withContainment,
  containmentStatus,
} from '../lib/openclaw-containment.mjs';
import { withExpertAndContainment } from '../lib/openclaw-expert-gate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const QUEUE = path.join(DATA, 'deploy-queue.json');

function loadQueue(file) {
  assertSafePath(file, 'deploy-queue');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { jobs: [] };
  }
}

function saveQueue(file, data) {
  assertSafePath(file, 'deploy-queue-write');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Strip secrets before persist
  const clean = {
    jobs: (data.jobs || []).map((j) => {
      const { apiKey, password, secret, ...rest } = j;
      return rest;
    }),
  };
  fs.writeFileSync(file, JSON.stringify(clean, null, 2));
}

async function runOpenClawDeployInner({ queuePath = QUEUE, max = 10 } = {}) {
  const q = loadQueue(queuePath);
  const jobs = (q.jobs || []).filter((j) => !j.done && !j.skip);
  const results = [];
  const batch = jobs.slice(0, max);

  for (const job of batch) {
    try {
      const sanitized = sanitizeOpenClawJob(job);
      if (!sanitized.ok) {
        job.error = sanitized.reason;
        job.blocked = true;
        results.push({
          ok: false,
          blocked: true,
          error: sanitized.reason,
          businessName: job.businessName,
        });
        continue;
      }
      const r = await deployAgent({
        ...sanitized.job,
        source: 'openclaw_contained',
      });
      job.done = true;
      job.doneAt = new Date().toISOString();
      job.agentId = r.agentId;
      job.artifactDir = r.artifactDir;
      job.contained = true;
      // never leave apiKey in queue file
      results.push({
        ok: r.ok,
        businessName: r.businessName,
        agentId: r.agentId,
        type: r.agentType,
        artifactDir: r.artifactDir,
        contained: true,
      });
    } catch (e) {
      job.error = e.message;
      results.push({
        ok: false,
        error: e.message,
        businessName: job.businessName,
        blocked: e.code === 'OPENCLAW_CONTAINMENT',
      });
    }
  }

  q.jobs = q.jobs || [];
  saveQueue(queuePath, q);

  const report = {
    ok: true,
    processed: results.length,
    remaining: (q.jobs || []).filter((j) => !j.done && !j.skip).length,
    results,
    containment: containmentStatus(),
  };

  containedWriteFile(
    path.join(DATA, `openclaw-deploy-${new Date().toISOString().slice(0, 10)}.json`),
    JSON.stringify(report, null, 2),
  );
  return report;
}

/**
 * Expert training loaded every deploy batch; then containment cage.
 */
export async function runOpenClawDeploy(opts = {}) {
  const wrapped = await withExpertAndContainment(
    'deploy-agent',
    'openclaw.deploy',
    async (ctx) => {
      const report = await runOpenClawDeployInner(opts);
      return {
        ...report,
        expert: {
          path: ctx.expert.expertPath,
          hash: ctx.expert.expertHash,
          runId: ctx.runId,
        },
      };
    },
    {
      payload: { max: opts.max || 10 },
      taskBrief: 'Process Meridian deploy-queue jobs: provision agents + config packs only.',
    },
  );
  return wrapped.result || wrapped;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let queuePath = QUEUE;
  const idx = process.argv.indexOf('--file');
  if (idx >= 0 && process.argv[idx + 1]) queuePath = path.resolve(process.argv[idx + 1]);
  runOpenClawDeploy({ queuePath })
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
    })
    .catch((e) => {
      console.error(JSON.stringify({ ok: false, error: e.message, code: e.code }, null, 2));
      process.exit(1);
    });
}
