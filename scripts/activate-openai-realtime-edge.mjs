import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = path.join(root, 'server.mjs');
const packagePath = path.join(root, 'package.json');
const testPath = path.join(root, 'tests', 'server-openai-webhook-order.test.mjs');

const importLine = "import { registerOpenAIRealtimeWebhookRoute } from './lib/openai-webhook-route.mjs';";
const importAnchor = "import { renderServicePage } from './lib/agency-pages.mjs';";
const jsonMarker = "app.use(express.json({ limit: '2mb' }));";
const registration = `// OpenAI Realtime webhook MUST stay before express.json().\n// Signature verification requires the untouched raw JSON request body.\nregisterOpenAIRealtimeWebhookRoute(app, {\n  environment: process.env.MERIDIAN_VOICE_ENVIRONMENT || 'staging',\n  requireSideband: true,\n});\n\n`;

let server = fs.readFileSync(serverPath, 'utf8');

if (!server.includes(importLine)) {
  if (!server.includes(importAnchor)) throw new Error('Could not find agency-pages import anchor in server.mjs');
  server = server.replace(importAnchor, `${importAnchor}\n${importLine}`);
}

if (!server.includes('registerOpenAIRealtimeWebhookRoute(app,')) {
  if (!server.includes(jsonMarker)) throw new Error('Could not find express.json marker in server.mjs');
  server = server.replace(jsonMarker, `${registration}${jsonMarker}`);
}

const registerIndex = server.indexOf('registerOpenAIRealtimeWebhookRoute(app,');
const jsonIndex = server.indexOf(jsonMarker);
const stripeIndex = server.indexOf("app.post('/api/stripe/webhook'");
if (registerIndex < 0 || jsonIndex < 0 || registerIndex > jsonIndex) {
  throw new Error('OpenAI Realtime webhook registration is not before express.json().');
}
if (stripeIndex < 0 || stripeIndex > jsonIndex) {
  throw new Error('Stripe raw webhook route unexpectedly moved behind express.json().');
}
fs.writeFileSync(serverPath, server);

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.engines = { ...(pkg.engines || {}), node: '>=22' };
pkg.dependencies = { ...(pkg.dependencies || {}), openai: '7.10.0' };
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

const test = `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\nimport { join } from 'node:path';\n\nconst root = new URL('..', import.meta.url).pathname;\n\ntest('OpenAI Realtime raw webhook is registered before JSON parsing', () => {\n  const server = readFileSync(join(root, 'server.mjs'), 'utf8');\n  const importLine = \"import { registerOpenAIRealtimeWebhookRoute } from './lib/openai-webhook-route.mjs';\";\n  const registration = 'registerOpenAIRealtimeWebhookRoute(app,';\n  const jsonParser = \"app.use(express.json({ limit: '2mb' }));\";\n  const stripeWebhook = \"app.post('/api/stripe/webhook'\";\n\n  assert.ok(server.includes(importLine), 'Realtime webhook registrar import missing');\n  const registrationIndex = server.indexOf(registration);\n  const jsonIndex = server.indexOf(jsonParser);\n  const stripeIndex = server.indexOf(stripeWebhook);\n  assert.ok(registrationIndex >= 0, 'Realtime webhook registration missing');\n  assert.ok(jsonIndex >= 0, 'Express JSON parser missing');\n  assert.ok(registrationIndex < jsonIndex, 'Realtime webhook must receive raw body before express.json');\n  assert.ok(stripeIndex >= 0 && stripeIndex < jsonIndex, 'Stripe raw webhook ordering must remain intact');\n});\n\ntest('Meridian runtime declares Node 22 and the official OpenAI SDK', () => {\n  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));\n  assert.equal(pkg.engines?.node, '>=22');\n  assert.equal(pkg.dependencies?.openai, '7.10.0');\n});\n`;
fs.writeFileSync(testPath, test);

console.log('OpenAI Realtime edge migration prepared. Run npm install to regenerate package-lock.json.');
