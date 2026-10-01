import { coreEnvironmentStatus } from './core-readiness.mjs';
import { voiceDemoStatus } from './voice-demo-routes.mjs';

export function publicVoiceConnections() {
  const env = coreEnvironmentStatus(), demo = voiceDemoStatus();
  const phoneConfigured = env.openai.apiKeyConfigured && env.openai.webhookSecretConfigured && env.twilio.accountConfigured && env.twilio.usableCredentialConfigured;
  return {
    ok: true, checkedAt: new Date().toISOString(),
    browser: { enabled:demo.enabled, available:demo.available, voice:demo.voice, model:demo.model, toolsEnabled:false },
    phone: { credentialsConfigured:phoneConfigured, liveCallVerified:null,
      openaiConfigured:env.openai.apiKeyConfigured, webhookConfigured:env.openai.webhookSecretConfigured,
      twilioAccountConfigured:env.twilio.accountConfigured, twilioCredentialConfigured:env.twilio.usableCredentialConfigured,
      note:'Credential presence is configuration only. Number routing, a real call, tool verification and client acceptance are separate deployment gates.' },
    roles: ['receptionist','booking','service','sales'].map(role=>({role,demoUrl:`/meridian-voice-demo.html?role=${role}`})),
    nextAction: !env.openai.apiKeyConfigured ? 'Add OPENAI_API_KEY in Railway → meridian → Variables.'
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
