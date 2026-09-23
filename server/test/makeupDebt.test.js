// A MAKE-UP MOVES REAL DEBT; IT DOES NOT RE-DERIVE OVER THE TOP OF IT.
//
// His report, 22 Sep 2026: he marked a day as a Push make-up and Nova "added
// exercises that wasn't originally in my makeup session pushed forward from
// yesterday." setMakeupDay always called leftoversOf(), which recomputes the
// remainder from the last logged session of that routine — a second,
// independent calculation that can disagree with the carry-over already in
// the store. That carry-over was written when the session ended, from that
// session. It is the record of what he did not do.
//
// And the stake is higher than a wrong list. His words: "I don't want nova to
// then log I skipped any exercises if I had left it but chose not to redo the
// ones I already did yesterday." A make-up carrying work he completed becomes,
// if left alone, a record that he skipped it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setMakeupDay, leftoversOf, sameRoutineAs, PLANNED_AS_DAY } from '../lib/makeupDay.js';

const routine = {
  id: 'push-1',
  name: 'Push',
  exercises: [
    { exerciseId: 'bench', name: 'Incline Barbell Bench Press' },
    { exerciseId: 'ohp', name: 'Dumbbell Shoulder Press' },
    { exerciseId: 'flys', name: 'Cable Flys' },
    { exerciseId: 'push', name: 'Triceps Pushdown' },
    { exerciseId: 'face', name: 'Face Pull' },
  ],
};

// what he ACTUALLY did not finish, written when the session ended
const realDebt = {
  id: 'co-1',
  forDate: '2026-09-25',
  sourceRoutineId: 'push-1',
  sourceRoutineName: 'Push',
  sourceDate: '2026-09-21',
  plannedAs: null,
  exercises: [{ exerciseId: 'face', name: 'Face Pull' }, { exerciseId: 'push', name: 'Triceps Pushdown' }],
};

// a DIFFERENT, older session — what leftoversOf would recompute from
const olderSessions = [{
  routineId: 'push-1', date: '2026-09-10',
  exercises: [{ exerciseId: 'bench', sets: [{ done: true }] }],
}];

function rig(initial) {
  // DEEP copy: the rig's addCarryover mutates rows in place (as the real one
  // does), and a shallow [...initial] shares the fixture objects between
  // tests — one test then silently rewrites another's starting conditions.
  const store = initial.map((c) => JSON.parse(JSON.stringify(c)));
  return {
    store,
    deps: {
      listCarryovers: async () => store.map((c) => ({ ...c })),
      removeCarryover: async (id) => { const i = store.findIndex((c) => c.id === id); if (i >= 0) store.splice(i, 1); },
      rescheduleCarryover: async (id, forDate) => { const c = store.find((x) => x.id === id); if (c) c.forDate = forDate; },
      addCarryover: async (rec) => {
        const twin = store.find((c) => c.sourceRoutineId === rec.sourceRoutineId && c.forDate === rec.forDate);
        if (twin) { Object.assign(twin, rec, { id: twin.id }); return twin; }
        const row = { ...rec, id: `co-${store.length + 1}` };
        store.push(row);
        return row;
      },
    },
  };
}

test('THE MAKE-UP CARRIES WHAT HE ACTUALLY LEFT, not a recomputation', async () => {
  const { store, deps } = rig([realDebt]);
  const rec = await setMakeupDay({ date: '2026-09-23', routine, sessions: olderSessions }, deps);
  assert.deepEqual(rec.exercises.map((e) => e.exerciseId).sort(), ['face', 'push'],
    'the make-up was re-derived and handed him work he had already done');
  assert.equal(rec.plannedAs, PLANNED_AS_DAY);
  assert.equal(rec.sourceDate, '2026-09-21', 'it lost which session it is finishing');
});

test('ONE ROW. The debt MOVES — it is not copied onto a second date', async () => {
  const { store, deps } = rig([realDebt]);
  await setMakeupDay({ date: '2026-09-23', routine, sessions: olderSessions }, deps);
  const pushRows = store.filter((c) => c.sourceRoutineId === 'push-1');
  assert.equal(pushRows.length, 1, `the debt exists on ${pushRows.length} dates at once`);
  assert.equal(pushRows[0].forDate, '2026-09-23', 'it did not move to the day he chose');
});

test('with NO outstanding debt it still derives, as it always did', async () => {
  const sessions = [{
    routineId: 'push-1', date: '2026-09-21',
    exercises: [
      { exerciseId: 'bench', sets: [{ done: true }] },
      { exerciseId: 'ohp', sets: [{ done: true }] },
    ],
  }];
  const { store, deps } = rig([]);
  const rec = await setMakeupDay({ date: '2026-09-23', routine, sessions }, deps);
  assert.deepEqual(rec.exercises.map((e) => e.exerciseId).sort(), ['face', 'flys', 'push']);
  assert.equal(store.length, 1);
});

test('a make-up already on that date is replaced, never stacked', async () => {
  const old = { ...realDebt, id: 'co-old', forDate: '2026-09-23', plannedAs: PLANNED_AS_DAY, sourceRoutineId: 'pull-1', sourceRoutineName: 'Pull' };
  const { store, deps } = rig([old, realDebt]);
  await setMakeupDay({ date: '2026-09-23', routine, sessions: olderSessions }, deps);
  const onDay = store.filter((c) => c.forDate === '2026-09-23' && c.plannedAs === PLANNED_AS_DAY);
  assert.equal(onDay.length, 1, 'two plans for one day');
  assert.equal(onDay[0].sourceRoutineName, 'Push');
});

test('debt is matched by id, and by NAME when a row has no id', async () => {
  assert.equal(sameRoutineAs({ sourceRoutineId: 'push-1' }, routine), true);
  assert.equal(sameRoutineAs({ sourceRoutineId: 'pull-1' }, routine), false);
  assert.equal(sameRoutineAs({ sourceRoutineName: 'Push' }, routine), true);
  assert.equal(sameRoutineAs({ sourceRoutineName: 'Pull' }, routine), false);
  assert.equal(sameRoutineAs(null, routine), false);
  // an id on both sides wins over a matching name
  assert.equal(sameRoutineAs({ sourceRoutineId: 'other', sourceRoutineName: 'Push' }, routine), false);
});

test('the most recent debt wins when there is more than one', async () => {
  const older = { ...realDebt, id: 'co-older', sourceDate: '2026-09-01', exercises: [{ exerciseId: 'bench', name: 'Bench' }] };
  const { deps } = rig([older, realDebt]);
  const rec = await setMakeupDay({ date: '2026-09-23', routine, sessions: olderSessions }, deps);
  assert.equal(rec.sourceDate, '2026-09-21', 'it picked up stale debt over the recent session');
});

test('leftoversOf itself is unchanged — it still refuses to invent a list', () => {
  assert.deepEqual(leftoversOf(null, []).exercises, []);
  assert.match(leftoversOf(routine, []).reason, /no logged Push session/);
  const all = [{ routineId: 'push-1', date: '2026-09-21', exercises: routine.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: [{ done: true }] })) }];
  assert.match(leftoversOf(routine, all).reason, /nothing left to make up/);
});
