// THE GOAL BOARD (his ask, 23 Sep 2026): steps, protein and calories judged
// by code against their targets, so the Coach has numbers to coach toward
// and the Goals card has something to draw. These pin the judgements that
// are easy to get quietly wrong: the pace line by the hour, a hole that is
// never a zero, calories that are a target and not a floor, the nudges'
// hour gates, and the precedence of his own target over the Intake's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTargets, judge, composeBoard, nudgesOf, goalBoardText, METRICS } from '../lib/goalBoard.js';

const at = (h, m = 0, day = 23) => new Date(2026, 8, day, h, m); // Sept 2026; the 23rd is a Wednesday
const targets = { steps: { value: 10000, source: 'default' }, protein: { value: 150, source: 'intake' }, kcal: { value: 2200, source: 'intake' } };
const steps = METRICS[0], protein = METRICS[1], kcal = METRICS[2];

test('his own target beats the Intake, which beats the house default — and each says which it is', () => {
  const t = resolveTargets({ stepsTarget: 8000, proteinTarget: null, kcalTarget: null }, { proteinFloorG: 150, targetKcal: 2200 });
  assert.deepEqual(t.steps, { value: 8000, source: 'goals' });
  assert.deepEqual(t.protein, { value: 150, source: 'intake' });
  const none = resolveTargets(null, null);
  assert.deepEqual(none.steps, { value: 10000, source: 'default' }, 'steps fall back to the house constant');
  assert.deepEqual(none.protein, { value: null, source: null }, 'protein has no honest default');
});

test('a floor is judged against the steady line by the hour, not against the whole day at breakfast', () => {
  // 40 g at 09:00 is ahead of a steady day (2/15 of the day → 20 g expected)
  assert.equal(judge(protein, 40, 150, { fraction: 2 / 15, dayOver: false }).state, 'good');
  // 40 g at 19:00 is behind (12/15 → 120 g expected)
  const late = judge(protein, 40, 150, { fraction: 12 / 15, dayOver: false });
  assert.equal(late.state, 'behind');
  assert.equal(late.short, 110);
  // met is met at any hour
  assert.equal(judge(protein, 151, 150, { fraction: 0.1, dayOver: false }).state, 'good');
  // and once the day is over an unmet floor is missed, not behind
  assert.equal(judge(protein, 120, 150, { fraction: 1, dayOver: true }).state, 'missed');
});

test('calories are a target: under it during the day is fine, over it is over', () => {
  assert.equal(judge(kcal, 900, 2200, { fraction: 0.5, dayOver: false }).state, 'good');
  const over = judge(kcal, 2600, 2200, { fraction: 0.9, dayOver: false });
  assert.equal(over.state, 'missed');
  assert.equal(over.over, 400);
  assert.equal(judge(kcal, 2300, 2200, { fraction: 1, dayOver: true }).state, 'good', 'within ten percent is on target');
});

test('a hole is absent, never a zero — and no target means no verdict', () => {
  assert.equal(judge(steps, null, 10000).state, 'absent');
  assert.equal(judge(steps, 7000, null).state, 'absent');
  assert.equal(judge(steps, 0, 10000, { fraction: 0.5, dayOver: false }).state, 'behind', 'a recorded zero IS a value');
});

test('the board counts the week honestly: met of TRACKED, and today is not in the count until it is over', () => {
  const healthDays = [
    { date: '2026-09-17', steps: 11000 }, { date: '2026-09-18', steps: 4000 }, { date: '2026-09-19', steps: 10200 },
    // 20th missing: a hole
    { date: '2026-09-21', steps: 10575 }, { date: '2026-09-22', steps: 6628 }, { date: '2026-09-23', steps: 3100 },
  ];
  const nutritionDays = [
    { date: '2026-09-21', p: 160, kcal: 2308 }, { date: '2026-09-22', p: 194, kcal: 2991 }, { date: '2026-09-23', p: 44, kcal: 605 },
  ];
  const b = composeBoard({ targets, healthDays, nutritionDays, now: at(15) });
  const s = b.metrics.find((m) => m.key === 'steps');
  assert.equal(s.tracked, 5, 'five past days had a number');
  assert.equal(s.met, 3);
  assert.equal(s.week.length, 7);
  assert.equal(s.week[3].value, null, 'the 20th is a hole');
  assert.equal(s.week[3].state, 'absent');
  assert.equal(s.today, 3100);
  assert.equal(s.state, 'behind', '3,100 at 15:00 is under the steady line');
  const k = b.metrics.find((m) => m.key === 'kcal');
  assert.equal(k.week[5].met, false, '2,991 against 2,200 was over');
  assert.equal(k.state, 'good', '605 at 15:00 is under target, which is fine');
  const p = b.metrics.find((m) => m.key === 'protein');
  assert.equal(p.tracked, 2, 'only two past days were logged');
  assert.equal(p.met, 2);
  assert.match(b.headline, /steps sit 6,900 under 10,000/);
});

test("today's live food-log totals beat the archive for today", () => {
  const b = composeBoard({ targets, nutritionDays: [{ date: '2026-09-23', p: 44, kcal: 605 }], todayLive: { p: 120, kcal: 1800 }, now: at(15) });
  assert.equal(b.metrics.find((m) => m.key === 'protein').today, 120);
});

test('the nudges keep to their hours and their thresholds', () => {
  const mk = (over) => composeBoard({ targets, healthDays: [{ date: '2026-09-23', steps: 3000 }], todayLive: { p: 90, kcal: over ? 2700 : 1500 }, now: at(18) }).metrics;
  const evening = nudgesOf(mk(false), at(18));
  assert.deepEqual(evening.map((n) => n.key).sort(), ['goal-protein-evening', 'goal-steps-afternoon']);
  assert.match(evening.find((n) => n.key === 'goal-protein-evening').title, /60 g/);
  // the same numbers at 10:00 raise nothing — the day is young
  assert.deepEqual(nudgesOf(mk(false), at(10)), []);
  // over on calories is said from midday
  assert.ok(nudgesOf(mk(true), at(13)).some((n) => n.key === 'goal-kcal-over'));
  // Monday morning reviews the week only when there is a week to review
  const monday = at(8, 0, 21);
  assert.deepEqual(nudgesOf(mk(false), monday).filter((n) => n.key === 'goal-week-review'), [], 'no tracked days, no review');
  const tracked = composeBoard({ targets, healthDays: [17, 18, 19, 20].map((d) => ({ date: `2026-09-${d}`, steps: d % 2 ? 12000 : 3000 })), now: monday }).metrics;
  const review = nudgesOf(tracked, monday).find((n) => n.key === 'goal-week-review');
  assert.ok(review, 'four tracked days earn a review');
  assert.match(review.text, /steps 2\/4/);
});

test('the text the models read carries the provenance and the standing instruction', () => {
  const b = composeBoard({ targets, healthDays: [{ date: '2026-09-23', steps: 3100 }], now: at(15) });
  const txt = goalBoardText(b);
  assert.match(txt, /Steps: target 10,000 \(house default — he has not set one\)/);
  assert.match(txt, /BEHIND PACE/);
  assert.match(txt, /Protein: target 150 g \(from the Intake\); nothing recorded today/);
  assert.match(txt, /never treat it as zero/);
});
