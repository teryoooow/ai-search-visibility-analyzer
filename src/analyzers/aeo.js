// AEO analyzer — answer engines & direct answers (featured snippets, AI
// Overviews, voice assistants). Question answered: "Can a machine extract one
// clear, citable answer from this page — and is it marked up for it?"

import { makeCheck, finalizeCategory } from '../score.js';
import { truncate } from '../util.js';

const HIGH_VALUE_TYPES = new Set([
  'FAQPage', 'HowTo', 'Article', 'BlogPosting', 'Product', 'Organization',
  'LocalBusiness', 'BreadcrumbList', 'QAPage', 'Person', 'Event', 'Recipe',
  'VideoObject', 'Course', 'SoftwareApplication',
]);
const GENERIC_TYPES = new Set(['WebSite', 'WebPage', 'AboutPage', 'ContactPage', 'CollectionPage', 'ItemList', 'ImageObject']);

export function analyzeAEO(page) {
  const checks = [];
  const s = page.schema;

  // 1. Schema presence & validity
  if (s.validBlocks >= 1) {
    checks.push(makeCheck('schema-valid', 'Schema.org markup parses cleanly', 2, 'pass',
      `${s.validBlocks} valid JSON-LD block${s.validBlocks > 1 ? 's' : ''} found.`));
  } else if (s.rawCount > 0) {
    checks.push(makeCheck('schema-valid', 'Schema.org markup parses cleanly', 2, 'fail',
      `${s.invalidBlocks} JSON-LD block${s.invalidBlocks > 1 ? 's' : ''} present but unparseable — answer engines will ignore broken markup.`,
      truncate(s.errors.join(' | '), 300)));
  } else {
    checks.push(makeCheck('schema-valid', 'Schema.org markup parses cleanly', 2, 'warn',
      'No JSON-LD found. Schema is the fastest way to tell answer engines exactly what this page is.'));
  }

  // 2. High-value schema types
  const types = s.types || [];
  if (s.validBlocks === 0) {
    checks.push(makeCheck('schema-types', 'High-value schema types present', 2, 'skip', 'No valid schema to evaluate.'));
  } else {
    const hv = types.filter((t) => HIGH_VALUE_TYPES.has(t));
    const generic = types.filter((t) => GENERIC_TYPES.has(t));
    const unknown = types.filter((t) => !HIGH_VALUE_TYPES.has(t) && !GENERIC_TYPES.has(t));
    if (hv.length) {
      checks.push(makeCheck('schema-types', 'High-value schema types present', 2, 'pass',
        `Types detected: ${[...new Set(hv)].join(', ')}.`, [...new Set(types)].join(', ')));
    } else if (generic.length && !unknown.length) {
      checks.push(makeCheck('schema-types', 'High-value schema types present', 2, 'warn',
        `Only generic types (${[...new Set(generic)].join(', ')}) — add rich types like FAQPage, Organization, Article, or BreadcrumbList.`));
    } else {
      checks.push(makeCheck('schema-types', 'High-value schema types present', 2, 'warn',
        `Types detected (${[...new Set(types)].slice(0, 5).join(', ')}) — none of the high-value answer-engine types.`));
    }
  }

  // 3. Schema quality (required fields per type)
  if (s.entities.length === 0) {
    checks.push(makeCheck('schema-quality', 'Schema entities carry required fields', 3, 'skip', 'No schema entities to evaluate.'));
  } else {
    const required = {
      Organization: ['name', 'url'],
      LocalBusiness: ['name', 'address'],
      FAQPage: ['mainEntity'],
      HowTo: ['name', 'step'],
      Article: ['headline', 'datePublished', 'author'],
      BlogPosting: ['headline', 'datePublished', 'author'],
      Product: ['name', 'offers'],
      BreadcrumbList: ['itemListElement'],
      QAPage: ['mainEntity'],
      Person: ['name'],
      Event: ['name', 'startDate'],
      Recipe: ['name', 'recipeIngredient', 'recipeInstructions'],
      Course: ['name'],
      SoftwareApplication: ['name', 'offers'],
    };
    let complete = 0;
    const missingNotes = [];
    for (const ent of s.entities) {
      const reqs = required[ent.type];
      if (!reqs) continue;
      const missing = reqs.filter((f) => ent[f] === undefined || ent[f] === null || (typeof ent[f] === 'string' && !ent[f].trim()));
      if (missing.length === 0) complete += 1;
      else missingNotes.push(`${ent.type} missing: ${missing.join(', ')}`);
    }
    const evaluated = s.entities.filter((e) => required[e.type]).length;
    if (evaluated === 0) {
      checks.push(makeCheck('schema-quality', 'Schema entities carry required fields', 3, 'warn',
        'Schema types present are not in the field-validated set — verify their properties manually.'));
    } else {
      const ratio = complete / evaluated;
      checks.push(makeCheck('schema-quality', 'Schema entities carry required fields', 3,
        ratio >= 0.8 ? 'pass' : ratio >= 0.5 ? 'warn' : 'fail',
        `${complete}/${evaluated} validated entities are complete.${missingNotes.length ? ' ' + truncate(missingNotes.join('; '), 220) : ''}`));
    }
  }

  // 4. FAQ-shaped content
  const qHeadings = page.questionHeadings || [];
  if (qHeadings.length >= 1) {
    checks.push(makeCheck('faq-content', 'Question-style headings present (FAQ-ready)', 3, 'pass',
      `${qHeadings.length} question heading${qHeadings.length > 1 ? 's' : ''} (e.g. "${truncate(qHeadings[0].text, 70)}") — pair with FAQPage schema for direct-answer eligibility.`));
  } else {
    checks.push(makeCheck('faq-content', 'Question-style headings present (FAQ-ready)', 3, 'warn',
      'No question-shaped headings (H2/H3 ending in "?"). A short FAQ section captures voice & featured-snippet queries.'));
  }

  // 5. Lead (definitional) paragraph — snippet-ready opening
  const p0 = (page.paragraphs || [])[0];
  if (p0 && page.wordCount >= 60) {
    const w = p0.split(/\s+/).length;
    if (w >= 25 && w <= 140) {
      checks.push(makeCheck('lead-answer', 'Opening paragraph is a self-contained answer', 3, 'pass',
        `Lead paragraph is ${w} words — extractable as a direct answer.`, truncate(p0, 220)));
    } else {
      checks.push(makeCheck('lead-answer', 'Opening paragraph is a self-contained answer', 3, 'warn',
        `Lead paragraph is ${w} words — answer engines favor a concise 25–140 word opening that states the answer up front.`, truncate(p0, 220)));
    }
  } else if (page.wordCount < 60) {
    checks.push(makeCheck('lead-answer', 'Opening paragraph is a self-contained answer', 3, 'fail',
      'Too little text on the page for any answer extraction.'));
  } else {
    checks.push(makeCheck('lead-answer', 'Opening paragraph is a self-contained answer', 3, 'warn',
      'No substantial paragraph found near the top of the content.'));
  }

  // 6. Snippet-length blocks
  const paras = page.paragraphs || [];
  const sized = paras.filter((p) => {
    const w = p.split(/\s+/).length;
    return w >= 30 && w <= 90;
  });
  const ratio = paras.length >= 3 ? sized.length / paras.length : null;
  if (ratio === null) {
    checks.push(makeCheck('snippet-blocks', 'Content has snippet-sized passages (30–90 words)', 2, 'warn',
      'Fewer than 3 paragraphs — not enough scannable blocks for snippet extraction.'));
  } else if (ratio >= 0.4) {
    checks.push(makeCheck('snippet-blocks', 'Content has snippet-sized passages (30–90 words)', 2, 'pass',
      `${sized.length}/${paras.length} paragraphs fall in the 30–90 word sweet spot for featured snippets.`));
  } else {
    checks.push(makeCheck('snippet-blocks', 'Content has snippet-sized passages (30–90 words)', 2, 'warn',
      `Only ${sized.length}/${paras.length} paragraphs are snippet-sized — break up long walls of text.`));
  }

  // 7. Lists & tables
  if (page.listItems >= 3 || page.tables >= 1) {
    checks.push(makeCheck('list-table', 'Lists / tables present', 2, 'pass',
      `${page.listItems} list items, ${page.tables} table${page.tables === 1 ? '' : 's'} — answer engines parse these into direct answers.`));
  } else {
    checks.push(makeCheck('list-table', 'Lists / tables present', 2, 'warn',
      'No substantial lists or tables — steps, comparisons, and specs in list/table form get lifted into answers.'));
  }

  // 8. Plain language (readable = extractable)
  const f = page.flesch;
  if (f === null) {
    checks.push(makeCheck('plain-language', 'Plain-language writing (Flesch ≥ 60)', 2, 'warn', 'Not enough text to score readability.'));
  } else if (f >= 60) {
    checks.push(makeCheck('plain-language', 'Plain-language writing (Flesch ≥ 60)', 2, 'pass', `Flesch Reading Ease ${f} — conversational and easy to quote.`));
  } else if (f >= 45) {
    checks.push(makeCheck('plain-language', 'Plain-language writing (Flesch ≥ 60)', 2, 'warn', `Flesch Reading Ease ${f} — aim for ≥60; answer engines favor plain, scannable prose.`));
  } else {
    checks.push(makeCheck('plain-language', 'Plain-language writing (Flesch ≥ 60)', 2, 'fail', `Flesch Reading Ease ${f} — dense writing is harder to extract into short answers.`));
  }

  // 9. Recency / dated content
  if (page.hasRecentDate || page.pubTime || page.timeTagDate) {
    const src = page.pubTime || page.timeTagDate || page.years.filter((y) => /^20(2[4-9]|[3-9]\d)$/.test(y)).join(',');
    checks.push(makeCheck('dated-content', 'Content carries a recency signal', 2, 'pass',
      `Freshness signal found (${src || 'recent year mentioned'}) — answer engines prefer dated, current content.`));
  } else if (page.years.length) {
    checks.push(makeCheck('dated-content', 'Content carries a recency signal', 2, 'warn',
      `Only year(s) ${page.years.slice(0, 4).join(', ')} found — stale or undated content is less likely to be served as an answer.`));
  } else {
    checks.push(makeCheck('dated-content', 'Content carries a recency signal', 2, 'warn',
      'No visible dates at all — add a publish/updated date so answer engines can assess freshness.'));
  }

  // 10. Explicit Q&A language
  const first300 = (page.paragraphs || []).slice(0, 2).join(' ');
  if (page.whSentenceOpeners >= 1 || /\b(is a|are a|refers to|defined as|means)\b/i.test(first300)) {
    checks.push(makeCheck('qa-language', 'Content speaks in explicit Q&A / definitions', 2, 'pass',
      'Content opens questions or definitions directly — the pattern answer engines extract from.'));
  } else {
    checks.push(makeCheck('qa-language', 'Content speaks in explicit Q&A / definitions', 2, 'warn',
      'No explicit "What is… / …is a…" definitional patterns near the top. State key terms plainly early.'));
  }

  return finalizeCategory('AEO', 'Can answer engines extract one clear, citable answer from this page?', checks);
}
