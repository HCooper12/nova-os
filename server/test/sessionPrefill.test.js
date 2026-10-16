// An extra exercise starts where he left it (lib/sessionPrefill.js): his
// report, 25 Sep, Face Pull added mid-session came in as 0 kg × 8 when he had
// done 29.5 kg × 11, 10, 10 on the 16th.
import test from 'node:test';
import assert from 'node:assert/strict';
import { prefillFor, routineFor } from '../lib/sessionPrefill.js';

const FACE_PULL_LAST = { lastDate: '2026-09-16', lastSets: [{ weight: 29.5, reps: 11 }, { weight: 29.5, reps: 10 }, { weight: 29.5, reps: 10 }] };
const PUSH_ENTRY = { exerciseId: 'face-pull', targetSets: 3, targetRepsLow: 12, targetRepsHigh: 12 };

test('his case: last time\'s sets and the program\'s prescription, not 0 kg × 8', () => {
  const p = prefillFor({ last: FACE_PULL_LAST, prescription: PUSH_ENTRY });
  assert.deepEqual(p.sets.map((s) => [s.weight, s.reps, s.done]), [[29.5, 11, false], [29.5, 10, false], [29.5, 10, false]]);
  assert.deepEqual([p.targetSets, p.targetRepsLow, p.targetRepsHigh], [3, 12, 12]);
  assert.deepEqual(p.last, { date: '2026-09-16', sets: [{ weight: 29.5, reps: 11 }, { weight: 29.5, reps: 10 }, { weight: 29.5, reps: 10 }] });
  assert.deepEqual(p.from, ['last time (2026-09-16)']);
});

test("Coach's earned step nudges the numbers the way a planned exercise's does", () => {
  const w = prefillFor({ last: FACE_PULL_LAST, progression: { kind: 'weight', delta: 2.5, evidence: 'x' } });
  assert.deepEqual(w.sets.map((s) => s.weight), [32, 32, 32]);
  const r = prefillFor({ last: FACE_PULL_LAST, progression: { kind: 'reps', delta: 1, evidence: 'x' } });
  assert.deepEqual(r.sets.map((s) => s.reps), [12, 11, 11]);
  assert.deepEqual(r.from, ['last time (2026-09-16)', "Coach's +1 rep"]);
  const q = prefillFor({ last: FACE_PULL_LAST, progression: { kind: 'quality', delta: 0, focus: '3s lowering' } });
  assert.deepEqual(q.sets.map((s) => [s.weight, s.reps]), [[29.5, 11], [29.5, 10], [29.5, 10]], 'a quality step changes no number');
  assert.equal(q.focusNote, '3s lowering', 'but its focus rides along');
});

test('never done: the prescription and Coach\'s start weight, or the honest default', () => {
  const marked = prefillFor({ prescription: { targetSets: 4, targetRepsLow: 6, targetRepsHigh: 8 }, marker: { startWeightKg: 5 } });
  assert.deepEqual(marked.sets.map((s) => [s.weight, s.reps]), [[5, 6], [5, 6], [5, 6], [5, 6]]);
  assert.deepEqual(marked.from, ["Coach's start weight"]);
  const bare = prefillFor({});
  assert.deepEqual(bare.sets.map((s) => [s.weight, s.reps]), [[0, 8], [0, 8], [0, 8]]);
  assert.deepEqual([bare.targetSets, bare.targetRepsLow, bare.targetRepsHigh, bare.last, bare.from.length], [3, 8, 12, null, 0]);
});

test('a lift in two routines takes the one where Coach has earned a step', () => {
  const routines = [{ id: 'push', exercises: [{ exerciseId: 'lat' }] }, { id: 'upper', exercises: [{ exerciseId: 'lat' }] }];
  assert.equal(routineFor(routines, 'lat', { 'upper:lat': { kind: 'reps', delta: 1 } }).id, 'upper');
  assert.equal(routineFor(routines, 'lat', {}).id, 'push');
  assert.equal(routineFor(routines, 'nope', {}), null);
});

// 16 Oct 2026, his pick (Option A): the count is the prescription's, the
// numbers are last time's. His lateral raise: 5 prescribed, one set logged.
import { fitSets } from '../../src/fitSets.js';

test('fitSets: set i takes last time\'s set i, the rest repeat the final one, extras are not carried', () => {
  assert.deepEqual(fitSets([{ weight: 4.5, reps: 12 }], 5).map((s) => [s.weight, s.reps]), [[4.5, 12], [4.5, 12], [4.5, 12], [4.5, 12], [4.5, 12]]);
  assert.deepEqual(fitSets([{ weight: 60, reps: 8 }, { weight: 60, reps: 7 }], 3).map((s) => s.reps), [8, 7, 7]);
  assert.equal(fitSets([{ weight: 1, reps: 1 }, { weight: 2, reps: 2 }, { weight: 3, reps: 3 }, { weight: 4, reps: 4 }], 3).length, 3);
  assert.equal(fitSets([], 3), null);
  assert.equal(fitSets(null, 3), null);
  const src = [{ weight: 4.5, reps: 12 }];
  fitSets(src, 3)[1].weight = 99;
  assert.equal(src[0].weight, 4.5, 'the copies are not the history');
});

test('an added lift opens with the prescribed number of sets, not however many he logged last time', () => {
  const p = prefillFor({ last: { lastDate: '2026-10-13', lastSets: [{ weight: 4.5, reps: 12 }] }, prescription: { targetSets: 5, targetRepsLow: 12, targetRepsHigh: 15 } });
  assert.equal(p.sets.length, 5);
  assert.ok(p.sets.every((s) => s.weight === 4.5 && s.reps === 12 && s.done === false));
  assert.equal(p.last.sets.length, 1, 'last time\'s truth is still one set');
});
