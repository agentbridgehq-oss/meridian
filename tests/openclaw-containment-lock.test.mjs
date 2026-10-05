import test from 'node:test';
import assert from 'node:assert/strict';
import { violatesContainment, containmentStatus } from '../lib/openclaw-containment.mjs';

test('OpenClaw cannot touch bank, folders, or mail', () => {
  assert.match(violatesContainment('open Documents/tax-return.pdf'), /Blocked/);
  assert.match(violatesContainment('read coinbase balance'), /Blocked/);
  assert.match(violatesContainment('open the gmail inbox'), /Blocked/);
  assert.equal(containmentStatus().mode, 'contained');
  assert.ok(containmentStatus().never.includes('ken_folders_drive'));
});
