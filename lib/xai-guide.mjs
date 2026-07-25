/**
 * Meridian site guide via xAI (Grok) chat — high quality public assistant.
 * Uses XAI_API_KEY (same key as TTS). Optional web-search context injected.
 */

const CHAT_URL = (process.env.XAI_CHAT_URL || 'https://api.x.ai/v1/chat/completions').replace(/\/$/, '');
const DEFAULT_MODEL = process.env.XAI_GUIDE_MODEL || process.env.XAI_MODEL || 'grok-3-mini';

export function xaiGuideConfigured() {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

/**
 * @returns {Promise<{ ok: boolean, reply?: string, model?: string, error?: string }>}
 */
export async function callXaiGuide({ message, history = [], systemExtra = '', searchContext = '' } = {}) {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) return { ok: false, error: 'XAI_API_KEY not set' };

  const system = `You are Meridian AI — the live on-site guide for Meridian Agency.
Products: Voice Agent (24/7 phone), Sales Agent (lead follow-up), Booking Agent (calendar).
Pricing (honest, no fake social proof): kits $497 each; full stack $997; done-for-you installs higher; Voice Premium uses metered xAI speech.
Phone stack: Retell/Vapi/Bland speaks; Meridian holds the business brain.
CASL: consent before email; never spam; no fake stats or patents.
You can help: explain products, compare options, walk install, and start onboarding (tell them to say "start" or use Deploy in the panel).
When web search notes are provided, use them and cite sources briefly. If search is empty, say you don't have live sources rather than inventing facts.
Be concise, professional, warm. Prefer short paragraphs.
${systemExtra}
${searchContext ? `\n--- LIVE WEB NOTES ---\n${searchContext}\n--- END ---` : ''}`.trim();

  const messages = [{ role: 'system', content: system }];
  for (const h of (history || []).slice(-10)) {
    const role = h.role === 'assistant' || h.role === 'ai' ? 'assistant' : 'user';
    const content = String(h.content || '').slice(0, 1500);
    if (content) messages.push({ role, content });
  }
  messages.push({ role: 'user', content: String(message || '').slice(0, 2000) });

  try {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        temperature: 0.5,
        max_tokens: Number(process.env.XAI_GUIDE_MAX_TOKENS || 450),
      }),
      signal: AbortSignal.timeout(25000),
    });
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, error: `xAI ${res.status}: ${body.slice(0, 180)}` };
    }
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return { ok: false, error: 'bad xAI JSON' };
    }
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) return { ok: false, error: 'empty xAI reply' };
    return { ok: true, reply, model: data.model || DEFAULT_MODEL };
  } catch (e) {
    return { ok: false, error: e.message || 'xAI guide failed' };
  }
}
