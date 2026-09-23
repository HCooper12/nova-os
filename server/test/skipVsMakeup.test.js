// A MAKE-UP IS NOT A SKIP. His question, 22 Sep 2026, after Nova put exercises
// he had already done into a make-up: "I don't want nova to then log I skipped
// any exercises if I had left it but chose not to redo the ones I already did
// yesterday."
//
// Audited. Two separate decisions, made in two different files, are what keep
// that true — and NOTHING asserted them together, so either could have been
// undone by a reasonable-looking change:
//
//   1. detectSkippedExercises reads ONLY logged sessions. Carry-overs and
//      make-ups are a different store and it never opens them, so a make-up
//      he leaves undone cannot become a skip.
//   2. A make-up session logs with routineId 'carryover', not the source
//      routine's id (App.jsx startCarryoverSession). So a DELIBERATELY
//      PARTIAL session — the whole point of a make-up — is excluded from the
//      routine's window instead of making every exercise he already finished
//      yesterday read as missing today.
//
// The second is the subtle one and the more dangerous: it is the exact
// inversion of his worry, and it would have produced false "you keep skipping
// this" nags from the act of doing a make-up properly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSkippedExercises } from '../lib/coach.js';

const routine = {
  id: 'pull-1',
  name: 'Pull',
  exercises: [
    { exerciseId: 'pullup', name: 'Weighted Pull-Up' },
    { exerciseId: 'hammer', name: 'Cable Hammer Curls' },
    { exerciseId: 'hang', name: 'Dead Hang' },
    { exerciseId: 'shrug', name: 'Dumbbell Shrug' },
  ],
};

const full = (date) => ({
  routineId: 'pull-1', date,
  exercises: routine.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: [{ done: true }] })),
});

test('a full session skips nothing', () => {
  const out = detectSkippedExercises([routine], [full('2026-09-21'), full('2026-09-18'), full('2026-09-15')]);
  assert.deepEqual(out, []);
});

test('A MAKE-UP SESSION IS NOT COUNTED AGAINST THE ROUTINE', () => {
  // the whole point of a make-up is that it is partial. If it landed in the
  // routine's window, every exercise he finished YESTERDAY would read as
  // missing TODAY, and the Coach would nag him for doing the right thing.
  const makeup = {
    routineId: 'carryover', date: '2026-09-22',
    sourceRoutineName: 'Pull',
    exercises: [{ exerciseId: 'hang', sets: [{ done: true }] }],
  };
  const out = detectSkippedExercises([routine], [makeup, full('2026-09-21'), full('2026-09-18'), full('2026-09-15')]);
  assert.deepEqual(out, [], `a make-up produced ${out.length} false skips: ${out.map((s) => s.name).join(', ')}`);
});

test('...and it does not count as ATTENDANCE either', () => {
  // the flip side: a make-up must not pad the window and make two real
  // sessions look like three
  const makeup = { routineId: 'carryover', date: '2026-09-22', exercises: [{ exerciseId: 'hang', sets: [{ done: true }] }] };
  const onlyOne = detectSkippedExercises([routine], [makeup, full('2026-09-21')]);
  assert.deepEqual(onlyOne, [], 'one real session plus a make-up was treated as enough history to claim a pattern');
});

test('AN UNDONE MAKE-UP CANNOT BECOME A SKIP — carry-overs are never read', () => {
  // his actual worry. A carry-over sitting there unfinished is not a session
  // and the detector has no way to see it.
  const carryover = {
    id: 'co-1', forDate: '2026-09-25', plannedAs: 'day',
    sourceRoutineId: 'pull-1', sourceRoutineName: 'Pull',
    exercises: [{ exerciseId: 'pullup' }, { exerciseId: 'hang' }],
  };
  const sessions = [full('2026-09-21'), full('2026-09-18'), full('2026-09-15')];
  const withDebt = detectSkippedExercises([routine], sessions.concat(carryover));
  assert.deepEqual(withDebt, [],
    'an outstanding carry-over leaked into the skip count — he would be told he skips work he has merely not done YET');
});

test('a genuine repeated skip is still caught — the guard must not blind it', () => {
  const partial = (date) => ({
    routineId: 'pull-1', date,
    exercises: routine.exercises
      .filter((e) => e.exerciseId !== 'shrug')
      .map((e) => ({ exerciseId: e.exerciseId, sets: [{ done: true }] })),
  });
  const out = detectSkippedExercises([routine], [partial('2026-09-21'), partial('2026-09-18'), full('2026-09-15')]);
  assert.equal(out.length, 1, 'a real drop-off stopped being detected');
  assert.equal(out[0].exerciseId, 'shrug');
  assert.equal(out[0].missed, 2);
  assert.equal(out[0].lastDoneDate, '2026-09-15', 'it lost when he last actually did it');
});

test('the counts come from logged SETS, not from the exercise being listed', () => {
  // an exercise present in the session with no sets is not done
  const listedNotDone = (date) => ({
    routineId: 'pull-1', date,
    exercises: routine.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.exerciseId === 'hammer' ? [] : [{ done: true }] })),
  });
  const out = detectSkippedExercises([routine], [listedNotDone('2026-09-21'), listedNotDone('2026-09-18')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].exerciseId, 'hammer');
});

test('THE WIRING: a make-up session must not adopt the routine id', async () => {
  // property (2) lives in App.jsx, a file this detector knows nothing about.
  // If startCarryoverSession ever set routineId to the source routine, every
  // test above would still pass and Nova would start nagging him in the app.
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const app = await readFile(path.join(
    path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'App.jsx',
  ), 'utf8');
  const at = app.indexOf('  startCarryoverSession(carryover) {');
  assert.ok(at > 0, 'startCarryoverSession is gone');
  // to the end of the method, not a guessed character count
  const fn = app.slice(at, app.indexOf('\n  rescheduleCarryoverTo(', at));
  assert.match(fn, /routineId: 'carryover'/,
    'a make-up session now logs under a real routine id — partial sessions will read as skipped work');
  assert.match(fn, /sourceRoutineName: carryover\.sourceRoutineName/,
    'the make-up lost the name it is finishing, which every surface reads');
});
