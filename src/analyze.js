// Analysis pipeline: URL → render → extract → analyze (SEO/AEO/GEO) → report.
// GEO LLM analysis is the main GEO function and runs on EVERY analysis: it
// reads the page the way a generative engine would. It is skipped only when no
// LLM key is configured, in which case the report notes that explicitly.

import { captureRendered, ensureChrome, closeChrome } from './capture.js';
import { extractPageModel } from './extract.js';
import { analyzeSEO } from './analyzers/seo.js';
import { analyzeAEO } from './analyzers/aeo.js';
import { analyzeGEO } from './analyzers/geo.js';
import { checkRobotsAndSitemap } from './robots.js';
import { runLighthouse } from './lighthouse.js';
import { geoSecondOpinion, llmConfigured } from './geo-llm.js';
import { overallScore } from './score.js';
import { normalizeUrl, hostnameOf } from './util.js';
import { checkDomainResolves } from './preflight.js';

export async function analyzeUrl(inputUrl, { onProgress = () => {} } = {}) {
  const url = normalizeUrl(inputUrl);
  const startedAt = Date.now();
  const origin = new URL(url).origin;
  let chrome = null;

  // Fail fast on nonexistent domains — no Chrome launch for NXDOMAIN typos.
  onProgress({ phase: 'preflight', message: 'Checking that the domain resolves…', pct: 3 });
  await checkDomainResolves(new URL(url).hostname);

  onProgress({ phase: 'browser', message: 'Launching headless Chrome…', pct: 5 });
  try {
    chrome = await ensureChrome();
    onProgress({ phase: 'render', message: 'Rendering page in a real browser (client-side JS included)…', pct: 15 });

    // 1) Render + capture
    const rendered = await captureRendered(url, { port: chrome.port });
    const page = extractPageModel(rendered.html, rendered.finalUrl || url);
    page.httpStatus = rendered.httpStatus ?? 200;

    onProgress({ phase: 'vitals', message: 'Measuring Core Web Vitals & performance (Lighthouse)…', pct: 35 });
    // 2) Lighthouse on the same Chrome instance
    const lh = await runLighthouse(rendered.finalUrl || url, { timeoutMs: 150000 });

    onProgress({ phase: 'crawl', message: 'Probing robots.txt & sitemap.xml…', pct: 70 });
    // 3) robots/sitemap
    let robots = { robotsStatus: 'error', sitemapStatus: 'error' };
    try {
      robots = await checkRobotsAndSitemap(origin);
    } catch {
      /* non-fatal: recorded as error statuses above */
    }

    // 4) Analyzers — deterministic scoring core
    onProgress({ phase: 'analyze', message: 'Scoring SEO / AEO / GEO signals…', pct: 82 });
    const categories = {
      seo: analyzeSEO(page, robots, lh),
      aeo: analyzeAEO(page),
      geo: analyzeGEO(page),
    };

    // 5) GEO LLM analysis — the generative-engine read. Main GEO function,
    //    part of every report; noted as skipped only when no key is configured.
    let llm = null;
    if (llmConfigured()) {
      onProgress({ phase: 'llm', message: 'GEO LLM analysis: simulating a generative-engine read…', pct: 90 });
      try {
        llm = { perspective: await geoSecondOpinion(page), provider: process.env.GEO_LLM_MODEL || 'configured' };
      } catch (e) {
        llm = { error: e.message };
      }
    } else {
      llm = { skipped: 'GEO LLM analysis is part of every run, but no LLM key is configured. Set GEO_LLM_API_KEY (or OPENAI_API_KEY) on the server to include the generative-engine read.' };
    }

    const overall = overallScore(categories);
    onProgress({ phase: 'done', message: 'Report ready.', pct: 100 });

    return {
      meta: {
        analyzedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        targetUrl: url,
        finalUrl: rendered.finalUrl || url,
        host: hostnameOf(url),
        httpStatus: rendered.httpStatus,
        mimeType: rendered.mimeType,
        toolVersion: '1.0.0',
        lighthouseVersion: lh.lighthouseVersion || null,
        llmUsed: !!(llm && llm.perspective),
      },
      overview: {
        visibilityIndex: overall,
        grade: grade(overall),
        summary: buildExecutiveSummary(categories, page),
      },
      categories,
      llm,
      page: slimPage(page),
      screenshot: rendered.screenshotDataUrl, // may be null
    };
  } finally {
    // Chrome stays warm for the next analysis in server mode; CLI closes it.
  }
}

/** CLI/one-shot convenience: ensures Chrome is shut down afterwards. */
export async function analyzeUrlOnce(inputUrl, opts = {}) {
  try {
    return await analyzeUrl(inputUrl, opts);
  } finally {
    await closeChrome();
  }
}

function grade(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Fair';
  return 'Needs work';
}

function buildExecutiveSummary(cats, page) {
  const parts = [];
  const worst = [...Object.values(cats)].sort((a, b) => a.score - b.score)[0];
  const best = [...Object.values(cats)].sort((a, b) => b.score - a.score)[0];
  const checkCount = Object.values(cats).reduce((n, c) => n + c.checks.filter((x) => x.status !== 'skip').length, 0);
  parts.push(`${page.wordCount} words of rendered text were analyzed across ${checkCount} SEO/AEO/GEO checks.`);
  if (worst.score === best.score) {
    parts.push(`All three categories scored ${worst.score}/100 — the page is evenly (${worst.score >= 70 ? 'well' : 'moderately'}) optimized for every engine type.`);
  } else {
    parts.push(`Strongest category: ${best.key} (${best.score}/100). Most urgent: ${worst.key} (${worst.score}/100) — ${worst.description.toLowerCase()}`);
  }
  return parts.join(' ');
}

/** Trim the page model to what a report consumer actually needs. */
function slimPage(p) {
  return {
    url: p.url,
    title: p.title,
    metaDescription: p.metaDescription,
    h1: p.h1s[0] || null,
    wordCount: p.wordCount,
    sentenceCount: p.sentenceCount,
    flesch: p.flesch,
    fkgl: p.fkgl,
    brandGuess: p.brandGuess,
    schemaTypes: p.schema.types,
    hasRecentDate: p.hasRecentDate,
    links: p.links,
    // never include raw text or full html
  };
}
