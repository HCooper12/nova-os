import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBests, pickBests, routineLiftIds } from '../../src/bestsCache.js';

// Offline mode (14 Oct 2026): the record banner's numbers kept on the phone.
test("the Mac's answer wins, and a lift it did not mention keeps its kept copy", () => {
  const kept = { squat: { e1rm: 100 }, bench: { e1rm: 80 } };
  const merged = mergeBests(kept, { squat: { e1rm: 105 } });
  assert.deepEqual(merged, { squat: { e1rm: 105 }, bench: { e1rm: 80 } });
  assert.deepEqual(mergeBests(null, undefined), {});
});

test('offline, a session gets only the lifts the phone has seen: never a guessed best', () => {
  const kept = { squat: { e1rm: 100 }, bench: { e1rm: 80 } };
  assert.deepEqual(pickBests(kept, ['squat', 'jm-press']), { squat: { e1rm: 100 } });
  assert.deepEqual(pickBests({}, ['squat']), {});
});

test('the warm-up asks for every lift across his routines, once each', () => {
  const routines = [
    { exercises: [{ exerciseId: 'squat' }, { exerciseId: 'bench' }] },
    { exercises: [{ exerciseId: 'squat' }, { exerciseId: null }, {}] },
  ];
  assert.deepEqual(routineLiftIds(routines), ['squat', 'bench']);
  assert.deepEqual(routineLiftIds(null), []);
});
