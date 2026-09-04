// Failures that nobody will ever retry should not keep their place in the
// queue. Twelve error records were sitting in his inbox on 4 Sep, five over a
// fortnight old and four of those ENOTFOUND blips from 9 August. They are not
// information; they make the real failures harder to see.
//
// The rule is deliberately conservative — aged to 'discarded', never deleted,
// with the reason recorded — because the one thing worse than clutter is a
// record disappearing without explanation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isStaleError } from '../lib/inboxStore.js';

const NOW = Date.parse('2026-09-04T04:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

test('an old failure is stale', () => {
  assert.equal(isStaleError({ status: 'error', createdAt: daysAgo(26) }, NOW), true);
});

test('a recent failure is left alone — he may still retry it', () => {
  assert.equal(isStaleError({ status: 'error', createdAt: daysAgo(4) }, NOW), false);
  assert.equal(isStaleError({ status: 'error', createdAt: daysAgo(20) }, NOW), false, 'just inside the window');
});

test('only failures age out — nothing else is touched', () => {
  for (const status of ['pending', 'filed', 'resolved', 'classifying', 'discarded']) {
    assert.equal(isStaleError({ status, createdAt: daysAgo(90) }, NOW), false, `${status} must never be reaped`);
  }
});

test('a record with no or unreadable date is never reaped', () => {
  // guessing an age and acting on it is worse than leaving it
  assert.equal(isStaleError({ status: 'error' }, NOW), false);
  assert.equal(isStaleError({ status: 'error', createdAt: 'whenever' }, NOW), false);
  assert.equal(isStaleError(null, NOW), false);
});

test('the threshold is adjustable, and the boundary is exclusive', () => {
  assert.equal(isStaleError({ status: 'error', createdAt: daysAgo(10) }, NOW, 7), true);
  assert.equal(isStaleError({ status: 'error', createdAt: daysAgo(7) }, NOW, 7), false, 'exactly at the threshold is not yet stale');
});
