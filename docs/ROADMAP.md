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

## 5. SEO/AEO/GEO checker as an MCP server (any AI agent can audit a URL)

**Problem:** the report lives in a UI and a CLI. The fastest-growing way
businesses now ask questions is through AI agents — ChatGPT, Claude Desktop,
Cursor/Codex, Hermes, and n8n AI workflows — and none of them can call this
analyzer today. Every agent integration would otherwise mean re-implementing
the audit logic badly, inside each tool.

**Build:** wrap the existing pipeline in a **Model Context Protocol (MCP)
server** exposing one tool — `analyze_url(url)` → returns the
report's JSON contract (Visibility Index, SEO/AEO/GEO category scores, and the
check list with evidence). MCP is the standard connector in 2026: any MCP
client (Claude Desktop, Cursor, n8n's MCP node, VS Code agents) gains
"audit any URL" instantly, served locally (stdio) or remotely (HTTP/SSE with
optional auth). Because the core is already deterministic, keyless and
JSON-serialized, this is a thin adapter over the existing pipeline — days, not
weeks — and it inherits the same JSON report contract the n8n/Notion workflows
already consume.

**Value:** turns the analyzer from a tool into **infrastructure that agents
call mid-workflow** — "check our new landing page before we ship" inside a
Notion-centric agent pipeline, automated pre-publish gates in CI agents, and
one reusable audit tool across every client engagement. It is also the
cleanest monetization door: a hosted MCP endpoint can be offered as a paid
tool in agent marketplaces. Fits the role's automation reality exactly.

---

### Sequencing logic

**Now → 3 months:** #1 and #2 (pure pipeline extensions, immediate client
proof and upsell). **3–6 months:** #3 (crawl breadth), then #4 (remediation
revenue). **#5 (MCP server) is the quick win** — a thin adapter over the
stable JSON contract that can land alongside any phase and unlocks the
agent/n8n workflows the role runs daily.

**Further candidates beyond these five:** field-data (CrUX API) and
entity-authority enrichment — optional connectors that add real-world CWV and
knowledge-graph signals as a clearly-labeled "authority layer". Deliberately
kept off the core list so the roadmap stays focused on pipeline extensions
that need no external data partnerships.

Every upgrade preserves the two non-negotiables: **deterministic, explainable
scores** and **keyless out-of-the-box operation**.
