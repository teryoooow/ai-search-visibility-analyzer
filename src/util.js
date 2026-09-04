// Shared utilities: URL normalization, HTTP helpers, readability metrics.
// No third-party deps — plain Node.

export const BOT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 ' +
  'SearchVisibilityAnalyzer/1.0 (+https://github.com/teryoooow/ai-search-visibility-analyzer)';

/** Add scheme if missing, validate, return clean URL string. Throws on garbage. */
export function normalizeUrl(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('No URL provided.');
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`"${input}" is not a valid URL.`);
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http/https URLs are supported.');
  return u.href;
}

export function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** fetch with timeout + size cap. Returns {ok, status, headers, text, finalUrl} or throws HttpError. */
export class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function fetchText(url, { timeoutMs = 15000, maxBytes = 2_000_000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': BOT_UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.8', ...headers },
    });
    if (!res.ok && res.status < 300) throw new HttpError(`HTTP ${res.status} ${res.statusText}`, res.status);
    const buf = await res.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buf.slice(0, Math.min(buf.byteLength, maxBytes)));
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url,
      headers: Object.fromEntries(res.headers.entries()),
      text,
      bytes: buf.byteLength,
    };
  } catch (e) {
    if (e.name === 'AbortError') throw new HttpError(`Request timed out after ${timeoutMs}ms.`, 408);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHeadish(url, { timeoutMs = 12000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': BOT_UA, range: 'bytes=0-2048', ...headers },
    });
    // Read a small slice only — enough to sniff XML/HTML for robots/sitemap checks.
    let chunk = '';
    const reader = res.body?.getReader();
    if (reader) {
      const { value } = await reader.read();
      chunk = value ? new TextDecoder().decode(value.slice(0, 4096)) : '';
      await reader.cancel().catch(() => {});
    } else {
      chunk = await res.text().catch(() => '');
    }
    return { ok: res.ok, status: res.status, finalUrl: res.url, headers: Object.fromEntries(res.headers.entries()), head: chunk.slice(0, 2048) };
  } catch (e) {
    if (e.name === 'AbortError') throw new HttpError(`Request timed out after ${timeoutMs}ms.`, 408);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------- text metrics ------------------------------- */

const VOWEL_RUN = /[aeiouy]+/g;

export function countWords(text) {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

// Sentence ends: classic punctuation, plus typographic separators (— · | •)
// and semicolons so fragment-heavy pages (tag lists, headings) don't merge
// into one giant pseudo-sentence that breaks readability math.
const SENT_END = /(?<=[.!?;])\s+|(?<=[—–·•|])\s+|(?<=:)\s+(?=[A-Z0-9"“'(])/;

export function splitSentences(text) {
  const cleaned = text.replace(
    /\b(Dr|Mr|Mrs|Ms|St|vs|etc|e\.g|i\.e|Inc|Ltd|Jr|Sr|No|Fig|approx|U\.S|U\.K)\./gi,
    '$1',
  );
  return cleaned
    .split(SENT_END)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

export function countSentences(text) {
  return splitSentences(text).length;
}

export function countSyllables(text) {
  let total = 0;
  for (const word of text.toLowerCase().match(/[\p{L}]+/gu) || []) {
    const runs = word.match(VOWEL_RUN) || [];
    let n = runs.length;
    if (word.endsWith('e') && n > 1) n -= 1; // silent e
    if (word.endsWith('le') && n > 1 && !word.endsWith('ble')) n -= 1;
    total += Math.max(1, n);
  }
  return total;
}

/** Flesch Reading Ease (0-100, higher = easier). Returns null when text too short. */
export function fleschReadingEase(text) {
  const words = countWords(text);
  const sentences = countSentences(text);
  const syllables = countSyllables(text);
  if (words < 20 || sentences === 0) return null;
  return 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
}

/** Flesch-Kincaid Grade Level (US school grade). Returns null when text too short. */
export function fleschKincaidGrade(text) {
  const words = countWords(text);
  const sentences = countSentences(text);
  const syllables = countSyllables(text);
  if (words < 20 || sentences === 0) return null;
  return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function round1(v) {
  return Math.round(v * 10) / 10;
}

export function truncate(str, n) {
  if (!str) return str;
  return str.length <= n ? str : str.slice(0, n - 1).trimEnd() + '…';
}
