import { createRequire } from 'node:module';
import { listDeployments } from './deployment-core.mjs';

const require = createRequire(import.meta.url);

function set(name) {
  return Boolean(String(process.env[name] || '').trim());
}

function moduleAvailable(name) {
  try {
    require.resolve(name);
    return true;
  } catch {
    return false;
  }
}

function add(checks, id, ok, detail, required = true) {
  checks.push({ id, ok: Boolean(ok), required, detail });
}

export function coreEnvironmentStatus() {
  const twilioApiCredential = set('TWILIO_API_KEY') && set('TWILIO_API_SECRET');
  const twilioLegacyCredential = set('TWILIO_AUTH_TOKEN');
  const nodeMajor = Number.parseInt(String(process.versions.node || '0').split('.')[0], 10) || 0;
  return {
    runtime: {
      nodeVersion: process.versions.node,
      node22Plus: nodeMajor >= 22,
      dataDirConfigured: set('DATA_DIR') || set('MERIDIAN_DATA_DIR'),
      publicBaseUrlConfigured: set('PUBLIC_BASE_URL'),
      opsTokenConfigured: set('OPS_TOKEN') || set('ARTICLES_API_TOKEN'),
    },
    openai: {
      sdkInstalled: moduleAvailable('openai'),
      apiKeyConfigured: set('OPENAI_API_KEY'),
      webhookSecretConfigured: set('OPENAI_WEBHOOK_SECRET'),
      realtimeModel: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
      textModel: process.env.OPENAI_TEXT_MODEL || 'gpt-5.6-terra',
    },
    twilio: {
      accountConfigured: set('TWILIO_ACCOUNT_SID'),
      apiCredentialConfigured: twilioApiCredential,
      legacyAuthConfigured: twilioLegacyCredential,
      usableCredentialConfigured: twilioApiCredential || twilioLegacyCredential,
      fromNumberConfigured: set('TWILIO_FROM_NUMBER'),
    },
    notifications: { resendConfigured: set('RESEND_API_KEY'), emailFromConfigured: set('EMAIL_FROM') },
    billing: { stripeConfigured: set('STRIPE_SECRET_KEY') },
    legacy: {
      anthropicConfigured: set('ANTHROPIC_API_KEY'),
      xaiConfigured: set('XAI_API_KEY'),
      groqConfigured: set('GROQ_API_KEY'),
    },
  };
}

export function buildCoreReadinessReport() {
  const environment = coreEnvironmentStatus();
  const checks = [];
  add(checks, 'runtime.node22', environment.runtime.node22Plus, 'Current OpenAI Node SDK requires Node.js 22 or newer.');
  add(checks, 'runtime.ops_token', environment.runtime.opsTokenConfigured, 'Private Core operations require OPS_TOKEN.');
  add(checks, 'runtime.public_base_url', environment.runtime.publicBaseUrlConfigured, 'Staging/production needs a stable PUBLIC_BASE_URL.');
  add(checks, 'runtime.data_volume', environment.runtime.dataDirConfigured, 'Deployment state needs a persistent DATA_DIR / volume.');
  add(checks, 'openai.sdk', environment.openai.sdkInstalled, 'Official OpenAI Node SDK must be installed for Realtime webhook, SIP and sideband control.');
  add(checks, 'openai.api_key', environment.openai.apiKeyConfigured, 'OpenAI Realtime provider credential is required for live voice.');
  add(checks, 'openai.webhook_secret', environment.openai.webhookSecretConfigured, 'Incoming OpenAI call webhooks must be signature-verifiable.');
  add(checks, 'twilio.account', environment.twilio.accountConfigured, 'Twilio account is required for the recommended PSTN/SIP path.');
  add(checks, 'twilio.credential', environment.twilio.usableCredentialConfigured, 'Twilio needs a restricted API credential or legacy auth token for provider operations.');
  add(checks, 'notifications.resend', environment.notifications.resendConfigured, 'Recommended for operator alerts and transactional delivery.', false);
  add(checks, 'billing.stripe', environment.billing.stripeConfigured, 'Required only when this environment processes paid checkout.', false);

  const deployments = listDeployments();
  const byStatus = deployments.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1;
    return acc;
  }, {});
  const required = checks.filter(c => c.required);
  const missing = required.filter(c => !c.ok);
  const ready = deployments.filter(d => d.readiness?.canActivate === true);
  const live = deployments.filter(d => d.status === 'live');

  return {
    ok: missing.length === 0,
    stagingInfrastructureReady: missing.length === 0,
    environment,
    checks,
    missingRequired: missing.map(c => c.id),
    deployments: {
      total: deployments.length,
      ready: ready.length,
      live: live.length,
      byStatus,
      blocked: deployments.filter(d => !d.readiness?.canActivate && d.status !== 'live').map(d => ({
        id: d.id,
        businessName: d.businessName,
        status: d.status,
        blockerCount: d.blockers?.length || 0,
      })),
    },
    nextGate: missing.length
      ? `Configure required infrastructure: ${missing.map(c => c.id).join(', ')}`
      : 'Infrastructure preflight is complete. Run provider connectivity and real call acceptance tests before production activation.',
    secretPolicy: 'This report exposes presence booleans, runtime version and model names only. It never returns credential values.',
    generatedAt: new Date().toISOString(),
  };
}
