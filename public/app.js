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

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = urlInput.value.trim();
  if (!raw) return;
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
      body: JSON.stringify({ url, useLlm: $('#llmToggle').checked }),
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
    ['Engine', `Lighthouse ${m.lighthouseVersion || '—'}${m.llmUsed ? ' · LLM' : ''}`],
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

  // LLM second opinion
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
    $('#llmChip').textContent = 'off';
    $('#llmBody').innerHTML = `<p class="muted" style="font-size:13px">${esc(llm.skipped)}</p>`;
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
      <div class="check" data-status="${c.status}">
        <span class="ic">${ICON[c.status]}</span>
        <div class="main">
          <div class="lbl">${esc(c.label)}</div>
          <div class="det">${esc(c.detail)}</div>
          ${c.evidence && typeof c.evidence === 'string' ? `<div class="det" style="font-family:var(--mono);font-size:11.5px;opacity:.75">${esc(c.evidence)}</div>` : ''}
        </div>
        <span class="wgt">w${c.weight}</span>
      </div>`)
    .join('');
}

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
