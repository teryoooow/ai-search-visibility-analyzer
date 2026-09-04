// SEO analyzer — traditional search engines (Google/Bing), i.e. CLICKS.
// Question answered: "Will a search engine find this page, understand it,
// index it, and will a human click the result?"
//
// Inputs: rendered page model + robots/sitemap probe + Lighthouse run.

import { makeCheck, finalizeCategory } from '../score.js';
import { truncate } from '../util.js';

export function analyzeSEO(page, robots, lh) {
  const checks = [];
  const host = page.finalHost;

  // 0. HTTP status of the document
  const hs = page.httpStatus;
  if (hs >= 200 && hs < 300) {
    checks.push(makeCheck('http-status', 'Document returns HTTP 200', 2, 'pass', `HTTP ${hs} — indexable response.`));
  } else if (hs >= 300 && hs < 400) {
    checks.push(makeCheck('http-status', 'Document returns HTTP 200', 2, 'warn', `HTTP ${hs} (redirect) — crawlers follow redirects, but chains dilute authority.`));
  } else if (hs >= 400) {
    checks.push(makeCheck('http-status', 'Document returns HTTP 200', 2, 'fail', `HTTP ${hs} error status — search engines treat this as a broken/error page.`));
  } else {
    checks.push(makeCheck('http-status', 'Document returns HTTP 200', 2, 'warn', 'HTTP status could not be determined.'));
  }

  // 1. Title tag
  const tl = page.title.trim().length;
  if (!page.title.trim()) {
    checks.push(makeCheck('title', 'Title tag present & well-sized', 3, 'fail', 'Missing <title>. Search engines and LLMs identify the page by its title.', ''));
  } else if (tl < 30 || tl > 60) {
    checks.push(
      makeCheck('title', 'Title tag present & well-sized', 3, 'warn',
        tl < 30 ? `Title is only ${tl} chars (aim 30–60): "${page.title}"` : `Title is ${tl} chars (aim ≤60 — long titles get truncated in SERPs): "${page.title}"`,
        page.title),
    );
  } else {
    checks.push(makeCheck('title', 'Title tag present & well-sized', 3, 'pass', `Title is ${tl} chars — good SERP length.`, page.title));
  }

  // 2. Meta description
  const md = (page.metaDescription || '').trim();
  const mlen = md.length;
  if (!md) {
    checks.push(makeCheck('meta-description', 'Meta description present (click-through driver)', 2, 'fail', 'Missing meta description — search engines will auto-generate the SERP snippet.', ''));
  } else if (mlen < 70 || mlen > 160) {
    checks.push(makeCheck('meta-description', 'Meta description present (click-through driver)', 2, 'warn',
      mlen < 70 ? `Description is only ${mlen} chars (aim 70–160): "${md}"` : `Description is ${mlen} chars (aim ≤160 — may truncate): "${md}"`, md));
  } else {
    checks.push(makeCheck('meta-description', 'Meta description present (click-through driver)', 2, 'pass', `Description is ${mlen} chars.`, md));
  }

  // 3. Indexability (robots meta)
  const rm = page.robotsMeta || '';
  if (/noindex/.test(rm)) {
    checks.push(makeCheck('indexability', 'Page is indexable (no noindex)', 3, 'fail', `robots meta contains "noindex" — search engines will not index this page. (${rm})`));
  } else if (/nofollow/.test(rm)) {
    checks.push(makeCheck('indexability', 'Page is indexable (no noindex)', 3, 'warn', `robots meta contains "nofollow" — links on this page pass no authority. (${rm})`));
  } else if (rm) {
    checks.push(makeCheck('indexability', 'Page is indexable (no noindex)', 3, 'pass', `robots meta "${rm}" does not block indexing.`));
  } else {
    checks.push(makeCheck('indexability', 'Page is indexable (no noindex)', 3, 'pass', 'No robots meta — defaults to index,follow.'));
  }

  // 4. robots.txt crawl access
  switch (robots?.robotsStatus) {
    case 'ok':
      checks.push(makeCheck('robots-txt', 'robots.txt allows crawling', 2, 'pass', robots.robots.detail));
      break;
    case 'blocked':
      checks.push(makeCheck('robots-txt', 'robots.txt allows crawling', 2, 'fail', robots.robots.detail));
      break;
    case 'missing':
      checks.push(makeCheck('robots-txt', 'robots.txt allows crawling', 2, 'warn', 'No robots.txt found — crawling is allowed by default, but a file lets you control it.'));
      break;
    default:
      checks.push(makeCheck('robots-txt', 'robots.txt allows crawling', 2, 'warn', robots?.robots?.detail || 'robots.txt could not be verified.'));
  }

  // 5. Sitemap
  switch (robots?.sitemapStatus) {
    case 'ok':
      checks.push(makeCheck('sitemap', 'XML sitemap available', 1, 'pass', robots.sitemap.detail));
      break;
    case 'missing':
      checks.push(makeCheck('sitemap', 'XML sitemap available', 1, 'warn', 'No sitemap found — fine for small sites, but a sitemap speeds up discovery of new/changed pages.'));
      break;
    default:
      checks.push(makeCheck('sitemap', 'XML sitemap available', 1, 'warn', robots?.sitemap?.detail || 'Sitemap could not be verified.'));
  }

  // 6. Canonical
  const canon = (page.canonical || '').trim();
  if (!canon) {
    checks.push(makeCheck('canonical', 'Canonical URL declared', 2, 'warn', 'No canonical tag — duplicate-content risk if this URL is reachable via multiple paths/params.'));
  } else {
    let canonHost = '';
    let canonAbs = canon;
    try {
      canonAbs = new URL(canon, page.url).href;
      canonHost = canonAbs.replace(/^https?:\/\//, '').split(/[/?#]/)[0].replace(/^www\./, '');
    } catch { /* keep raw */ }
    if (canonHost && canonHost !== host) {
      checks.push(makeCheck('canonical', 'Canonical URL declared', 2, 'warn', `Canonical points to a different host (${canonHost}) — verify this is intentional.`, canon));
    } else {
      checks.push(makeCheck('canonical', 'Canonical URL declared', 2, 'pass', 'Canonical tag present.', canonAbs));
    }
  }

  // 7. H1
  if (page.h1s.length === 0) {
    checks.push(makeCheck('h1', 'Exactly one H1 heading', 2, 'fail', 'No H1 found — pages need one clear H1 summarizing the topic.'));
  } else if (page.h1s.length > 1) {
    checks.push(makeCheck('h1', 'Exactly one H1 heading', 2, 'warn', `${page.h1s.length} H1s found — split topics into H2s and keep a single H1.`, page.h1s.join(' | ')));
  } else {
    checks.push(makeCheck('h1', 'Exactly one H1 heading', 2, 'pass', `H1: "${truncate(page.h1s[0], 90)}"`));
  }

  // 8. Heading hierarchy
  const seq = page.headingSeq;
  let skipDetected = false;
  let firstSkip = '';
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] > seq[i - 1] + 1) {
      skipDetected = true;
      firstSkip = `H${seq[i - 1]} → H${seq[i]}`;
      break;
    }
  }
  if (skipDetected) {
    checks.push(makeCheck('hierarchy', 'Heading hierarchy has no skipped levels', 1, 'warn', `Skipped heading level detected (${firstSkip}) — use H1→H2→H3 in order.`));
  } else if (seq.length >= 3) {
    checks.push(makeCheck('hierarchy', 'Heading hierarchy has no skipped levels', 1, 'pass', `${seq.length} headings with a clean hierarchy.`));
  } else {
    checks.push(makeCheck('hierarchy', 'Heading hierarchy has no skipped levels', 1, 'warn', 'Very few headings — consider structuring content with H2/H3 sections.'));
  }

  // 9. HTTPS
  if (page.url.startsWith('https://')) {
    checks.push(makeCheck('https', 'Served over HTTPS', 2, 'pass', 'Page loads over HTTPS.'));
  } else {
    checks.push(makeCheck('https', 'Served over HTTPS', 2, 'fail', 'Page loads over plain HTTP — browsers flag it and rankings suffer.'));
  }

  // 10. Mobile viewport
  if (page.viewport) {
    checks.push(makeCheck('viewport', 'Mobile viewport configured', 2, 'pass', 'viewport meta present — mobile-first indexing ready.'));
  } else {
    checks.push(makeCheck('viewport', 'Mobile viewport configured', 2, 'fail', 'No viewport meta — page renders unreadably on phones (mobile-first indexing).'));
  }

  // 11-14. Core Web Vitals + performance (from Lighthouse, when available)
  const m = lh?.metrics || {};
  if (m.lcp != null) {
    checks.push(vitalCheck('lcp', 'Core Web Vitals — LCP', 3, m.lcp, 2.5, 4.0, 's', 'Largest Contentful Paint', 'loading'));
  }
  if (m.cls != null) {
    checks.push(vitalCheck('cls', 'Core Web Vitals — CLS', 3, m.cls, 0.1, 0.25, '', 'Cumulative Layout Shift', 'stability'));
  }
  const tbt = m.tbt ?? m.inp;
  if (tbt != null) {
    const label = m.tbt != null ? 'Total Blocking Time' : 'INP (lab)';
    checks.push(vitalCheck('tbt', 'Core Web Vitals — responsiveness', 3, tbt, 200, 600, 'ms', label, 'interactivity'));
  }
  if (lh?.performance != null) {
    const p = lh.performance;
    checks.push(makeCheck(
      'perf-score', 'Lighthouse performance score', 3,
      p >= 0.9 ? 'pass' : p >= 0.5 ? 'warn' : 'fail',
      `Lighthouse performance score ${Math.round(p * 100)}/100 (mobile, simulated throttling).`,
      `${lh.lighthouseVersion || ''}`.trim() || null,
    ));
  }

  // 15. Content depth
  const wc = page.wordCount;
  if (wc >= 300) {
    checks.push(makeCheck('content-depth', 'Substantial content on page', 2, 'pass', `${wc} words of readable text.`));
  } else if (wc >= 100) {
    checks.push(makeCheck('content-depth', 'Substantial content on page', 2, 'warn', `Only ~${wc} words — thin content ranks poorly and gives LLMs little to cite.`));
  } else {
    checks.push(makeCheck('content-depth', 'Substantial content on page', 2, 'fail', `Only ~${wc} words — search engines consider this a thin page.`));
  }

  // 16. Image alt coverage
  if (page.imgs.total > 0) {
    const ratio = page.imgs.missingAlt / page.imgs.total;
    if (ratio === 0) {
      checks.push(makeCheck('img-alt', 'Images have alt text', 1, 'pass', `All ${page.imgs.total} images have alt text.`));
    } else if (ratio <= 0.3) {
      checks.push(makeCheck('img-alt', 'Images have alt text', 1, 'warn', `${page.imgs.missingAlt}/${page.imgs.total} images missing alt text.`));
    } else {
      checks.push(makeCheck('img-alt', 'Images have alt text', 1, 'fail', `${page.imgs.missingAlt}/${page.imgs.total} images missing alt text — alt text is image SEO.`));
    }
  } else {
    checks.push(makeCheck('img-alt', 'Images have alt text', 1, 'skip', 'No images on page.'));
  }

  // 17. Semantic HTML
  const semCount = ['main', 'article', 'nav', 'header', 'footer'].filter((t) => (page.semantic[t] || 0) > 0).length;
  if (semCount >= 3) {
    checks.push(makeCheck('semantic', 'Semantic HTML5 landmarks used', 1, 'pass', `Found ${semCount}/5 landmarks (main/article/nav/header/footer).`));
  } else if (semCount >= 1) {
    checks.push(makeCheck('semantic', 'Semantic HTML5 landmarks used', 1, 'warn', `Only ${semCount}/5 landmarks — semantic tags help crawlers and LLMs map the page.`));
  } else {
    checks.push(makeCheck('semantic', 'Semantic HTML5 landmarks used', 1, 'fail', 'No semantic landmarks — content is harder for crawlers to classify.'));
  }

  // 18. Internal links
  if (page.links.internal >= 3) {
    checks.push(makeCheck('internal-links', 'Internal links present', 1, 'pass', `${page.links.internal} internal links — the page is reachable and distributes authority.`));
  } else if (page.links.internal >= 1) {
    checks.push(makeCheck('internal-links', 'Internal links present', 1, 'warn', `Only ${page.links.internal} internal link(s) — deep pages with no links are hard to discover.`));
  } else {
    checks.push(makeCheck('internal-links', 'Internal links present', 1, 'fail', 'No internal links found — if this is not the homepage, crawlers may never find it.'));
  }

  return finalizeCategory('SEO', 'Will search engines find, index, and get clicks for this page?', checks);
}

function vitalCheck(id, label, weight, value, good, bad, unit, name, metricKey) {
  const roundTo = unit === 's' ? 2 : unit === 'ms' ? 0 : 2;
  const f = (u) => `${Number(u.toFixed(roundTo))}${unit}`;
  const v = f(value);
  const target = f(good);
  const status = value <= good ? 'pass' : value <= bad ? 'warn' : 'fail';
  const verdict = status === 'pass' ? 'good' : status === 'warn' ? 'needs improvement' : 'poor';
  return makeCheck(id, label, weight, status, `${name}: ${v} — ${verdict} (target ≤ ${target}).`, metricKey);
}
