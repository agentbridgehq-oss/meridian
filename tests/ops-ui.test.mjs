import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);

test('operations page loads the Deployment Core workspace before the legacy project script', () => {
  const html = readFileSync(join(root.pathname, 'public', 'meridian-operations.html'), 'utf8');
  assert.match(html, /id="ops-deployments"/);
  assert.match(html, /id="deployment-status"/);
  assert.ok(html.indexOf('/js/deployment-ops.js') < html.indexOf('/js/agency-ops.js'));
});

test('deployment ops UI exposes hard-gate controls without embedding provider secrets', () => {
  const js = readFileSync(join(root.pathname, 'public', 'js', 'deployment-ops.js'), 'utf8');
  for (const marker of ['provision-runtime','/manifest','/integrations/','/checks/','/rollback','/acceptance','/activate','/pause']) assert.ok(js.includes(marker), marker);
  assert.equal(js.includes('OPENAI_API_KEY='), false);
  assert.equal(js.includes('TWILIO_API_SECRET='), false);
});
