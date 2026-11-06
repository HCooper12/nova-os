import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBgMisses } from '../lib/bgMisses.js';

test('only well-formed misses survive, stripped to their two fields', () => {
  const at = '2026-11-06T04:00:00Z';
  assert.deepEqual(cleanBgMisses([{ at, why: 'locked', extra: 1 }, { at }, null, 'x']), [{ at, why: 'locked' }]);
});

test('anything that is not a list is no misses', () => {
  assert.deepEqual(cleanBgMisses(undefined), []);
  assert.deepEqual(cleanBgMisses({ at: 'x', why: 'y' }), []);
});

test('the list is bounded to its newest entries', () => {
  const list = Array.from({ length: 80 }, (_, i) => ({ at: String(i), why: 'locked' }));
  const out = cleanBgMisses(list);
  assert.equal(out.length, 50);
  assert.equal(out[49].at, '79');
});
