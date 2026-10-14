import test from 'node:test';
import assert from 'node:assert/strict';
import { isPaused, sessionElapsedMs, sessionMinutes, effectiveStart, pauseSession, resumeSession } from '../../src/sessionClock.js';

// His ask, 14 Oct 2026: pause a workout. A paused minute never counts.
const T0 = Date.UTC(2026, 9, 14, 0, 0, 0);
const MIN = 60_000;

test('a running session counts every minute since it started', () => {
  const ws = { startedAt: T0 };
  assert.equal(sessionMinutes(ws, T0 + 30 * MIN), 30);
  assert.equal(effectiveStart(ws), T0);
  assert.equal(isPaused(ws), false);
});

test('while paused the clock stands still, and resuming banks the pause', () => {
  let ws = pauseSession({ startedAt: T0 }, T0 + 30 * MIN);
  assert.equal(isPaused(ws), true);
  assert.equal(sessionMinutes(ws, T0 + 30 * MIN), 30);
  assert.equal(sessionMinutes(ws, T0 + 45 * MIN), 30, 'fifteen paused minutes add nothing');
  ws = resumeSession(ws, T0 + 45 * MIN);
  assert.equal(isPaused(ws), false);
  assert.equal(ws.pausedAt, undefined);
  assert.equal(ws.pausedMs, 15 * MIN);
  assert.equal(sessionMinutes(ws, T0 + 50 * MIN), 35);
  assert.equal(effectiveStart(ws), T0 + 15 * MIN, "iOS's timer counts from here and shows 35:00 at T0+50");
});

test('two pauses add up; pausing twice or resuming twice changes nothing', () => {
  let ws = { startedAt: T0 };
  ws = pauseSession(ws, T0 + 10 * MIN);
  assert.equal(pauseSession(ws, T0 + 12 * MIN), ws);
  ws = resumeSession(ws, T0 + 15 * MIN);
  assert.equal(resumeSession(ws, T0 + 16 * MIN), ws);
  ws = resumeSession(pauseSession(ws, T0 + 20 * MIN), T0 + 30 * MIN);
  assert.equal(ws.pausedMs, 15 * MIN);
  assert.equal(sessionMinutes(ws, T0 + 60 * MIN), 45);
});

test('no start means no clock', () => {
  assert.equal(sessionElapsedMs(null, T0), null);
  assert.equal(sessionMinutes({}, T0), null);
  assert.equal(effectiveStart({}), null);
});
