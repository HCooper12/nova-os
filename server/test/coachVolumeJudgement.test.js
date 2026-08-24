// "Is this enough, or too much?" — his ask that Coach judge the SHAPE of his
// training, not just whether a lift is climbing.
//
// The bar these detectors are held to is the same as the rest of the review:
// CODE finds the problem in his real history, the model only phrases it. The
// expensive failure mode here is a false positive — a coach who calls a good
// session bloated, or a productive lift useless, is never believed again. So
// most of these tests are about STAYING QUIET.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findJunkVolume,
  findOversizedRoutines,
  findLowValueExercises,
  findLongTenure,
  findEffortCeiling,
  rankFindings,
  JUNK_VOLUME_CEILING,
} from '../lib/coachProgramReview.js';

const EX = [
  { id: 'flys-low', name: 'Cable Flys Low', muscleGroup: 'Chest' },
  { id: 'flys-high', name: 'Cable Flys High', muscleGroup: 'Chest' },
  { id: 'db-bench', name: 'Dumbbell Bench Press', muscleGroup: 'Chest' },
  { id: 'incline', name: 'Incline Barbell Bench Press', muscleGroup: 'Chest' },
  { id: 'stretch', name: 'Hip Stretch', muscleGroup: 'Mobility' },
];
const sets = (w, r, n = 3) => Array.from({ length: n }, () => ({ weight: w, reps: r }));

/* ------------------------------ junk volume ------------------------------- */

test('TOO MUCH: a muscle over the ceiling every week is raised, with the real average', () => {
  const weekly = [
    { week: '2026-08-24', groups: { Chest: 26 } },
    { week: '2026-08-17', groups: { Chest: 24 } },
  ];
  const [f] = findJunkVolume(weekly);
  assert.equal(f.kind, 'junk-volume');
  assert.equal(f.muscle, 'Chest');
  assert.equal(f.avg, 25);
  assert.match(f.line, /25 hard sets a week for 2 weeks/);
  assert.equal(f.fix, null, 'which sets to cut is his call — never a silent button');
});

test('STAYS QUIET: one big week is training, not a programming error', () => {
  const weekly = [
    { week: '2026-08-24', groups: { Chest: 30 } },
    { week: '2026-08-17', groups: { Chest: 12 } }, // back to normal
  ];
  assert.deepEqual(findJunkVolume(weekly), []);
});

test('STAYS QUIET: an ordinary hard week nowhere near the ceiling', () => {
  const weekly = [
    { week: '2026-08-24', groups: { Back: 15, Chest: 12 } },
    { week: '2026-08-17', groups: { Back: 16, Chest: 10 } },
  ];
  assert.deepEqual(findJunkVolume(weekly), [], `15-16 sets must not trip a ${JUNK_VOLUME_CEILING}-set ceiling`);
});

/* -------------------------- oversized routine ----------------------------- */
// Reframed after checking his REAL data: a generic "session ran long" ceiling
// never fires for him, because he already splits a big routine across days.
// The honest signal is a routine he cannot finish — which his history shows
// plainly (9-10 defined, ~5 completed, 12 makeup sessions in six weeks).

const sess = (date, routineId, name, n) => ({
  date, routineId, routineName: name,
  exercises: Array.from({ length: n }, (_, i) => ({ exerciseId: `e${i}`, name: `Ex ${i}`, sets: sets(20, 10) })),
});
const bigRoutine = (n = 10) => ({ id: 'push', name: 'Push', exercises: Array.from({ length: n }, (_, i) => ({ exerciseId: `e${i}`, name: `Ex ${i}` })) });
const NOW = new Date('2026-08-24T12:00:00');

test('TOO MANY EXERCISES: a routine he only ever half-finishes is raised', () => {
  const sessions = [sess('2026-08-20', 'push', 'Push', 5), sess('2026-08-13', 'push', 'Push', 4), sess('2026-08-06', 'push', 'Push', 5)];
  const [f] = findOversizedRoutines(sessions, [bigRoutine(10)], { now: NOW });
  assert.equal(f.kind, 'routine-oversized');
  assert.equal(f.defined, 10);
  assert.ok(f.avg < 6);
  assert.match(f.line, /lists 10 exercises but you finish about/);
  assert.match(f.line, /makeup sessions/);
});

test('the one-tap cut is the movement HIS history says he never reaches', () => {
  // he logs e0-e4; e5..e9 are defined but never touched. Ties break on
  // routine order, so the FIRST never-touched entry is the honest pick —
  // deterministic, and always one he genuinely does not do.
  const sessions = [sess('2026-08-20', 'push', 'Push', 5), sess('2026-08-13', 'push', 'Push', 4), sess('2026-08-06', 'push', 'Push', 5)];
  const [f] = findOversizedRoutines(sessions, [bigRoutine(10)], { now: NOW });
  assert.equal(f.fix.action, 'drop');
  assert.equal(f.fix.routineId, 'push');
  assert.equal(f.fix.exerciseId, 'e5', 'first never-logged entry in routine order');
  assert.match(f.line, /hasn't been touched once/);
});

test('the cut is never an exercise he actually trains', () => {
  const sessions = [sess('2026-08-20', 'push', 'Push', 5), sess('2026-08-13', 'push', 'Push', 4), sess('2026-08-06', 'push', 'Push', 5)];
  const [f] = findOversizedRoutines(sessions, [bigRoutine(10)], { now: NOW });
  const logged = new Set(['e0', 'e1', 'e2', 'e3', 'e4']);
  assert.ok(!logged.has(f.fix.exerciseId), 'must never propose cutting something he does');
});

test('STAYS QUIET when he actually finishes the routine', () => {
  const sessions = [sess('2026-08-20', 'push', 'Push', 9), sess('2026-08-13', 'push', 'Push', 8), sess('2026-08-06', 'push', 'Push', 9)];
  assert.deepEqual(findOversizedRoutines(sessions, [bigRoutine(10)], { now: NOW }), []);
});

test('STAYS QUIET on a short routine — a 4-exercise day is not bloat', () => {
  const small = { id: 'arms', name: 'Arms', exercises: Array.from({ length: 4 }, (_, i) => ({ exerciseId: `e${i}`, name: `Ex ${i}` })) };
  const sessions = [sess('2026-08-20', 'arms', 'Arms', 1), sess('2026-08-13', 'arms', 'Arms', 1), sess('2026-08-06', 'arms', 'Arms', 1)];
  assert.deepEqual(findOversizedRoutines(sessions, [small], { now: NOW }), []);
});

test('STAYS QUIET without enough sessions to call it a pattern', () => {
  const sessions = [sess('2026-08-20', 'push', 'Push', 3)];
  assert.deepEqual(findOversizedRoutines(sessions, [bigRoutine(10)], { now: NOW }), []);
});

/* ---------------------------- low-value lift ------------------------------ */

const routine = { id: 'push', name: 'Push', exercises: [{ exerciseId: 'flys-low' }, { exerciseId: 'flys-high' }, { exerciseId: 'db-bench' }] };

test('LEAST EFFECTIVE: the flat movement is named against a climbing stablemate', () => {
  const sessions = [
    { date: '2026-06-01', exercises: [{ exerciseId: 'flys-low', name: 'Cable Flys Low', sets: sets(10, 12) }, { exerciseId: 'flys-high', name: 'Cable Flys High', sets: sets(10, 12) }, { exerciseId: 'db-bench', name: 'Dumbbell Bench Press', sets: sets(20, 10) }] },
    { date: '2026-07-01', exercises: [{ exerciseId: 'flys-low', name: 'Cable Flys Low', sets: sets(10, 12) }, { exerciseId: 'flys-high', name: 'Cable Flys High', sets: sets(11, 12) }, { exerciseId: 'db-bench', name: 'Dumbbell Bench Press', sets: sets(24, 10) }] },
    { date: '2026-08-01', exercises: [{ exerciseId: 'flys-low', name: 'Cable Flys Low', sets: sets(10, 12) }, { exerciseId: 'flys-high', name: 'Cable Flys High', sets: sets(12, 12) }, { exerciseId: 'db-bench', name: 'Dumbbell Bench Press', sets: sets(27, 10) }] },
  ];
  const [f] = findLowValueExercises(sessions, EX, [routine]);
  assert.equal(f.kind, 'low-value');
  assert.equal(f.exerciseId, 'flys-low', 'the flat one, not merely the lightest');
  assert.match(f.line, /Cable Flys Low/);
  assert.match(f.line, /Dumbbell Bench Press/, 'names what DID work, as evidence');
  // and it IS one-tap, because which movement is weakest was decided by data
  assert.deepEqual(f.fix, { action: 'drop', routineId: 'push', exerciseId: 'flys-low' });
});

test('STAYS QUIET when every movement in the group is progressing', () => {
  const climb = (id, name, w) => ({ exerciseId: id, name, sets: sets(w, 10) });
  const sessions = [
    { date: '2026-06-01', exercises: [climb('flys-low', 'Cable Flys Low', 10), climb('flys-high', 'Cable Flys High', 10), climb('db-bench', 'Dumbbell Bench Press', 20)] },
    { date: '2026-07-01', exercises: [climb('flys-low', 'Cable Flys Low', 12), climb('flys-high', 'Cable Flys High', 12), climb('db-bench', 'Dumbbell Bench Press', 24)] },
    { date: '2026-08-01', exercises: [climb('flys-low', 'Cable Flys Low', 14), climb('flys-high', 'Cable Flys High', 13), climb('db-bench', 'Dumbbell Bench Press', 27)] },
  ];
  assert.deepEqual(findLowValueExercises(sessions, EX, [routine]), []);
});

test('STAYS QUIET when a muscle only gets two movements — that is normal programming', () => {
  const two = { id: 'push', name: 'Push', exercises: [{ exerciseId: 'flys-low' }, { exerciseId: 'db-bench' }] };
  const sessions = [
    { date: '2026-06-01', exercises: [{ exerciseId: 'flys-low', name: 'Cable Flys Low', sets: sets(10, 12) }, { exerciseId: 'db-bench', name: 'DB Bench', sets: sets(20, 10) }] },
    { date: '2026-07-01', exercises: [{ exerciseId: 'flys-low', name: 'Cable Flys Low', sets: sets(10, 12) }, { exerciseId: 'db-bench', name: 'DB Bench', sets: sets(26, 10) }] },
    { date: '2026-08-01', exercises: [{ exerciseId: 'flys-low', name: 'Cable Flys Low', sets: sets(10, 12) }, { exerciseId: 'db-bench', name: 'DB Bench', sets: sets(30, 10) }] },
  ];
  assert.deepEqual(findLowValueExercises(sessions, EX, [two]), []);
});

test('mobility work is never judged as low-value hypertrophy', () => {
  const r = { id: 'push', name: 'Push', exercises: [{ exerciseId: 'stretch' }, { exerciseId: 'flys-low' }, { exerciseId: 'db-bench' }] };
  const found = findLowValueExercises([], EX, [r]);
  assert.ok(!found.some((f) => f.exerciseId === 'stretch'));
});

/* ------------------------------- tenure ----------------------------------- */

test('TOO LONG ON ONE THING: months of the same lift earns a rotation nudge', () => {
  const sessions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date('2026-04-01T12:00:00');
    d.setDate(d.getDate() + i * 14); // fortnightly across ~24 weeks
    return { date: d.toISOString().slice(0, 10), exercises: [{ exerciseId: 'db-bench', name: 'Dumbbell Bench Press', sets: sets(20, 10) }] };
  });
  const [f] = findLongTenure(sessions, EX, { now: new Date('2026-09-15T12:00:00') });
  assert.equal(f.kind, 'tenure');
  assert.ok(f.weeks >= 16);
  assert.match(f.line, /Dumbbell Bench Press/);
  assert.equal(f.fix.action, 'swap', 'offers a same-muscle alternative');
});

test('STAYS QUIET on a lift he already stopped doing', () => {
  const sessions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date('2025-01-01T12:00:00');
    d.setDate(d.getDate() + i * 14);
    return { date: d.toISOString().slice(0, 10), exercises: [{ exerciseId: 'db-bench', name: 'DB Bench', sets: sets(20, 10) }] };
  });
  // last outing is over a year before "now" — it is not in the program
  assert.deepEqual(findLongTenure(sessions, EX, { now: new Date('2026-08-24T12:00:00') }), []);
});

/* ------------------------------- ranking ---------------------------------- */

test('a wrong mapping still outranks everything; tenure is always last', () => {
  const ranked = rankFindings([
    { kind: 'tenure' }, { kind: 'stale' }, { kind: 'routine-oversized' },
    { kind: 'mapping' }, { kind: 'junk-volume' }, { kind: 'low-value' }, { kind: 'under-volume' },
  ]).map((f) => f.kind);
  assert.equal(ranked[0], 'mapping');
  assert.equal(ranked[1], 'under-volume');
  assert.equal(ranked[ranked.length - 1], 'tenure');
});

/* --------------------------- the effort ceiling --------------------------- */
// Found in his real log: 227 working sets, all RPE-rated, 94% at 9 or 10.
// That is the finding that explains several stale lifts at once, and it must
// be said ONCE rather than as fourteen identical per-exercise notes.

const rpeSession = (date, n, rpe) => ({
  date,
  exercises: [{ exerciseId: 'x', name: 'X', sets: Array.from({ length: n }, () => ({ weight: 20, reps: 8, rpe })) }],
});

test('TRAINING TOO HARD: near-maximal effort on nearly every set is raised once', () => {
  const sessions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date('2026-08-20T12:00:00');
    d.setDate(d.getDate() - i * 3);
    return rpeSession(d.toISOString().slice(0, 10), 10, 9);
  });
  const found = findEffortCeiling(sessions, { now: new Date('2026-08-24T12:00:00') });
  assert.equal(found.length, 1, 'said once, not per exercise');
  assert.equal(found[0].kind, 'effort-ceiling');
  assert.ok(found[0].pct >= 85);
  assert.match(found[0].line, /nothing to progress into/);
  assert.equal(found[0].fix, null, 'a habit on the floor, not a plan edit');
});

test('STAYS QUIET when effort is sensibly distributed', () => {
  const sessions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date('2026-08-20T12:00:00');
    d.setDate(d.getDate() - i * 3);
    // most sets at 7-8, a hard last set — how it should look
    return {
      date: d.toISOString().slice(0, 10),
      exercises: [{ exerciseId: 'x', name: 'X', sets: [{ weight: 20, reps: 8, rpe: 7 }, { weight: 20, reps: 8, rpe: 8 }, { weight: 20, reps: 8, rpe: 9 }] }],
    };
  });
  assert.deepEqual(findEffortCeiling(sessions, { now: new Date('2026-08-24T12:00:00') }), []);
});

test('STAYS QUIET on a thin log — a hard fortnight is not a programming verdict', () => {
  const sessions = [rpeSession('2026-08-20', 10, 10), rpeSession('2026-08-18', 10, 10)];
  assert.deepEqual(findEffortCeiling(sessions, { now: new Date('2026-08-24T12:00:00') }), []);
});

test('STAYS QUIET when RPE is barely logged — it cannot judge what it cannot see', () => {
  const sessions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date('2026-08-20T12:00:00');
    d.setDate(d.getDate() - i * 3);
    return {
      date: d.toISOString().slice(0, 10),
      exercises: [{ exerciseId: 'x', name: 'X', sets: Array.from({ length: 10 }, (_, j) => (j === 0 ? { weight: 20, reps: 8, rpe: 10 } : { weight: 20, reps: 8 })) }],
    };
  });
  assert.deepEqual(findEffortCeiling(sessions, { now: new Date('2026-08-24T12:00:00') }), []);
});
