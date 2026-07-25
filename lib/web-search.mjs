/**
 * Lightweight public web search for Meridian AI Guide.
 * Prefer BRAVE_API_KEY or SERPER_API_KEY when set; else DuckDuckGo Instant Answer.
 * Never invent citations — only return what APIs provide.
 */

const UA = 'MeridianGuide/1.0 (+https://claudecraft.ca; research assistant)';

/**
 * @returns {Promise<{ ok: boolean, provider: string, query: string, answer?: string, results: Array<{title,url,snippet}>, error?: string }>}
 */
export async function webSearch(query, { max = 5 } = {}) {
  const q = String(query || '').trim().slice(0, 200);
  if (q.length < 2) return { ok: false, provider: 'none', query: q, results: [], error: 'empty query' };

  if (process.env.BRAVE_API_KEY?.trim()) {
    try {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${max}`,
        {
          headers: {
            Accept: 'application/json',
            'X-Subscription-Token': process.env.BRAVE_API_KEY.trim(),
            'User-Agent': UA,
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const results = (data.web?.results || []).slice(0, max).map((r) => ({
          title: r.title || '',
          url: r.url || '',
          snippet: r.description || '',
        }));
        return { ok: true, provider: 'brave', query: q, results, answer: data.infobox?.description || '' };
      }
    } catch (e) {
      /* fall through */
    }
  }

  if (process.env.SERPER_API_KEY?.trim()) {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': process.env.SERPER_API_KEY.trim(),
        },
        body: JSON.stringify({ q, num: max }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        const results = (data.organic || []).slice(0, max).map((r) => ({
          title: r.title || '',
          url: r.link || '',
          snippet: r.snippet || '',
        }));
        return {
          ok: true,
          provider: 'serper',
          query: q,
          results,
          answer: data.answerBox?.answer || data.answerBox?.snippet || '',
        };
      }
    } catch (e) {
      /* fall through */
    }
  }

  // DuckDuckGo Instant Answer (free, no key)
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { ok: false, provider: 'duckduckgo', query: q, results: [], error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const results = [];
    if (data.AbstractText) {
      results.push({
        title: data.Heading || q,
        url: data.AbstractURL || '',
        snippet: data.AbstractText,
      });
    }
    for (const t of data.RelatedTopics || []) {
      if (results.length >= max) break;
      if (t.Text && t.FirstURL) {
        results.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text });
      } else if (Array.isArray(t.Topics)) {
        for (const sub of t.Topics) {
          if (results.length >= max) break;
          if (sub.Text && sub.FirstURL) {
            results.push({ title: sub.Text.slice(0, 80), url: sub.FirstURL, snippet: sub.Text });
          }
        }
      }
    }
    return {
      ok: results.length > 0,
      provider: 'duckduckgo',
      query: q,
      results,
      answer: data.AbstractText || '',
      error: results.length ? undefined : 'No instant results — try a more specific question',
    };
  } catch (e) {
    return { ok: false, provider: 'duckduckgo', query: q, results: [], error: e.message };
  }
}

export function formatSearchForPrompt(search) {
  if (!search?.ok && !search?.results?.length) {
    return search?.error ? `Web search failed: ${search.error}` : 'No web results.';
  }
  const lines = [`Web search (${search.provider}) for: "${search.query}"`];
  if (search.answer) lines.push(`Summary: ${search.answer}`);
  (search.results || []).forEach((r, i) => {
    lines.push(`${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`);
  });
  return lines.join('\n');
}

/** Heuristic: freeform questions that benefit from live web facts */
export function wantsWebSearch(message) {
  const m = String(message || '').toLowerCase();
  if (m.length < 8) return false;
  if (/^(start|yes|no|hi|hello|pricing|what does|how does install)/i.test(m)) return false;
  return (
    /\b(search|look up|google|what is|who is|latest|news|current|202[4-9]|today|weather|stock|law|regulation|compare|vs\.?|best|how to)\b/i.test(
      m,
    ) || m.includes('?')
  );
}
