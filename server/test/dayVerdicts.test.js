import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayVerdicts, verdictBlock, contradictions, unitMismatches, assertAgrees } from '../lib/dayVerdicts.js';

// the 2 Nov bench day, as the 9B was shown it
const FACTS = { proteinG: 178, proteinFloorG: 167, kcal: 2518, kcalTarget: 2138, steps: 11544, stepGoal: 10000, hrv: 55.6, hrvWeek: 76.2, rhr: 59, rhrWeek: 52 };
const V = dayVerdicts(FACTS);

test('code makes each comparison and says which way it went', () => {
  const by = Object.fromEntries(V.map((v) => [v.topic, v.state]));
  assert.deepEqual(by, { protein: 'met', calories: 'over', steps: 'met', hrv: 'low' });
  const block = verdictBlock(V);
  assert.match(block, /178 g, ABOVE the 167 g floor by 11 g\. The floor is MET/);
  assert.match(block, /2,518 kcal, OVER the 2,138 kcal target by 380 kcal/);
  assert.match(block, /HRV today: 55\.6 ms .* 27 % BELOW it/);
  assert.equal(verdictBlock([]), '');
});

test('a missing reading makes no verdict, never a guessed one', () => {
  assert.deepEqual(dayVerdicts({ proteinG: 40, proteinFloorG: null, kcal: null, kcalTarget: 2000, steps: null, stepGoal: 10000, hrv: 60, hrvWeek: null }), []);
});

test('HRV within 10 % of the week is about usual, and a sentence calling it low is refused', () => {
  const v = dayVerdicts({ hrv: 74, hrvWeek: 76 });
  assert.equal(v[0].state, 'usual');
  assert.equal(contradictions('Your HRV is low at 74 ms, so take it easy today.', v).length, 1);
  assert.equal(contradictions('HRV is 74 ms, about where it has been all week.', v).length, 0);
});

test('the 9B\'s real wrong sentences (bench 2 Nov) are refused', () => {
  for (const s of [
    'Your HRV is 55.6 ms and resting heart rate is 59 bpm, so recovery is low today; you have logged only 178 g of protein against the 167 g floor, so eat a named meal with 45 g+ protein now to close the gap before your Work at 15:30.',
    'Eat a named dinner with 45g+ protein now to balance today\'s high calories and hit the daily floor. Calories are over target while protein is only 178g against a 167g floor.',
  ]) assert.ok(contradictions(s, V).some((c) => c.topic === 'protein'), s);
});

test('right sentences pass, and history is not judged as today', () => {
  for (const s of [
    'Protein hit 178g against a 167g floor, but calories are 380 over your 2,138 target.',
    'You missed the 167 g floor on 5 of the last 7 days, so keep breakfast big.',
    'Steps reached 11,544, exceeding your 10,000 goal.',
    'HRV dropped 27% below your seven-day average, so keep tonight easy.',
  ]) assert.deepEqual(contradictions(s, V), [], s);
});

test('the other directions are refused too', () => {
  const short = dayVerdicts({ proteinG: 90, proteinFloorG: 167, kcal: 1500, kcalTarget: 2138, steps: 4000, stepGoal: 10000, hrv: 95, hrvWeek: 76 });
  assert.equal(contradictions('You have met the protein floor today with 90 g.', short)[0].topic, 'protein');
  assert.equal(contradictions('Calories so far are 1,500 kcal, already over the target.', short)[0].topic, 'calories');
  assert.equal(contradictions('You hit 4,000 steps today, goal reached.', short)[0].topic, 'steps');
  assert.equal(contradictions('HRV is 95 ms today, so recovery is poor.', short)[0].topic, 'hrv');
});

test('a number given in minutes may not come back in metres', () => {
  const prompt = 'Tank walk: 74 minutes. Protein 178 g. Sleep 434 min.';
  assert.deepEqual(unitMismatches('You walked 74 m with Tank.', prompt), ['74 as dist-m (shown as time-min)']);
  assert.deepEqual(unitMismatches('A 74-minute walk and 178 g of protein.', prompt), []);
  assert.deepEqual(unitMismatches('74 minutes with Tank, 178g protein.', prompt), []);
  assert.throws(() => assertAgrees('You walked 74 m.', [], prompt), /74 as dist-m/);
  assert.throws(() => assertAgrees('Only 178 g of protein against the 167 g floor today.', V, prompt), /protein as met/);
  assert.equal(assertAgrees('Protein is 178 g, past the floor today.', V, prompt), true);
});

test('the local review must say what became of yesterday\'s adjustments when it was shown them', async () => {
  const { readReview, buildCompactReviewPrompt } = await import('../lib/dailyReview.js');
  const ctx = "YESTERDAY'S REVIEW (still unanswered) — hold today against it:\n1. Weigh in.";
  const prompt = buildCompactReviewPrompt(ctx, new Date('2026-11-03T20:00:00'));
  assert.match(prompt, /"yesterday":/);
  assert.throws(() => readReview('{"read":"A fine day.","adjustments":[]}', { provider: 'local', prompt }), /nothing about yesterday/);
  const r = readReview('{"yesterday":"The weigh-in did not happen","read":"A fine day.","adjustments":[]}', { provider: 'local', prompt });
  assert.equal(r.read, 'The weigh-in did not happen. A fine day.');
  // Claude is not held to the field (its prompt asks in prose and it complies)
  assert.equal(readReview('{"read":"A fine day.","adjustments":[]}', { provider: 'claude', prompt }).read, 'A fine day.');
  assert.doesNotMatch(buildCompactReviewPrompt('no review yesterday', new Date()), /"yesterday":/);
});
