// The weekly muscle sets sheet as words and shapes (src/muscleWeekView.js):
// the headline counts goal muscles that reach their range by Sunday, the
// bars sit on one 0 to 25 scale, the colour verdict is the number's, and a
// card's lines are the model's lines, grouped by day.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-muscleweekview-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { muscleWeekView, barOf, cardOf, V_TAPER } = await import('../../src/muscleWeekView.js');

const line = (short, routine, exercise, sets, credit, status, date) => ({ short, routine, exercise, exerciseId: exercise.toLowerCase().replace(/\W+/g, '-'), sets, credit, value: sets * credit, status, date });
const muscle = (name, over = {}) => {
  const m = { muscle: name, goal: true, low: 10, high: 20, focusDone: 0, accDone: 0, focusPlanned: 0, accPlanned: 0, lines: [], ...over };
  m.done = m.focusDone + m.accDone / 2;
  m.bySunday = m.done + m.focusPlanned + m.accPlanned / 2;
  return m;
};
const WEEK = {
  start: '2026-10-12', end: '2026-10-18', today: '2026-10-16',
  goalMuscles: [...V_TAPER],
  muscles: [
    muscle('Side Delts', { focusDone: 1, focusPlanned: 6 }),
    muscle('Rear Delts', { focusDone: 3, accDone: 3, focusPlanned: 6, accPlanned: 3 }),
    muscle('Lats', { focusDone: 3, accDone: 3, focusPlanned: 6 }),
    muscle('Upper Back', { focusDone: 3, accDone: 6, accPlanned: 6 }),
    muscle('Biceps', { focusDone: 6, accDone: 9, focusPlanned: 6, accPlanned: 6, lines: [
      line('Wed', 'Pull', 'Spider Curl', 3, 1, 'done', '2026-10-14'),
      line('Wed', 'Pull', 'Lying T Bar Row', 3, 0.5, 'done', '2026-10-14'),
      line('Fri', 'Upper Body', 'Wide-Grip Lat Pulldown', 3, 0.5, 'today', '2026-10-16'),
      line('Sat', 'Arms and Delts', 'Cable Bicep Curl', 3, 1, 'planned', '2026-10-17'),
    ] }),
    muscle('Triceps', { focusDone: 6, accDone: 6, focusPlanned: 6, accPlanned: 6 }),
    muscle('Chest', { goal: false, focusDone: 3, focusPlanned: 18 }),
  ],
  days: [{ date: '2026-10-13', day: 'tuesday', short: 'Tue', routine: 'Push', status: 'done', focus: { Chest: 3, 'Front Delts': 3 }, accessory: { Triceps: 3 } }],
  uncounted: { sets: 0, planned: 0, lifts: [] },
};

test('the headline counts the V-taper muscles that reach the range by Sunday and names the ones short', () => {
  const v = muscleWeekView(WEEK);
  assert.deepEqual(v.headline, { count: '4 of 6', rest: 'V-taper muscles reach the growth range by Sunday' });
  assert.equal(v.sub, 'Side Delts and Upper Back finish short of 10 on this plan.');
  assert.equal(v.group, 'V-taper muscles');
  assert.equal(v.eyebrow, 'This week · Mon 12 – Sun 18 Oct · tap a muscle');
  assert.equal(muscleWeekView({ ...WEEK, muscles: WEEK.muscles.map((m) => ({ ...m, bySunday: 12 })) }).sub, 'Every V-taper muscle lands in range on this plan.');
});

test('goal muscles that are not his V-taper are called goal muscles', () => {
  const v = muscleWeekView({ ...WEEK, goalMuscles: ['Biceps', 'Triceps'], muscles: WEEK.muscles.map((m) => ({ ...m, goal: ['Biceps', 'Triceps'].includes(m.muscle) })) });
  assert.equal(v.group, 'Goal muscles');
  assert.equal(v.headline.rest, 'goal muscles reach the growth range by Sunday');
});

test('the bar: one 0 to 25 scale, range shaded, accessory drawn at half, the plan as the tail; the tone is the number', () => {
  const b = barOf(WEEK.muscles[1]); // Rear Delts: 3 focus + 3 acc done (4½), by Sunday 12
  assert.deepEqual(b.range, { left: 40, width: 40 });
  assert.equal(b.focus, 12);
  assert.deepEqual(b.acc, { left: 12, width: 6 });
  assert.deepEqual(b.plan, { left: 18, width: 30 });
  const v = muscleWeekView(WEEK);
  assert.equal(v.goal[0].tone, 'low', 'Side Delts lands at 7');
  assert.equal(v.rest[0].tone, 'high', 'Chest lands at 21');
  assert.equal(v.goal.find((r) => r.muscle === 'Biceps').tone, null);
  assert.equal(v.goal.find((r) => r.muscle === 'Biceps').bySunday, '19½');
  assert.match(v.goal[0].aria, /^Side Delts: 1 sets done, 7 by Sunday, range 10 to 20\. Open the exercises\.$/);
  // a muscle with its own range draws its own band
  assert.deepEqual(barOf({ ...WEEK.muscles[0], low: 12, high: 22 }).range, { left: 48, width: 40 });
});

test('a card: every line, grouped by day, adding up to the number on the bar', () => {
  // totals made from its own lines, as the model makes them
  const lines = WEEK.muscles[4].lines;
  const c = cardOf(muscle('Biceps', { lines,
    focusDone: 3, accDone: 3, focusPlanned: 3, accPlanned: 3 }));
  assert.equal(c.bySunday, '9');
  assert.equal(c.total, c.bySunday);
  assert.deepEqual(c.groups.map((g) => [g.short, g.routine, g.tag]), [['Wed', 'Pull', null], ['Fri', 'Upper Body', 'today'], ['Sat', 'Arms and Delts', 'planned']]);
  assert.deepEqual(c.groups[0].items.map((i) => [i.exercise, i.sets, i.value, i.focus, i.come]), [
    ['Spider Curl', '3 sets × 1', '3', true, false],
    ['Lying T Bar Row', '3 sets × ½', '1½', false, false],
  ]);
  assert.equal(c.groups[2].items[0].come, true);
  assert.equal(cardOf(muscle('Biceps', { lines: [{ ...lines[0], dup: true }], focusDone: 3 })).groups[0].dup, true, 'a twin filing is said on its day');
});

test('day chips: focus sets as counted, accessory sets at half, biggest first', () => {
  const [d] = muscleWeekView(WEEK).days;
  assert.equal(d.label, 'Done');
  assert.deepEqual(d.focus.map((c) => [c.muscle, c.sets]), [['Chest', '3'], ['Front Delts', '3']]);
  assert.deepEqual(d.accessory.map((c) => [c.muscle, c.sets]), [['Triceps', '1½']]);
});

test('the tray under the set card: goal muscles, done against the low end, how many are there', async () => {
  const { weekTrayOf } = await import('../../src/muscleWeekView.js');
  assert.equal(weekTrayOf(null), null);
  assert.equal(weekTrayOf({ muscles: [] }), null);
  const t = weekTrayOf(WEEK);
  assert.equal(t.label, 'V-taper muscles in range');
  assert.deepEqual(t.bars.map((b) => b.muscle), ['Side Delts', 'Rear Delts', 'Lats', 'Upper Back', 'Biceps', 'Triceps']);
  // Biceps 6 + 9/2 = 10.5 and Triceps 6 + 3 = 9: one of six at 10 or more
  assert.equal(t.count, '1 of 6');
  const bi = t.bars.find((b) => b.muscle === 'Biceps');
  assert.equal(bi.fill, 100); assert.equal(bi.met, true); assert.equal(bi.done, '10½');
  assert.equal(t.bars.find((b) => b.muscle === 'Side Delts').fill, 10);
  // no goal muscles: the six that have done most, said plainly
  const none = weekTrayOf({ ...WEEK, goalMuscles: [], muscles: WEEK.muscles.map((m) => ({ ...m, goal: false })) });
  assert.equal(none.label, 'Muscles in range this week');
  assert.equal(none.bars[0].muscle, 'Biceps');
  assert.equal(none.bars.length, 6);
});
