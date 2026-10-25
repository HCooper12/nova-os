// THE INTAKE — code computes the numbers, every line readable, nothing tuned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswer, compute, describe, QUESTIONS, mergeFacts, bodyFat, STABLE_FACTS } from '../lib/intake.js';

test('answers arrive the way he says them — units, words, feet and inches', () => {
  assert.equal(parseAnswer('sex', "I'm a bloke").value, 'male');
  assert.equal(parseAnswer('age', 'thirty… 32').value, 32);
  assert.equal(parseAnswer('heightCm', '188').value, 188);
  assert.equal(parseAnswer('heightCm', "6'2").value, 188);
  assert.equal(parseAnswer('heightCm', '6 ft 2').value, 188);
  assert.equal(parseAnswer('heightCm', '1.88 m').value, 188);
  assert.equal(parseAnswer('weightKg', '84.9').value, 84.9);
  assert.equal(parseAnswer('weightKg', '187 lbs').value, 84.8);
  assert.equal(parseAnswer('activity', 'pretty much very active, I train six days').value, 'very');
  assert.equal(parseAnswer('goal', 'cut some fat').value, 'lose');
  assert.equal(parseAnswer('goal', 'build muscle').value, 'gain');
  assert.equal(parseAnswer('pace', 'slow and steady').value, 'gentle', 'the first word he said wins the tie');
  assert.equal(parseAnswer('pace', 'steady, not slow').value, 'steady');
  assert.equal(parseAnswer('eating', 'nothing').value, '');
  assert.equal(parseAnswer('eating', 'high protein, no dairy').value, 'high protein, no dairy');
});

test('a bad answer is refused with the reason, never guessed', () => {
  assert.match(parseAnswer('age', 'a fair few').error, /a number of years/);
  assert.match(parseAnswer('weightKg', '900').error, /does not look right/);
  assert.match(parseAnswer('activity', 'sometimes').error, /one of: sedentary/);
  assert.match(parseAnswer('nonsense', 'x').error, /not a question/);
});

test('the arithmetic is Mifflin-St Jeor, printed line by line', () => {
  const f = { sex: 'male', age: 33, heightCm: 180, weightKg: 79.4, activity: 'very', goal: 'lose', pace: 'steady' };
  const p = compute(f);
  // 10×79.4 + 6.25×180 − 5×33 + 5 = 794 + 1125 − 165 + 5 = 1759
  assert.equal(p.bmr, 1759);
  assert.equal(p.tdee, Math.round(1759 * 1.725));
  assert.equal(p.targetKcal, p.tdee - 500);
  assert.equal(p.proteinG, Math.round(79.4 * 2.0));
  assert.equal(p.fatG, Math.round(79.4 * 0.8));
  assert.equal(p.carbsG, Math.round((p.targetKcal - p.proteinG * 4 - p.fatG * 9) / 4));
  assert.equal(p.lines.length, 7);
  assert.match(p.lines[0], /Mifflin-St Jeor/);
  assert.match(p.lines[2], /− 500/);
});

test('maintain has no deficit and says so; female uses the −161 constant; the floor is never below 1200', () => {
  const m = compute({ sex: 'female', age: 40, heightCm: 165, weightKg: 60, activity: 'light', goal: 'maintain' });
  assert.equal(m.bmr, Math.round(10 * 60 + 6.25 * 165 - 5 * 40 - 161));
  assert.equal(m.deltaKcal, 0);
  assert.match(m.lines[2], /maintain/);
  assert.equal(m.proteinG, Math.round(60 * 1.8), 'not on a cut → 1.8 g/kg');
  const tiny = compute({ sex: 'female', age: 70, heightCm: 150, weightKg: 45, activity: 'sedentary', goal: 'lose', pace: 'aggressive' });
  assert.equal(tiny.targetKcal, 1200, 'the floor holds');
});

test('the card carries the head number and every step', () => {
  const f = { sex: 'male', age: 33, heightCm: 180, weightKg: 79.4, activity: 'very', goal: 'lose', pace: 'steady', eating: 'high protein' };
  const d = describe(f, compute(f));
  assert.match(d.title, /^Your numbers: \d+ kcal a day · \d+ g protein/);
  assert.match(d.body, /- Resting burn/);
  assert.match(d.body, /high protein/);
});

test('the pace question is skipped for maintain, and the questions are in the order the arithmetic needs', () => {
  const keys = QUESTIONS.map((q) => q.key);
  assert.deepEqual(keys.slice(0, 7), ['sex', 'age', 'heightCm', 'weightKg', 'bodyFatPct', 'activity', 'goal']);
  assert.equal(QUESTIONS.find((q) => q.key === 'pace').skipIf({ goal: 'maintain' }), true);
});

test('with a body fat %, the resting burn is Katch-McArdle from lean mass, printed', () => {
  const f = { sex: 'male', age: 28, heightCm: 188.5, weightKg: 84, bodyFatPct: 18, activity: 'moderate', goal: 'lose', pace: 'aggressive' };
  const p = compute(f);
  // lean mass 84 × 0.82 = 68.9 kg; 370 + 21.6 × 68.9 = 1858.2
  assert.equal(p.leanKg, 68.9);
  assert.equal(p.bmr, 1858);
  assert.equal(p.bmrFormula, 'katch-mcardle');
  assert.match(p.lines[0], /Katch-McArdle\): 370 \+ 21\.6 × 68\.9 kg lean mass \(84 kg at 18% fat\) = 1858/);
  assert.equal(p.tdee, Math.round(1858 * 1.55));
  assert.equal(p.targetKcal, p.tdee - 750);
});

test('without one it says why it fell back to Mifflin-St Jeor; a silly body fat is absent, not believed', () => {
  const p = compute({ sex: 'male', age: 28, heightCm: 188.5, weightKg: 84, activity: 'moderate', goal: 'lose', pace: 'steady' });
  assert.equal(p.bmrFormula, 'mifflin-st-jeor');
  assert.match(p.lines[0], /because Katch-McArdle needs a body fat %/);
  assert.equal(bodyFat(85), null);
  assert.equal(bodyFat('0'), null);
  assert.equal(bodyFat(''), null);
  assert.equal(bodyFat(17.25), 17.3);
  assert.equal(parseAnswer('bodyFatPct', "don't know").value, null, 'skippable');
  assert.equal(parseAnswer('bodyFatPct', 'about 17%').value, 17);
});

test('the weekly calibration shifts the daily burn by a printed line, held to ±500', () => {
  const f = { sex: 'male', age: 28, heightCm: 188.5, weightKg: 84, activity: 'moderate', goal: 'lose', pace: 'steady', tdeeAdjust: -150, tdeeAdjustOn: '2026-11-02' };
  const p = compute(f);
  assert.equal(p.tdee, p.formulaTdee - 150);
  assert.equal(p.targetKcal, p.tdee - 500);
  assert.ok(p.lines.some((l) => /Calibrated from your own record: \d+ − 150 \(weekly review, 2026-11-02\)/.test(l)));
  assert.equal(compute({ ...f, tdeeAdjust: -2000 }).tdeeAdjust, -500);
});

test('an edit keeps what he did not change — his sex and height are never asked again', () => {
  const stored = { sex: 'male', age: 28, heightCm: 188.5, weightKg: 83, activity: 'moderate', goal: 'lose', pace: 'aggressive', eating: '' };
  const m = mergeFacts(stored, { pace: 'steady' });
  assert.deepEqual(m, { ...stored, pace: 'steady' });
  for (const k of STABLE_FACTS) assert.equal(m[k], stored[k]);
  assert.equal(mergeFacts(stored, { goal: 'maintain' }).pace, undefined, 'maintain has no pace');
  assert.equal(mergeFacts({ ...stored, goal: 'maintain', pace: undefined }, { goal: 'lose' }).pace, 'steady', 'a cut needs one; steady is the default');
  assert.equal(mergeFacts({ ...stored, bodyFatPct: 18 }, { bodyFatPct: null }).bodyFatPct, undefined, 'null clears an optional fact');
  assert.equal(mergeFacts(stored, { targetKcal: 1500 }).targetKcal, undefined, 'a number is never a fact — only answers are');
});
