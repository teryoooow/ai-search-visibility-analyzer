// GEO analyzer — generative engines (ChatGPT, Perplexity, Gemini, Claude,
// AI Overviews). Question answered: "Can an LLM confidently identify this
// entity, trust it, and quote/cite it in an answer?"
//
// GEO has two complementary halves: deterministic scoring from verifiable
// on-page signals (below) and the main GEO LLM analysis (see geo-llm.js),
// which runs on every report and reads the page the way a generative engine
// would. The deterministic score never depends on the external model.

import { makeCheck, finalizeCategory } from '../score.js';
import { truncate } from '../util.js';

const AUTHORITY_TYPES = new Set([
  'Organization', 'LocalBusiness', 'Person', 'ProfessionalService',
  'Corporation', 'NGO', 'EducationalOrganization', 'Article', 'BlogPosting',
]);

const CREDENTIAL_RE =
  /\b(certified|licensed|accredited|award|awarded|winner|ISO\s?\d+|est\.?\s*(19|20)\d{2}|since\s*(19|20)\d{2}|years of experience|recognized)\b/i;

export function analyzeGEO(page) {
  const checks = [];
  const brand = page.brandGuess;

  // 1. Entity identification — can the model tell WHO this is?
  const placed = ['title', 'H1', 'first 100 words'].filter((where, i) =>
    [page.brandInTitle, page.brandInH1, page.brandInFirst100][i]);
  if (page.wordCount < 60) {
    checks.push(makeCheck('entity-id', 'Entity self-identifies early & consistently', 4, 'fail',
      `Only ~${page.wordCount} words of content — the page is too thin for any model (or human) to identify what it is.`));
  } else if (placed.length >= 3) {
    checks.push(makeCheck('entity-id', 'Entity self-identifies early & consistently', 4, 'pass',
      `Brand/entity "${truncate(brand, 60)}" appears in ${placed.join(', ')} — an LLM can resolve who this is.`));
  } else if (placed.length === 2) {
    checks.push(makeCheck('entity-id', 'Entity self-identifies early & consistently', 4, 'warn',
      `Brand/entity "${truncate(brand, 60)}" found in ${placed.join(', ')} but not ${['title', 'H1', 'first 100 words'].filter((w) => !placed.includes(w)).join(', ')} — strengthen early self-identification.`));
  } else {
    checks.push(makeCheck('entity-id', 'Entity self-identifies early & consistently', 4, 'fail',
      placed.length === 0
        ? 'No consistent entity name found in title, H1, or opening text — generative engines cannot tell what/who this page is.'
        : `Entity name only appears in ${placed.join(', ')} — most of the page reads anonymously to an LLM.`));
  }

  // 2. Brand presence & consistency across the document
  if (page.brandOccurrences >= 3) {
    checks.push(makeCheck('brand-consistency', 'Brand name recurs consistently (citation signal)', 3, 'pass',
      `"${truncate(brand, 60)}" appears ${page.brandOccurrences}× across the page${page.brandInFooter ? ', including the footer' : ''} — repeated, consistent naming is what LLMs cite.`));
  } else if (page.brandOccurrences >= 1) {
    checks.push(makeCheck('brand-consistency', 'Brand name recurs consistently (citation signal)', 3, 'warn',
      `"${truncate(brand, 60)}" appears only ${page.brandOccurrences}× — echo the brand in headings, body copy, and footer.`));
  } else {
    checks.push(makeCheck('brand-consistency', 'Brand name recurs consistently (citation signal)', 3, 'fail',
      'Brand name never appears in the text body.'));
  }

  // 3. Entity authority signals (About, social proof, credentials, contact)
  let authority = 0;
  const found = [];
  if (page.links.about >= 1) { authority += 1; found.push('About/team page linked'); }
  if (page.links.social >= 1) { authority += 1; found.push(`${page.links.social} social profile link(s)`); }
  if (page.emailFound || page.phoneFound) { authority += 1; found.push('contact email/phone on page'); }
  if (CREDENTIAL_RE.test(page.paragraphs.join(' ') + ' ' + page.title)) { authority += 1; found.push('credential/recognition marker (certified, award, est. year, etc.)'); }
  if (page.pubTime || page.timeTagDate || /\bby\s+[A-Z][a-z]+ [A-Z][a-z]+\b/.test(page.paragraphs.join(' '))) { authority += 1; found.push('byline or publish date'); }
  if (authority >= 3) {
    checks.push(makeCheck('entity-authority', 'Entity authority signals present', 3, 'pass', `${authority} signals found: ${found.join('; ')}.`));
  } else if (authority >= 1) {
    checks.push(makeCheck('entity-authority', 'Entity authority signals present', 3, 'warn', `Only ${authority} signal(s): ${found.join('; ') || 'none listed'} — add an About page, social links, credentials, and a dated byline.`));
  } else {
    checks.push(makeCheck('entity-authority', 'Entity authority signals present', 3, 'fail', 'No authority signals found (About page, socials, credentials, byline, contact).'));
  }

  // 4. Statistics density (LLMs quote numbers)
  const spw = page.statsPer100Words;
  if (spw >= 0.5) {
    checks.push(makeCheck('stats-density', 'Concrete statistics present to quote', 3, 'pass',
      `~${Math.round(spw * 100) / 10} stat-bearing phrases per 100 words — numeric claims are the most-cited content.`, page.statMatches.slice(0, 6).join(' · ')));
  } else if (spw > 0) {
    checks.push(makeCheck('stats-density', 'Concrete statistics present to quote', 3, 'warn',
      `Only ~${Math.round(spw * 100) / 10} stat-bearing phrases per 100 words — add concrete numbers (users, %, years, ratings) LLMs can lift.`, page.statMatches.slice(0, 6).join(' · ') || null));
  } else if (page.wordCount < 120) {
    checks.push(makeCheck('stats-density', 'Concrete statistics present to quote', 3, 'fail',
      'No statistics and too little content to matter — nothing numeric for a model to cite.'));
  } else {
    checks.push(makeCheck('stats-density', 'Concrete statistics present to quote', 3, 'warn',
      'No statistics found — generative engines prefer content with quotable numbers and data.'));
  }

  // 5. Quotability (direct quotes + punchy short sentences)
  const shortRatio = page.sentenceCount ? page.shortSentences / page.sentenceCount : 0;
  if (page.sentenceCount === 0) {
    checks.push(makeCheck('quotability', 'Content is quotable (quotes + punchy sentences)', 2, 'fail',
      'No complete sentences detected in the rendered text — there is nothing to quote.'));
  } else if (page.quoteCount >= 2 || shortRatio >= 0.4) {
    checks.push(makeCheck('quotability', 'Content is quotable (quotes + punchy sentences)', 2, 'pass',
      `${page.quoteCount} quoted passage(s), ${Math.round(shortRatio * 100)}% short sentences — LLMs extract verbatim lines like these.`));
  } else if (page.quoteCount >= 1 || shortRatio >= 0.25) {
    checks.push(makeCheck('quotability', 'Content is quotable (quotes + punchy sentences)', 2, 'warn',
      `Some quotable texture (${page.quoteCount} quote(s), ${Math.round(shortRatio * 100)}% short sentences) — tighten key sentences so they stand alone.`));
  } else {
    checks.push(makeCheck('quotability', 'Content is quotable (quotes + punchy sentences)', 2, 'warn',
      'Few short, standalone sentences — write scannable claims a model could quote verbatim.'));
  }

  // 6. Sourced / grounded claims
  if (page.attributionHits.length >= 1 || page.links.authority >= 1) {
    checks.push(makeCheck('sourced-claims', 'Claims are sourced / grounded', 3, 'pass',
      page.attributionHits.length
        ? `Attribution language found (${truncate(page.attributionHits.slice(0, 2).join('; '), 120)}) — grounded claims earn model trust.`
        : `${page.links.authority} link(s) to authoritative domains (gov/edu/news/research).`));
  } else {
    checks.push(makeCheck('sourced-claims', 'Claims are sourced / grounded', 3, 'warn',
      'No attributions ("according to…", "research shows…") or authority links found — LLMs rank sourced statements above unsupported ones.'));
  }

  // 7. LLM readability (parseable, conversational, structured)
  const g = page.fkgl;
  if (g === null) {
    checks.push(makeCheck('llm-readable', 'Readable by LLMs (FK grade ≤ 11)', 3, 'warn', 'Not enough text to score readability.'));
  } else if (g <= 11) {
    checks.push(makeCheck('llm-readable', 'Readable by LLMs (FK grade ≤ 11)', 3, 'pass', `Flesch-Kincaid grade ${g} — model-friendly prose.`));
  } else if (g <= 14) {
    checks.push(makeCheck('llm-readable', 'Readable by LLMs (FK grade ≤ 11)', 3, 'warn', `Flesch-Kincaid grade ${g} — simplify long sentences so models paraphrase accurately.`));
  } else {
    checks.push(makeCheck('llm-readable', 'Readable by LLMs (FK grade ≤ 11)', 3, 'fail', `Flesch-Kincaid grade ${g} — dense academic prose is hard for models to summarize faithfully.`));
  }

  // 8. Freshness (LLMs weight recency)
  if (page.hasRecentDate || page.pubTime) {
    const src = page.pubTime || page.timeTagDate || page.years.filter((y) => /^20(2[4-9]|[3-9]\d)$/.test(y)).join(',');
    checks.push(makeCheck('geo-freshness', 'Recency signals for the model', 2, 'pass', `Recent-dated content (${src || '2024+ mentioned'}) — models prefer current sources.`));
  } else if (page.years.length) {
    checks.push(makeCheck('geo-freshness', 'Recency signals for the model', 2, 'warn', `Content only references ${page.years.slice(0, 4).join(', ')} — looks stale to a recency-aware model.`));
  } else {
    checks.push(makeCheck('geo-freshness', 'Recency signals for the model', 2, 'warn', 'No dates found — add publish/update dates so models can weigh freshness.'));
  }

  // 9. Distinctiveness (boilerplate poisons citations)
  if (page.boilerplateHits.length) {
    checks.push(makeCheck('distinctive', 'Content is original, not boilerplate', 2, 'fail',
      `Boilerplate/placeholder text detected ("${truncate(page.boilerplateHits[0], 60)}") — models ignore and de-rank template content.`));
  } else if (page.buzzHits.length >= 4) {
    checks.push(makeCheck('distinctive', 'Content is original, not boilerplate', 2, 'warn',
      `Heavy marketing-speak (${page.buzzHits.length} buzzword hits) — vague superlatives reduce quotability.`));
  } else {
    checks.push(makeCheck('distinctive', 'Content is original, not boilerplate', 2, 'pass', 'No placeholder or template filler detected.'));
  }

  // 10. Entity grounding via structured data
  if (s_has(page, AUTHORITY_TYPES)) {
    checks.push(makeCheck('grounding', 'Entity grounded in structured data (Organization/Person/Article…)', 2, 'pass',
      `Schema grounds the entity (${[...page.schema.types].filter((t) => AUTHORITY_TYPES.has(t)).slice(0, 4).join(', ')}) — the same data feeds knowledge graphs models train on.`));
  } else if (page.schema.validBlocks > 0) {
    checks.push(makeCheck('grounding', 'Entity grounded in structured data (Organization/Person/Article…)', 2, 'warn',
      'Schema exists but does not describe the entity itself — add Organization/Person/Article markup with name, logo, and socials.'));
  } else {
    checks.push(makeCheck('grounding', 'Entity grounded in structured data (Organization/Person/Article…)', 2, 'warn',
      'No entity schema — structured data helps models and knowledge graphs resolve the brand.'));
  }

  return finalizeCategory('GEO', 'Would a generative engine confidently identify, trust, and cite this page?', checks);
}

function s_has(page, set) {
  return (page.schema.types || []).some((t) => set.has(t));
}
