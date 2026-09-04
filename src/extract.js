// Rendered-HTML → normalized page model. Pure functions over cheerio.
// This is the single source of truth every analyzer reads from.

import * as cheerio from 'cheerio';
import {
  countWords, countSentences, countSyllables, splitSentences,
  fleschReadingEase, fleschKincaidGrade, hostnameOf,
} from './util.js';

const BOILERPLATE_RE =
  /lorem ipsum|coming soon|under construction|placeholder|page under maintenance|tbd\b|todo:?|example\.com|insert (text|image|content)/gi;
const BUZZ_RE =
  /world-class|cutting-edge|game-?chang(ing|er)|revolutionary|best-in-class|synerg(y|ies)|state-of-the-art|disruptive|unparalleled/gi;
const ATTRIBUTION_RE =
  /according to|source\s*[::]|reported by|a (202[0-9]|20[0-9]{2}) (study|survey|report)|research (shows|found)|data (shows|from)|as of (january|february|march|april|may|june|july|august|september|october|november|december)/gi;
const WH_WORDS = /^(what|why|how|when|where|who|which|can|do|does|is|are)\b/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const PHONE_RE = /(\+?\d[\d\s().-]{6,}\d)/;
const YEAR_RE = /\b(19|20)\d{2}\b/g;
const SOCIAL_RE =
  /(linkedin\.com|facebook\.com|fb\.com|x\.com|twitter\.com|instagram\.com|youtube\.com|github\.com|tiktok\.com)/i;
const ABOUT_RE = /(^|\/)(about|about-us|team|our-story|who-we-are)(\/|$|#)/i;
const STAT_RE =
  /%|\b\d[\d,]*\.?\d*\s*(million|billion|thousand|k|m|b|users|customers|clients|members|countries|years|stars|reviews|projects|channels|episodes|downloads|requests|respondents|sqm|sq\.?\s?m|hectares|rooms|guests|nights)\b/gi;
const QUOTE_RE = /["\u201C\u201D\u2018\u2019\u00AB\u00BB]/g;

const RECENT_YEARS = new Set(['2024', '2025', '2026', '2027']);

export function extractPageModel(html, url) {
  const $ = cheerio.load(html);
  const finalHost = hostnameOf(url);
  const textOf = (sel) => $(sel).first().text().replace(/\s+/g, ' ').trim();

  // ---- head / metadata ----
  const meta = (name) => $(`meta[name="${name}"], meta[property="${name}"]`).first().attr('content') || '';
  const og = {};
  $('meta[property^="og:"]').each((_, el) => {
    const p = $(el).attr('property').slice(3);
    og[p] = $(el).attr('content') || '';
  });

  const canonical = $('link[rel="canonical"]').first().attr('href') || '';
  const robotsMeta = (meta('robots') || meta('googlebot')).toLowerCase();
  const charset =
    $('meta[charset]').first().attr('charset') ||
    ($('meta[http-equiv="content-type"]').first().attr('content') || '').match(/charset=([\w-]+)/)?.[1] ||
    '';

  // ---- headings & structure ----
  const h1s = [];
  const headingSeq = [];
  const allHeadings = [];
  $('h1,h2,h3,h4,h5,h6').each((_, el) => {
    const lvl = Number(el.tagName[1]);
    const txt = $(el).text().replace(/\s+/g, ' ').trim();
    if (!txt) return;
    allHeadings.push({ lvl, text: txt });
    headingSeq.push(lvl);
    if (lvl === 1) h1s.push(txt);
  });

  const semantic = {};
  for (const tag of ['main', 'article', 'nav', 'header', 'footer', 'section', 'aside']) {
    semantic[tag] = $(tag).length;
  }

  // ---- links ----
  const links = { internal: 0, external: 0, nofollow: 0, about: 0, social: 0, total: 0, authority: 0 };
  const authorityDomains =
    /(wikipedia\.org|\.gov|\.edu|who\.int|oecd\.org|reuters\.com|apnews\.com|bbc\.com|bloomberg\.com|forbes\.com|nature\.com|sciencedirect\.com|nih\.gov|statista\.com|gartner\.com|forrester\.com|theguardian\.com|nytimes\.com|wsj\.com)/i;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const rel = ($(el).attr('rel') || '').toLowerCase();
    if (href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    links.total += 1;
    if (rel.includes('nofollow')) links.nofollow += 1;
    try {
      const u = new URL(href, url);
      if (hostnameOf(u.href) === finalHost) links.internal += 1;
      else {
        links.external += 1;
        if (authorityDomains.test(u.hostname)) links.authority += 1;
      }
      // authority signals work for internal About pages and external socials alike
      if (ABOUT_RE.test(u.pathname)) links.about += 1;
      if (SOCIAL_RE.test(u.hostname)) links.social += 1;
    } catch {
      /* ignore malformed */
    }
  });

  // ---- schema.org (JSON-LD) ----
  const schema = { rawCount: 0, validBlocks: 0, invalidBlocks: 0, types: [], entities: [], errors: [] };
  $('script[type="application/ld+json"]').each((_, el) => {
    schema.rawCount += 1;
    const raw = $(el).html() || '';
    let parsed;
    try {
      parsed = JSON.parse(raw.trim());
    } catch (e) {
      schema.invalidBlocks += 1;
      schema.errors.push(`Unparseable JSON-LD: ${raw.slice(0, 80).replace(/\s+/g, ' ')}…`);
      return;
    }
    const list = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed];
    schema.validBlocks += 1;
    for (const ent of list) {
      if (!ent || typeof ent !== 'object') continue;
      const type = Array.isArray(ent['@type']) ? ent['@type'][0] : ent['@type'];
      if (!type) continue;
      schema.types.push(type);
      schema.entities.push({ type, ...ent });
    }
  });
  const typeCount = {};
  for (const t of schema.types) typeCount[t] = (typeCount[t] || 0) + 1;

  // social profiles declared via schema sameAs also count as citation signals
  for (const ent of schema.entities) {
    const sameAs = Array.isArray(ent.sameAs) ? ent.sameAs : ent.sameAs ? [ent.sameAs] : [];
    for (const s of sameAs) {
      if (typeof s === 'string' && SOCIAL_RE.test(s)) links.social += 1;
    }
  }

  // ---- main content text ----
  const mainSel = $('main, article').first();
  const bodySel = $('body').first();
  let contentRoot = mainSel.length ? mainSel : bodySel;
  // If the declared content container is nearly empty but the body holds real
  // copy, the site probably keeps content in generic sections — fall back to body.
  if (contentRoot !== bodySel) {
    const containerWords = countWords(htmlToText(contentRoot));
    const bodyWords = countWords(htmlToText(bodySel));
    if (bodyWords > 150 && containerWords < Math.min(120, bodyWords * 0.4)) {
      contentRoot = bodySel;
    }
  }

  const paragraphs = [];
  contentRoot.find('p').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t && countWords(t) >= 3) paragraphs.push(t);
  });

  // cleanText: serialize to HTML and strip tags so block elements become
  // spaces (cheerio .text() concatenates <p>a</p><p>b</p> into "ab").
  const cleanText = htmlToText(contentRoot);

  const wordCount = countWords(cleanText);
  const sentenceCount = countSentences(cleanText);
  const flesch = fleschReadingEase(cleanText);
  const fkgl = fleschKincaidGrade(cleanText);
  // sentence length distribution for quotability heuristics
  const sentences = splitSentences(cleanText);
  const shortSentences = sentences.filter((s) => countWords(s) <= 16).length;

  // ---- dates / freshness ----
  const yearMatches = cleanText.match(YEAR_RE) || [];
  const years = [...new Set(yearMatches)];
  const hasRecentDate = years.some((y) => RECENT_YEARS.has(y));
  const timeTagDate = $('time[datetime]').first().attr('datetime') || '';
  const pubTime = meta('article:published_time') || $('meta[name="date"]').first().attr('content') || '';

  // ---- images ----
  const imgs = { total: 0, missingAlt: 0 };
  $('img').each((_, el) => {
    const alt = $(el).attr('alt');
    if ($(el).attr('src')?.startsWith('data:')) return; // ignore inline data images
    imgs.total += 1;
    if (alt === undefined || alt.trim() === '') imgs.missingAlt += 1;
  });

  // ---- brand / entity candidates ----
  const titleText = textOf('title');
  const brandGuess =
    og['site_name'] ||
    titleText.split(/[|–—-]/)[0].trim() ||
    (h1s[0] || '').split(/\s{2,}|\.|\n/)[0] ||
    finalHost;
  const textLower = cleanText.toLowerCase();
  const brandLower = brandGuess.toLowerCase();
  const brandOccurrences = brandLower ? (cleanText.match(new RegExp(brandLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length : 0;
  const firstHundred = cleanText.split(/\s+/).slice(0, 100).join(' ');
  const brandInFirst100 = brandLower ? firstHundred.toLowerCase().includes(brandLower) : false;
  const brandInTitle = titleText.toLowerCase().includes(brandLower);
  const brandInH1 = h1s.length ? h1s[0].toLowerCase().includes(brandLower) : false;
  const footerText = $('footer').first().text().replace(/\s+/g, ' ').trim();
  const brandInFooter = brandLower ? footerText.toLowerCase().includes(brandLower) : false;

  // ---- quotability / stats / sourcing signals ----
  const quoteCount = (cleanText.match(QUOTE_RE) || []).length;
  const statMatches = cleanText.match(STAT_RE) || [];
  const statsPer100Words = wordCount ? (statMatches.length / wordCount) * 100 : 0;
  const attributionHits = cleanText.match(ATTRIBUTION_RE) || [];
  const boilerplateHits = cleanText.match(BOILERPLATE_RE) || [];
  const buzzHits = cleanText.match(BUZZ_RE) || [];
  const emailFound = EMAIL_RE.test(cleanText);
  const phoneFound = PHONE_RE.test(cleanText);

  // ---- AEO: Q&A shaped content ----
  const questionHeadings = allHeadings.filter((h) => /\?\s*$/.test(h.text) || WH_WORDS.test(h.text));
  const whSentenceOpeners = sentences.filter((s) => WH_WORDS.test(s.trim())).length;

  // ---- lists & tables (answer-engine friendly formatting) ----
  let listItems = 0;
  let tables = 0;
  contentRoot.find('ul,ol').each((_, el) => {
    listItems += $(el).find('li').length;
  });
  tables = contentRoot.find('table').length;

  // ---- hidden / deferred content ----
  let hiddenContentChars = 0;
  contentRoot.find('[hidden], [aria-hidden="true"], details:not([open])').each((_, el) => {
    hiddenContentChars += ($(el).text() || '').length;
  });

  return {
    url,
    finalHost,
    title: titleText,
    metaDescription: meta('description'),
    canonical,
    robotsMeta,
    charset,
    viewport: meta('viewport'),
    og,
    h1s,
    headingSeq,
    allHeadings,
    questionHeadings,
    semantic,
    links,
    schema: { ...schema, typeCount },
    paragraphs,
    wordCount,
    sentenceCount,
    flesch: flesch === null ? null : Math.round(flesch * 10) / 10,
    fkgl: fkgl === null ? null : Math.round(fkgl * 10) / 10,
    sentences,
    shortSentences,
    years,
    hasRecentDate,
    timeTagDate,
    pubTime,
    imgs,
    brandGuess,
    brandOccurrences,
    brandInFirst100,
    brandInTitle,
    brandInH1,
    brandInFooter,
    quoteCount,
    statMatches,
    statsPer100Words,
    attributionHits,
    boilerplateHits,
    buzzHits,
    emailFound,
    phoneFound,
    whSentenceOpeners,
    listItems,
    tables,
    hiddenContentChars,
    // trimmed raw text for the optional LLM layer (never stored in reports)
    llmText: truncateForLLM(cleanText),
  };
}

function truncateForLLM(text) {
  const words = text.split(/\s+/);
  const first = words.slice(0, 1600).join(' ');
  const last = words.length > 2200 ? words.slice(-200).join(' ') : '';
  return first + (last ? `\n\n[…content truncated…]\n\n${last}` : '');
}

/** Serialize a cheerio node to readable text with word boundaries intact. */
function htmlToText(root) {
  const clone = root.clone();
  clone.find('script,style,noscript,svg,button,nav,iframe,form,footer,canvas,audio,video').remove();
  clone.find('br').replaceWith(' ');
  const html = clone.html() || '';
  return (
    html
      .replace(/<[^>]+>/g, ' ') // every tag boundary becomes a space
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0?39;|&#x27;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function statusOf(condition, passDetail, warnDetail, failDetail) {
  if (condition === true) return { status: 'pass', detail: passDetail };
  if (condition === false) return { status: 'fail', detail: failDetail };
  return { status: 'warn', detail: warnDetail };
}
