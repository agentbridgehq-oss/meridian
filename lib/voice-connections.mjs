import { coreEnvironmentStatus } from './core-readiness.mjs';
import { voiceDemoStatus } from './voice-demo-routes.mjs';

export function publicVoiceConnections() {
  const env = coreEnvironmentStatus(), demo = voiceDemoStatus();
  const xai = env.aiProvider !== 'legacy';
  const voiceKey = xai ? env.xai.apiKeyConfigured : env.openai.apiKeyConfigured;
  const voiceWebhook = xai ? env.xai.webhookSecretConfigured : env.openai.webhookSecretConfigured;
  const phoneConfigured = voiceKey && voiceWebhook && env.twilio.accountConfigured && env.twilio.usableCredentialConfigured;
  return {
    ok: true, checkedAt: new Date().toISOString(),
    browser: { enabled:demo.enabled, available:demo.available, voice:demo.voice, model:demo.model, toolsEnabled:false },
    phone: { credentialsConfigured:phoneConfigured, liveCallVerified:null,
      provider: xai ? 'xai' : 'openai', voiceProviderConfigured:voiceKey,
      openaiConfigured:env.openai.apiKeyConfigured, xaiConfigured:env.xai.apiKeyConfigured, webhookConfigured:voiceWebhook,
      twilioAccountConfigured:env.twilio.accountConfigured, twilioCredentialConfigured:env.twilio.usableCredentialConfigured,
      note:'Credential presence is configuration only. Number routing, a real call, tool verification and client acceptance are separate deployment gates.' },
    roles: ['receptionist','booking','service','sales'].map(role=>({role,demoUrl:`/meridian-voice-demo.html?role=${role}`})),
    nextAction: xai ? (
      !env.xai.apiKeyConfigured ? 'Add XAI_API_KEY (with credits) in Railway → meridian → Variables.'
      : !env.xai.webhookSecretConfigured ? 'Register the number with POST https://api.x.ai/v2/phone-numbers (origin byo_trunk, webhook /api/xai/webhooks/realtime) and store the returned signing secret as XAI_WEBHOOK_SECRET.'
      : !phoneConfigured ? 'Point the Twilio Elastic SIP trunk origination at sip:{number}@sip.voice.x.ai;transport=tls and enable call transfer.'
      : 'Run a real inbound staging call and review private deployment acceptance evidence.'
    ) : !env.openai.apiKeyConfigured ? 'Add OPENAI_API_KEY in Railway → meridian → Variables.'
      : !demo.enabled ? 'Enable the staging browser demo on Railway.'
      : !env.openai.webhookSecretConfigured ? 'Test the browser conversation, then configure the OpenAI incoming-call webhook and signing secret.'
      : !phoneConfigured ? 'Configure the Twilio account and SIP trunk for the same OpenAI project.'
      : 'Run a real inbound staging call and review private deployment acceptance evidence.',
  };
}

export function registerVoiceConnectionRoutes(app,{publicLimiter}={}) {
  const limiter=publicLimiter || ((_req,_res,next)=>next());
  app.get('/api/voice/connections',limiter,(_req,res)=>{res.set('Cache-Control','no-store');res.json(publicVoiceConnections());});
}
