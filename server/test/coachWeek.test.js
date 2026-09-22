// Finding 8 (22 Sep 2026): the Coach tab's empty log shows the week the Coach
// is reading — real volume rows, goal muscles first, nothing when there is
// nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coachWeekRows } from '../../src/coachWeek.js';

test('goal muscles lead, rows are capped, and a short goal muscle is marked', () => {
  const w = coachWeekRows([
    { muscle: 'Chest', sets: 8, target: 10 },
    { muscle: 'Triceps', sets: 6, target: 12, goalMuscle: true },
    { muscle: 'Back', sets: 12, target: 12 },
    { muscle: 'Biceps', sets: 10, target: 10, goalMuscle: true },
    { muscle: 'Quads', sets: 3, target: 9 },
    { muscle: 'Calves', sets: 0, target: 6 },
  ], { cap: 4 });
  assert.deepEqual(w.rows.map((r) => r.muscle), ['Biceps', 'Triceps', 'Back', 'Chest']);
  assert.equal(w.rows[1].short, true);
  assert.equal(w.rows[0].short, false);
  assert.equal(w.rows[1].pct, 50);
  assert.equal(w.line, '16 of 22 sets on your goal muscles this week');
  assert.equal(w.more, 2);
});

test('no volume is null, a target of zero is skipped, and the line counts sets without goals', () => {
  assert.equal(coachWeekRows(null), null);
  assert.equal(coachWeekRows([]), null);
  assert.equal(coachWeekRows([{ muscle: 'Abs', sets: 4, target: 0 }]), null);
  assert.equal(coachWeekRows([{ muscle: 'Abs', sets: 4, target: 8 }]).line, '4 sets this week');
  assert.equal(coachWeekRows([{ muscle: 'Abs', sets: 40, target: 8 }]).rows[0].pct, 100, 'never past the bar');
});

test('the empty coach log draws the instrument in each muscle\'s own hue', () => {
  const src = readFileSync(new URL('../../src/screens/Workouts.jsx', import.meta.url), 'utf8');
  const start = src.lastIndexOf('v.coachMsgs.length === 0 && !v.coachBusy');
  const block = src.slice(start, src.indexOf('{v.coachMsgs.map(', start));
  assert.match(block, /v\.coachWeek && \(/);
  assert.match(block, /muscleVar\(r\.muscle\)/);
  assert.doesNotMatch(block, /var\(--nv-cy\)/, 'no muscle painted cyan');
});
