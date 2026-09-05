import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

test('coding-agent handoff does not claim the dead Railway host is live', () => {
  const server = readFileSync(join(root, 'server.mjs'), 'utf8');
  assert.equal(server.includes('Load https://meridian-production-2eb0.up.railway.app/for-claude'), false);
  assert.match(server, /productionStatus: 'down'/);
  assert.match(server, /GitHub is the source of truth/);
});

test('public guide has valid UTF-8 copy and the current production voice path', () => {
  const guide = readFileSync(join(root, 'public', 'js', 'meridian-chat.js'), 'utf8');
  for (const marker of ['Â', 'â€', 'Ã—', 'ðŸ']) assert.equal(guide.includes(marker), false, marker);
  assert.match(guide, /OpenAI Realtime voice · Twilio SIP phone routing/);
  assert.match(guide, /Production phone uses OpenAI Realtime with Twilio SIP/);
});
