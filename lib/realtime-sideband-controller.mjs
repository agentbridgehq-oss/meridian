import { normalizeE164 } from './inbound-routing.mjs';
import { referOpenAIRealtimeCall } from './openai-provider-adapter.mjs';
import { executeRealtimeTool } from './realtime-tool-gateway.mjs';

const MAX_ARGUMENT_BYTES = 64 * 1024;

function safeOutput(value) {
  try { return JSON.stringify(value); }
  catch { return JSON.stringify({ ok: false, code: 'tool_output_invalid', message: 'Tool output could not be serialized.' }); }
}

function outputEvents(functionCallId, result) {
  return [
    {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: functionCallId,
        output: safeOutput(result),
      },
    },
    { type: 'response.create' },
  ];
}

function parseArguments(raw) {
  if (typeof raw !== 'string') return { ok: false, result: { ok: false, code: 'invalid_arguments', message: 'Tool arguments were not a JSON string.' } };
  if (Buffer.byteLength(raw, 'utf8') > MAX_ARGUMENT_BYTES)
    return { ok: false, result: { ok: false, code: 'arguments_too_large', message: 'Tool arguments exceeded the allowed size.' } };
  try {
    const value = JSON.parse(raw || '{}');
    if (!value || Array.isArray(value) || typeof value !== 'object')
      return { ok: false, result: { ok: false, code: 'invalid_arguments', message: 'Tool arguments must be a JSON object.' } };
    return { ok: true, value };
  } catch {
    return { ok: false, result: { ok: false, code: 'invalid_arguments', message: 'Tool arguments were not valid JSON.' } };
  }
}

function transferUri(destination) {
  const number = normalizeE164(destination);
  return number ? `tel:${number}` : '';
}

export function createRealtimeSidebandController({
  deploymentId,
  sessionCallId,
  executeTool = executeRealtimeTool,
  referCall = referOpenAIRealtimeCall,
} = {}) {
  const toolNames = new Map();
  const processedCalls = new Set();

  async function handleServerEvent(event = {}) {
    if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
      const functionCallId = String(event.item.call_id || '');
      const name = String(event.item.name || '');
      if (functionCallId && name) toolNames.set(functionCallId, name);
      return { ok: true, handled: true, clientEvents: [] };
    }

    if (event.type !== 'response.function_call_arguments.done') {
      return { ok: true, handled: false, clientEvents: [] };
    }

    const functionCallId = String(event.call_id || '');
    if (!functionCallId) {
      return { ok: false, handled: true, clientEvents: [], error: 'Function-call event is missing call_id.' };
    }
    if (processedCalls.has(functionCallId)) {
      return { ok: true, handled: true, duplicate: true, clientEvents: [] };
    }
    processedCalls.add(functionCallId);

    const name = String(event.name || toolNames.get(functionCallId) || '');
    if (!name) {
      const result = { ok: false, code: 'tool_name_missing', message: 'The requested tool could not be identified.' };
      return { ok: false, handled: true, toolResult: result, clientEvents: outputEvents(functionCallId, result) };
    }

    const parsed = parseArguments(event.arguments);
    if (!parsed.ok) {
      return { ok: false, handled: true, toolName: name, toolResult: parsed.result, clientEvents: outputEvents(functionCallId, parsed.result) };
    }

    let result;
    try {
      result = await executeTool({ deploymentId, name, arguments: parsed.value });
    } catch {
      result = { ok: false, code: 'tool_execution_failed', message: 'The Meridian tool could not be completed.' };
    }

    if (result?.ok && result.action === 'provider_refer_required') {
      const targetUri = transferUri(result.destination);
      if (!sessionCallId || !targetUri) {
        result = {
          ok: false,
          code: 'provider_refer_not_authorized',
          message: 'The transfer destination or active call identifier is not valid for a provider transfer.',
          transferConfirmed: false,
        };
      } else {
        try {
          await referCall({ callId: sessionCallId, targetUri });
          result = {
            ok: true,
            action: 'transferred',
            transferConfirmed: true,
            interactionId: result.interactionId,
            message: 'The provider confirmed that the SIP REFER request was accepted.',
          };
        } catch {
          result = {
            ok: false,
            code: 'provider_refer_failed',
            message: 'The provider could not complete the transfer. Do not tell the caller that the transfer succeeded.',
            transferConfirmed: false,
          };
        }
      }
    }

    return {
      ok: result?.ok === true,
      handled: true,
      toolName: name,
      toolResult: result,
      clientEvents: outputEvents(functionCallId, result),
    };
  }

  return {
    handleServerEvent,
    snapshot() {
      return {
        deploymentId: String(deploymentId || ''),
        sessionCallId: String(sessionCallId || ''),
        trackedToolCalls: toolNames.size,
        processedToolCalls: processedCalls.size,
      };
    },
  };
}
