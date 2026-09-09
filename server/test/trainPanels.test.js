// WHAT THE TODAY PANE SHOWS, AND WHEN.
//
// 8 Sep: a make-up day replaced the scheduled session, because offering a
// full standard day on a day he had moved forward to FINISH was the bug.
// 9 Sep, his correction: "both the finish push workout and the pool workout
// panels should be getting displayed and not just one or the other."
import test from 'node:test';
import assert from 'node:assert/strict';
import { todayPanels } from '../../src/trainPanels.js';

const MAKEUP = { sourceRoutineName: 'Push', exercises: [{ name: 'Weighted Pull-Up' }] };
const POOL = { routineId: 'r1', name: 'Pool', exerciseCount: 5 };

test('THE REPORT: a make-up and a scheduled session both show', () => {
  const p = todayPanels({ makeup: MAKEUP, today: POOL, restDay: false });
  assert.equal(p.makeup, true);
  assert.equal(p.scheduled, true, 'the pool workout was being hidden by the make-up');
  assert.equal(p.alsoScheduled, true, 'and it says which one is the extra');
});

test('a make-up on a day the template calls rest shows only the make-up', () => {
  const p = todayPanels({ makeup: MAKEUP, today: null, restDay: true });
  assert.equal(p.makeup, true);
  assert.equal(p.scheduled, false);
  assert.equal(p.rest, false, '"Rest day" beside "Finish Push" is noise, not a second option');
});

test('an ordinary day is unchanged', () => {
  const p = todayPanels({ makeup: null, today: POOL, restDay: false });
  assert.deepEqual(p, { resume: false, makeup: false, scheduled: true, rest: false, alsoScheduled: false });
});

test('a real rest day still says so', () => {
  const p = todayPanels({ makeup: null, today: null, restDay: true });
  assert.equal(p.rest, true);
  assert.equal(p.scheduled, false);
});

test('a session already underway is the only thing that matters', () => {
  const p = todayPanels({ makeup: MAKEUP, today: POOL, restDay: false }, { name: 'Push', done: 4 });
  assert.equal(p.resume, true);
  assert.equal(p.makeup, false);
  assert.equal(p.scheduled, false);
});

test('no overview at all draws nothing', () => {
  assert.deepEqual(todayPanels(null), { resume: false, makeup: false, scheduled: false, rest: false, alsoScheduled: false });
});
