// THE CORRELATION ENGINE. His ask, 22 Sep, from a reel: find patterns in his
// real numbers — "it's not lying, it's not making something up."
//
// That sentence is the spec, and it is why this is arithmetic rather than a
// prompt. A model handed sixty rows and asked to find patterns will always
// find some; it cannot tell you n, or r, or how many pairs it looked at
// first. These tests pin the three ways a correlation engine lies:
// too few points, a series that never moved, and — the one that matters —
// running enough comparisons that chance hands you a finding every time.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pearson, pValue, benjaminiHochberg, alignSeries, shiftDate,
  runCorrelations, describeFinding, stdDev, effectPerSd, strengthWord,
  MIN_N, MIN_ABS_R,
} from '../lib/correlate.js';

const day = (i) => shiftDate('2026-07-01', i);
const series = (values, from = 0) => values.map((v, i) => ({ date: day(i + from), value: v }));

test('pearson is pearson', () => {
  assert.equal(pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1);
  assert.equal(pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1);
  // worked by hand: means 3/3, numerator 8, both sums of squares 10 → 0.8
  assert.equal(pearson([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]), 0.8);
  // two points is a line through two points, never a correlation
  assert.equal(pearson([1, 2], [3, 4]), null);
});

test('A SERIES THAT NEVER MOVED CORRELATES WITH NOTHING — not with zero', () => {
  // "did he train" is nearly constant on a good month. Returning 0 would let
  // it be reported as "no relationship", which is a claim. There is no claim.
  assert.equal(pearson([5, 5, 5, 5], [1, 2, 3, 4]), null);
  assert.equal(pearson([1, 2, 3, 4], [7, 7, 7, 7]), null);
});

test('the p-value knows its own floor', () => {
  assert.equal(pValue(0.9, 3), null, 'Fisher z needs n > 3 and said otherwise');
  assert.equal(pValue(null, 30), null);
  const p = pValue(0.9, 30);
  assert.ok(p < 0.001, `a strong r over 30 days should be tiny, got ${p}`);
  const weak = pValue(0.1, 30);
  assert.ok(weak > 0.3, `a weak r over 30 days should be unremarkable, got ${weak}`);
  // r = 1 must not divide by zero
  assert.ok(Number.isFinite(pValue(1, 20)));
});

test('BENJAMINI-HOCHBERG IS THE WHOLE REASON THIS IS TRUSTWORTHY', () => {
  // 20 pure-noise pairs, one of which lands at p=0.04 by luck. Uncorrected
  // that is a confident finding every single run, forever.
  const noise = [0.04, ...Array.from({ length: 19 }, (_, i) => 0.3 + i * 0.03)];
  assert.equal(benjaminiHochberg(noise, 0.10).size, 0,
    'a lucky p=0.04 among 20 noise pairs survived — Nova would say something false');
  // a genuinely strong batch survives
  const real = [0.0001, 0.0002, 0.0005, 0.6, 0.7];
  const kept = benjaminiHochberg(real, 0.10);
  assert.equal(kept.size, 3);
  assert.ok(kept.has(0) && kept.has(1) && kept.has(2));
  // nulls are not comparisons and must not dilute the correction
  assert.equal(benjaminiHochberg([null, null], 0.10).size, 0);
  assert.equal(benjaminiHochberg([], 0.10).size, 0);
});

test('a lag pairs YESTERDAY with today, which is the actual question', () => {
  const sleep = series([7, 6, 8, 5]);              // Jul 1..4
  const hrv = series([50, 55, 45, 60]);            // Jul 1..4
  const same = alignSeries(sleep, hrv, 0);
  assert.equal(same.n, 4);
  assert.deepEqual(same.ys, [50, 55, 45, 60]);
  // lag 1: Jul-1 sleep against Jul-2 HRV
  const lagged = alignSeries(sleep, hrv, 1);
  assert.equal(lagged.n, 3);
  assert.deepEqual(lagged.xs, [7, 6, 8]);
  assert.deepEqual(lagged.ys, [55, 45, 60]);
});

test('only days where BOTH sides exist are paired', () => {
  const a = series([1, 2, 3, 4, 5]);
  const b = [{ date: day(0), value: 10 }, { date: day(3), value: 40 }];
  const al = alignSeries(a, b, 0);
  assert.equal(al.n, 2);
  assert.deepEqual(al.xs, [1, 4]);
  // a NaN on either side is not a day
  const bad = alignSeries([{ date: day(0), value: NaN }], [{ date: day(0), value: 5 }], 0);
  assert.equal(bad.n, 0);
});

test('shiftDate crosses months and years without drifting', () => {
  assert.equal(shiftDate('2026-07-31', 1), '2026-08-01');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDate('nonsense', 1), 'nonsense');
});

test('TOO FEW DAYS IS REPORTED, NOT COMPUTED', () => {
  const s = {
    a: { label: 'A', points: series([1, 2, 3, 4, 5]) },
    b: { label: 'B', points: series([2, 4, 6, 8, 10]) },
  };
  const out = runCorrelations(s, [{ x: 'a', y: 'b', lag: 0 }]);
  assert.equal(out.findings.length, 0);
  assert.equal(out.tested, 0);
  assert.equal(out.skipped[0].skipped, 'not enough overlapping days');
  assert.equal(out.skipped[0].n, 5);
  assert.ok(MIN_N >= 10, 'the floor is too low to mean anything');
});

test('a real relationship over enough days survives and is described honestly', () => {
  const n = 40;
  const xs = Array.from({ length: n }, (_, i) => 50 + Math.sin(i) * 10);
  const ys = xs.map((v, i) => v * 1.5 + (i % 5) - 2);   // strong, with noise
  const s = {
    a: { label: 'HRV', unit: 'ms', points: series(xs) },
    b: { label: 'Training volume', unit: 'kg', points: series(ys) },
  };
  const out = runCorrelations(s, [{ x: 'a', y: 'b', lag: 0 }]);
  assert.equal(out.tested, 1);
  assert.equal(out.findings.length, 1);
  const f = out.findings[0];
  assert.ok(Math.abs(f.r) >= MIN_ABS_R);
  assert.equal(f.n, n);
  const sentence = describeFinding(f);
  // every number it rests on is IN the sentence
  assert.match(sentence, /\d+ days of overlap/);
  assert.match(sentence, /r=/);
  // and the last clause is not optional
  assert.match(sentence, /not a cause/i);
  assert.doesNotMatch(sentence, /because|causes|caused/i);
});

test('an empty run says so, and that is not a failure', () => {
  const n = 30;
  const s = {
    a: { label: 'A', points: series(Array.from({ length: n }, (_, i) => (i * 7919) % 97)) },
    b: { label: 'B', points: series(Array.from({ length: n }, (_, i) => (i * 104729) % 89)) },
  };
  const out = runCorrelations(s, [{ x: 'a', y: 'b', lag: 0 }]);
  assert.equal(out.empty, true);
  assert.equal(out.findings.length, 0);
  assert.equal(out.tested, 1, 'it must still report that it looked');
});

test('the wording never borrows authority the number has not earned', () => {
  assert.equal(strengthWord(0.95), 'tracks closely with');
  assert.equal(strengthWord(0.55), 'moves with');
  assert.equal(strengthWord(0.4), 'leans with');
  // no "significant", no "strong", no causal verb anywhere in the vocabulary
  for (const r of [0.95, 0.55, 0.4, 0.1, -0.8]) {
    assert.doesNotMatch(strengthWord(r), /significant|strong|causes|drives|because/i);
  }
});

test('the effect is in his units, per typical swing — not a percentage', () => {
  const ys = [10, 12, 14, 16, 18];
  const sd = stdDev(ys);
  assert.ok(sd > 3 && sd < 3.3, `sd was ${sd}`);
  assert.equal(effectPerSd(0.5, sd), 0.5 * sd);
  assert.equal(effectPerSd(null, sd), null);
  assert.equal(stdDev([4]), null);
});

// ---- the watch tier, and the wiring ----

import { describeWatch, WATCH_Q, FDR_Q } from '../lib/correlate.js';
import { patternsContext, PAIRS } from '../lib/patterns.js';

test('HELD AND WATCHING CAN NEVER BE MISTAKEN FOR EACH OTHER', () => {
  const f = { xLabel: 'Active energy', yLabel: 'Resting heart rate', r: -0.43, n: 31, lag: 1, yUnit: 'bpm', effect: -3 };
  const watch = describeWatch(f);
  assert.match(watch, /^NOT ESTABLISHED/, 'a skimmer could read this as a finding');
  assert.match(watch, /does not survive/i);
  assert.match(watch, /31 days/);
  assert.match(watch, /r=-0\.43/);
  // and it must not borrow the vocabulary of a real finding
  assert.doesNotMatch(watch, /tracks closely|not a cause —/);
  assert.ok(WATCH_Q > FDR_Q, 'the watch gate must be LOOSER than the real one');
});

test('the watch tier catches what the strict gate drops, and nothing else', () => {
  // seven pairs, one at p≈0.016 — his actual shape on 22 Sep: outside a
  // q=0.10 cut of 0.0143 by a hair, inside q=0.25.
  const n = 31;
  const mk = (r) => {
    const xs = Array.from({ length: n }, (_, i) => Math.sin(i * 1.7) * 10 + 50);
    const ys = xs.map((v, i) => v * r + Math.cos(i * 2.3) * 10);
    return { xs, ys };
  };
  const series = {};
  const pairs = [];
  // one real-ish relationship and six noise pairs
  [0.8, 0.02, -0.01, 0.03, -0.02, 0.01, 0.0].forEach((strength, i) => {
    const { xs, ys } = mk(strength);
    series[`x${i}`] = { label: `X${i}`, points: xs.map((v, d) => ({ date: `2026-07-${String(d + 1).padStart(2, '0')}`, value: v })) };
    series[`y${i}`] = { label: `Y${i}`, points: ys.map((v, d) => ({ date: `2026-07-${String(d + 1).padStart(2, '0')}`, value: v })) };
    pairs.push({ x: `x${i}`, y: `y${i}`, lag: 0 });
  });
  const out = runCorrelations(series, pairs);
  // whatever lands where, the two tiers must never overlap
  const held = new Set(out.findings.map((f) => `${f.x}/${f.y}`));
  for (const w of out.watching) {
    assert.ok(!held.has(`${w.x}/${w.y}`), 'a pair is in BOTH tiers');
  }
  assert.equal(out.tested, 7);
});

test('the model is told what it may NOT do with any of it', () => {
  const ctx = patternsContext({
    tested: 7, empty: false, skipped: [],
    findings: [{ sentence: 'A held.' }],
    watching: [{ sentence: 'NOT ESTABLISHED — B might.' }],
  });
  assert.match(ctx, /7 pairs tested/);
  assert.match(ctx, /Benjamini-Hochberg/);
  assert.match(ctx, /do NOT state these as facts/i);
  assert.match(ctx, /NEVER present any of this as cause and effect/i);
  assert.match(ctx, /never quote a number that is not above/i);
});

test('an empty run tells the model not to go looking itself', () => {
  const ctx = patternsContext({ tested: 7, empty: true, findings: [], watching: [], skipped: [] });
  assert.match(ctx, /NOTHING SURVIVED/);
  assert.match(ctx, /not a failure/i);
  assert.match(ctx, /Do NOT go looking for a pattern in the raw numbers yourself/i);
});

test('every pair asks a question a person could act on', () => {
  assert.ok(PAIRS.length >= 5 && PAIRS.length <= 14,
    `${PAIRS.length} pairs — too many comparisons makes the FDR cut punishing for all of them`);
  for (const p of PAIRS) {
    assert.ok(p.x && p.y && p.x !== p.y, `degenerate pair: ${JSON.stringify(p)}`);
    assert.ok(p.question && p.question.length > 20, `no stated question for ${p.x}/${p.y}`);
    assert.ok(p.lag === 0 || p.lag === 1, `unexpected lag on ${p.x}/${p.y}`);
  }
  // no duplicate questions asked twice under different names
  const keys = PAIRS.map((p) => `${p.x}|${p.y}|${p.lag}`);
  assert.equal(new Set(keys).size, keys.length, 'the same pair is tested twice, which weakens every other one');
});
