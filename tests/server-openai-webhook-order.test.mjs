import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

test('OpenAI Realtime raw webhook is registered before JSON parsing', () => {
  const server = readFileSync(join(root, 'server.mjs'), 'utf8');
  const importLine = "import { registerOpenAIRealtimeWebhookRoute } from './lib/openai-webhook-route.mjs';";
  const registration = 'registerOpenAIRealtimeWebhookRoute(app,';
  const jsonParser = "app.use(express.json({ limit: '2mb' }));";
  const stripeWebhook = "app.post('/api/stripe/webhook'";

  assert.ok(server.includes(importLine), 'Realtime webhook registrar import missing');
  const registrationIndex = server.indexOf(registration);
  const jsonIndex = server.indexOf(jsonParser);
  const stripeIndex = server.indexOf(stripeWebhook);
  assert.ok(registrationIndex >= 0, 'Realtime webhook registration missing');
  assert.ok(jsonIndex >= 0, 'Express JSON parser missing');
  assert.ok(registrationIndex < jsonIndex, 'Realtime webhook must receive raw body before express.json');
  assert.ok(stripeIndex >= 0 && stripeIndex < jsonIndex, 'Stripe raw webhook ordering must remain intact');
});

test('Meridian runtime declares Node 22 and the official OpenAI SDK', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.engines?.node, '>=22');
  assert.equal(pkg.dependencies?.openai, '7.10.0');
});
