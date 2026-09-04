import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractPageModel } from '../src/extract.js';

const goodHtml = readFileSync(fileURLToPath(new URL('./fixtures/good.html', import.meta.url)), 'utf8');
const poorHtml = readFileSync(fileURLToPath(new URL('./fixtures/poor.html', import.meta.url)), 'utf8');

const good = extractPageModel(goodHtml, 'https://example.com/');
const poor = extractPageModel(poorHtml, 'https://example.com/');

describe('extractPageModel — well-optimized fixture', () => {
  it('extracts title, description, canonical, viewport', () => {
    expect(good.title).toContain('Acme Analytics');
    expect(good.metaDescription.length).toBeGreaterThan(70);
    expect(good.canonical).toBe('https://example.com/');
    expect(good.viewport).toBeTruthy();
  });

  it('detects exactly one H1 and clean heading sequence', () => {
    expect(good.h1s).toHaveLength(1);
    expect(good.headingSeq).toEqual([1, 2, 2, 2]);
  });

  it('parses all three JSON-LD blocks into typed entities', () => {
    expect(good.schema.rawCount).toBe(3);
    expect(good.schema.validBlocks).toBe(3);
    expect(good.schema.invalidBlocks).toBe(0);
    expect(good.schema.types).toContain('Organization');
    expect(good.schema.types).toContain('FAQPage');
    expect(good.schema.types).toContain('BreadcrumbList');
  });

  it('extracts meaningful content volume and metrics', () => {
    expect(good.wordCount).toBeGreaterThan(300);
    expect(good.sentenceCount).toBeGreaterThan(10);
    expect(good.flesch).not.toBeNull();
    expect(good.fkgl).not.toBeNull();
  });

  it('identifies the brand and its recurrence', () => {
    expect(good.brandGuess).toContain('Acme Analytics');
    expect(good.brandOccurrences).toBeGreaterThanOrEqual(3);
    expect(good.brandInTitle).toBe(true);
    expect(good.brandInH1).toBe(true);
    expect(good.brandInFooter).toBe(true);
  });

  it('finds authority, attribution, stats, quotes, and dates', () => {
    expect(good.links.about).toBeGreaterThanOrEqual(1);
    expect(good.links.social).toBeGreaterThanOrEqual(1);
    expect(good.attributionHits.length).toBeGreaterThanOrEqual(1);
    expect(good.statMatches.length).toBeGreaterThanOrEqual(4);
    expect(good.quoteCount).toBeGreaterThanOrEqual(2);
    expect(good.hasRecentDate).toBe(true);
    expect(good.emailFound).toBe(true);
    expect(good.phoneFound).toBe(true);
  });

  it('detects FAQ headings and Q&A formatting', () => {
    expect(good.questionHeadings.length).toBeGreaterThanOrEqual(1);
    expect(good.listItems).toBeGreaterThanOrEqual(3);
    expect(good.tables).toBeGreaterThanOrEqual(1);
  });
});

describe('extractPageModel — poor fixture', () => {
  it('sees empty title, broken schema, no viewport', () => {
    expect(poor.title).toBe('');
    expect(poor.schema.rawCount).toBe(1);
    expect(poor.schema.validBlocks).toBe(0);
    expect(poor.schema.invalidBlocks).toBe(1);
    expect(poor.viewport).toBe('');
  });

  it('flags boilerplate and thin content', () => {
    expect(poor.wordCount).toBeLessThan(50);
    expect(poor.boilerplateHits.length).toBeGreaterThanOrEqual(1);
    expect(poor.h1s.length).toBe(2);
  });
});
