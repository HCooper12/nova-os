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
  openTurn, sawSpeech, sawEngineEnd, sawRestart, nextAction, endReason,
  holdTiming, HOLD_PRESETS, DEFAULT_HOLD, RESTART_GRACE_MS,
} from '../../src/turnEnd.js';

const OPTS = { holdMs: 2000, leadMs: 7000 };

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
  assert.equal(nextAction(t, 1000 + 2000, OPTS), 'end');
});

test('an engine that ends after a real silence sends — it does not restart forever', () => {
  let t = openTurn(0);
  t = sawSpeech(t, 1000);
  t = sawEngineEnd(t);
  assert.equal(nextAction(t, 1000 + 2000, OPTS), 'end');
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
  assert.equal(nextAction(t, 500 + 2000, OPTS), 'end');
});

// ---- the guards, which is why they are checked first ----

// THE FAULT, 12 Sep, driving: "it somehow thought that I was finished
// talking even though I did not pause while speaking". The cap was a flat
// wall clock checked before everything else, so two minutes of explaining
// ended his turn mid-word. It is now a ceiling for a turn that has gone
// QUIET, and the runaway case belongs to the absolute ceiling below.
test('THE FAULT: two minutes of unbroken explaining does not end his turn', () => {
  let t = openTurn(0);
  t = sawSpeech(t, 119800);                     // still mid-sentence at 2:00
  assert.equal(nextAction(t, 120000, OPTS), 'wait');
  t = sawSpeech(t, 181000);                     // and still going at 3:01
  assert.equal(nextAction(t, 181200, OPTS), 'wait');
});

test('but a turn past the cap that has gone quiet ends, and says which cap', () => {
  let t = openTurn(0);
  t = sawSpeech(t, 119000);
  assert.equal(nextAction(t, 121000, OPTS), 'end');      // 2s of silence, past 120s
  assert.equal(endReason(t, 121000, OPTS), 'cap-idle');
});

test('an idle engine past the cap is still ended', () => {
  let t = openTurn(0);
  t = sawSpeech(t, 100000);
  t = sawEngineEnd(t);
  assert.equal(nextAction(t, 130000, OPTS), 'end');
});

test('the absolute ceiling still closes a microphone nobody closed', () => {
  // a television in the room: speech keeps arriving, so no silence ever
  // ends the turn. Fifteen minutes is the thing that does.
  let t = openTurn(0);
  for (let ms = 1000; ms <= 900000; ms += 1000) t = sawSpeech(t, ms);
  assert.equal(nextAction(t, 900000, OPTS), 'end');
  assert.equal(endReason(t, 900000, OPTS), 'cap-absolute');
  assert.equal(nextAction(t, 899000, OPTS), 'wait', 'and not a second before');
});

// ---- why a turn ended, so the next "it cut me off" has an answer ----

test('endReason names each way a turn can end', () => {
  let spoke = sawSpeech(openTurn(0), 1000);
  assert.equal(endReason(spoke, 3000, OPTS), 'hold');
  assert.equal(endReason(spoke, 2000, OPTS), null, 'still his');

  assert.equal(endReason(openTurn(0), 7000, OPTS), 'lead');
  assert.equal(endReason(openTurn(0), 6000, OPTS), null);

  let failing = sawSpeech(openTurn(0), 100);
  for (let i = 0; i < 40; i++) failing = sawRestart(failing);
  failing = sawEngineEnd(failing);
  assert.equal(endReason(failing, 600, OPTS), 'restart-limit');

  assert.equal(endReason(null, 1, OPTS), 'engine', 'no turn left — the caller stopped it');
});

// ---- the restart seam (fault 2): the gap must not eat his hold ----

test('an engine that died in the last moments of the hold gets time to hear him', () => {
  let t = openTurn(0);
  t = sawSpeech(t, 10000);
  t = sawEngineEnd(t);
  t = sawRestart(t, 11700);                     // 300ms of hold left, new engine deaf
  assert.equal(nextAction(t, 12000, OPTS), 'wait', 'that silence was the seam, not him');
  assert.equal(nextAction(t, 11700 + RESTART_GRACE_MS, OPTS), 'end');
});

test('the grace is a floor, never a reset — a restart adds no dead air of its own', () => {
  // the commonest restart of all: iOS gives up ~1.5s in BECAUSE he stopped.
  // Resetting the hold here would add a whole extra hold to nearly every turn.
  let t = openTurn(0);
  t = sawSpeech(t, 1000);
  t = sawEngineEnd(t);
  t = sawRestart(t, 2400);                      // grace ends at 3000, hold at 3000
  assert.equal(nextAction(t, 3000, OPTS), 'end');
  assert.equal(endReason(t, 3000, OPTS), 'hold');
});

test('the grace is spent once he speaks again', () => {
  let t = openTurn(0);
  t = sawSpeech(t, 10000);
  t = sawRestart(t, 11900);
  t = sawSpeech(t, 12100);                      // the new engine hears him
  assert.equal(nextAction(t, 14100, OPTS), 'end', 'a normal hold from his last word');
  assert.equal(nextAction(t, 14000, OPTS), 'wait');
});

test('the receipt counts every restart in the turn, not just since he spoke', () => {
  let t = openTurn(0);
  t = sawRestart(t, 100);
  t = sawSpeech(t, 200);                        // resets the failing-engine budget
  t = sawRestart(t, 300);
  assert.equal(t.restarts, 1);
  assert.equal(t.restartsTotal, 2);
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
  assert.equal(holdTiming('natural').holdMs, 2000, 'he reported 2.6s as too long a pause');
});
