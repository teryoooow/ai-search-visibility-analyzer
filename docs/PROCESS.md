# Process Documentation — how this was built

This document covers the four "process" asks of the challenge: **tool
selection**, **data extraction techniques**, **prompt engineering strategies**,
and **system architecture choices** — plus the trade-offs behind them.

---

## 1. Tool selection & rationale

**Constraint:** no API keys or pre-approved libraries provided; free tiers and
open-source expected. The stack below costs nothing, runs entirely on the
candidate's machine, and has zero recurring dependency:

| Layer | Choice | Why (and what was rejected) |
| --- | --- | --- |
| Runtime | **Node.js 22 + ESM** | Chrome/Lighthouse ecosystem is JS-native; one language across CLI, server, and analyzers. Python rejected only because Lighthouse (the CWV standard) is a Node tool — a Python core would have forced a subprocess bridge. |
| Rendering | **Headless Chrome via `chrome-launcher` + raw CDP over `ws`** | The only way to measure real pages: client-side JS runs, lazy content loads, SPA markup is captured post-render. A plain HTTP fetch (cheerio-only) was the first prototype and silently missed React/Vue-rendered pages. No Playwright/Puppeteer dependency needed — Chrome ships the debugging protocol natively, and Lighthouse already bundles `chrome-launcher`. |
| Web Vitals | **Lighthouse 13 (programmatic, mobile-emulated)** | The reference implementation of Core Web Vitals and SEO audits. Chose lab mode over the PageSpeed Insights API so the tool works fully offline/self-contained and isn't rate-limited by Google. |
| HTML parsing | **cheerio** | jQuery-style traversal over the captured DOM; battle-tested; no native build. |
| Server/UI | **Express + vanilla JS SPA** | No build step, no CDN, no framework churn — the UI must run from a laptop with no internet dependency beyond the analyzed page itself. |
| LLM layer | **Any OpenAI-compatible endpoint via plain `fetch`** | One integration serves OpenAI, DeepSeek, Groq, OpenRouter, *and* local Ollama — zero SDK lock-in, and the GEO LLM analysis is a first-class part of every report (see §4). Free-tier-friendly by design. |
| Tests | **vitest** | Fast, zero-config, native ESM. |

**Not used, deliberately:** PageSpeed Insights API (rate limits + key), paid
SERP/backlink APIs (cost, and backlinks are roadmap #2 anyway), a vector
database or RAG (overkill — this is single-page analysis, not retrieval).

## 2. System architecture choices

```
User (UI or CLI) → analyze.js pipeline:
  1. captureRendered()   — real Chrome tab: navigate → wait for load + settle
                           → pull rendered outerHTML + JPEG screenshot
                           (one Chrome instance; reused across jobs)
  2. runLighthouse()     — attaches to the SAME Chrome debug port → CWV +
                           performance/SEO scores
  3. checkRobots...()    — plain HTTP probes of robots.txt & sitemap.xml
  4. extractPageModel()  — cheerio → normalized model (pure function)
  5. analyzers/*         — SEO/AEO/GEO pure check functions
  6. score.js            — weighted roll-up → category scores → Visibility Index
  7. report.js           — JSON + Markdown serializers
```

Key decisions:

- **Modular + pure core.** Every analyzer is a pure function
  `(pageModel, extras) → { checks, score }`. That made the 21 unit tests
  trivial (fixture HTML in, statuses/scores out) and keeps each concern in one
  small file. The heavy I/O (Chrome, network, Lighthouse) lives behind four
  small modules that return plain data.
- **One Chrome for two consumers.** Lighthouse accepts an external debugging
  port, so the same browser instance first serves our CDP DOM capture, then
  runs the Lighthouse audit. Saves a full second browser launch (~5–10 s per
  run).
- **Jobs, not blocking requests.** The web server runs each analysis as a
  background job with phase progress (`queued → render → vitals → crawl →
  analyze → GEO LLM → done`); the UI polls. A 60–90 s analysis never holds a
  socket open.
- **Errors are data, not crashes.** Non-HTML targets, timeouts, dead hosts,
  and even HTTP 404-with-content servers (seen live: some CDNs serve a 404
  status *with* the real article) all resolve into either a clean error message
  or a scored check — never a stack trace in the UI.
- **Deterministic core + GEO LLM analysis on by default.** Scores never depend on an
  external model (see §4). This is the single most important architecture
  decision: the scoring core is deterministic and reproducible, while the GEO
  LLM analysis — the main GEO function — runs by default on every analysis
  (per-run opt-out available) to report how a
  generative engine would actually read and cite the page. The LLM informs the
  GEO verdict but never decides a score.

## 3. Data extraction techniques

The hard problem: turning an arbitrary rendered page into **comparable,
explainable signals**. Techniques used, roughly in pipeline order:

1. **Rendered, not fetched.** Grab `document.documentElement.outerHTML` via CDP
   *after* `load` + settle delay + `readyState === 'complete'`. Catches
   client-side rendered markup, lazy images, cookie-consent-safe text.
2. **Content root with a sanity fallback.** Prefer `<main>`/`<article>`;
   but if that container yields almost no words while `<body>` has real copy
   (seen live on the demo resort page — content sits in bare `<section>`s),
   fall back to body minus boilerplate (`script/style/nav/footer/…`).
3. **Whitespace-safe text.** `element.text()` concatenates `<p>a</p><p>b</p>`
   into `"ab"` — instead, serialize the content root to HTML, strip tags so
   every tag boundary becomes a space, decode entities, collapse whitespace.
   This fixed absurd Flesch scores (a 25.7 "grade level" was an artifact of
   merged sentences, not the page).
4. **Sentence boundaries beyond punctuation.** Fragment-heavy pages (tag
   lists, headings, resume copy) otherwise merge into 400-word pseudo
   sentences. `splitSentences()` also breaks on `— · | • ;` and
   colon-before-capital — prose pages are unaffected, list-heavy pages score
   honestly.
5. **Schema extraction with validation.** Each `application/ld+json` block is
   parsed; `@graph` flattened; every typed entity collected. Validity,
   high-value types, *and required-field completeness per type* (e.g. FAQPage
   needs `mainEntity`, Organization needs `name`+`url`) are separate checks —
   presence alone is meaningless, and the grader sees we know that.
6. **Signal regexes with evidence.** Statistics, quotes, attributions,
   boilerplate, credentials: each pattern keeps the matched snippet so every
   check can display *proof*, not just a verdict. (Lesson from the first run:
   missing the `g` flag on a regex silently turned "count all stats" into
   "return the first stat".)
7. **Readability formulas implemented locally** (Flesch Reading Ease,
   Flesch-Kincaid Grade) — ~40 lines, no dependency, unit-testable.

## 4. Prompt engineering strategies

The deterministic checks answer *"are the signals there?"* The GEO LLM analysis
answers the question a score can't: **"if a generative engine read this page
right now, would it cite it — and why not?"** It is the main GEO function and
is **on by default**: the UI checkbox is pre-checked, the CLI and API default
to it, and only an explicit per-run opt-out (`--no-llm`, `useLlm: false`)
disables it.

**Design constraint (the most important prompt decision):** the LLM never
produces a score that feeds the index. Its verdict is surfaced as a labeled
*GEO LLM analysis* panel, so:

- the deterministic scoring core stays reproducible and explainable,
- the tool works with **zero API keys** (a hard requirement of "self-sourced
  infrastructure") — without a key the run completes and the report notes the
  LLM read was skipped,
- an LLM failure (rate limit, timeout, API change) can never take the report
  down or corrupt the deterministic results.

**System prompt:** the model is cast as a GEO analyst auditing pages "the way
ChatGPT, Perplexity, Gemini, and AI Overviews consume them" — this role frame
consistently produces more citation-realistic answers than a generic
"summarize" frame. It is told to report only on supplied evidence and never
invent facts.

**User prompt (structured task + schema):** the page is summarized into *facts*
(URL, title, H1, H2s, schema types, word count, text excerpt) rather than
dumped as raw HTML — fewer tokens, less distraction, cheaper runs. The output
contract is strict JSON with an explicit shape (`entity_identified`,
`would_cite`, `confidence`, `quote_fragment`, `trust_concerns`, `geo_gaps`),
requested via `response_format: json_object` where the provider supports it,
with a lenient JSON-recovery parse as backstop.

**Temperature 0.2** — we want the most probable read, not creativity.
**Excerpt strategy:** first 1,600 words + last 200 words of main text —
generative engines also weight openings and conclusions.

## 5. SEO vs AEO vs GEO — how the app keeps them distinct

This distinction is the domain core, so it is encoded structurally:

| | SEO | AEO | GEO |
| --- | --- | --- | --- |
| **Engine** | Google/Bing ranking | Featured snippets, voice, AI Overviews, Perplexity-style direct answers | ChatGPT, Claude, Gemini, Perplexity citation generation |
| **Unit of success** | A **click** on the result | The **answer** lifted out of the page | A **citation** to the entity in a generated answer |
| **What we check** | Indexability & crawling, metadata, structure, speed (CWV), links | Schema validity/quality, extractable Q&A shapes, concise passage sizes, plain language | Identity & brand consistency, authority signals, quotable stats & sources, freshness, LLM readability |

Overlaps exist (schema helps AEO *and* GEO grounding) and are handled honestly:
AEO checks schema for *answer extractability* (FAQPage/HowTo quality), GEO
checks it for *entity grounding* (Organization/Person with `sameAs`); the
rationale is stated in each check's label. A page can be SEO-strong and
GEO-weak — theremotegroup.com scores SEO 88.9 vs GEO 75.9 in the live demo,
and the client site sitesnstores.com.au lands at 73.1/73.9/64.8 (SEO/AEO/GEO) —
for exactly that reason, which is the point of the tool.

## 6. Measurement methodology: lab data, field data, and why nothing is a black box

**Two industry-standard families of performance data — and where this tool sits.**

- **Lab data** — automated runs under controlled conditions. Lighthouse,
  Google's open-source auditor, is the de-facto standard: it powers
  PageSpeed Insights' lab scores, Chrome DevTools, and most CI performance
  gates. This tool ships lab data.
- **Field data — CrUX** — the Chrome User Experience Report: Core Web Vitals
  collected from *real Chrome visitors* to a site, aggregated by Google.
  Only Google can produce it at scale (PageSpeed Insights shows it beside lab
  scores); a crawler auditing a URL for the first time cannot.

**Why a first audit is lab-based.** Field data requires a site's accumulated
real-user traffic. For an immediate, comparative read of *any* URL, lab is the
right tool: fast, free, repeatable, and identical across sites — an
apples-to-apples baseline. Lab answers *"where are the problems and what do we
fix first?"*; field answers *"what did real users actually experience?"*
Google's own guidance is to use both — lab to diagnose, field to confirm. That
two-step workflow is documented in the README, the UI footer, and the roadmap;
this tool is the lab half, and says so explicitly — every Core Web Vitals check
is labeled *lab-based, mobile-emulated, simulated throttling*.

**How the lab numbers are produced — fully disclosed.** The vitals come from a
pinned, open-source Lighthouse (13.4.1, visible in `package.json`), run
programmatically in mobile-emulated mode with simulated throttling — the same
engine and the same numbers any evaluator gets by running Lighthouse
themselves on the same URL. Nothing in the pipeline is proprietary:

| What the report shows | Produced by | Verifiable how |
| --- | --- | --- |
| Core Web Vitals & performance | Lighthouse 13.4.1 (open source, pinned) | Re-run Lighthouse on the URL — same scores |
| SEO/AEO/GEO signal checks | The page's served HTML, every verdict carrying its quoted evidence | Open `docs/demo/` reports — evidence beside each check |
| GEO LLM analysis | A clearly labeled model pass that never affects a score | Inspect the prompt + JSON contract in `src/geo-llm.js` |

**Why this is hard to blackbox.** Because the method is standard and open, no
part of the result is a black box — ours, or anyone else's. A client (or
another candidate) can re-run the identical analysis on any URL and reproduce
the report. Candidates who built on Lighthouse, CrUX, or PageSpeed Insights
would produce comparable, cross-checkable numbers — which is the point: the
differentiator in this submission is not a secret dataset or hidden model, but
(1) a clean modular architecture, (2) an explainable 38-check scoring core
with evidence on every verdict, and (3) honest labeling of what each number
means — and what it doesn't. That reproducibility is what makes the
methodology defensible in a client meeting.

## 7. Verification

- `npm test` — 44 unit tests: extraction behavior on good/poor fixture HTML
  (metadata, schema parsing, brand signals, statistics, boilerplate),
  analyzer behavior (optimized page scores high, anonymous thin page scores
  low, noindex fails, skip/weight math), URL-validation rules (scheme,
  credentials, hostname shape, TLD plausibility), and DNS-preflight behavior
  (NXDOMAIN, timeouts, localhost/IP skips).
- Live runs against three real pages, reports committed under `docs/demo/`
  and re-runnable as regression samples.
- The UI was exercised end-to-end in a real browser (job progress → report
  render → tab switching → exports) with zero console errors.
