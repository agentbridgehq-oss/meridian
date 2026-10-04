/**
 * Test guard: the unit suite must never call a live AI vendor (box keys may be
 * real but unfunded — xAI returns 403). Strips AI vendor keys from the test
 * process unless MERIDIAN_TEST_ALLOW_LIVE_AI=1. Tests that need a key set a
 * fake one and inject a mock fetch / WebSocket.
 */
if (process.env.MERIDIAN_TEST_ALLOW_LIVE_AI !== '1') {
  for (const name of ['XAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY']) delete process.env[name];
}
