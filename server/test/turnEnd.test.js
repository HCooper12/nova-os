// WHEN A SPOKEN TURN IS OVER.
//
// His report, 9 Sep: "sometimes when speaking with Nova my speech is cut off
// and I feel like I am rushing to keep speaking before it thinks I have
// stopped talking." The conversational surfaces let the BROWSER decide when
// he had finished, and sent on that instant — so a breath mid-sentence fired
// the question. The decision moved into turnEnd.js, and this pins it.
//
// It has to be a test rather than a phone check: the failure is silent, it
// only shows up on a device, and the thing it protects is the one input he
// uses every day.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  openTurn, sawSpeech, sawEngineEnd, sawRestart, nextAction,
  holdTiming, HOLD_PRESETS, DEFAULT_HOLD,
} from '../../src/turnEnd.js';

const OPTS = { holdMs: 2600, leadMs: 7000 };

// ---- the bug itself ----

test('THE BUG: a breath mid-sentence does not end his turn', () => {
  let t = openTurn(0);
  t = sawSpeech(t, 1000);                       // he is talking
  // a 1.2s pause — longer than the browser's own patience, shorter than his
  assert.equal(nextAction(t, 2200, OPTS), 'wait');
});

test('THE BUG: the engine quitting mid-thought reopens it instead of sending', () => {
  let t = openTurn(0);
  t = sawSpeech(t, 1000);
  t = sawEngineEnd(t);                          // iOS gave up at ~1.5s
  assert.equal(nextAction(t, 2400, OPTS), 'restart');
});

test('a pause he actually meant ends the turn', () => {
  let t = openTurn(0);
  t = sawSpeech(t, 1000);
  assert.equal(nextAction(t, 1000 + 2600, OPTS), 'end');
});

test('an engine that ends after a real silence sends — it does not restart forever', () => {
  let t = openTurn(0);
  t = sawSpeech(t, 1000);
  t = sawEngineEnd(t);
  assert.equal(nextAction(t, 1000 + 2600, OPTS), 'end');
});

// ---- the two silences mean different things ----

test('before he has said anything he gets the longer lead, not the hold', () => {
  const t = openTurn(0);
  assert.equal(nextAction(t, 3000, OPTS), 'wait');   // would have ended on hold
  assert.equal(nextAction(t, 7000, OPTS), 'end');
});

test('the lead applies only until the first word', () => {
  let t = openTurn(0);
  t = sawSpeech(t, 500);
  assert.equal(nextAction(t, 500 + 2600, OPTS), 'end');
});

// ---- the guards, which is why they are checked first ----

test('the microphone is never held open forever', () => {
  let t = openTurn(0);
  t = sawSpeech(t, 119000);                     // a television in the room
  assert.equal(nextAction(t, 120000, OPTS), 'end');
});

test('an engine failing over and over stops being restarted', () => {
  let t = openTurn(0);
  t = sawSpeech(t, 100);
  for (let i = 0; i < 40; i++) t = sawRestart(t);
  t = sawEngineEnd(t);
  assert.equal(nextAction(t, 600, OPTS), 'end');
});

test('but hearing him resets that budget — a long answer is not a failing engine', () => {
  let t = openTurn(0);
  for (let i = 0; i < 40; i++) t = sawRestart(t);
  t = sawSpeech(t, 500);
  t = sawEngineEnd(t);
  assert.equal(nextAction(t, 900, OPTS), 'restart');
});

test('a turn that no longer exists is over', () => {
  assert.equal(nextAction(null, 1, OPTS), 'end');
});

// ---- what he can choose ----

test('every preset is slower than the browser endpointer this replaces', () => {
  for (const p of HOLD_PRESETS) assert.ok(p.holdMs >= 1500, `${p.value} is ${p.holdMs}ms`);
});

test('every preset waits longer for him to begin than to continue', () => {
  for (const p of HOLD_PRESETS) assert.ok(p.leadMs > p.holdMs, p.value);
});

test('a corrupt stored setting falls back to the default, never to zero', () => {
  // holdMs 0 means "let the engine decide" — the exact behaviour this exists
  // to end. A junk localStorage value must never reach it.
  for (const junk of [undefined, null, '', 'instant', 0, {}]) {
    const t = holdTiming(junk);
    assert.equal(t.value, DEFAULT_HOLD);
    assert.ok(t.holdMs > 0);
  }
});

test('a real stored setting is honoured', () => {
  assert.equal(holdTiming('patient').holdMs, 4200);
});
