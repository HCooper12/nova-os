import test from 'node:test';
import assert from 'node:assert/strict';
import { momentLeads, splitMoments } from '../../src/momentPriority.js';

// his call, 15 Oct 2026: the Daily review leads until 9 and 19:00–21:00,
// today's technique until 11, everything else whenever it exists
test('the Daily review leads only in its morning and evening hours', () => {
  for (const h of [5, 6, 8, 19, 20]) assert.equal(momentLeads('review', h, { reviewState: 'card' }), true, `hour ${h}`);
  for (const h of [4, 9, 12, 18, 21, 23]) assert.equal(momentLeads('review', h, { reviewState: 'card' }), false, `hour ${h}`);
});

test('a finished review never leads, even in its hours', () => {
  assert.equal(momentLeads('review', 7, { reviewState: 'all-done' }), false);
});

test('the technique leads until 11; other moments always lead', () => {
  assert.equal(momentLeads('technique', 10), true);
  assert.equal(momentLeads('technique', 11), false);
  for (const k of ['asking', 'money', 'pr', 'plan', 'landed', 'lead', 'wrap']) assert.equal(momentLeads(k, 14), true, k);
});

test('splitMoments keeps the given order on both sides', () => {
  const { top, later } = splitMoments(['asking', 'review', 'money', 'technique'], 14, { reviewState: 'card' });
  assert.deepEqual(top, ['asking', 'money']);
  assert.deepEqual(later, ['review', 'technique']);
});
