// A BODY FAT ESTIMATE WITHOUT A SCAN — the visual guide's bands, the Navy
// tape method and relative fat mass, combined by code into an honest range.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VISUAL_BANDS, navyBodyFat, relativeFatMass, estimateBodyFat, parseRange, NAVY_SEE } from '../lib/bodyFatEstimate.js';
import { compute, mergeFacts, parseAnswer } from '../lib/intake.js';

test('the visual bands are the guide\'s, in order, with its gap at 31–34%', () => {
  assert.deepEqual(VISUAL_BANDS.map((b) => b.id), ['1-4', '5-7', '8-10', '11-12', '13-15', '16-19', '20-24', '25-30', '35-40']);
  for (const b of VISUAL_BANDS) assert.ok(b.lo < b.hi && b.look.length > 10);
});

test('the Navy equation (Hodgdon & Beckett 1984, metric) by hand', () => {
  // 495 / (1.0324 − 0.19077·log10(88 − 39) + 0.15456·log10(188.5)) − 450 = 16.3
  assert.equal(navyBodyFat({ sex: 'male', heightCm: 188.5, waistCm: 88, neckCm: 39 }), 16.3);
  assert.equal(navyBodyFat({ sex: 'male', heightCm: 188.5, waistCm: 38, neckCm: 39 }), null, 'a waist under the neck is a typo, not a body');
  assert.equal(navyBodyFat({ sex: 'female', heightCm: 165, waistCm: 75, neckCm: 33 }), null, 'women need hips');
  assert.ok(navyBodyFat({ sex: 'female', heightCm: 165, waistCm: 75, neckCm: 33, hipCm: 98 }) > 20);
});

test('relative fat mass (Woolcott & Bergman 2018): 64 − 20 × height ÷ waist, +12 for women', () => {
  assert.equal(relativeFatMass({ sex: 'male', heightCm: 188.5, waistCm: 88 }), 21.2);
  assert.equal(relativeFatMass({ sex: 'female', heightCm: 188.5, waistCm: 88 }), 33.2);
});

test('where the methods overlap is the range; the middle feeds Katch-McArdle', () => {
  const e = estimateBodyFat({ sex: 'male', heightCm: 188.5, bandId: '16-19', waistCm: 88, neckCm: 39 });
  // visual 16–19, Navy 16.3 ± 3.5 = 12.8–19.8 → overlap 16–19
  assert.deepEqual([e.lo, e.hi, e.pct, e.agree, e.method], [16, 19, 17.5, true, 'visual+navy']);
  assert.ok(e.lines.some((l) => /They agree on 16–19%/.test(l)));
  assert.ok(e.lines.some((l) => /Relative fat mass sits outside/.test(l)), 'RFM 21.2 is more than 2 points past 19');
});

test('when they do not overlap, the range spans both and says a scan would settle it', () => {
  const e = estimateBodyFat({ sex: 'male', heightCm: 188.5, bandId: '8-10', waistCm: 100, neckCm: 38 });
  assert.equal(e.agree, false);
  assert.equal(e.lo, 8);
  assert.ok(e.hi > 20);
  assert.ok(e.lines.some((l) => /do not agree/.test(l)));
});

test('a band alone is its own range; a waist alone is RFM ± the Navy error; nothing is nothing', () => {
  assert.deepEqual((({ lo, hi, pct }) => [lo, hi, pct])(estimateBodyFat({ sex: 'male', heightCm: 188, bandId: '13-15' })), [13, 15, 14]);
  const w = estimateBodyFat({ sex: 'male', heightCm: 188.5, waistCm: 88 });
  assert.deepEqual([w.lo, w.hi, w.method], [21.2 - NAVY_SEE, 21.2 + NAVY_SEE, 'rfm'].map((x) => (typeof x === 'number' ? Math.round(x * 10) / 10 : x)));
  assert.equal(estimateBodyFat({ sex: 'male', heightCm: 188 }), null);
});

test('he can say a range in the interview, and the plan prints what the range is worth', () => {
  assert.deepEqual(parseRange('probably 16 to 19%'), { lo: 16, hi: 19, pct: 17.5 });
  assert.deepEqual(parseRange('15-20'), { lo: 15, hi: 20, pct: 17.5 });
  assert.equal(parseRange('about 18'), null);
  assert.deepEqual(parseAnswer('bodyFatPct', '16 to 19').also, { bodyFatRange: [16, 19], bodyFatMethod: 'visual' });
  const p = compute({ sex: 'male', age: 28, heightCm: 188.5, weightKg: 84.3, activity: 'moderate', goal: 'lose', pace: 'aggressive', bodyFatPct: 17.5, bodyFatRange: [16, 19], bodyFatMethod: 'visual+navy' });
  assert.equal(p.bmrFormula, 'katch-mcardle');
  assert.match(p.lines[1], /estimate, 16–19% \(visual guide \+ Navy tape method\); 17\.5% is its middle\. Across the range the daily burn runs \d+–\d+ kcal/);
});

test('a typed body fat drops the estimate it no longer came from; a Health reading is marked measured', () => {
  const est = { sex: 'male', heightCm: 188.5, bodyFatPct: 17.5, bodyFatRange: [16, 19], bodyFatMethod: 'visual' };
  const typed = mergeFacts(est, { bodyFatPct: 15 });
  assert.equal(typed.bodyFatRange, undefined);
  assert.equal(typed.bodyFatMethod, undefined);
  const health = mergeFacts(est, { bodyFatPct: 18.2, bodyFatMethod: 'health' });
  assert.deepEqual([health.bodyFatRange, health.bodyFatMethod], [undefined, 'health']);
  assert.equal(mergeFacts(est, { bodyFatPct: null }).bodyFatRange, undefined);
});
