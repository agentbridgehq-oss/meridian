/**
 * OpenClaw-wired Meridian content articles
 * Every run loads experts/meridian/content-articles.md first (fail closed).
 */

import { withExpertAndContainment } from './openclaw-expert-gate.mjs';
import {
  runArticleCycle,
  maybeRunScheduledCycle,
  draftArticle,
  vetArticle,
  fixArticle,
  publishArticle,
  articlesStatus,
} from './articles.mjs';

/**
 * Full draft → vet → fix loop under content-articles expert.
 */
export async function runOpenClawArticles(opts = {}) {
  const wrapped = await withExpertAndContainment(
    'content-articles',
    'openclaw.content_articles',
    async (ctx) => {
      const result = await runArticleCycle({
        topic: opts.topic,
        autoPublish: opts.autoPublish,
      });
      return {
        ...result,
        openclaw: {
          agentId: 'content-articles',
          expertPath: ctx.expert.expertPath,
          expertHash: ctx.expert.expertHash,
          runId: ctx.runId,
          contained: true,
        },
      };
    },
    {
      payload: {
        topic: opts.topic || null,
        autoPublish: Boolean(opts.autoPublish),
      },
      taskBrief:
        opts.taskBrief ||
        'Meridian insights: draft long-form → Claude vet → fix if needed → ready for ops publish. Never auto-post social. No fake testimonials.',
    },
  );
  return wrapped.result || wrapped;
}

/**
 * Interval-aware cycle (2.5 days default) under expert gate.
 */
export async function runOpenClawArticlesScheduled() {
  const wrapped = await withExpertAndContainment(
    'content-articles',
    'openclaw.content_articles_cron',
    async (ctx) => {
      const result = await maybeRunScheduledCycle();
      return {
        ...result,
        openclaw: {
          agentId: 'content-articles',
          expertPath: ctx.expert.expertPath,
          expertHash: ctx.expert.expertHash,
          runId: ctx.runId,
          contained: true,
        },
      };
    },
    {
      taskBrief:
        'Scheduled insights cycle if interval elapsed. Expert gate mandatory. Publish stays ops-gated unless MERIDIAN_ARTICLES_AUTO_PUBLISH=1.',
    },
  );
  return wrapped.result || wrapped;
}

/** Single-step ops under expert (draft / vet / fix still expert-gated). */
export async function runOpenClawArticleStep(step, { articleId, topic, force } = {}) {
  const allowed = new Set(['draft', 'vet', 'fix', 'publish', 'status', 'cycle']);
  if (!allowed.has(step)) {
    return { ok: false, error: `Unknown step ${step}`, allowed: [...allowed] };
  }

  return withExpertAndContainment(
    'content-articles',
    `openclaw.articles.${step}`,
    async (ctx) => {
      let result;
      if (step === 'status') result = { ok: true, ...articlesStatus() };
      else if (step === 'cycle') result = await runArticleCycle({ topic, autoPublish: force === true });
      else if (step === 'draft') result = await draftArticle({ topic });
      else if (step === 'vet') result = await vetArticle(articleId);
      else if (step === 'fix') result = await fixArticle(articleId);
      else if (step === 'publish') result = publishArticle(articleId, { source: 'ops' });
      return {
        ...result,
        openclaw: {
          agentId: 'content-articles',
          step,
          expertPath: ctx.expert.expertPath,
          expertHash: ctx.expert.expertHash,
          runId: ctx.runId,
        },
      };
    },
    {
      payload: { step, articleId: articleId || null, topic: topic || null },
      taskBrief: `Article step: ${step}`,
    },
  ).then((w) => w.result || w);
}
