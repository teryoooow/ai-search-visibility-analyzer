# Install & Use Guide — Search Visibility Analyzer (SEO · AEO · GEO)

> A step-by-step guide for reviewers. Total time to a working system: **~5–10 minutes**
> (Docker: one extra ~6-minute build on first run). No paid services required.

---

## 0. Do I need an API key? (read this first)

**No.** The core analyzer is fully deterministic and runs with **zero API keys** — real Chrome
render, Lighthouse Core Web Vitals, all 38 SEO/AEO/GEO checks, scoring, screenshots, and
JSON/Markdown reports all work out of the box.

| Feature | Without any key | With a key configured |
| --- | --- | --- |
| Core scoring (38 checks, Visibility Index) | ✅ Works | ✅ Works |
| Lighthouse Core Web Vitals | ✅ Works | ✅ Works |
| Page screenshot | ✅ Works | ✅ Works |
| JSON / Markdown reports | ✅ Works | ✅ Works |
| **GEO LLM analysis** (a generative-engine "would I cite this?" read) | ⚠️ Report clearly notes *"LLM read skipped"* | ✅ Runs automatically on every analysis |

**About that GEO LLM panel:** it's the one feature that *can* use an LLM. It is not a scoring
dependency — it's a separate, clearly-labeled second opinion layered on top of the deterministic
core, and it never changes a score. If you want to see it live, you can supply **your own** key for
**any OpenAI-compatible provider** — OpenAI, DeepSeek, Groq, OpenRouter, or a free local Ollama
(no key needed at all for Ollama). The submission contains **no keys**, and none are required to
evaluate the system.

---

## 1. Choose how you want to run it

| Option | You need | Best for |
| --- | --- | --- |
| **A · Docker** (recommended) | Docker only — no Node, no Chrome | Quickest, most reliable review |
| **B · From source** | Node.js ≥ 18 + Chrome/Chromium | Inspecting/running the code yourself |
| **C · No install** | Nothing | Just browsing the evidence |

---

## 2. Option A — Docker (recommended)

**Prerequisite:** [Docker](https://www.docker.com/products/docker-desktop/) installed and running
(Docker Desktop on Windows/macOS).

**Step 1 — Clone the repository**
```bash
git clone https://github.com/teryoooow/ai-search-visibility-analyzer
cd ai-search-visibility-analyzer
```

**Step 2 — Build the image** (first build takes ~6 minutes; later builds are near-instant)
```bash
docker build -t visibility-analyzer .
```

**Step 3 — Run it**
```bash
docker run -p 3100:3100 visibility-analyzer
```

**Step 4 — Open the web UI**
http://localhost:3100

You should see the analyzer home page with a URL input box.

**Optional — enable the GEO LLM panel** (any OpenAI-compatible provider; see §0). Add one or
two `-e` flags to Step 3:
```bash
docker run -p 3100:3100 \
  -e GEO_LLM_API_KEY=sk-your-key \
  -e GEO_LLM_BASE_URL=https://api.openai.com/v1 \
  visibility-analyzer
```
Provider examples for `GEO_LLM_BASE_URL`: `https://api.deepseek.com/v1` (DeepSeek),
`https://api.groq.com/openai/v1` (Groq), `https://openrouter.ai/api/v1` (OpenRouter). The model is
auto-picked per provider. Omit `GEO_LLM_MODEL` unless you want a specific one.

**To stop:** `Ctrl+C` in that terminal, or `docker ps` → `docker stop <container-id>`.

> **Port already in use?** Map to another host port: `docker run -p 3101:3100 visibility-analyzer`
> → open http://localhost:3101

---

## 3. Option B — Run from source (Node.js)

**Prerequisites:**
- [Node.js](https://nodejs.org) **≥ 18** (check: `node --version`)
- **Chrome or Chromium** installed (Lighthouse runs the page in headless Chrome). It is
  auto-detected on Windows/macOS/Linux. If it isn't found, point the app at it:

  ```bash
  # Windows
  set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
  # macOS
  export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  # Linux
  export CHROME_PATH=/usr/bin/chromium
  ```

**Step 1 — Clone and install**
```bash
git clone https://github.com/teryoooow/ai-search-visibility-analyzer
cd ai-search-visibility-analyzer
npm install
```

**Step 2 — (Optional) enable the GEO LLM panel**
```bash
cp .env.example .env      # then edit .env: set GEO_LLM_API_KEY and GEO_LLM_BASE_URL
```
The server and CLI load `.env` automatically. (Or export the same variables in your shell.)

**Step 3 — Start the web UI**
```bash
npm start
```
→ open http://localhost:3100 · stop with `Ctrl+C`

**Run the tests (44 unit tests):**
```bash
npm test
```

---

## 4. Option C — No install at all

Everything below is already in the repository — no setup needed:

- **README screenshots** — the UI report (main report view + GEO LLM panel views)
- **Sample reports** — `docs/demo/*.md` and `docs/demo/*.json`: full analyses of real sites
  (portfolio, resort, an SEO-industry hub, two business sites), including one of
  [theremotegroup.com](docs/demo/theremotegroup.md)
- **Submission PDFs** — walkthrough, process documentation, business-value justification, and
  product roadmap (4 documents, one per challenge deliverable)
- **A live walkthrough call** can be arranged — just ask.

---

## 5. Using the web UI — step by step

1. Open http://localhost:3100
2. **Paste a URL** into the input box (e.g. `https://en.wikipedia.org/wiki/Core_Web_Vitals` —
   `https://` is optional).
3. Click **Analyze**. The first analysis takes **~30–90 seconds** (Chrome launch + Lighthouse).
   A progress panel shows each pipeline phase: render page → Lighthouse Core Web Vitals →
   extract content → run checks → score.
4. When it finishes, the report shows, top to bottom:
   - **Visibility Index** — the overall 0–100 score
   - **SEO / AEO / GEO rings** — per-category scores. SEO = traditional search (*clicks*),
     AEO = answer engines (*direct answers*), GEO = generative engines (*LLM citations*).
   - **Executive summary** — the headline findings
   - **Category tabs** — click **SEO**, **AEO**, or **GEO** to see the individual checks;
     click any check to expand its **evidence** and reasoning
   - **GEO LLM panel** — the generative-engine read (only when a key is configured; otherwise a
     clear "skipped" note appears here and everything else still renders)
   - **Page screenshot** — the page as the analyzer actually rendered it
   - **Prioritized fix list** — concrete improvements, ordered by impact on the weakest category
5. **Export** the report with the **Export JSON** / **Export Markdown** buttons (top-right of the
   report) — both download a file you can keep or re-run through other tooling.
6. To analyze another URL, clear the input, paste a new one, and click **Analyze** again.

---

## 6. Using the CLI — step by step

Same pipeline, no browser needed (still requires Chrome for the render, as in §3).

```bash
# Basic analysis — prints a summary
node cli.js https://example.com

# Full export: JSON report + Markdown report + page screenshot
node cli.js https://example.com --json report.json --md report.md --shot shot.jpg
```

`npm run analyze -- https://example.com` works too. Output files are written to your current
directory. Without an LLM key the Markdown/JSON report includes an explicit note that the GEO LLM
read was skipped; with a key (`.env` or environment), the LLM read runs automatically — there is
no flag to turn it on, it is the main GEO function.

---

## 7. API — for automation (optional, power users)

The web UI is a client of this small JSON API:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/analyze`  `{ "url": "https://example.com" }` | Start an analysis job → returns `{ id }` |
| `GET /api/jobs/:id` | Poll job status + report when done |
| `GET /api/jobs/:id/markdown` | Download the Markdown report for a finished job |
| `GET /api/health` | Health check → `{ "ok": true }` |

Example:
```bash
curl -X POST http://localhost:3100/api/analyze -H "Content-Type: application/json" -d '{"url":"https://example.com"}'
```

---

## 8. Verifying it's working

- The UI loads at http://localhost:3100
- `curl http://localhost:3100/api/health` → `{"ok":true,...}`
- An analysis completes end-to-end (~30–90 s) and renders a full report
- `npm test` → **44 tests passed** (source installs only)

---

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Could not find Chrome` | Install Chrome/Chromium, or set `CHROME_PATH` (see §3). Docker needs none. |
| Analysis fails fast with a network/timeout error | The target site may block datacenter IPs (Docker) or your network egress — try another public URL or run locally. |
| First `docker build` is slow | Normal (~6 min: downloads Chromium + npm deps). Only the first build. |
| Port 3100 already in use | Use another host port: `docker run -p 3101:3100 ...` or `PORT=3101 npm start`. |
| Analysis takes a while | Normal for the first run (30–90 s). Later runs on the same server are faster. |
| GEO LLM panel says "skipped" | No LLM key configured — expected and fine (§0). Add one only if you want the LLM read. |
| Anything else | The app never crashes silently — every failure returns a plain-English message. File an issue on the repo. |
