// Lighthouse runner: Core Web Vitals + performance/SEO scores on the shared Chrome.

import lighthouse from 'lighthouse';
import { chromePort, ensureChrome } from './capture.js';

export async function runLighthouse(url, { timeoutMs = 150000 } = {}) {
  await ensureChrome();
  const port = chromePort();
  const result = await withTimeout(
    lighthouse(
      url,
      {
        port,
        logLevel: 'error',
        output: 'json',
        onlyCategories: ['performance', 'seo'],
        formFactor: 'mobile',
        screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 2, disabled: false },
        throttlingMethod: 'simulate',
        maxWaitForFcp: 45000,
        maxWaitForLoad: 60000,
      },
    ),
    timeoutMs,
  );

  const lhr = result.lhr || result;
  const audits = lhr.audits || {};

  const num = (id) => audits[id]?.numericValue ?? null;
  const score = (id) => audits[id]?.score ?? null;

  return {
    lighthouseVersion: lhr.lighthouseVersion,
    performance: lhr.categories?.performance?.score ?? null,
    seoScore: lhr.categories?.seo?.score ?? null,
    metrics: {
      lcp: num('largest-contentful-paint') != null ? num('largest-contentful-paint') / 1000 : null, // seconds
      cls: num('cumulative-layout-shift'),
      tbt: num('total-blocking-time'), // ms
      inp: num('inp'), // ms when available (lab estimate)
      fcpMs: num('first-contentful-paint'),
      speedIndexMs: num('speed-index'),
      ttiMs: num('interactive'),
    },
    audits: {
      // Selected diagnostics that map to SEO/AEO concerns
      metaDescription: audits['meta-description']?.description ?? null,
      documentTitle: audits['document-title']?.description ?? null,
      crawlableAnchors: audits['crawlable-anchors']?.description ?? null,
      robotsTxt: audits['robots-txt']?.description ?? null,
      viewport: audits['viewport']?.description ?? null,
      imageAlt: audits['image-alt']?.description ?? null,
      fontLegibility: audits['font-size']?.description ?? null,
      hreflang: audits['hreflang']?.description ?? null,
      canonical: audits['canonical']?.description ?? null,
      tapTargets: audits['tap-targets']?.description ?? null,
      lcpMs: audits['largest-contentful-paint']?.displayValue ?? null,
      clsScore: audits['cumulative-layout-shift']?.displayValue ?? null,
      tbtMs: audits['total-blocking-time']?.displayValue ?? null,
    },
    failedAudits: Object.entries(audits)
      .filter(([, a]) => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary')
      .map(([id]) => id)
      .slice(0, 30),
  };
}

async function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`Lighthouse run exceeded ${Math.round(ms / 1000)}s — page may be too slow or unstable.`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
