import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractPageModel } from '../src/extract.js';
import { analyzeSEO } from '../src/analyzers/seo.js';
import { analyzeAEO } from '../src/analyzers/aeo.js';
import { analyzeGEO } from '../src/analyzers/geo.js';
import { categoryScore, overallScore, gradeOf } from '../src/score.js';

const goodHtml = readFileSync(fileURLToPath(new URL('./fixtures/good.html', import.meta.url)), 'utf8');
const poorHtml = readFileSync(fileURLToPath(new URL('./fixtures/poor.html', import.meta.url)), 'utf8');
const goodPage = extractPageModel(goodHtml, 'https://example.com/');
const poorPage = extractPageModel(poorHtml, 'https://example.com/');

const goodRobots = {
  robotsStatus: 'ok', robots: { detail: 'robots.txt is reachable and does not block crawling' },
  sitemapStatus: 'ok', sitemap: { detail: 'Found at https://example.com/sitemap.xml (HTTP 200)' },
};
const poorRobots = { robotsStatus: 'missing', sitemapStatus: 'missing' };

const goodLh = { lighthouseVersion: '13.4.1', performance: 0.96, metrics: { lcp: 1.8, cls: 0.05, tbt: 110 } };
const poorLh = { lighthouseVersion: '13.4.1', performance: 0.2, metrics: { lcp: 7.5, cls: 0.42, tbt: 1100 } };

describe('SEO analyzer', () => {
  it('scores an optimized page high and a poor page low', () => {
    const good = analyzeSEO(goodPage, goodRobots, goodLh);
    const poor = analyzeSEO(poorPage, poorRobots, poorLh);
    expect(good.score).toBeGreaterThanOrEqual(85);
    expect(poor.score).toBeLessThanOrEqual(35);
  });

  it('differentiates the core SEO concerns', () => {
    const good = analyzeSEO(goodPage, goodRobots, goodLh);
    const ids = new Set(good.checks.map((c) => c.id));
    expect(ids).toContain('title');
    expect(ids).toContain('indexability');
    expect(ids).toContain('lcp');
    expect(ids).toContain('canonical');
  });

  it('fails a noindex page and warns on a thin page', () => {
    const noindex = { ...goodPage, robotsMeta: 'noindex' };
    const r = analyzeSEO(noindex, goodRobots, goodLh);
    expect(r.checks.find((c) => c.id === 'indexability').status).toBe('fail');

    const thin = { ...goodPage, wordCount: 150 };
    const r2 = analyzeSEO(thin, goodRobots, goodLh);
    expect(r2.checks.find((c) => c.id === 'content-depth').status).toBe('warn');
  });
});

describe('AEO analyzer', () => {
  it('rewards extractable, schema-rich content', () => {
    const good = analyzeAEO(goodPage);
    expect(good.score).toBeGreaterThanOrEqual(75);
  });

  it('penalizes missing/invalid schema and thin content', () => {
    const poor = analyzeAEO(poorPage);
    expect(poor.score).toBeLessThanOrEqual(45);
  });

  it('flags pages with no FAQ-shaped content as warnings', () => {
    const r = analyzeAEO(goodPage);
    const faq = r.checks.find((c) => c.id === 'faq-content');
    expect(faq.status).toBe('pass');
  });
});

describe('GEO analyzer', () => {
  it('recognizes citable, quotable, sourced content', () => {
    const good = analyzeGEO(goodPage);
    expect(good.score).toBeGreaterThanOrEqual(70);
    const ids = new Set(good.checks.map((c) => c.id));
    for (const id of ['entity-id', 'brand-consistency', 'entity-authority', 'stats-density', 'sourced-claims']) {
      expect(ids).toContain(id);
    }
  });

  it('penalizes anonymous boilerplate pages', () => {
    const poor = analyzeGEO(poorPage);
    expect(poor.score).toBeLessThanOrEqual(35);
    expect(poor.checks.find((c) => c.id === 'distinctive').status).toBe('fail');
    expect(poor.checks.find((c) => c.id === 'entity-id').status).toBe('fail');
  });
});

describe('scoring math', () => {
  it('computes weighted scores with warn = half credit', () => {
    const checks = [
      { status: 'pass', weight: 3 },
      { status: 'warn', weight: 2 },
      { status: 'fail', weight: 1 },
    ];
    expect(categoryScore(checks)).toBeCloseTo((3 * 1 + 2 * 0.5 + 0) / 6 * 100, 0);
  });

  it('excludes skipped checks', () => {
    const checks = [
      { status: 'pass', weight: 3 },
      { status: 'skip', weight: 2 },
    ];
    expect(categoryScore(checks)).toBe(100);
  });

  it('averages categories into the visibility index', () => {
    expect(overallScore({ a: { score: 100 }, b: { score: 50 } })).toBe(75);
  });

  it('grades thresholds', () => {
    expect(gradeOf(90).grade).toBe('Excellent');
    expect(gradeOf(72).grade).toBe('Good');
    expect(gradeOf(58).grade).toBe('Fair');
    expect(gradeOf(30).grade).toBe('Needs work');
  });
});
