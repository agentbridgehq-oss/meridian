import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderServicePage } from '../lib/agency-pages.mjs';

const root = new URL('..', import.meta.url).pathname;

test('Try Voice page uses the isolated Realtime browser client', () => {
  const html = readFileSync(join(root, 'public', 'meridian-voice-demo.html'), 'utf8');
  assert.match(html, /id="voice-demo-consent"/);
  assert.match(html, /id="voice-demo-start"/);
  assert.match(html, /id="voice-demo-stop"/);
  assert.match(html, /id="voice-demo-audio"/);
  assert.ok(html.includes('/js/realtime-voice-demo.js'));
  assert.equal(html.includes('/js/voice-demo.js'), false);
  assert.match(html, /Do not share passwords/);
});

test('Realtime demo client keeps OpenAI credentials and session policy off the browser', () => {
  const js = readFileSync(join(root, 'public', 'js', 'realtime-voice-demo.js'), 'utf8');
  for (const marker of ['getUserMedia', 'RTCPeerConnection', '/api/voice-demo/status', '/api/voice-demo/session', 'setRemoteDescription']) {
    assert.ok(js.includes(marker), marker);
  }
  assert.equal(js.includes('api.openai.com'), false);
  assert.equal(js.includes('OPENAI_API_KEY'), false);
  assert.equal(js.includes('sk-proj-'), false);
  assert.equal(js.includes('deploymentId:'), false);
  assert.equal(js.includes("type: 'session.update'"), false);
  assert.equal(js.includes('tools:'), false);
});

test('managed Voice service points prospects to the new Realtime demo instead of the legacy voice page', () => {
  const html = renderServicePage('voice');
  assert.ok(html.includes('/meridian-voice-demo.html'));
  assert.ok(html.includes('Try the Voice demo'));
  assert.equal(html.includes('/agent-voice.html'), false);
});
