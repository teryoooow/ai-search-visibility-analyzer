# Enable the AI (GEO LLM analysis) — 30 seconds

The analyzer has **two layers**:

1. **Deterministic core** (38 SEO/AEO/GEO checks, scoring, Lighthouse, screenshots) — runs
   with **zero keys**, always.
2. **GEO LLM analysis — the AI layer, built in and always on** — an actual LLM reads the page the
   way ChatGPT/Perplexity would and reports: *would it identify, trust, and cite this page?* It
   runs on **every** analysis as soon as one API key is configured. It never changes a score — it
   is a labeled generative-engine read on top of the deterministic core.

**This page makes step 2 work in 30 seconds.** You need any **OpenAI-compatible API key**
(OpenAI, DeepSeek, Groq, OpenRouter — or a local Ollama, which needs no key).

---

## Option A — Docker (one command)

```bash
docker run -p 3100:3100 \
  -e GEO_LLM_API_KEY=sk-REPLACE_WITH_YOUR_KEY \
  -e GEO_LLM_BASE_URL=https://api.deepseek.com/v1 \
  visibility-analyzer
```

> Any provider? Swap the base URL: OpenAI `https://api.openai.com/v1` · Groq
> `https://api.groq.com/openai/v1` · OpenRouter `https://openrouter.ai/api/v1` · local Ollama
> `http://localhost:11434/v1` (then the key can be anything, e.g. `ollama`).

## Option B — From source (Node.js)

```bash
cd ai-search-visibility-analyzer
cp .env.example .env
```

Then open `.env` and set exactly two lines (rest can stay commented):

```bash
GEO_LLM_API_KEY=sk-REPLACE_WITH_YOUR_KEY
GEO_LLM_BASE_URL=https://api.deepseek.com/v1
```

The server and CLI load `.env` automatically. Restart if it was already running: `npm start`.

## Verify the AI is live

1. Open http://localhost:3100 → paste any URL → **Analyze** (~30–90 s).
2. In the report, find the **GEO LLM analysis** panel — it shows the generative-engine read
   (entity identified?, would cite?, confidence, trust concerns).
3. If the panel instead says the LLM read was **skipped**, the key wasn't picked up — check the
   two lines are spelled exactly (`GEO_LLM_API_KEY`, `GEO_LLM_BASE_URL`), then restart the server.

The CLI does the same automatically: `node cli.js https://example.com` (no flag needed — the LLM
read is the main GEO function).

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Panel says "skipped" | Key not set or server not restarted after setting it (see Verify above). |
| `401 Unauthorized` / `Authentication Fails` | Key is wrong, expired, or has no balance — double-check it, or use another provider's key. |
| Request times out | Some networks block the provider — try a different `GEO_LLM_BASE_URL` (e.g. Groq or OpenRouter). |
| Ollama connection refused | Start Ollama first (`ollama serve`), and pull a model (e.g. `ollama pull llama3.2`). |
| Still stuck | Everything else still works — the deterministic core never depends on the LLM. File an issue on the repo. |
