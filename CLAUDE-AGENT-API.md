# Meridian — Claude Agent API

Meridian client agents use **Anthropic Claude** (Messages API) as the production brain.

| Layer | Who | Key |
|-------|-----|-----|
| Customer | Calls Meridian | `mdn_…` Bearer key |
| Meridian | Calls Claude | `ANTHROPIC_API_KEY` (Railway only) |

---

## Status

```http
GET /api/brain/status
GET /health   → brain + claudeAgent
```

Live example: https://meridian-production-2eb0.up.railway.app/api/brain/status

---

## Agent turn (primary)

```http
POST /api/v1/agents/{agentId}/agent
Authorization: Bearer mdn_…
Content-Type: application/json

{
  "message": "What are your hours?",
  "history": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Hello — how can I help?" }
  ]
}
```

Alias: `POST /api/v1/agents/{agentId}/claude`

### Response

```json
{
  "ok": true,
  "reply": "We're open Mon–Fri 8–5. Want to book a time?",
  "source": "llm",
  "provider": "anthropic",
  "model": "claude-haiku-4-5-20251001",
  "usage": { "inputTokens": 120, "outputTokens": 40 },
  "latencyMs": 850
}
```

If Claude is down/missing key → `source: "fallback"` (regex brain — still answers).

---

## Related endpoints (same brain)

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/v1/agents/:id/chat` | Same Claude brain, lighter JSON |
| POST | `/api/v1/agents/:id/voice-turn` | Brain + optional `{ "audio": true }` TTS |
| POST | `/api/v1/agents/:id/widget-chat` | Public widget token |
| POST | `/api/guide-chat` | Site guide (Claude on freeform) |

---

## Env (Railway)

```bash
ANTHROPIC_API_KEY=sk-ant-…          # required for Claude
MERIDIAN_LLM_MODEL=claude-haiku-4-5-20251001   # optional
MERIDIAN_LLM_MAX_TOKENS=400
MERIDIAN_LLM_TIMEOUT_MS=12000
```

Ops usage log:

```http
GET /api/ops/claude/usage
X-Meridian-Token: $OPS_TOKEN
```

---

## Code map

- `lib/claude-agent-api.mjs` — Anthropic Messages client + usage ledger  
- `lib/agent-brain.mjs` — system prompt + smartAgentChat + fallback  
- `lib/expertise.mjs` — Voice/Sales/Booking expertise injected every spawn  
