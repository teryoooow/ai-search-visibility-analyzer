// GEO LLM analysis — the main GEO function. An actual LLM reads the page the
// way ChatGPT/Perplexity would and reports whether/how it would cite it. It
// runs as part of every analysis and feeds the report's GEO LLM section. It is
// skipped only when no API key is configured (noted explicitly in the report);
// the deterministic GEO score above never depends on this call.

import { chatJSON } from './llm.js';

export function llmConfigured() {
  return !!(process.env.GEO_LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY);
}

export async function geoSecondOpinion(page) {
  const pageFacts = {
    url: page.url,
    title: page.title,
    metaDescription: page.metaDescription?.slice(0, 300),
    h1: page.h1s[0],
    h2s: page.allHeadings.filter((h) => h.lvl === 2).slice(0, 15).map((h) => h.text),
    brandGuess: page.brandGuess,
    wordCount: page.wordCount,
    schemaTypes: page.schema.types.slice(0, 12),
    textExcerpt: page.llmText.slice(0, 14000),
  };

  const system = [
    'You are a GEO (Generative Engine Optimization) analyst. You audit web pages the way ChatGPT,',
    'Perplexity, Gemini, and AI Overviews actually consume them: can you identify the entity, trust',
    'it, extract a faithful summary, and cite it? You only report on the evidence given — you never',
    'invent facts about the site.',
  ].join(' ');

  const user = [
    'Analyze this page as a generative search engine would. Return STRICT JSON with exactly these keys:',
    '{',
    '  "entity_identified": "yes|no|partial",',
    '  "entity_summary": "one sentence naming what/who this page is",',
    '  "would_cite": "yes|likely|unlikely|no",',
    '  "confidence": 0-100,',
    '  "as_what": "how a model would describe/categorize this source, one short phrase",',
    '  "quote_fragment": "the single most quotable sentence on the page, verbatim from the text, or empty string",',
    '  "trust_concerns": ["short list of anything that lowers trust: anonymity, stale dates, missing sources, boilerplate, thin content"],',
    '  "geo_gaps": ["3-5 concrete, actionable gaps that would raise the chance of citation"]',
    '}',
    '',
    'PAGE FACTS:',
    JSON.stringify(pageFacts, null, 1),
  ].join('\n');

  const out = await chatJSON([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.2 });
  return normalize(out);
}

function normalize(raw) {
  return {
    entityIdentified: String(raw.entity_identified ?? 'unknown'),
    entitySummary: String(raw.entity_summary ?? '').slice(0, 400),
    wouldCite: String(raw.would_cite ?? 'unknown'),
    confidence: Number.isFinite(raw.confidence) ? Math.max(0, Math.min(100, Math.round(raw.confidence))) : null,
    asWhat: String(raw.as_what ?? '').slice(0, 200),
    quoteFragment: String(raw.quote_fragment ?? '').slice(0, 500),
    trustConcerns: Array.isArray(raw.trust_concerns) ? raw.trust_concerns.slice(0, 6).map(String) : [],
    geoGaps: Array.isArray(raw.geo_gaps) ? raw.geo_gaps.slice(0, 6).map(String) : [],
  };
}
