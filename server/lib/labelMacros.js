// Macros from the labels on the packets — for the recipe editor.
//
// He said the numbers on some recipes are wrong and he wants to fix them
// from the actual nutrition labels: photograph each label, say how many
// grams of that ingredient the recipe uses, and let Nova do the sums.
//
// Doctrine split, kept strict:
//   - the MODEL reads each label (OCR: the per-100g column, the serving size)
//   - this CODE scales by grams, sums, divides by servings, and rounds
//   - HE reviews the four fields the result fills in, then presses Save —
//     nothing writes to the vault from here
//
// A composite job wraps one scan job per label (scanFood.js, mode
// 'label-per100', the fast OCR lane). Each label has its own work dir
// because a scan job deletes its dir when it finishes.

import { randomUUID } from 'node:crypto';
import { startFoodScan, getFoodScanJob } from './scanFood.js';

const jobs = new Map();
let scanner = { start: startFoodScan, get: getFoodScanJob };
export function _setScannerForTests(s) { scanner = s || { start: startFoodScan, get: getFoodScanJob }; }

const round1 = (n) => Math.round(n * 10) / 10;

// parts: [{ name, grams, per100: {p,c,f,kcal} }], servings: how many the
// whole recipe makes. Returns the per-serving macros plus the audit trail
// (each part's contribution) so he can see where a number came from.
export function composeFromLabels(parts, servings) {
  const n = Number(servings);
  if (!Number.isFinite(n) || n <= 0) throw new Error('servings must be a positive number');
  if (!Array.isArray(parts) || !parts.length) throw new Error('at least one label is needed');
  const total = { p: 0, c: 0, f: 0, kcal: 0 };
  const contributions = parts.map((part) => {
    const grams = Number(part.grams);
    if (!Number.isFinite(grams) || grams <= 0) throw new Error(`${part.name || 'a label'} needs the grams used in the recipe`);
    const per100 = part.per100 || {};
    const scale = grams / 100;
    const c = {
      p: round1((Number(per100.p) || 0) * scale),
      c: round1((Number(per100.c) || 0) * scale),
      f: round1((Number(per100.f) || 0) * scale),
      kcal: Math.round((Number(per100.kcal) || 0) * scale),
    };
    total.p += c.p; total.c += c.c; total.f += c.f; total.kcal += c.kcal;
    return { name: part.name || 'label', grams, per100, contribution: c, confidence: part.confidence || 'high', question: part.question || '' };
  });
  const perServing = {
    p: round1(total.p / n), c: round1(total.c / n), f: round1(total.f / n), kcal: Math.round(total.kcal / n),
  };
  return {
    servings: n,
    total: { p: round1(total.p), c: round1(total.c), f: round1(total.f), kcal: Math.round(total.kcal) },
    perServing,
    parts: contributions,
    // if any label read as low confidence, say so — he decides whether to trust it
    confidence: contributions.some((c) => c.confidence === 'low') ? 'low' : 'high',
  };
}

// labels: [{ imagePath, workDir, grams, name }]
export function startLabelMacros(labels, servings) {
  if (!Array.isArray(labels) || !labels.length) throw new Error('at least one label is needed');
  if (labels.length > 12) throw new Error('up to 12 labels at a time');
  const n = Number(servings);
  if (!Number.isFinite(n) || n <= 0) throw new Error('servings must be a positive number');
  for (const l of labels) {
    const g = Number(l.grams);
    if (!Number.isFinite(g) || g <= 0) throw new Error(`${l.name || 'each label'} needs the grams used in the recipe`);
  }
  const id = randomUUID().slice(0, 8);
  const children = labels.map((l) => ({
    name: l.name || '', grams: Number(l.grams),
    jobId: scanner.start('label-per100', [l.imagePath], l.workDir, ''),
  }));
  jobs.set(id, { id, servings: n, children, status: 'running', result: null, error: null });
  return id;
}

export function getLabelMacrosJob(id) {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.status !== 'running') return job;
  const states = job.children.map((c) => ({ c, scan: scanner.get(c.jobId) }));
  const failed = states.find((s) => !s.scan || s.scan.status === 'error');
  if (failed) {
    job.status = 'error';
    job.error = `${failed.c.name || 'a label'}: ${failed.scan?.error || 'scan lost'}`;
    return job;
  }
  if (states.some((s) => s.scan.status !== 'ready')) return job;
  try {
    job.result = composeFromLabels(states.map(({ c, scan }) => ({
      // the model's product name is better than the file name he uploaded
      name: scan.result?.name || c.name,
      grams: c.grams,
      per100: scan.result?.per100 || null,
      confidence: scan.result?.confidence,
      question: scan.result?.question,
    })), job.servings);
    // a label with no per-100g column read at all is not silently zero
    const blank = job.result.parts.filter((p) => !p.per100 || !Object.values(p.per100).some((v) => Number(v) > 0));
    if (blank.length) {
      job.result.confidence = 'low';
      job.result.warning = `Couldn't read a per-100g column on: ${blank.map((p) => p.name).join(', ')} — those count as zero. Retake the photo or type the numbers.`;
    }
    job.status = 'ready';
  } catch (e) {
    job.status = 'error';
    job.error = e.message;
  }
  return job;
}
