// Shared scoring semantics: every analyzer emits a list of weighted checks;
// this module turns them into a 0-100 category score + a grade.

export const STATUS_WEIGHT = { pass: 1, warn: 0.5, fail: 0, skip: null };

export function makeCheck(id, label, weight, status, detail, evidence = null) {
  return { id, label, weight, status, detail, evidence: evidence == null ? null : String(evidence).slice(0, 400) };
}

export function categoryScore(checks) {
  let acc = 0;
  let total = 0;
  for (const c of checks) {
    if (c.status === 'skip' || !c.weight) continue;
    const v = STATUS_WEIGHT[c.status];
    if (v === undefined) continue; // defensive
    acc += c.weight * v;
    total += c.weight;
  }
  if (total === 0) return 0;
  return Math.round((acc / total) * 1000) / 10;
}

export function gradeOf(score) {
  if (score >= 85) return { grade: 'Excellent', color: '#22c55e' };
  if (score >= 70) return { grade: 'Good', color: '#84cc16' };
  if (score >= 55) return { grade: 'Fair', color: '#f59e0b' };
  return { grade: 'Needs work', color: '#ef4444' };
}

/** Combine three category scores into the overall Visibility Index (equal thirds). */
export function overallScore(cats) {
  const vals = Object.values(cats).map((c) => c.score);
  if (!vals.length) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

export function finalizeCategory(key, description, checks) {
  const score = categoryScore(checks);
  const { grade, color } = gradeOf(score);
  const passCount = checks.filter((c) => c.status === 'pass').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const failCount = checks.filter((c) => c.status === 'fail').length;
  const skipped = checks.filter((c) => c.status === 'skip').length;
  return { key, description, score, grade, color, passCount, warnCount, failCount, skipped, checks };
}
