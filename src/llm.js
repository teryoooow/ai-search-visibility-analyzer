// Minimal OpenAI-compatible chat-completions client (no SDK).
// Any provider implementing POST /chat/completions works:
//   OpenAI, DeepSeek, Groq, OpenRouter, Ollama, LM Studio, Azure (via baseURL).

const DEFAULT_MODEL_HINT = (baseUrl) => {
  if (/deepseek/i.test(baseUrl)) return 'deepseek-chat';
  if (/groq/i.test(baseUrl)) return 'llama-3.3-70b-versatile';
  if (/openrouter/i.test(baseUrl)) return 'openai/gpt-4o-mini';
  if (/ollama/i.test(baseUrl)) return 'qwen2.5:7b';
  if (/127\.0\.0\.1|localhost/i.test(baseUrl)) return 'qwen2.5:7b';
  return 'gpt-4o-mini';
};

/**
 * Chat completion. Config from env:
 *   GEO_LLM_API_KEY      required (or OPENAI_API_KEY fallback)
 *   GEO_LLM_BASE_URL     default https://api.openai.com/v1
 *   GEO_LLM_MODEL        default guessed from base URL
 */
export async function chatCompletion(messages, { temperature = 0.2, json = false, timeoutMs = 45000 } = {}) {
  const apiKey = process.env.GEO_LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('No LLM API key found (set GEO_LLM_API_KEY or OPENAI_API_KEY).');

  const baseUrl = (process.env.GEO_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.GEO_LLM_MODEL || DEFAULT_MODEL_HINT(baseUrl);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        messages,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LLM API error ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

/** Ask for strict JSON and recover leniently. */
export async function chatJSON(messages, opts = {}) {
  const raw = await chatCompletion(messages, { ...opts, json: true });
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`Model did not return JSON: ${raw.slice(0, 200)}`);
  }
}
