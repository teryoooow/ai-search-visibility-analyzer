/* Search Visibility Analyzer — UI logic. Vanilla JS, no dependencies. */
'use strict';

const $ = (sel) => document.querySelector(sel);
const CATS = [
  { key: 'seo', name: 'SEO', color: '#7c5cff' },
  { key: 'aeo', name: 'AEO', color: '#22d3ee' },
  { key: 'geo', name: 'GEO', color: '#34d399' },
];
const ICON = { pass: '✅', warn: '⚠️', fail: '❌', skip: '—' };
let currentReport = null;

/* ---------------- SVG ring (donut) ---------------- */
function ringSVG(score, color, size, { index = false } = {}) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const filled = (score / 100) * c;
  const cls = index ? 'index-ring' : 'ring';
  const grade = index ? gradeText(score) : '';
  return `
  <svg class="${cls}" viewBox="0 0 ${size} ${size}" role="img" aria-label="score ${score}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#223048" stroke-width="7"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="7"
      stroke-linecap="round" stroke-dasharray="${filled} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"
      style="transition: stroke-dasharray 1s ease"/>
    <text class="num" x="50%" y="${size / 2 + (index ? 1 : 2)}" text-anchor="middle" dominant-baseline="middle" font-size="${index ? 30 : 24}">${score}</text>
    ${index ? `<text class="grade-txt" x="50%" y="${size / 2 + 20}" text-anchor="middle" dominant-baseline="middle">/100</text>` : ''}
  </svg>`;
}

function gradeText(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Fair';
  return 'Needs work';
}

/* ---------------- analyze flow ---------------- */
const form = $('#analyzeForm');
const urlInput = $('#urlInput');
const goBtn = $('#goBtn');
const urlError = $('#urlError');
const urlRow = $('.urlrow');

/* Client-side mirror of src/util.js normalizeUrl — keep messages in sync. */
function validateInput(value) {
  const raw = value.trim();
  if (!raw) return 'Enter a URL to analyze.';
  if (raw.length > 2048) return 'URL is too long (max 2048 characters).';
  if (/@/.test(raw.split(/[/?#]/)[0]) && !/^https?:\/\//i.test(raw)) return 'URLs with embedded credentials (user:pass@) are not supported.';
  if (!/^https?:\/\//i.test(raw) && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(raw)) return 'Only http/https URLs are supported.';
  const candidate = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
  let u;
  try { u = new URL(candidate); } catch { return `"${raw}" is not a valid URL.`; }
  if (!['http:', 'https:'].includes(u.protocol)) return 'Only http/https URLs are supported.';
  if (u.username || u.password) return 'URLs with embedded credentials (user:pass@) are not supported.';
  const host = u.hostname;
  if (host === '' || host.startsWith('.') || host.endsWith('.') || host.includes('..')) return `"${raw}" is not a valid URL.`;
  if (/[\s%]/.test(host)) return `"${raw}" is not a valid URL.`;
  const isIpv6 = host.startsWith('[') && host.endsWith(']');
  const isIpv4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(host);
  if (host === 'localhost' || isIpv6 || isIpv4) return null;
  if (!host.includes('.')) return `"${raw}" is missing a domain — use a public URL like example.com (or localhost for local testing).`;
  const labels = host.split('.');
  const dnsLabel = (l) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(l);
  if (!labels.every(dnsLabel)) return `"${raw}" is not a valid hostname — domains use letters, digits and hyphens only.`;
  const tld = labels[labels.length - 1].toLowerCase();
  if (!/^[a-z]{2,63}$/.test(tld) && !tld.startsWith('xn--')) return `"${raw}" doesn't look like a real domain (TLD "${labels[labels.length - 1]}").`;
  return null;
}

function showUrlError(msg) {
  urlError.textContent = msg;
  urlError.classList.remove('hidden');
  urlRow.classList.add('invalid');
  urlInput.setAttribute('aria-invalid', 'true');
  urlInput.focus();
}

function clearUrlError() {
  urlError.classList.add('hidden');
  urlError.textContent = '';
  urlRow.classList.remove('invalid');
  urlInput.removeAttribute('aria-invalid');
}

urlInput.addEventListener('input', clearUrlError);

/* Pasting a full URL into a field that already shows an https:// prefix looks
   like a duplicate scheme — strip http(s):// (and stray spaces) on paste. */
function cleanPastedUrl(raw) {
  return String(raw || '').trim().replace(/^https?:\/\//i, '');
}

urlInput.addEventListener('paste', (e) => {
  const pasted = e.clipboardData?.getData('text');
  if (!pasted) return;
  const cleaned = cleanPastedUrl(pasted);
  e.preventDefault();
  const start = urlInput.selectionStart ?? urlInput.value.length;
  const end = urlInput.selectionEnd ?? urlInput.value.length;
  const next = urlInput.value.slice(0, start) + cleaned + urlInput.value.slice(end);
  if (next !== urlInput.value) {
    urlInput.value = next;
    clearUrlError();
  }
  const caret = start + cleaned.length;
  urlInput.setSelectionRange(caret, caret);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = validateInput(urlInput.value);
  if (err) return showUrlError(err);
  clearUrlError();
  const raw = urlInput.value.trim();
  const url = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
  startAnalysis(url);
});

async function startAnalysis(url) {
  $('#legend').classList.add('hidden');
  $('#report').classList.add('hidden');
  $('#progressPanel').classList.remove('hidden');
  goBtn.disabled = true;
  goBtn.textContent = 'Analyzing…';
  setProgress(2, 'Submitting job…', '');

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    await poll(data.jobId);
  } catch (err) {
    setProgress(0, 'Error', '');
    phaseError(err.message);
  }
}

async function poll(jobId) {
  const started = Date.now();
  for (;;) {
    const res = await fetch(`/api/jobs/${jobId}`);
    const job = await res.json();
    if (job.status === 'error') {
      goBtn.disabled = false; goBtn.textContent = 'Analyze';
      $('#progressPanel').classList.add('hidden');
      phaseError(job.error || 'Analysis failed');
      return;
    }
    if (job.status === 'done') {
      lastJobId = job.id;
      renderReport(job.report);
      goBtn.disabled = false; goBtn.textContent = 'Analyze';
      $('#progressPanel').classList.add('hidden');
      return;
    }
    setProgress(job.pct, job.message, `Elapsed ${Math.round((Date.now() - started) / 1000)}s — ${job.targetUrl}`);
    await new Promise((r) => setTimeout(r, 1200));
  }
}

function setProgress(pct, label, hint) {
  $('#barFill').style.width = `${Math.max(2, pct)}%`;
  $('#phasePct').textContent = `${pct}%`;
  $('#phaseLabel').textContent = label || 'Working…';
  if (hint) $('#progressHint').textContent = hint;
}

function phaseError(msg) {
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.innerHTML = `<div style="display:flex;gap:12px;align-items:center;color:var(--fail)">
    <span style="font-size:22px">⚠️</span>
    <div><b>Analysis failed</b><p style="color:var(--muted);font-size:13px;margin-top:4px">${esc(msg)}</p>
    <p style="margin-top:10px"><button class="btn ghost" onclick="location.reload()">Try again</button></p></div></div>`;
  const main = document.querySelector('main');
  main.insertBefore(panel, main.querySelector('#report'));
  panel.scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => panel.remove(), 15000);
}

/* ---------------- render ---------------- */
function renderReport(r) {
  currentReport = r;
  $('#report').classList.remove('hidden');
  $('#report').scrollIntoView({ behavior: 'smooth' });

  // overall
  const vi = r.overview.visibilityIndex;
  $('#indexRing').innerHTML = ringSVG(vi, gradeColor(vi), 110, { index: true });
  $('#overallGrade').textContent = r.overview.grade;
  $('#overallGrade').style.color = gradeColor(vi);

  // categories
  for (const c of CATS) {
    const cat = r.categories[c.key];
    const color = c.color;
    $(`#ring-${c.key}`).innerHTML = ringSVG(cat.score, color, 92);
    $(`#counts-${c.key}`).innerHTML =
      `<span class="p">${cat.passCount} pass</span> · <span class="w">${cat.warnCount} warn</span> · <span class="f">${cat.failCount} fail</span>`;
  }

  // meta strip
  const m = r.meta;
  const meta = [
    ['Target', m.finalUrl || m.targetUrl],
    ['HTTP', m.httpStatus],
    ['Words', r.page.wordCount],
    ['Grade level', r.page.fkgl ?? '—'],
    ['Readability', r.page.flesch ?? '—'],
    ['Schema', (r.page.schemaTypes || []).slice(0, 4).join(', ') || 'none'],
    ['Duration', `${Math.round(m.durationMs / 1000)}s`],
    ['Engine', `Lighthouse ${m.lighthouseVersion || '—'}${m.llmUsed ? ' · LLM' : ''}${!m.llmUsed && (r.llm?.skipped || r.llm?.error) ? ' · GEO LLM skipped (no API key)' : ''}`],
  ];
  $('#metaStrip').innerHTML = meta
    .map(([k, v]) => `<span class="kv">${k}: <b>${esc(String(v))}</b></span>`)
    .join('<span class="dot-sep">·</span>');

  // screenshot
  const shot = $('#shotImg');
  if (r.screenshot) {
    shot.src = r.screenshot;
    $('#shotPanel').classList.remove('hidden');
  } else {
    $('#shotPanel').classList.add('hidden');
  }

  // summary + actions
  $('#summaryText').textContent = r.overview.summary;

  const actions = collectActions(r);
  $('#actionCount').textContent = `(${actions.length})`;
  $('#actionsList').innerHTML = actions.length
    ? actions.map((a) => `<li><b class="cat">${a.category}</b><span>${esc(a.label)} — <span class="detail">${esc(a.detail)}</span></span></li>`).join('')
    : '<li style="color:var(--pass)">No warnings or failures — nothing urgent to fix 🎉</li>';

  // GEO LLM analysis (main GEO read; present unless the server has no key)
  const llm = r.llm;
  const lp = $('#llmPanel');
  if (llm?.perspective) {
    lp.classList.remove('hidden');
    $('#llmChip').textContent = llm.provider || 'llm';
    const p = llm.perspective;
    const citeColor = { yes: 'var(--pass)', likely: 'var(--pass)', unlikely: 'var(--warn)', no: 'var(--fail)' }[p.wouldCite] || 'var(--muted)';
    const concerns = (p.trustConcerns || []).map((t) => `<li>${esc(t)}</li>`).join('');
    const gaps = (p.geoGaps || []).map((g) => `<li>${esc(g)}</li>`).join('');
    $('#llmBody').innerHTML = `
      <div class="llm-grid">
        <div class="llm-box"><div class="lb-t">Entity identified</div>
          <div>${esc(p.entityIdentified)}<span class="muted"> — ${esc(p.entitySummary || '')}</span></div>
          ${p.quoteFragment ? `<div class="quote-line">“${esc(p.quoteFragment)}”</div>` : ''}
        </div>
        <div class="llm-box"><div class="lb-t">Would it cite this page?</div>
          <div style="color:${citeColor};font-weight:700;font-size:15px">${esc(p.wouldCite)}</div>
          <div class="muted" style="font-size:12.5px">confidence ${p.confidence ?? '—'}/100 · as: ${esc(p.asWhat || '—')}</div>
        </div>
        ${concerns ? `<div class="llm-box"><div class="lb-t">Trust concerns</div><ul>${concerns}</ul></div>` : ''}
        ${gaps ? `<div class="llm-box"><div class="lb-t">GEO gaps it flagged</div><ul>${gaps}</ul></div>` : ''}
      </div>`;
  } else if (llm?.skipped) {
    lp.classList.remove('hidden');
    $('#llmChip').textContent = 'skipped';
    $('#llmBody').innerHTML = `<p class="muted" style="font-size:13px">${esc(llm.skipped)}</p>`;
  } else if (llm?.error) {
    lp.classList.remove('hidden');
    $('#llmChip').textContent = 'error';
    $('#llmBody').innerHTML = `<p style="font-size:13px;color:var(--fail)">⚠️ LLM pass failed: ${esc(llm.error)}</p>`;
  } else {
    lp.classList.add('hidden');
  }

  // detail tabs (default to worst category for attention)
  const worst = CATS.map((c) => c.key).sort((a, b) => r.categories[a].score - r.categories[b].score)[0];
  showTab(worst);
}

function collectActions(r) {
  const out = [];
  for (const [key, label] of [['seo', 'SEO'], ['aeo', 'AEO'], ['geo', 'GEO']]) {
    for (const c of r.categories[key].checks) {
      if (c.status === 'fail' || c.status === 'warn') out.push({ category: label, status: c.status, weight: c.weight, label: c.label, detail: c.detail });
    }
  }
  out.sort((a, b) => (a.status === b.status ? b.weight - a.weight : a.status === 'fail' ? -1 : 1));
  return out.slice(0, 8);
}

/* ---------------- tabs ---------------- */
const tabs = $('#tabs');
tabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (btn) showTab(btn.dataset.tab);
});

function showTab(key) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === key));
  const cat = currentReport.categories[key];
  $('#catDesc').textContent = `${cat.description} Score ${cat.score}/100 — ${cat.grade}.`;
  $('#checks').innerHTML = cat.checks
    .filter((c) => c.status !== 'skip')
    .map((c) => `
      <div class="faq" data-status="${c.status}">
        <button class="faq-q" type="button" aria-expanded="false">
          <span class="ic">${ICON[c.status]}</span>
          <span class="lbl">${esc(c.label)}</span>
          <span class="wgt">w${c.weight}</span>
          <span class="faq-caret" aria-hidden="true"></span>
        </button>
        <div class="faq-a">
          <div class="det">${esc(c.detail)}</div>
          ${c.evidence && typeof c.evidence === 'string' ? `<div class="det ev">${esc(c.evidence)}</div>` : ''}
        </div>
      </div>`)
    .join('');
}

/* FAQ-style accordion: shows only the check titles until one is clicked. */
function setFaq(el, open) {
  el.classList.toggle('open', open);
  const q = el.querySelector('.faq-q');
  if (q) q.setAttribute('aria-expanded', open ? 'true' : 'false');
}

$('#checks').addEventListener('click', (e) => {
  const q = e.target.closest('.faq-q');
  if (!q) return;
  const item = q.closest('.faq');
  const open = !item.classList.contains('open');
  $('#checks').querySelectorAll('.faq.open').forEach((f) => { if (f !== item) setFaq(f, false); });
  setFaq(item, open);
});

/* ---------------- exports ---------------- */
let lastJobId = null;

$('#exportJson').addEventListener('click', () => {
  if (!currentReport) return;
  download(JSON.stringify(currentReport, null, 2), `${safeHost(currentReport.meta.host)}-report.json`, 'application/json');
});

$('#exportMd').addEventListener('click', async () => {
  if (!lastJobId) return;
  const res = await fetch(`/api/jobs/${lastJobId}/markdown`);
  const md = await res.text();
  download(md, `${safeHost(currentReport.meta.host)}-report.md`, 'text/markdown');
});

$('#newAnalysis').addEventListener('click', () => {
  $('#report').classList.add('hidden');
  $('#legend').classList.remove('hidden');
  urlInput.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// monkey-patch leftovers removed
function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function safeHost(h) { return String(h || 'site').replace(/[^a-z0-9.-]/gi, '_'); }
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function gradeColor(score) {
  return score >= 85 ? 'var(--pass)' : score >= 70 ? '#a3e635' : score >= 55 ? 'var(--warn)' : 'var(--fail)';
}

// sample URL for quick demo
urlInput.value = 'teryoooow.github.io';
