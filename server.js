// Web UI + API server. Analysis runs as a background job so the UI can show
// live progress (rendering + Lighthouse takes 30-90s).

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { analyzeUrl } from './src/analyze.js';
import { normalizeUrl } from './src/util.js';
import { reportToMarkdown } from './src/report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3100;

// ---- in-memory job store (single-process demo server) ----
const jobs = new Map();
let queue = Promise.resolve();

function createJob() {
  const id = crypto.randomBytes(6).toString('hex');
  const job = {
    id,
    status: 'queued', // queued | running | done | error
    phase: 'queued',
    message: 'Waiting in queue…',
    pct: 0,
    createdAt: Date.now(),
    report: null,
    error: null,
  };
  jobs.set(id, job);
  return job;
}

app.post('/api/analyze', (req, res) => {
  let url;
  try {
    url = normalizeUrl(req.body?.url);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const job = createJob();
  job.targetUrl = url;
  job.useLlm = !!req.body?.useLlm;

  queue = queue.then(() => runJob(job)).catch(() => {});
  res.json({ jobId: job.id });
});

async function runJob(job) {
  job.status = 'running';
  try {
    job.report = await analyzeUrl(job.targetUrl, {
      useLlm: job.useLlm,
      onProgress: ({ phase, message, pct }) => {
        job.phase = phase;
        job.message = message;
        job.pct = pct ?? job.pct;
      },
    });
    job.status = 'done';
    job.phase = 'done';
    job.message = 'Report ready.';
    job.pct = 100;
  } catch (e) {
    job.status = 'error';
    job.error = e.message;
  }
}

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Unknown job id' });
  res.json({
    id: job.id,
    status: job.status,
    phase: job.phase,
    message: job.message,
    pct: job.pct,
    targetUrl: job.targetUrl,
    error: job.error,
    report: job.status === 'done' ? job.report : null,
  });
});

app.get('/api/jobs/:id/markdown', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== 'done' || !job.report) return res.status(404).json({ error: 'Report not ready' });
  res.type('text/markdown').send(reportToMarkdown(job.report));
});

app.get('/api/health', (_req, res) => res.json({ ok: true, jobs: jobs.size }));

// Housekeeping: drop finished jobs after 30 min
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, j] of jobs) {
    if ((j.status === 'done' || j.status === 'error') && j.createdAt < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000).unref();

app.listen(PORT, () => {
  console.log(`\n  🔎 Search Visibility Analyzer`);
  console.log(`  UI   → http://localhost:${PORT}`);
  console.log(`  (headless Chrome will launch on first analysis)\n`);
});
