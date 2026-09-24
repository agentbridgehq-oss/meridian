let clientPromise = null;

function configured(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0;
}

export function openAIProviderStatus() {
  return {
    sdkInstalledAtRuntime: null,
    apiKeyConfigured: configured('OPENAI_API_KEY'),
    webhookSecretConfigured: configured('OPENAI_WEBHOOK_SECRET'),
    realtimeModel: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
  };
}

async function client() {
  if (!configured('OPENAI_API_KEY')) {
    const error = new Error('OPENAI_API_KEY is not configured in the runtime environment.');
    error.code = 'openai_api_key_missing';
    throw error;
  }
  if (!clientPromise) {
    clientPromise = import('openai')
      .then(({ default: OpenAI }) => new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        webhookSecret: process.env.OPENAI_WEBHOOK_SECRET || undefined,
      }))
      .catch(error => {
        clientPromise = null;
        const wrapped = new Error('The current OpenAI Node SDK is not installed in this runtime yet.');
        wrapped.code = 'openai_sdk_missing';
        wrapped.cause = error;
        throw wrapped;
      });
  }
  return clientPromise;
}

export async function verifyOpenAIWebhook(rawBody, headers) {
  if (!configured('OPENAI_WEBHOOK_SECRET')) {
    const error = new Error('OPENAI_WEBHOOK_SECRET is not configured in the runtime environment.');
    error.code = 'openai_webhook_secret_missing';
    throw error;
  }
  if (typeof rawBody !== 'string' || rawBody.length === 0) {
    const error = new Error('OpenAI webhook verification requires the unparsed raw JSON body.');
    error.code = 'openai_webhook_raw_body_missing';
    throw error;
  }
  const sdk = await client();
  return sdk.webhooks.unwrap(rawBody, headers);
}

export async function createOpenAIRealtimeWebRTCCall({ sdp, session }) {
  const sdk = await client();
  const response = await sdk.realtime.calls.create({ sdp, session });
  const answerSdp = await response.text();
  const location = response.headers?.get?.('location') || '';
  const callId = /\/realtime\/calls\/([^/?#]+)/.exec(location)?.[1] || '';
  return {
    ok: true,
    answerSdp,
    callId,
  };
}

export async function acceptOpenAIRealtimeCall({ callId, body }) {
  const sdk = await client();
  await sdk.realtime.calls.accept(callId, body);
  return { ok: true, callId };
}

export async function rejectOpenAIRealtimeCall({ callId, statusCode = 603 }) {
  const sdk = await client();
  await sdk.realtime.calls.reject(callId, { status_code: statusCode });
  return { ok: true, callId, statusCode };
}

export async function referOpenAIRealtimeCall({ callId, targetUri }) {
  const sdk = await client();
  await sdk.realtime.calls.refer(callId, { target_uri: targetUri });
  return { ok: true, callId, targetUri };
}

export async function hangupOpenAIRealtimeCall({ callId }) {
  const sdk = await client();
  await sdk.realtime.calls.hangup(callId);
  return { ok: true, callId };
}
