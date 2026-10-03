// The iOS Mail swipe grammar (src/swipeReveal.js), pinned: reveal, commit,
// close, and one row open at a time. His ask, 3 Oct 2026: "swipe to delete
// just like iOS typically allows ... consistent across the platform".
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_WIDTH, FULL_FRACTION, revealWidth, trackOffset, isFull, fullCrossing,
  releaseSwipe, openOffset, createOpenRegistry,
} from '../../src/swipeReveal.js';

const W = 343; // a 375px phone's row inside a 16px gutter
const one = { rowWidth: W, leftCount: 1, rightCount: 1 };

test('the row follows the finger 1:1, and a side with no action does not move', () => {
  assert.equal(trackOffset({ raw: -50, ...one }), -50);
  assert.equal(trackOffset({ raw: 80, ...one }), 80);
  assert.equal(trackOffset({ raw: -50, rowWidth: W, leftCount: 0, rightCount: 1 }), 0, 'no trailing action: inert leftwards');
  assert.equal(trackOffset({ raw: 50, rowWidth: W, leftCount: 1, rightCount: 0 }), 0, 'no leading action: inert rightwards');
});

test('past the row width it rubber-bands: more pull, less travel, never a hard stop', () => {
  const a = trackOffset({ raw: -(W + 50), ...one });
  const b = trackOffset({ raw: -(W + 150), ...one });
  assert.ok(a < -W && a > -(W + 50), 'past the end it moves less than the finger');
  assert.ok(b < a, 'and still moves further with more pull');
  assert.ok(Math.abs(b) - Math.abs(a) < 100, 'with diminishing return');
});

test('REVEAL: a partial swipe opens on the buttons and stays open', () => {
  const r = releaseSwipe({ dir: 'h', offset: -60, velocity: 0, ...one });
  assert.deepEqual(r, { to: 'open', side: 'left' });
  assert.equal(openOffset('left', 1), -ACTION_WIDTH);
  assert.equal(openOffset('right', 2), 2 * ACTION_WIDTH);
  assert.equal(revealWidth(2), 148);
});

test('a nudge under half a button closes', () => {
  assert.deepEqual(releaseSwipe({ dir: 'h', offset: -20, velocity: 0, ...one }), { to: 'closed', side: null });
});

test('COMMIT: a swipe past the full line runs the action', () => {
  const r = releaseSwipe({ dir: 'h', offset: -(W * FULL_FRACTION + 5), velocity: 0, ...one });
  assert.deepEqual(r, { to: 'commit', side: 'left' });
  assert.deepEqual(releaseSwipe({ dir: 'h', offset: W * 0.7, velocity: 0, ...one }), { to: 'commit', side: 'right' });
});

test('a velocity flick commits once the finger has uncovered the buttons', () => {
  const r = releaseSwipe({ dir: 'h', offset: -(ACTION_WIDTH + 10), velocity: -2, ...one });
  assert.deepEqual(r, { to: 'commit', side: 'left' });
});

test('a flick from a standing start only OPENS: a careless flick shows Delete, never deletes', () => {
  const r = releaseSwipe({ dir: 'h', offset: -20, velocity: -3, ...one });
  assert.deepEqual(r, { to: 'open', side: 'left' });
});

test('pulling back cancels, however far the row had gone', () => {
  assert.deepEqual(releaseSwipe({ dir: 'h', offset: -(W * 0.8), velocity: 4, ...one }), { to: 'closed', side: null });
});

test('pulling back from past the full line to the open zone opens instead of committing', () => {
  const r = releaseSwipe({ dir: 'h', offset: -(W * 0.65), velocity: 0.8, ...one });
  assert.equal(r.to, 'open');
});

test('a side that refuses a full swipe only ever opens', () => {
  const r = releaseSwipe({ dir: 'h', offset: -(W * 0.9), velocity: -3, ...one, fullLeft: false });
  assert.deepEqual(r, { to: 'open', side: 'left' });
});

test('THE SAFETY PROPERTY: a vertical-locked gesture can never commit, and never opens; it closes', () => {
  for (const offset of [-W, -W * 0.9, -100, 100, W]) {
    for (const velocity of [-20, -2, 0, 2, 20]) {
      for (const dir of ['v', null, undefined]) {
        assert.deepEqual(releaseSwipe({ dir, offset, velocity, ...one }), { to: 'closed', side: null });
      }
    }
  }
});

test('a side with no action can neither open nor commit', () => {
  assert.equal(releaseSwipe({ dir: 'h', offset: -200, velocity: -3, rowWidth: W, leftCount: 0, rightCount: 1 }).to, 'closed');
});

test('the full-swipe haptic fires once per crossing, never per frame', () => {
  const line = W * FULL_FRACTION;
  assert.equal(fullCrossing(-(line - 4), -(line + 4), W), 1, 'in');
  assert.equal(fullCrossing(-(line + 4), -(line + 30), W), 0, 'staying in is silent');
  assert.equal(fullCrossing(-(line + 4), -(line - 4), W), -1, 'out');
  assert.equal(isFull(-line, W), true);
  assert.equal(isFull(-(line - 1), W), false);
});

test('ONE ROW OPEN: opening a second row closes the first; closeAll closes the one open', () => {
  const reg = createOpenRegistry();
  const closedLog = [];
  reg.open('a', () => closedLog.push('a'));
  assert.equal(reg.openId, 'a');
  reg.open('a', () => closedLog.push('a again'));
  assert.deepEqual(closedLog, [], 'the same row re-opening closes nothing');
  reg.open('b', () => closedLog.push('b'));
  assert.deepEqual(closedLog, ['a again'], 'the first row closed (through its newest closer) as the second opened');
  assert.equal(reg.openId, 'b');
  reg.closed('a');
  assert.equal(reg.openId, 'b', 'a stale close from another row leaves the open one alone');
  reg.closeAll();
  assert.deepEqual(closedLog, ['a again', 'b']);
  assert.equal(reg.openId, null);
  reg.closeAll();
  assert.deepEqual(closedLog, ['a again', 'b'], 'closing nothing is a no-op');
});
