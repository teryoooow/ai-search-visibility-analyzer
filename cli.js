#!/usr/bin/env node
// CLI: analyze a URL without a browser UI.
//   node cli.js https://example.com [--json out.json] [--md out.md] [--llm] [--shot out.jpg]

import fs from 'node:fs';
import path from 'node:path';
import { analyzeUrlOnce } from './src/analyze.js';
import { reportToMarkdown, topActions } from './src/report.js';
import { normalizeUrl } from './src/util.js';

const args = process.argv.slice(2);
const flags = { json: null, md: null, llm: false, shot: null };
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--json') flags.json = args[++i];
  else if (a === '--md') flags.md = args[++i];
  else if (a === '--llm') flags.llm = true;
  else if (a === '--shot') flags.shot = args[++i];
  else if (a === '--help' || a === '-h') { help(); process.exit(0); }
  else positional.push(a);
}

if (!positional.length) { help(); process.exit(0); }

let url;
try {
  url = normalizeUrl(positional[0]);
} catch (e) {
  console.error(`✖ ${e.message}`);
  process.exit(1);
}

console.log(`\n  🔎 AI Search Visibility Analyzer\n  ${'─'.repeat(46)}`);
console.log(`  Target : ${url}`);

const started = Date.now();
const phases = {
  browser: 'launching headless Chrome',
  render: 'rendering page (JS included)',
  vitals: 'running Lighthouse (Core Web Vitals)',
  crawl: 'probing robots.txt & sitemap',
  analyze: 'scoring SEO/AEO/GEO',
  llm: 'LLM second opinion',
  done: 'done',
};

try {
  const report = await analyzeUrlOnce(url, {
    useLlm: flags.llm,
    onProgress: ({ phase, message }) => {
      if (phase !== 'done' && phase !== 'browser') console.log(`  · ${message}`);
      else if (phase === 'browser') console.log(`  · ${message}`);
    },
  });

  // ---- console summary ----
  console.log(`  ${'─'.repeat(46)}`);
  console.log(`  VISIBILITY INDEX : ${report.overview.visibilityIndex}/100 (${report.overview.grade})`);
  console.log(`  SEO : ${report.categories.seo.score}/100 (${report.categories.seo.grade})   AEO : ${report.categories.aeo.score}/100 (${report.categories.aeo.grade})   GEO : ${report.categories.geo.score}/100 (${report.categories.geo.grade})`);
  console.log(`  ${'─'.repeat(46)}`);
  console.log('\n  Top actions:');
  topActions(report).forEach((a, i) => console.log(`   ${i + 1}. ${a}`));
  console.log(`\n  Finished in ${Math.round((Date.now() - started) / 1000)}s · HTTP ${report.meta.httpStatus} · ${report.page.wordCount} words analyzed`);

  // ---- artifacts ----
  const dir = flags.json || flags.md || flags.shot ? path.dirname(flags.json || flags.md || flags.shot) : null;
  if (dir) fs.mkdirSync(dir, { recursive: true });

  if (flags.shot && report.screenshot) {
    const b64 = report.screenshot.split(',')[1];
    fs.writeFileSync(flags.shot, Buffer.from(b64, 'base64'));
    console.log(`  📸 Screenshot → ${flags.shot}`);
  }
  if (flags.json) {
    const clean = structuredClone(report);
    fs.writeFileSync(flags.json, JSON.stringify(clean, null, 2));
    console.log(`  💾 JSON report → ${flags.json}`);
  }
  if (flags.md) {
    fs.writeFileSync(flags.md, reportToMarkdown(report));
    console.log(`  📝 Markdown report → ${flags.md}`);
  }
  console.log('');
} catch (e) {
  console.error(`\n✖ Analysis failed: ${e.message}`);
  process.exit(1);
}

function help() {
  console.log(`
Usage: node cli.js <url> [options]

Analyzes a URL across SEO (clicks), AEO (direct answers), and GEO (LLM citations).

Options:
  --json <file>   Write the full JSON report to a file
  --md <file>     Write a Markdown report to a file
  --shot <file>   Save a screenshot of the page (JPEG)
  --llm           Enable the LLM second opinion (needs GEO_LLM_API_KEY or OPENAI_API_KEY)

Examples:
  node cli.js https://example.com
  node cli.js https://example.com --json report.json --md report.md --shot shot.jpg
`);
}
