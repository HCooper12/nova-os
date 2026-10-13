import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prKind, prGain, prBasis } from '../../src/missionFocus.js';

// mockup 101's record rows set the gain apart as a pill; the two parts must
// still say exactly what prBasis says in one line
test('the record splits into its kind and its gain, and agrees with prBasis', () => {
  const e = { kind: 'e1rm', value: 82.3, previous: 80.2, weight: 65, reps: 8 };
  assert.equal(prKind(e), 'est. 1RM 82.3kg');
  assert.equal(prGain(e), '2.1');
  assert.equal(`${prKind(e)} ▲${prGain(e)}`, prBasis(e));
  const w = { kind: 'weight', value: 29.5, previous: 27.2, reps: 9 };
  assert.equal(prKind(w), 'heaviest yet');
  assert.equal(prGain(w), '2.3');
});

test('a first record has no gain to show, never a zero', () => {
  assert.equal(prGain({ kind: 'weight', value: 40, previous: null }), null);
  assert.equal(prGain({ kind: 'e1rm', value: 40, previous: 40 }), null);
});
