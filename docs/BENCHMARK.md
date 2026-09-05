# Benchmark — cross-checking the analyzer against independent sources

Scope: a pragmatic accuracy cross-check (not a statistical study). Four target
URLs spanning different site types were run through the analyzer (fresh
SEO/AEO/GEO runs with the GEO LLM pass, DeepSeek `deepseek-v4-flash`) and the
results were compared against **independent measurements**: a from-scratch raw
HTML re-extraction of the on-page signals and known site quality.

| Target | Type | Visibility | SEO | AEO | GEO | Words | LLM "would cite" |
| --- | --- | --- | --- | --- | --- | --- | --- |
| en.wikipedia.org/wiki/Generative_AI | Encyclopedic authority | 90.2 | 87.2 | 89.1 | 94.4 | 15,004 | yes (95) |
| developer.mozilla.org/en-US/docs/Web/HTML | Technical doc | 85.4 | 93.4 | 83.3 | 79.6 | 1,087 | yes (98) |
| teryoooow.github.io | Personal portfolio | 72.9 | 91.0 | 61.1 | 66.7 | 1,126 | yes (90) |
| backlinko.com/hub/seo | Marketing content hub | 65.7 | 79.5 | 69.6 | 48.1 | 456 | (older snapshot, no LLM) |

> Note: `backlinko.com/hub/seo` now serves bot-protection content to headless
> Chrome (our fresh run returned an `image/gif` body), so it is benchmarked from
> the committed earlier report (`docs/demo/seo-guide.json`). The other three are
> fresh runs from this session.

## 1. On-page extraction accuracy (vs. independent raw-HTML re-extraction)

Each URL was fetched directly and parsed with a clean, independent cheerio pass
(no shared code with the analyzer's extractor), then diffed field-by-field
against the analyzer's report.

| Field | Wikipedia | MDN | Portfolio | Backlinko |
| --- | --- | --- | --- | --- |
| `<title>` | ✓ | ✓ | ✓ | ✓ |
| meta description | ✓ (both null) | ✓ | ✓ | ✓ |
| H1 text | ✓ | ✓ | ✓ | ✓ |
| H1 count | ✓ | ✓ | ✓ | ✓ |
| Schema types detected | ✓ (Article) | ✓ (none) | ✓ (none) | ✓ (5 types) |
| Canonical present | ✓ | ✓ | ✓ (both absent) | ✓ |
| noindex meta | ✓ | ✓ | ✓ | ✓ |
| Served over HTTPS | ✓ | ✓ | ✓ | ✓ |
| robots.txt reachable/allowed | ✓ | ✓ | ✓ (both none) | ✓ |

**Result: 36/36 fields agree.** The extractor and the indexability/robots/
HTTPS/canonical checks are reading the same truth as an independent parse, on
four structurally different sites (encyclopedic, technical-doc, static-personal,
marketing). One expected nuance: the analyzer works from the *rendered* DOM, so
for JS-heavy pages it will include client-side content a plain fetch misses —
that is intentional and does not affect these static fields.

## 2. SEO — cross-check with Google PageSpeed Insights

Planned comparison target: Google's PageSpeed Insights API (mobile, lab). The
keyless endpoint returned **HTTP 429 (rate-limited)** for every target this
session, so external CWV/performance verification could not be completed here.

What we can state from this run:
- Our SEO scores for the four targets (79–93) track the known profile of each
  site (MDN highest, thin backlinko hub lowest).
- The performance/CWV portion of the score comes from **Lighthouse, the same
  open-source engine Google's PSI runs**; our lab values are a local execution
  of that engine rather than an independent third-party number.
- **Re-run later:** PSI is keyless and usually available; one more attempt with
  an API key or at a different quota window would let us diff
  performance/LCP/CLS/TBT per target.

## 3. AEO — sanity check against answer-engine markers

No free third-party "AEO checker" exists; the cross-check used the independent
HTML pass to confirm the *inputs* to AEO scoring (schema presence/absence,
H1/question structure, meta) and reason from content:

- Wikipedia (AEO 89.1) and MDN (83.3) both open with a direct, self-contained
  definitional lead and clean heading structure — exactly the shape answer
  engines quote. High scores are plausible.
- Portfolio (61.1) has resume-style copy with no FAQ/definitional answer block.
- No target exposes FAQPage/HowTo schema, and none scored on those AEO checks —
  internally consistent (AEO schema checks fired "absent" correctly).

## 4. GEO — score vs. the LLM's own citation read

GEO has no established external checker, so we compare our deterministic GEO
score against the model read the analyzer already produces (the same prompt a
generative engine context would use):

| Target | GEO score | LLM verdict | Confidence | Notes from the model |
| --- | --- | --- | --- | --- |
| Wikipedia | 94.4 | yes | 95 | strong identity + article schema + dense sourced content |
| MDN | 79.6 | yes | 98 | clear entity; light on cite-able stats/dates |
| Portfolio | 66.7 | yes | 90 | entity identifiable; missing schema/dates |
| Backlinko hub | 48.1 | — | — | thin hub content (456 words) — lowest, correct direction |

Deterministic GEO and the model read agree on *direction* for every site
(authority-heavy pages rate highest, the thin hub lowest). The model is more
lenient in absolute terms (personal pages are "citable" for personal facts) —
worth noting as a calibration observation, not an error.

**Limitation:** only one provider key (DeepSeek) is configured, so this is a
single-model check. The LLM layer is provider-agnostic; adding OpenAI/Groq/
OpenRouter keys and re-running would give a true multi-model verdict agreement
test.

## Verdicts & recommendations

- **Extraction accuracy: verified.** On-page signals match an independent parse
  36/36 across four site types.
- **Category direction: sane.** Scores rank the four sites the way an SEO/AEO/
  GEO specialist would; GEO and AEO line up with LLM/answer-engine intuition.
- **To close the remaining gaps:** (1) re-run the SEO/PSI comparison when the
  keyless quota frees up (or add a Google API key); (2) configure 1–2 more
  OpenAI-compatible keys to compare GEO verdicts across models; (3) widen the
  target set toward more "known-good vs known-poor" pairs for a stronger sanity
  spread. A repeatable runner for all of the above is a natural next step.
