// The start guard (src/sessionGuard.js): a start button never writes over
// logged work. Written after the 26 Sep loss — a make-up Begin tapped over a
// recovered make-up session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startDecision, tickedSets } from '../../src/sessionGuard.js';

const ex = (done) => [{ exerciseId: 'b', sets: [{ done }, { done: false }] }];

test('nothing open starts fresh', () => {
  assert.equal(startDecision(null, { routineId: 'r1' }), 'start');
});

test('the 26 Sep case: Begin on the make-up that is already open resumes it', () => {
  const cur = { routineId: 'carryover', carryoverId: '612b71e2', exercises: ex(true) };
  assert.equal(startDecision(cur, { carryoverId: '612b71e2' }), 'resume');
});

test('the same routine resumes, even untouched', () => {
  assert.equal(startDecision({ routineId: 'r1', exercises: ex(false) }, { routineId: 'r1' }), 'resume');
});

test('a different session with logged sets is kept; an untouched one may be replaced', () => {
  assert.equal(startDecision({ routineId: 'r1', exercises: ex(true) }, { routineId: 'r2' }), 'keep');
  assert.equal(startDecision({ routineId: 'carryover', carryoverId: 'a', exercises: ex(true) }, { carryoverId: 'b' }), 'keep');
  assert.equal(startDecision({ routineId: 'r1', exercises: ex(false) }, { carryoverId: 'b' }), 'start');
});

test('tickedSets counts only done sets', () => {
  assert.equal(tickedSets({ exercises: [...ex(true), ...ex(true)] }), 2);
  assert.equal(tickedSets(null), 0);
});
