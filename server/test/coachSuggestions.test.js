// COACH'S SUGGESTIONS IN TRAIN (25 Sep 2026). His ask: every change the Coach
// suggests — over time, from research, from chat — in one simple place, to
// approve, discuss or turn down. What must hold: only waiting Coach changes
// become cards; each reads as a sentence with numbers computed from his real
// program (never the machine title); the deck follows his week; and a yes on
// a program-review fix ACTS — it used to file an acknowledgement and change
// nothing, which is the complaint that started this.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-sugg-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-sugg-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import { coachSuggestions, suggestionsSummary, isCoachSuggestion, toHim, whenLabel, COACH_ROUTES } from '../../src/coachSuggestions.js';

const routines = [
  { id: 'push', name: 'Push', exercises: [
    { exerciseId: 'wpu', name: 'Weighted Pull-Up', muscleGroup: 'Back', targetSets: 3, targetRepsLow: 12, targetRepsHigh: 12 },
    { exerciseId: 'fly', name: 'High Cable Fly', muscleGroup: 'Chest', targetSets: 3, targetRepsLow: 10, targetRepsHigh: 12 },
    { exerciseId: 'carter', name: 'Carter Extension', muscleGroup: 'Triceps', targetSets: 2, targetRepsLow: 10, targetRepsHigh: 12 },
    { exerciseId: 'incline', name: 'Incline Bench', muscleGroup: 'Chest', targetSets: 3, targetRepsLow: 6, targetRepsHigh: 8 },
  ] },
  { id: 'pull', name: 'Pull', exercises: [{ exerciseId: 'pinch', name: 'Plate Pinch', muscleGroup: 'Forearms', targetSets: 3 }] },
];
const schedule = { monday: 'push', wednesday: 'pull', thursday: 'active-rest' };
const rec = (id, route, payload, extra = {}) => ({ id, status: 'pending', source: 'coach', createdAt: '2026-09-25T00:00:00Z', decision: { route, title: `Coach: ${id}`, payload }, ...extra });
const NOW = Date.parse('2026-09-25T03:00:00Z');

const items = [
  rec('r-pinch', 'routine-edit', { action: 'remove', routineId: 'pull', routineName: 'Pull', removeExerciseId: 'pinch', removeName: 'Plate Pinch', reason: 'his grip is already loaded' }),
  rec('r-wpu', 'routine-edit', { action: 'remove', routineId: 'push', routineName: 'Push', removeExerciseId: 'wpu', removeName: 'Weighted Pull-Up', reason: 'a pull on push day' }),
  rec('r-carter', 'routine-edit', { action: 'targets', routineId: 'push', routineName: 'Push', removeExerciseId: 'carter', removeName: 'Carter Extension', targetSets: 3 }),
  rec('r-first', 'routine-edit', { action: 'reorder', routineId: 'push', routineName: 'Push', removeExerciseId: 'incline', removeName: 'Incline Bench', position: 1 }),
  rec('r-tue', 'schedule-edit', { action: 'schedule', day: 'tuesday', routineId: null, routineName: 'rest', beforeId: 'push' }),
  { id: 'f-effort', kind: 'coach-program', status: 'pending', source: 'coach', findingKind: 'effort-ceiling', finding: { kind: 'effort-ceiling', pct: 89 }, fix: null, createdAt: '2026-09-20T00:00:00Z', text: 'Coach: 89% of your last 383 working sets were RPE 9 or 10. Take the first sets to an honest 7-8.' },
  { id: 'f-drop', kind: 'coach-program', status: 'pending', source: 'coach', findingKind: 'routine-oversized', finding: {}, fix: { action: 'drop', routineId: 'pull', exerciseId: 'pinch' }, createdAt: '2026-09-21T00:00:00Z', text: 'Coach: Pull lists more than you finish. Plate Pinch has not been touched.' },
  // not his to decide here: filed, a research note, a coach-audit receipt
  rec('filed', 'routine-edit', { action: 'remove' }, { status: 'filed' }),
  { id: 'note', status: 'pending', kind: 'research', decision: { route: 'note' } },
  { id: 'audit', status: 'pending', kind: 'coach-audit' },
];

test('only waiting Coach changes become cards — never notes, receipts or answered ones', () => {
  assert.equal(COACH_ROUTES.includes('schedule-edit'), true);
  assert.deepEqual(items.filter(isCoachSuggestion).map((r) => r.id), ['r-pinch', 'r-wpu', 'r-carter', 'r-first', 'r-tue', 'f-effort', 'f-drop']);
});

test('each card is a sentence with numbers from his real program', () => {
  const cards = coachSuggestions(items, { routines, schedule, now: NOW });
  const by = Object.fromEntries(cards.map((c) => [c.id, c]));
  assert.equal(by['r-wpu'].headline, 'Drop Weighted Pull-Up');
  assert.deepEqual(by['r-wpu'].sets, { before: 11, after: 8 }, 'Push has 11 sets; dropping 3 leaves 8');
  assert.deepEqual(by['r-wpu'].routine, { id: 'push', name: 'Push', days: ['Mon'] });
  assert.equal(by['r-wpu'].why, 'A pull on push day');
  assert.equal(by['r-carter'].headline, 'Carter Extension: 3 sets');
  assert.deepEqual(by['r-carter'].sets, { before: 11, after: 12 });
  assert.equal(by['r-first'].headline, 'Do Incline Bench first');
  assert.deepEqual([by['r-first'].diff.from, by['r-first'].diff.to], [4, 1]);
  assert.equal(by['r-first'].sets, null, 'a reorder changes no set count, so none is shown');
  assert.equal(by['r-tue'].headline, 'Make Tuesday a rest day');
  const tue = by['r-tue'].diff.week.find((d) => d.changes);
  assert.deepEqual([tue.day, tue.before, tue.after], ['Tue', 'Rest', 'Rest'], 'the day it changes (schedule shows Tuesday already rest here)');
  assert.equal(by['r-tue'].diff.week.find((d) => d.day === 'Thu').after, 'Active rest');
  assert.equal(by['r-pinch'].why, 'Your grip is already loaded', 'shown TO him');
});

test('a program-review fix is drawn like any change; an observation says Coach will draft it', () => {
  const cards = coachSuggestions(items, { routines, schedule, now: NOW });
  const drop = cards.find((c) => c.id === 'f-drop');
  assert.equal(drop.headline, 'Drop Plate Pinch');
  assert.equal(drop.via, 'approve');
  assert.equal(drop.source, "From Coach's program review");
  const effort = cards.find((c) => c.id === 'f-effort');
  assert.equal(effort.via, 'draft', 'no one-tap edit — a yes asks Coach to draft the concrete change');
  assert.deepEqual([effort.diff.type, effort.diff.pct], ['gauge', 89]);
  assert.match(effort.headline, /^89% of your last 383/);
});

test('the deck follows his week: Monday first, then Wednesday, then anything not about one routine', () => {
  const cards = coachSuggestions(items, { routines, schedule, now: NOW });
  const order = cards.map((c) => c.routine?.name || '—');
  assert.deepEqual(order, ['Push', 'Push', 'Push', 'Pull', 'Pull', '—', '—']);
  assert.deepEqual(suggestionsSummary(cards), { count: 7, title: '7 changes from Coach', where: 'Push and Pull' });
  assert.equal(suggestionsSummary([]), null);
});

test('reasons read TO him, and dates read like he would say them', () => {
  assert.equal(toHim("his 09-22 note says it felt worse; it's for him"), "Your 09-22 note says it felt worse; it's for you");
  assert.equal(toHim('this stays'), 'This stays', 'only whole words change');
  assert.equal(whenLabel('2026-09-25T01:00:00Z', NOW), 'today');
  assert.equal(whenLabel('2026-09-24T01:00:00Z', NOW), 'yesterday');
});

test('a yes on a program-review fix ACTS, and undo puts it back', async () => {
  const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
  const { createRoutine, loadRoutines } = await import('../lib/workouts.js');
  const { createRecord } = await import('../lib/inboxStore.js');
  const { approveRecord, undoRecord } = await import('../lib/inbox.js');
  await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
  const a = await addCustomExercise(vault, 'Plate Pinch', 'Forearms', 'weight_reps');
  const b = await addCustomExercise(vault, 'Barbell Row', 'Back', 'weight_reps');
  const { exercises } = await loadExerciseLibrary(vault);
  const pull = await createRoutine(vault, exercises, 'Pull', [{ exerciseId: a.id, targetSets: 3 }, { exerciseId: b.id, targetSets: 3 }]);
  const names = async () => (await loadRoutines(vault, (await loadExerciseLibrary(vault)).exercises)).routines.find((r) => r.id === pull.id).exercises.map((e) => e.name);
  await createRecord({ id: 'drop1', kind: 'coach-program', status: 'pending', source: 'coach', findingKey: 'k', findingKind: 'routine-oversized', finding: {}, fix: { action: 'drop', routineId: pull.id, exerciseId: a.id }, text: 'Coach: Plate Pinch has not been touched.', createdAt: new Date().toISOString() });
  const filed = await approveRecord(vault, 'drop1');
  assert.equal(filed.status, 'filed');
  assert.equal(filed.destination, 'workout plan');
  assert.deepEqual(await names(), ['Barbell Row'], 'the exercise is really gone — the approve acted');
  await undoRecord(vault, 'drop1');
  assert.deepEqual((await names()).sort(), ['Barbell Row', 'Plate Pinch'], 'and undo put it back');
});

// The deck's Undo. A "no" used to be final: the first time that mattered, a
// test of this very deck declined one of his real cards and nothing on the
// rails could ask it again.
test('an answer can be taken back: a no is asked again, and so is an undone yes', async () => {
  const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
  const { createRoutine, loadRoutines } = await import('../lib/workouts.js');
  const { createRecord, getRecord } = await import('../lib/inboxStore.js');
  const { approveRecord, discardRecord, undoRecord, reopenRecord } = await import('../lib/inbox.js');
  const a = await addCustomExercise(vault, 'Calf Raise', 'Calves', 'weight_reps');
  const b = await addCustomExercise(vault, 'Leg Press', 'Quads', 'weight_reps');
  const { exercises } = await loadExerciseLibrary(vault);
  const legs = await createRoutine(vault, exercises, 'Legs', [{ exerciseId: a.id, targetSets: 3 }, { exerciseId: b.id, targetSets: 3 }]);
  const names = async () => (await loadRoutines(vault, (await loadExerciseLibrary(vault)).exercises)).routines.find((r) => r.id === legs.id).exercises.map((e) => e.name);
  await createRecord({ id: 'back1', kind: 'coach-program', status: 'pending', source: 'coach', findingKey: 'k2', findingKind: 'routine-oversized', finding: {}, fix: { action: 'drop', routineId: legs.id, exerciseId: a.id }, text: 'Coach: Calf Raise has not been touched.', createdAt: new Date().toISOString() });

  await discardRecord('back1');
  assert.equal((await reopenRecord('back1')).status, 'pending', 'a no, taken back: the question is open again');
  assert.equal((await getRecord('back1')).discardedAt, null);

  await approveRecord(vault, 'back1');
  assert.deepEqual(await names(), ['Leg Press']);
  await assert.rejects(reopenRecord('back1'), /turned down or undid/, 'a filed change is undone before it is asked again');
  await undoRecord(vault, 'back1');
  assert.deepEqual((await names()).sort(), ['Calf Raise', 'Leg Press'], 'the plan is back');
  const again = await reopenRecord('back1');
  assert.equal(again.status, 'pending');
  assert.equal(again.undoData, null, 'no stale undo rides the reopened card');
  await approveRecord(vault, 'back1');
  assert.deepEqual(await names(), ['Leg Press'], 'and a second yes still acts');
});

test('only his own answers on Coach cards reopen', async () => {
  const { createRecord } = await import('../lib/inboxStore.js');
  const { reopenRecord } = await import('../lib/inbox.js');
  const at = new Date().toISOString();
  await createRecord({ id: 'exp1', status: 'discarded', expired: true, source: 'coach', decision: { route: 'routine-edit', payload: {} }, createdAt: at });
  await createRecord({ id: 'note1', status: 'discarded', kind: 'research', decision: { route: 'note' }, createdAt: at });
  await createRecord({ id: 'plan1', status: 'discarded', source: 'coach', parentPlanId: 'p', decision: { route: 'routine-edit', payload: {} }, createdAt: at });
  await createRecord({ id: 'wait1', status: 'pending', source: 'coach', decision: { route: 'routine-edit', payload: {} }, createdAt: at });
  await assert.rejects(reopenRecord('exp1'), /turned down or undid/, 'an expired card was the system, not him');
  await assert.rejects(reopenRecord('note1'), /Coach change/, 'not a Coach card');
  await assert.rejects(reopenRecord('plan1'), /moved on/, "a plan's step: its plan has moved on");
  await assert.rejects(reopenRecord('wait1'), /turned down or undid/, 'a waiting card is already open');
});

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

// 25 Sep 2026: a move was a "Drop" card and an "Add" card; he read "Drop
// Cable Lateral Raise" as losing it. A move is one card, drawn as a move.
test('a move card says Move, belongs to where it lands, and shows where it comes from and where it sits', () => {
  const upper = { id: 'upper', name: 'Upper Body', exercises: [
    { exerciseId: 'rope', name: 'Rope Overhead Tricep Extension', muscleGroup: 'Triceps', targetSets: 3, targetRepsLow: 6, targetRepsHigh: 7 },
    { exerciseId: 'bench', name: 'Barbell Bench Press', muscleGroup: 'Chest', targetSets: 3, targetRepsLow: 6, targetRepsHigh: 8 },
  ] };
  const [c] = coachSuggestions([rec('r-move', 'routine-edit', {
    action: 'move', routineId: 'push', routineName: 'Push', fromRoutineId: 'upper', fromRoutineName: 'Upper Body',
    removeExerciseId: 'rope', removeName: 'Rope Overhead Tricep Extension', muscleGroup: 'Triceps',
    position: 2, afterName: 'Weighted Pull-Up', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12, reason: 'your only overhead triceps work',
  })], { routines: [...routines, upper], schedule, now: NOW });
  assert.equal(c.headline, 'Move Rope Overhead Tricep Extension to Push');
  assert.equal(c.routine.name, 'Push');
  assert.equal(c.diff.type, 'move');
  assert.equal(c.diff.from, 'Upper Body');
  assert.equal(c.diff.place, 'after Weighted Pull-Up');
  assert.deepEqual(c.diff.fromSets, { before: 6, after: 3 });
  assert.equal(c.diff.reps, '8–12');
  assert.deepEqual(c.sets, { before: 11, after: 14 }, 'the session it joins, before and after');
  // and an add says where it lands, too
  const [a] = coachSuggestions([rec('r-add', 'routine-edit', { action: 'add', routineId: 'push', routineName: 'Push', addName: 'Face Pull', position: 1, targetSets: 3 })], { routines, schedule, now: NOW });
  assert.equal(a.diff.place, 'first');
});

// 25 Sep 2026: he moved the rope extension by hand while Coach's card for
// the same move still waited. A card his own edits have overtaken says so
// and offers no yes, instead of failing when tapped.
test('a card overtaken by his own edits is marked stale, with what changed', () => {
  const opts = { routines, schedule, now: NOW };
  const gone = coachSuggestions([rec('r-gone', 'routine-edit', { action: 'remove', routineId: 'push', routineName: 'Push', removeExerciseId: 'nope', removeName: 'Cable Fly Low' })], opts)[0];
  assert.equal(gone.stale, 'Cable Fly Low is no longer in Push');
  const dup = coachSuggestions([rec('r-dup', 'routine-edit', { action: 'add', routineId: 'push', routineName: 'Push', addExerciseId: 'carter', addName: 'Carter Extension', targetSets: 3 })], opts)[0];
  assert.equal(dup.stale, 'Carter Extension is already in Push');
  const moved = coachSuggestions([rec('r-mv', 'routine-edit', { action: 'move', routineId: 'push', routineName: 'Push', fromRoutineId: 'pull', fromRoutineName: 'Pull', removeExerciseId: 'pinch', removeName: 'Plate Pinch' })], opts)[0];
  assert.equal(moved.stale, null, 'Plate Pinch is still on Pull and not yet on Push: the card stands');
  const live = coachSuggestions(items, opts);
  assert.ok(live.every((c) => !c.stale), 'nothing on the real deck is stale');
});
