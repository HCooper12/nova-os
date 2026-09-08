// MAKE-UP DAY — a date whose plan is finishing a prior session, not running a
// standard one. His report: every surface recommended a full Pull day while he
// was actually there to finish three exercises from Monday's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { leftoversOf, setMakeupDay, clearMakeupDay, makeupFor, makeupLine, makeupContext, todayIso } from '../lib/makeupDay.js';

const routine = {
  id: 'pull', name: 'Pull',
  exercises: [
    { exerciseId: 'weighted-pull-up', name: 'Weighted Pull-Up', targetSets: 3, targetRepsLow: 6, targetRepsHigh: 10 },
    { exerciseId: 'cable-row', name: 'Cable Row', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12 },
    { exerciseId: 'cable-hammer-curls', name: 'Cable Hammer Curls', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12 },
    { exerciseId: 'face-pull', name: 'Face Pull', targetSets: 3, targetRepsLow: 12, targetRepsHigh: 15 },
  ],
};
const sessions = [
  { id: 's2', date: '2026-09-07', routineId: 'pull', routineName: 'Pull', exercises: [
    { exerciseId: 'weighted-pull-up', name: 'Weighted Pull-Up', sets: 3 },
    { exerciseId: 'cable-row', name: 'Cable Row', sets: 2 },
    { exerciseId: 'cable-hammer-curls', name: 'Cable Hammer Curls', sets: 0 },
  ] },
  { id: 's1', date: '2026-09-01', routineId: 'pull', routineName: 'Pull', exercises: [{ exerciseId: 'face-pull', sets: 3 }] },
];

test('the leftovers are derived from the LAST session of that routine, not typed', () => {
  const out = leftoversOf(routine, sessions);
  assert.deepEqual(out.exercises.map((e) => e.exerciseId), ['cable-hammer-curls', 'face-pull'], 'zero sets counts as not done; an older session does not cover it');
  assert.equal(out.sourceDate, '2026-09-07');
  assert.equal(out.exercises[0].targetSets, 3);
  assert.equal(out.exercises[1].targetRepsHigh, 15, 'the prescription rides with it');
});

test('a skipped exercise is left over even when sets were logged, and an untouched routine says so honestly', () => {
  const skipped = [{ date: '2026-09-07', routineId: 'pull', exercises: [
    { exerciseId: 'weighted-pull-up', sets: [{ done: true }, { done: true }] },
    { exerciseId: 'cable-row', sets: [{ done: true }], skipped: true },
    { exerciseId: 'cable-hammer-curls', sets: [{ done: false }] },
    { exerciseId: 'face-pull', sets: [{ done: true }] },
  ] }];
  assert.deepEqual(leftoversOf(routine, skipped).exercises.map((e) => e.exerciseId), ['cable-row', 'cable-hammer-curls']);
  assert.deepEqual(leftoversOf(routine, []).exercises, []);
  assert.match(leftoversOf(routine, []).reason, /no logged Pull session to finish/);
  assert.match(leftoversOf(null, sessions).reason, /not in your plan/);
  const finished = [{ date: '2026-09-07', routineId: 'pull', exercises: routine.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: 3 })) }];
  assert.match(leftoversOf(routine, finished).reason, /nothing left to make up/);
});

// a tiny in-memory carry-over store
function store() {
  const rows = [];
  return {
    rows,
    listCarryovers: async () => rows,
    addCarryover: async (r) => { const rec = { id: `c${rows.length + 1}`, ...r }; rows.push(rec); return rec; },
    removeCarryover: async (id) => { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); return { removed: i >= 0 ? 1 : 0 }; },
  };
}

test('marking a day writes ONE make-up for it, replacing any earlier one', async () => {
  const s = store();
  const m = await setMakeupDay({ date: '2026-09-08', routine, sessions }, s);
  assert.equal(m.plannedAs, 'day');
  assert.equal(m.sourceRoutineName, 'Pull');
  assert.equal(m.sourceRoutineId, 'pull');
  assert.equal(m.sourceDate, '2026-09-07');
  assert.deepEqual(m.exercises.map((e) => e.name), ['Cable Hammer Curls', 'Face Pull']);
  await setMakeupDay({ date: '2026-09-08', routine, sessions }, s);
  assert.equal(s.rows.filter((r) => r.forDate === '2026-09-08').length, 1, 'one plan per day, never two');
  assert.equal((await makeupFor('2026-09-08', s)).id, s.rows[0].id);
  assert.equal(await makeupFor('2026-09-09', s), null);
  await assert.rejects(setMakeupDay({ date: 'tomorrow', routine, sessions }, s), /YYYY-MM-DD/);
  await assert.rejects(setMakeupDay({ date: '2026-09-08', routine, sessions: [] }, s), /no logged Pull session/);
});

test('ordinary carry-over debt on the same date is NOT the day\'s plan', async () => {
  const s = store();
  await s.addCarryover({ forDate: '2026-09-08', sourceRoutineName: 'Push', exercises: [{ exerciseId: 'x', name: 'X' }] });
  assert.equal(await makeupFor('2026-09-08', s), null, 'debt waiting on a date is still just debt');
  await setMakeupDay({ date: '2026-09-08', routine, sessions }, s);
  assert.equal((await makeupFor('2026-09-08', s)).sourceRoutineName, 'Pull');
  assert.equal(s.rows.length, 2, 'the ordinary carry-over is untouched');
  await clearMakeupDay('2026-09-08', s);
  assert.equal(await makeupFor('2026-09-08', s), null);
  assert.equal(s.rows.length, 1, 'clearing the make-up leaves the debt alone');
});

test('one sentence, and it says what today is NOT for — the whole point of his report', async () => {
  const s = store();
  const m = await setMakeupDay({ date: todayIso(), routine, sessions }, s);
  assert.equal(makeupLine(m, { scheduledName: 'Push' }),
    'MAKE-UP DAY (not the scheduled Push): finishing Pull from 2026-09-07 — 2 exercises left: Cable Hammer Curls, Face Pull.');
  assert.match(makeupLine(m, { scheduledName: 'Pull' }), /MAKE-UP DAY — not a full session: finishing Pull/);
  assert.equal(makeupLine(null), null);
  const many = { ...m, exercises: [1, 2, 3, 4, 5].map((n) => ({ name: `Ex ${n}` })) };
  assert.match(makeupLine(many), /Ex 1, Ex 2, Ex 3 \+2 more\.$/);
  const ctx = await makeupContext(new Date(), s);
  assert.match(ctx, /TODAY IS A MAKE-UP DAY, by his own plan\./);
  assert.match(ctx, /Do NOT program or recommend a full session today/);
  assert.equal(await makeupContext(new Date(), store()), null, 'no make-up, no section — never an empty heading');
});
