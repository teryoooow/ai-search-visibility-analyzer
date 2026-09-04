# Product Roadmap — next 5 upgrades

Prioritized by **client value × feasibility** (all buildable on free tiers),
not by hype. Each item states the problem, the build, and the value.

---

## 1. Cross-LLM citation monitoring ("Am I cited, and how?")

**Problem:** the tool predicts citability; clients ultimately want to *see*
themselves cited in ChatGPT/Perplexity/Gemini answers — and to watch that
change over time.

**Build:** a scheduled job that asks 2–4 LLMs (or their search APIs) a fixed
set of brand-relevant questions ("best resort in Angeles City", "what is Core
Web Vitals?") and records: was the brand mentioned, in what role, with what
description, and which competing entities were cited instead. Diff each run
against the last (the JSON report format already gives us a stable comparison
shape).

**Value:** turns a static audit into **shareable proof** ("here is exactly how
ChatGPT described you last month vs. after our fixes") — the most sellable
artifact in GEO consulting. Free-tier note: rotation across providers keeps
costs near zero at low volume.

## 2. Competitor benchmarking (gap analysis)

**Problem:** a 72/100 tells a client little; "your competitor scores 91 and
here is *why*" closes the deal.

**Build:** accept N competitor URLs, run the same pipeline, and produce a
side-by-side matrix: score deltas per category, per *check* (check-level diff
is the killer feature — it names the exact missing schema tag or absent FAQ
block), plus a "citation share" view once #1 exists.

**Value:** the standard upsell from audit → "fix your gaps vs. the two
resorts you actually lose bookings to." Pure extension — zero new
infrastructure, reuses the whole pipeline.

## 3. Whole-site crawl (from one page to a domain)

**Problem:** single-URL analysis misses the biggest SEO truth: **which pages
are invisible, orphaned, or cannibalizing each other.**

**Build:** sitemap/robots-driven crawl (bounded to N pages, polite delay),
reusing the existing per-page analyzers, then aggregate: distribution of
scores, worst pages, duplicate-title/meta clusters, thin-content inventory,
and a crawl-level GEO read (is the *entity* consistent across every page?).

**Value:** moves the tool from "diagnose a page" to "audit a website" — the
shape agencies actually sell, and the natural input for #5's remediation
backlog.

## 4. Automated remediation (audit → ticket → fix loop)

**Problem:** findings only become value when someone acts on them.

**Build:** per-failing-check remediation templates (e.g. "inject FAQPage
schema", "add meta description of 70–160 chars", "add alt text") that render
into either a structured ticket (GitHub issue / Linear / Notion via webhook)
or a **patch**: for static sites, an auto-generated diff/PR implementing the
fix; for CMS sites, a ready-to-paste snippet block. Plus a
"re-analyze after deploy" verification step so the loop closes with proof.

**Value:** this is where an automation consultancy earns its margin — the tool
becomes the *discovery engine* for implementation work, and remediation can
be billed as a service built on a free diagnostic. (Ships naturally as n8n
workflows around the JSON report contract — scheduled runs, Telegram/Slack
notifications on score regressions, Notion database sync of client baselines.)

## 5. Field-data + entity-authority enrichment

**Problem:** lab Core Web Vitals and on-page heuristics are honest but
incomplete: real-world CWV, backlink profile, and knowledge-graph presence
(Google Business Profile, Wikipedia, review sites) drive a large share of
actual rankings/citations.

**Build:** optional connectors — CrUX API (free) for field CWV; a search/backlink
free-tier (or owned-crawl fallback) for inbound-link counts; and a lightweight
entity check (does a knowledge-graph entry exist, is NAP consistent across
the top citation sources?). Roll into the report as clearly-labeled
"authority layer" checks with their own weights.

**Value:** closes the gap between "page is well-built" and "page is
trusted" — the two things rankings and citations actually mix. Kept optional
so the core stays keyless and offline.

---

### Sequencing logic

**Now → 3 months:** #1 and #2 (pure pipeline extensions, immediate client
proof and upsell). **3–6 months:** #3 (crawl breadth) then #4 (remediation
revenue). **6–12 months:** #5 (authority data) — the only item needing
external data partnerships, deliberately last so it never blocks the others.

Every upgrade preserves the two non-negotiables: **deterministic, explainable
scores** and **keyless out-of-the-box operation**.
