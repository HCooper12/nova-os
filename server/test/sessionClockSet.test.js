import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setSessionMinutes, sessionMinutes, pauseSession, effectiveStart } from '../../src/sessionClock.js';

const M = 60000;
test('he sets the clock: the phone died mid make-up, 70 min becomes 20', () => {
  const now = 1_000_000_000;
  const ws = { startedAt: now - 70 * M };
  const fixed = setSessionMinutes(ws, now, 20);
  assert.equal(sessionMinutes(fixed, now), 20);
  assert.equal(sessionMinutes(fixed, now + 5 * M), 25, 'it keeps counting from there');
  assert.equal(effectiveStart(fixed), now - 20 * M, 'the lock screen agrees');
});
test('a paused clock stays paused at the new number; never above the time since start, never below zero', () => {
  const now = 2_000_000_000;
  const p = pauseSession({ startedAt: now - 60 * M, pausedMs: 5 * M }, now - 10 * M);
  const fixed = setSessionMinutes(p, now, 15);
  assert.equal(sessionMinutes(fixed, now), 15);
  assert.equal(sessionMinutes(fixed, now + 30 * M), 15);
  assert.equal(sessionMinutes(setSessionMinutes({ startedAt: now - 10 * M }, now, 999), now), 10);
  const same = { startedAt: now };
  assert.equal(setSessionMinutes(same, now, -3), same);
  assert.equal(setSessionMinutes(same, now, NaN), same);
});
test('both idioms offer the correction', () => {
  for (const f of ['src/screens/SessionSummary.jsx', 'src/screens/Workouts.jsx']) assert.match(fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'), /<SessionClockEdit /);
});
