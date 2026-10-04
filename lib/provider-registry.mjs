import { aiProvider } from './ai-provider.mjs';

const PROVIDERS = Object.freeze({
  xai: {
    id: 'xai', label: 'xAI (Grok)', kinds: ['brain'], recommended: true,
    env: ['XAI_API_KEY', 'XAI_WEBHOOK_SECRET', 'XAI_VOICE_MODEL', 'XAI_TEXT_MODEL'],
    defaults: { realtimeModel: 'grok-voice-think-fast-2.0', textModel: 'grok-4.3' },
    modes: ['realtime-sip', 'realtime-websocket', 'chat-completions'],
    verifies: ['Signed realtime.call.incoming webhook verifies', 'Model session connects and speaks approved facts', 'Tool calls reach Meridian control plane', 'Refer/hangup path is observable and recoverable'],
  },
  openai: {
    id: 'openai', label: 'OpenAI (legacy / rollback)', kinds: ['brain'], recommended: false,
    env: ['OPENAI_API_KEY', 'OPENAI_REALTIME_MODEL', 'OPENAI_TEXT_MODEL'],
    defaults: { realtimeModel: 'gpt-realtime-2.1', textModel: 'gpt-5.6-terra' },
    modes: ['realtime-sip', 'realtime-webrtc', 'responses'],
    verifies: ['Model session connects', 'Tool calls reach Meridian control plane', 'Failure path is observable and recoverable'],
  },
  'twilio-sip': {
    id: 'twilio-sip', label: 'Twilio Elastic SIP Trunking', kinds: ['telephony'], recommended: true,
    env: ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY', 'TWILIO_API_SECRET'],
    defaults: { numberFormat: 'E.164', transport: 'SIP' },
    verifies: ['Inbound PSTN call reaches SIP destination', 'Caller/called numbers remain correct', 'Failure or fallback route is tested'],
  },
  meridian: {
    id: 'meridian', label: 'Meridian Core', kinds: ['knowledge','lead_capture','source','destination'], recommended: true,
    env: [], defaults: {},
    verifies: ['Configured business truth is returned', 'Invalid input fails closed', 'Event reaches the intended internal destination once'],
  },
  resend: {
    id: 'resend', label: 'Resend', kinds: ['notifications','confirmation','messaging'], recommended: true,
    env: ['RESEND_API_KEY', 'EMAIL_FROM'], defaults: {},
    verifies: ['Approved transactional message is delivered', 'Failure is logged', 'No secret appears in customer-visible output'],
  },
  twilio: {
    id: 'twilio', label: 'Twilio Messaging', kinds: ['messaging','confirmation','notifications'], recommended: false,
    env: ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY', 'TWILIO_API_SECRET'], defaults: {},
    verifies: ['Consent-aware message is delivered', 'Opt-out behavior is honored', 'Delivery status is captured'],
  },
  'google-calendar': {
    id: 'google-calendar', label: 'Google Calendar', kinds: ['calendar'], recommended: true,
    env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], defaults: {},
    verifies: ['Availability read succeeds', 'Test booking writes once', 'Timezone and duplicate-booking guards pass'],
  },
  webhook: {
    id: 'webhook', label: 'Customer Webhook / API', kinds: ['crm','calendar','workflow','source','destination','analytics','search_reporting','cms','hosting','forms'], recommended: true,
    env: [], defaults: {},
    verifies: ['Authenticated test event succeeds', 'Duplicate delivery is idempotent', 'Timeout/failure produces an operator-visible exception'],
  },
  n8n: {
    id: 'n8n', label: 'n8n', kinds: ['workflow','crm','calendar'], recommended: true,
    env: [], defaults: {},
    verifies: ['Workflow receives a signed test event', 'Retry/error path works', 'Run history is visible to operations'],
  },
});

const DEFAULT_BY_KIND = Object.freeze({
  brain: 'xai', telephony: 'twilio-sip', knowledge: 'meridian', lead_capture: 'meridian',
  source: 'meridian', destination: 'meridian', notifications: 'resend', messaging: 'twilio',
  confirmation: 'twilio', calendar: 'google-calendar', crm: 'webhook', workflow: 'n8n',
  analytics: 'webhook', search_reporting: 'webhook', cms: 'webhook', hosting: 'webhook', forms: 'webhook',
});

function publicProvider(p) {
  return { id:p.id, label:p.label, kinds:p.kinds, recommended:p.recommended, env:p.env, defaults:p.defaults, modes:p.modes || [], verifies:p.verifies };
}

export function providerCatalog() {
  return Object.fromEntries(Object.entries(PROVIDERS).map(([id,p]) => [id, publicProvider(p)]));
}

export function providersForKind(kind) {
  return Object.values(PROVIDERS).filter(p => p.kinds.includes(kind)).map(publicProvider);
}

export function recommendedProvider(kind) {
  const id = kind === 'brain' ? (aiProvider() === 'legacy' ? 'openai' : 'xai') : DEFAULT_BY_KIND[kind];
  return id ? publicProvider(PROVIDERS[id]) : null;
}

export function validateProvider(kind, providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider || !provider.kinds.includes(kind)) return { ok:false, error:`Provider ${providerId || '(empty)'} is not registered for ${kind}.` };
  return { ok:true, provider:publicProvider(provider) };
}

export function buildDeploymentManifest(deployment, lead = null) {
  if (!deployment) return null;
  const runtime = lead?.managedRuntime || null;
  const integrations = Object.values(deployment.integrations || {}).map(integration => {
    const recommended = recommendedProvider(integration.kind);
    return {
      kind: integration.kind,
      required: integration.required,
      selectedProvider: integration.provider || null,
      recommendedProvider: recommended?.id || null,
      providerConfigured: integration.credentialConfigured,
      verificationStatus: integration.status,
      verificationEvidence: integration.evidence || '',
      requiredEnvNames: recommended?.env || [],
      checks: recommended?.verifies || [],
    };
  });
  return {
    version: 1,
    deploymentId: deployment.id,
    projectId: deployment.projectId,
    businessName: deployment.businessName,
    service: deployment.service,
    capabilities: deployment.capabilities,
    architecture: (() => {
      const legacy = aiProvider() === 'legacy';
      const textModel = legacy
        ? (process.env.OPENAI_TEXT_MODEL || PROVIDERS.openai.defaults.textModel)
        : (process.env.XAI_TEXT_MODEL || PROVIDERS.xai.defaults.textModel);
      if (!deployment.capabilities.includes('voice')) {
        return {
          inbound: `Customer system -> Meridian control plane -> ${legacy ? 'OpenAI Responses' : 'xAI chat completions'}/tools -> customer destination`,
          textModel,
        };
      }
      return {
        inbound: legacy
          ? 'PSTN -> Twilio SIP -> OpenAI Realtime -> Meridian tools/control plane'
          : 'PSTN -> Twilio Elastic SIP trunk -> xAI Grok Voice (sip.voice.x.ai) -> Meridian tools/control plane',
        browserDemo: legacy ? 'Browser -> WebRTC -> OpenAI Realtime -> Meridian tools/control plane' : 'Browser demo -> legacy OpenAI WebRTC path (xAI browser path not wired yet)',
        realtimeModel: legacy
          ? (process.env.OPENAI_REALTIME_MODEL || PROVIDERS.openai.defaults.realtimeModel)
          : (process.env.XAI_VOICE_MODEL || PROVIDERS.xai.defaults.realtimeModel),
        textModel,
        fallbackPolicy: 'Do not route production calls through an unverified fallback. Pause or use the client-approved human/legacy route.',
      };
    })(),
    controlPlane: runtime ? {
      agentId: runtime.agentId,
      endpoints: runtime.endpoints,
      provisionedAt: runtime.provisionedAt,
      role: runtime.role || 'control-plane',
    } : { agentId:null, endpoints:null, provisionedAt:null, role:'control-plane', status:'not-provisioned' },
    integrations,
    goLive: {
      canActivate: deployment.readiness?.canActivate === true,
      blockers: deployment.blockers || [],
      rollbackDocumented: deployment.rollback?.documented === true,
      clientAccepted: deployment.clientAcceptance?.accepted === true,
    },
    secretPolicy: 'Only environment-variable names and credential-present booleans belong in this manifest. Provider secret values must never be stored here.',
  };
}
