// THE CORRELATION ENGINE — arithmetic, not a model's impression.
//
// 22 Sep 2026, his ask, from a reel: "the best use case for AI is finding
// patterns with your real numbers… it compares things that shouldn't be
// compared. Seven hours of sleep or lower, my business metrics would go down
// by a certain percentage. And it's not lying. It's not making something up."
//
// The last sentence is the requirement, and it is why none of this is a
// prompt. Nova's rule is deterministic first: code computes, models
// interpret. A model handed sixty rows and asked to "find patterns" will
// always find some — that is what it is for — and it cannot tell you n, or
// r, or how many other pairs it silently looked at first. So every number
// here is computed, and the model downstream only gets to put the finding
// into a sentence.
//
// THE HARD PART IS NOT THE CORRELATION, IT IS THE HONESTY:
//
//   n — Two months of daily health data is ~60 points, and half the metrics
//       are missing on any given day. A pair is only computed on days where
//       BOTH sides exist, so an r over 12 aligned days is reported as an r
//       over 12 aligned days.
//   MULTIPLE COMPARISONS — the real trap. Testing 40 pairs at p < 0.05 gives
//       you two false findings for free, every run, forever. Nova would look
//       clever and be wrong, which is worse than saying nothing. Every run
//       applies Benjamini-Hochberg across the whole batch and reports how
//       many pairs were tested.
//   CAUSATION — never claimed, in any wording this file produces.

// ---- primitives -----------------------------------------------------------

export const MIN_N = 12;          // fewer aligned days than this is an anecdote
export const MIN_ABS_R = 0.35;    // below this, nothing worth his attention
export const FDR_Q = 0.10;        // expected false-discovery rate across a run
// AND A SECOND, LOOSER GATE. Run against his real history the one genuine
// signal (active energy → next-day resting HR, r=-0.43 over 31 days) came in
// at p=0.0163 against a q=0.10 cut of 0.0143 — outside by a hair. Reporting
// nothing would have been true but useless, and loosening the real gate to
// let it through would have been the exact dishonesty this file exists to
// prevent. So it gets its own tier, and the wording never lets the two be
// confused: one HELD, the other is WORTH WATCHING and is not established.
export const WATCH_Q = 0.25;

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  let sx = 0; let sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n; const my = sy / n;
  let num = 0; let dx2 = 0; let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx; const b = ys[i] - my;
    num += a * b; dx2 += a * a; dy2 += b * b;
  }
  // a series that never moves has no correlation to anything — not zero, none
  if (dx2 === 0 || dy2 === 0) return null;
  return num / Math.sqrt(dx2 * dy2);
}

// Abramowitz & Stegun 7.1.26 — good to ~1.5e-7, which is far past anything
// that changes a decision here.
function erf(x) {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

const normalTail = (z) => 0.5 * (1 - erf(Math.abs(z) / Math.SQRT2));

// Two-tailed p for a correlation, via Fisher's z. Exact enough and honest
// about its own floor: n must be at least 4 for the transform to exist.
export function pValue(r, n) {
  if (r === null || !Number.isFinite(r) || n < 4) return null;
  const clamped = Math.max(-0.999999, Math.min(0.999999, r));
  const z = Math.atanh(clamped) * Math.sqrt(n - 3);
  return Math.max(0, Math.min(1, 2 * normalTail(z)));
}

// BENJAMINI-HOCHBERG. The whole reason this file can be trusted. Given every
// p-value from one run, it returns the set that survives an expected false
// discovery rate of q — so "we tested 40 things and these two held" is a
// sentence Nova is entitled to say.
export function benjaminiHochberg(pvalues, q = FDR_Q) {
  const indexed = pvalues
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p !== null && Number.isFinite(x.p))
    .sort((a, b) => a.p - b.p);
  const m = indexed.length;
  if (!m) return new Set();
  let cut = -1;
  for (let k = 0; k < m; k++) {
    if (indexed[k].p <= ((k + 1) / m) * q) cut = k;
  }
  const keep = new Set();
  for (let k = 0; k <= cut; k++) keep.add(indexed[k].i);
  return keep;
}

// ---- aligning two irregular daily series ----------------------------------

// Days where BOTH sides have a number. `lag` shifts x back: lag 1 pairs
// YESTERDAY's x with today's y, which is the only shape most of his questions
// actually have ("did last night's sleep change today's session?").
export function alignSeries(a, b, lag = 0) {
  const bByDate = new Map(b.map((p) => [p.date, p.value]));
  const xs = []; const ys = []; const dates = [];
  for (const p of a) {
    if (!Number.isFinite(p.value)) continue;
    const target = lag ? shiftDate(p.date, lag) : p.date;
    const y = bByDate.get(target);
    if (!Number.isFinite(y)) continue;
    xs.push(p.value); ys.push(y); dates.push(target);
  }
  return { xs, ys, dates, n: xs.length };
}

export function shiftDate(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---- saying it in English -------------------------------------------------

// Deliberately flat. "Strong" and "significant" are words that do work in a
// reader's head that the number has not earned, so the strength word is about
// the SIZE and the caveat is always attached.
export function strengthWord(r) {
  const a = Math.abs(r);
  if (a >= 0.7) return 'tracks closely with';
  if (a >= 0.5) return 'moves with';
  if (a >= 0.35) return 'leans with';
  return 'barely moves with';
}

// The effect in his units: a one-standard-deviation move in x goes with this
// much move in y. Not a percentage claim, because a percentage of a mean is a
// different statement and the reel's version of it is the part that is least
// defensible.
export function effectPerSd(r, sdY) {
  if (r === null || !Number.isFinite(sdY)) return null;
  return r * sdY;
}

export function stdDev(values) {
  const n = values.length;
  if (n < 2) return null;
  const m = values.reduce((s, v) => s + v, 0) / n;
  const v = values.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1);
  return Math.sqrt(v);
}

// ---- the run --------------------------------------------------------------

/**
 * `series`: { key: { label, unit, points: [{date, value}], higherIsBetter } }
 * `pairs`:  [{ x, y, lag }] — which questions to ask. Chosen by the caller,
 *           because "test everything against everything" is how you get a
 *           hundred comparisons and a guaranteed lie.
 */
export function runCorrelations(series, pairs, { minN = MIN_N, minAbsR = MIN_ABS_R, q = FDR_Q, watchQ = WATCH_Q } = {}) {
  const computed = [];
  for (const pair of pairs) {
    const a = series[pair.x];
    const b = series[pair.y];
    if (!a?.points?.length || !b?.points?.length) continue;
    const { xs, ys, n } = alignSeries(a.points, b.points, pair.lag || 0);
    if (n < minN) {
      computed.push({ ...pair, n, r: null, p: null, skipped: 'not enough overlapping days' });
      continue;
    }
    const r = pearson(xs, ys);
    if (r === null) {
      computed.push({ ...pair, n, r: null, p: null, skipped: 'one side never varied' });
      continue;
    }
    computed.push({
      ...pair, n, r, p: pValue(r, n),
      xLabel: a.label, yLabel: b.label, yUnit: b.unit || '',
      effect: effectPerSd(r, stdDev(ys)),
      sdX: stdDev(xs),
    });
  }

  const testable = computed.filter((c) => c.r !== null);
  const ps = testable.map((c) => c.p);
  const survivors = benjaminiHochberg(ps, q);
  const watchers = benjaminiHochberg(ps, watchQ);
  const strong = (c) => Math.abs(c.r) >= minAbsR;
  const findings = testable
    .filter((c, i) => survivors.has(i) && strong(c))
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const watching = testable
    .filter((c, i) => !survivors.has(i) && watchers.has(i) && strong(c))
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  return {
    tested: testable.length,
    skipped: computed.filter((c) => c.skipped),
    findings,
    watching,
    // The honest headline for a run that found nothing, which is the expected
    // result most weeks and must never read as a failure.
    empty: findings.length === 0,
  };
}

// One finding, as a sentence Nova can say out loud. Every number it rests on
// is in the sentence, and the last clause is not optional.
export function describeFinding(f) {
  if (!f || f.r === null) return null;
  const dir = f.r > 0 ? 'higher' : 'lower';
  const lag = f.lag ? ` the day before` : '';
  const move = f.effect === null ? '' :
    ` — about ${Math.abs(f.effect) < 1 ? Math.abs(f.effect).toFixed(2) : Math.round(Math.abs(f.effect))}${f.yUnit ? ` ${f.yUnit}` : ''} per typical swing`;
  return `${f.xLabel}${lag} ${strengthWord(f.r)} ${dir} ${f.yLabel}${move}. `
    + `${f.n} days of overlap, r=${f.r.toFixed(2)}. `
    + `This is a pattern in your numbers, not a cause — something else may drive both.`;
}

// A watch-list item. Same numbers, and the first clause makes the status
// unmissable — a reader skimming must not be able to mistake it for a finding.
export function describeWatch(f) {
  if (!f || f.r === null) return null;
  const dir = f.r > 0 ? 'higher' : 'lower';
  const lag = f.lag ? ' the day before' : '';
  return `NOT ESTABLISHED — ${f.xLabel}${lag} may lean with ${dir} ${f.yLabel}, `
    + `but over ${f.n} days (r=${f.r.toFixed(2)}) it does not survive the test once every pair checked this run is accounted for. `
    + `Worth another look as the history grows.`;
}
