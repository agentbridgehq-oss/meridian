import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCoreReadinessReport } from '../lib/core-readiness.mjs';

const envNames = [
  'DATA_DIR','MERIDIAN_DATA_DIR','PUBLIC_BASE_URL','OPS_TOKEN','ARTICLES_API_TOKEN',
  'OPENAI_API_KEY','OPENAI_WEBHOOK_SECRET','OPENAI_REALTIME_MODEL','OPENAI_TEXT_MODEL',
  'TWILIO_ACCOUNT_SID','TWILIO_API_KEY','TWILIO_API_SECRET','TWILIO_AUTH_TOKEN','TWILIO_FROM_NUMBER',
  'RESEND_API_KEY','EMAIL_FROM','STRIPE_SECRET_KEY','ANTHROPIC_API_KEY','XAI_API_KEY','GROQ_API_KEY',
  'MERIDIAN_DEPLOYMENT_CORE_FILE','MERIDIAN_AI_PROVIDER','XAI_WEBHOOK_SECRET','XAI_VOICE_MODEL','XAI_TEXT_MODEL',
];

function snapshotEnv() {
  return Object.fromEntries(envNames.map(name => [name, process.env[name]]));
}
function restoreEnv(snapshot) {
  for (const name of envNames) {
    if (snapshot[name] === undefined) delete process.env[name]; else process.env[name] = snapshot[name];
  }
}

test('rollback (legacy): readiness reports missing live voice infrastructure without exposing values', () => {
  const previous = snapshotEnv();
  const dir = mkdtempSync(join(tmpdir(), 'meridian-core-ready-'));
  try {
    for (const name of envNames) delete process.env[name];
    process.env.MERIDIAN_AI_PROVIDER = 'legacy';
    process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = join(dir, 'deployment-core.json');
    const report = buildCoreReadinessReport();
    assert.equal(report.stagingInfrastructureReady, false);
    for (const expected of ['runtime.ops_token','runtime.public_base_url','runtime.data_volume','openai.api_key','openai.webhook_secret','twilio.account','twilio.credential']) {
      assert.ok(report.missingRequired.includes(expected), expected);
    }
    assert.equal(report.environment.runtime.node22Plus, true);
    assert.equal(report.environment.openai.sdkInstalled, true);
    assert.equal(report.missingRequired.includes('runtime.node22'), false);
    assert.equal(report.missingRequired.includes('openai.sdk'), false);
    assert.equal(report.environment.openai.apiKeyConfigured, false);
    assert.equal(report.environment.openai.realtimeModel, 'gpt-realtime-2.1');
  } finally {
    restoreEnv(previous); rmSync(dir, { recursive:true, force:true });
  }
});

test('rollback (legacy): readiness becomes infrastructure-ready with required secret presence and never returns secret contents', () => {
  const previous = snapshotEnv();
  const dir = mkdtempSync(join(tmpdir(), 'meridian-core-ready-'));
  const secretValues = ['ops-secret-value','openai-secret-value','webhook-secret-value','twilio-secret-value'];
  try {
    for (const name of envNames) delete process.env[name];
    process.env.MERIDIAN_AI_PROVIDER = 'legacy';
    process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = join(dir, 'deployment-core.json');
    process.env.DATA_DIR = dir;
    process.env.PUBLIC_BASE_URL = 'https://staging.example.invalid';
    process.env.OPS_TOKEN = secretValues[0];
    process.env.OPENAI_API_KEY = secretValues[1];
    process.env.OPENAI_WEBHOOK_SECRET = secretValues[2];
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_IDENTIFIER';
    process.env.TWILIO_API_KEY = 'SK_TEST_IDENTIFIER';
    process.env.TWILIO_API_SECRET = secretValues[3];
    const report = buildCoreReadinessReport();
    assert.equal(report.stagingInfrastructureReady, true);
    assert.deepEqual(report.missingRequired, []);
    assert.equal(report.environment.runtime.node22Plus, true);
    const nodeMajor = Number.parseInt(report.environment.runtime.nodeVersion, 10);
    assert.ok(nodeMajor >= 22, `expected Node.js 22+, received ${report.environment.runtime.nodeVersion}`);
    assert.equal(report.environment.openai.sdkInstalled, true);
    assert.equal(report.environment.openai.apiKeyConfigured, true);
    assert.equal(report.environment.twilio.usableCredentialConfigured, true);
    const serialized = JSON.stringify(report);
    for (const secret of secretValues) assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes('AC_TEST_IDENTIFIER'), false);
    assert.equal(serialized.includes('SK_TEST_IDENTIFIER'), false);
  } finally {
    restoreEnv(previous); rmSync(dir, { recursive:true, force:true });
  }
});

test('xAI default: readiness requires XAI_API_KEY + XAI_WEBHOOK_SECRET (not OpenAI) and never returns secret contents', () => {
  const previous = snapshotEnv();
  const dir = mkdtempSync(join(tmpdir(), 'meridian-core-ready-'));
  const secretValues = ['ops-secret-value','xai-secret-value','xai-webhook-secret-value','twilio-secret-value'];
  try {
    for (const name of envNames) delete process.env[name];
    process.env.MERIDIAN_DEPLOYMENT_CORE_FILE = join(dir, 'deployment-core.json');
    let report = buildCoreReadinessReport();
    assert.equal(report.environment.aiProvider, 'xai');
    for (const expected of ['xai.api_key','xai.webhook_secret']) assert.ok(report.missingRequired.includes(expected), expected);
    assert.equal(report.missingRequired.includes('openai.api_key'), false);
    assert.equal(report.environment.xai.voiceModel, 'grok-voice-think-fast-2.0');
    assert.equal(report.environment.xai.textModel, 'grok-4.3');

    process.env.DATA_DIR = dir;
    process.env.PUBLIC_BASE_URL = 'https://staging.example.invalid';
    process.env.OPS_TOKEN = secretValues[0];
    process.env.XAI_API_KEY = secretValues[1];
    process.env.XAI_WEBHOOK_SECRET = secretValues[2];
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_IDENTIFIER';
    process.env.TWILIO_API_KEY = 'SK_TEST_IDENTIFIER';
    process.env.TWILIO_API_SECRET = secretValues[3];
    report = buildCoreReadinessReport();
    assert.deepEqual(report.missingRequired, []);
    assert.equal(report.stagingInfrastructureReady, true);
    const serialized = JSON.stringify(report);
    for (const secret of secretValues) assert.equal(serialized.includes(secret), false);
  } finally {
    restoreEnv(previous); rmSync(dir, { recursive:true, force:true });
  }
});
