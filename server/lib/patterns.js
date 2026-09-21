// WHAT NOVA ACTUALLY COMPARES — the series, and the questions worth asking.
//
// correlate.js is the arithmetic. This is the judgement: which of his numbers
// exist, and which pairs are worth a test. That judgement lives in code and
// not in a prompt for the reason the whole engine exists — "test everything
// against everything" is forty comparisons, and forty comparisons at p<0.05
// hands him two confident lies per run.
//
// THE PAIRS ARE CHOSEN, AND SHORT. Each one is a question he could actually
// act on. Adding a pair costs statistical power across the whole batch (the
// Benjamini-Hochberg cut gets stricter as the batch grows), so a pair has to
// earn its place — which is the correct incentive and the opposite of the
// reel's "compare everything".

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCorrelations, describeFinding, describeWatch, MIN_N } from './correlate.js';

const dataDir = () => process.env.NOVA_DATA_DIR
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

const num = (v) => (Number.isFinite(v) ? v : (Number.isFinite(Number(v)) ? Number(v) : null));

// ---- the series -----------------------------------------------------------

// His health days: one file per date, written by the iOS Shortcut.
// SLEEP IS DELIBERATELY LISTED. He has none today — the Shortcut does not
// send it — and the right behaviour is for the series to come back empty and
// every pair that needs it to be reported as skipped for want of data, rather
// than for sleep to be quietly missing from the questions Nova asks.
export const HEALTH_METRICS = {
  sleepHours: { label: 'Sleep', unit: 'h', keys: ['sleepHours', 'sleep', 'sleepH'] },
  hrv: { label: 'HRV', unit: 'ms', keys: ['hrv'] },
  restingHeartRate: { label: 'Resting heart rate', unit: 'bpm', keys: ['restingHeartRate', 'restingHR'] },
  steps: { label: 'Steps', unit: '', keys: ['steps'] },
  weightKg: { label: 'Weight', unit: 'kg', keys: ['weightKg'] },
  activeEnergyKcal: { label: 'Active energy', unit: 'kcal', keys: ['activeEnergyKcal'] },
  vo2Max: { label: 'VO2 max', unit: '', keys: ['vo2Max'] },
};

export async function healthSeries(dir = dataDir()) {
  const out = {};
  for (const k of Object.keys(HEALTH_METRICS)) {
    out[k] = { ...HEALTH_METRICS[k], points: [] };
  }
  let files = [];
  try {
    files = (await readdir(path.join(dir, 'health'))).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  } catch { return out; }
  for (const f of files.sort()) {
    let day;
    try { day = JSON.parse(await readFile(path.join(dir, 'health', f), 'utf8')); } catch { continue; }
    const date = day.date || f.replace('.json', '');
    for (const [k, meta] of Object.entries(HEALTH_METRICS)) {
      const raw = meta.keys.map((key) => day[key]).find((v) => v !== undefined && v !== null);
      const v = num(raw);
      if (v !== null) out[k].points.push({ date, value: v });
    }
  }
  return out;
}

// Training, as two daily numbers: how much he moved and how many sets he did.
// Volume is the honest one — "did he train" is nearly constant on a good
// month, and a series that never varies correlates with nothing.
//
// FROM THE VAULT, not from server/data. The first cut of this file read
// server/data/workouts/sessions.json and got nothing at all, because that
// file does not exist: sessions live in Wiki/Health/Workouts and server/data
// is derived. The rule is in CLAUDE.md and I read past it — the run reported
// "Training volume: 0 days" and seven of the ten questions were unanswerable
// for a reason that was mine, not his data's.
export async function trainingSeries(vaultPath = process.env.VAULT_PATH) {
  const out = {
    trainingVolume: { label: 'Training volume', unit: 'kg', points: [] },
    trainingSets: { label: 'Sets logged', unit: '', points: [] },
  };
  if (!vaultPath) return out;
  let sessions = [];
  try {
    const { loadSessions } = await import('./workoutSessions.js');
    sessions = await loadSessions(vaultPath);
  } catch { return out; }
  const byDate = new Map();
  for (const s of sessions) {
    const date = (s.date || s.startedAt || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    let vol = 0; let sets = 0;
    for (const e of s.exercises || []) {
      for (const st of e.sets || []) {
        const w = num(st.weight) || 0; const reps = num(st.reps) || 0;
        vol += w * reps; sets += 1;
      }
    }
    const prev = byDate.get(date) || { vol: 0, sets: 0 };
    byDate.set(date, { vol: prev.vol + vol, sets: prev.sets + sets });
  }
  for (const [date, v] of [...byDate.entries()].sort()) {
    out.trainingVolume.points.push({ date, value: Math.round(v.vol) });
    out.trainingSets.points.push({ date, value: v.sets });
  }
  return out;
}

export async function allSeries({ dir = dataDir(), vaultPath = process.env.VAULT_PATH } = {}) {
  const [h, t] = await Promise.all([healthSeries(dir), trainingSeries(vaultPath)]);
  return { ...h, ...t };
}

// ---- the questions --------------------------------------------------------

// Each pair is a question he could act on tomorrow. `lag: 1` means yesterday's
// x against today's y — the shape most recovery questions actually have.
export const PAIRS = [
  { x: 'sleepHours', y: 'hrv', lag: 1, question: 'Does a longer night show up in the next morning’s HRV?' },
  { x: 'sleepHours', y: 'trainingVolume', lag: 1, question: 'Does a short night cost him volume the next day?' },
  { x: 'sleepHours', y: 'restingHeartRate', lag: 1, question: 'Does short sleep raise the next day’s resting heart rate?' },
  { x: 'trainingVolume', y: 'hrv', lag: 1, question: 'Does a heavy session show in tomorrow’s HRV?' },
  { x: 'trainingVolume', y: 'restingHeartRate', lag: 1, question: 'Does a heavy session raise tomorrow’s resting heart rate?' },
  { x: 'steps', y: 'hrv', lag: 1, question: 'Do walking days show in the next morning’s HRV?' },
  { x: 'hrv', y: 'trainingVolume', lag: 0, question: 'Does he lift more on the days his HRV is already high?' },
  { x: 'activeEnergyKcal', y: 'restingHeartRate', lag: 1, question: 'Does a big output day raise tomorrow’s resting heart rate?' },
  { x: 'steps', y: 'weightKg', lag: 1, question: 'Does movement show on the scales the next morning?' },
  { x: 'trainingVolume', y: 'weightKg', lag: 1, question: 'Does a heavy session move the next morning’s weight?' },
];

// ---- the run --------------------------------------------------------------

export async function findPatterns({ dir = dataDir(), vaultPath = process.env.VAULT_PATH, pairs = PAIRS, minN = MIN_N } = {}) {
  const series = await allSeries({ dir, vaultPath });
  const result = runCorrelations(series, pairs, { minN });
  return {
    ...result,
    findings: result.findings.map((f) => ({ ...f, sentence: describeFinding(f) })),
    watching: result.watching.map((f) => ({ ...f, sentence: describeWatch(f) })),
    // WHAT HE HAS, so a run that found nothing can say WHY. "No patterns" and
    // "no data to look for patterns in" are different facts and the surface
    // must be able to tell them apart.
    coverage: Object.entries(series)
      .map(([key, s]) => ({ key, label: s.label, days: s.points.length }))
      .sort((a, b) => b.days - a.days),
  };
}

// The block a model gets. It may write the sentence; it may not invent a
// finding, and it is told what was tested so it cannot imply more was found.
export function patternsContext(result) {
  if (!result) return null;
  const lines = [];
  lines.push(`CORRELATIONS IN HIS OWN NUMBERS, computed (not estimated) over his logged history.`);
  lines.push(`${result.tested} pair${result.tested === 1 ? '' : 's'} tested; Benjamini-Hochberg applied at q=0.10.`);
  if (result.empty) {
    lines.push('NOTHING SURVIVED. Say so plainly if asked — it is the expected result most weeks, and it is not a failure. Do NOT go looking for a pattern in the raw numbers yourself.');
  } else {
    lines.push('What held:');
    for (const f of result.findings) lines.push(`- ${f.sentence}`);
  }
  if (result.watching?.length) {
    lines.push('Not established — do NOT state these as facts, and do not present them as findings:');
    for (const f of result.watching) lines.push(`- ${f.sentence}`);
  }
  const thin = result.skipped.filter((s) => s.skipped === 'not enough overlapping days');
  if (thin.length) {
    lines.push(`Not answerable yet for want of overlapping days: ${thin.map((s) => `${s.x}/${s.y}`).join(', ')}.`);
  }
  lines.push('NEVER present any of this as cause and effect, and never quote a number that is not above.');
  return lines.join('\n');
}
