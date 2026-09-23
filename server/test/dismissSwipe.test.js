// FLICK IT AWAY. His ask, 22 Sep: notifications in Nova should swipe away
// "smoothly and with dynamic animation just like how notifications in iOS
// operate."
//
// The back swipe cost four attempts because a synthetic drag is not a thumb.
// Those lessons are the tests here: the direction locks once and is never
// re-questioned, a jitter does not kill the gesture, a downward drag belongs
// to the page, and the card leaves in the direction it was already going.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dismissDecision, dismissDistance, dismissStyle, exitOffset,
  DISMISS_FRACTION, FLING_MIN_PX, UP_DISMISS_PX,
} from '../../src/dismissSwipe.js';
import { INTENT_PX } from '../../src/swipeCore.js';

const d = (o = {}) => ({ dx: 0, dy: 0, dt: 900, width: 360, locked: null, ...o });

test('the direction locks once, through the app’s own rule', () => {
  assert.equal(dismissDecision(d({ dx: 2, dy: 1 })), 'waiting');
  assert.equal(dismissDecision(d({ dx: INTENT_PX + 8, dy: 3 })), 'lock-h');
  assert.equal(dismissDecision(d({ dx: 2, dy: -(INTENT_PX + 8) })), 'lock-v');
  // a finger that jitters has not decided anything yet — it must not cancel
  assert.equal(dismissDecision(d({ dx: -2, dy: 1 })), 'waiting');
});

test('DOWN BELONGS TO THE PAGE, not to the card', () => {
  // a notification that ate a downward drag would break scrolling under it
  assert.equal(dismissDecision(d({ dx: 1, dy: INTENT_PX + 10 })), 'cancel');
});

test('it dismisses on distance — a share of its own width, either way', () => {
  const need = dismissDistance(360);
  assert.equal(need, Math.round(360 * DISMISS_FRACTION));
  assert.equal(dismissDecision(d({ dx: need - 1, locked: 'h' })), 'tracking');
  assert.equal(dismissDecision(d({ dx: need, locked: 'h' })), 'dismiss');
  assert.equal(dismissDecision(d({ dx: -need, locked: 'h' })), 'dismiss', 'left does not dismiss');
  // and it scales, so a wide card is not dismissed by a flick a phone needs
  assert.ok(dismissDistance(900) > dismissDistance(360));
  assert.ok(dismissDistance(50) >= 64, 'a tiny card must still need a real gesture');
});

test('a FLING counts, a brush does not', () => {
  assert.equal(dismissDecision(d({ dx: FLING_MIN_PX + 4, dt: 40, locked: 'h' })), 'dismiss');
  // fast but barely moved
  assert.equal(dismissDecision(d({ dx: 20, dt: 10, locked: 'h' })), 'tracking');
  // far enough for a fling but taken slowly — needs the full distance
  assert.equal(dismissDecision(d({ dx: FLING_MIN_PX + 4, dt: 4000, locked: 'h' })), 'tracking');
});

test('UP dismisses too, which is how the iOS stack is cleared', () => {
  assert.equal(dismissDecision(d({ dy: -(UP_DISMISS_PX - 1), locked: 'v' })), 'tracking');
  assert.equal(dismissDecision(d({ dy: -UP_DISMISS_PX, locked: 'v' })), 'dismiss');
  // a fast upward flick that did not travel far still counts
  assert.equal(dismissDecision(d({ dy: -(FLING_MIN_PX + 4), dt: 40, locked: 'v' })), 'dismiss');
});

test('A LOCKED GESTURE IS NEVER TAKEN AWAY — the fault the back swipe taught', () => {
  // a thumb arcs as it travels; re-deciding the axis mid-drag is how a real
  // hand loses a gesture that a straight synthetic line keeps
  assert.equal(dismissDecision(d({ dx: dismissDistance(360) + 10, dy: 60, locked: 'h' })), 'dismiss');
  assert.equal(dismissDecision(d({ dx: 40, dy: 80, locked: 'h' })), 'tracking');
  assert.notEqual(dismissDecision(d({ dx: 30, dy: 90, locked: 'h' })), 'cancel');
});

test('it stays legible while he is deciding', () => {
  // a card that vanishes a third of the way reads as a bug, not a gesture
  const half = dismissStyle(dismissDistance(360) / 2, 0, 'h', 360);
  assert.ok(half.opacity > 0.6, `faded to ${half.opacity} halfway — too fast`);
  assert.equal(half.x, dismissDistance(360) / 2, 'the card does not follow the finger 1:1');
  const none = dismissStyle(0, 0, 'h', 360);
  assert.equal(none.opacity, 1);
  // upward never drags the card DOWN
  assert.equal(dismissStyle(0, 40, 'v', 360).y, 0);
});

test('it leaves the way it was already going', () => {
  assert.ok(exitOffset(100, 0, 'h', 360).x > 360, 'a rightward flick must exit right');
  assert.ok(exitOffset(-100, 0, 'h', 360).x < -360, 'a leftward flick must exit left');
  assert.ok(exitOffset(0, -80, 'v', 360).y < 0, 'an upward flick must exit upward');
  assert.equal(exitOffset(0, -80, 'v', 360).x, 0);
});

test('the card and the back swipe do not fight over the edge', async () => {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const src = await readFile(path.join(
    path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'dismissSwipe.js',
  ), 'utf8');
  assert.match(src, /startsInEdgeGuard\(e\.clientX\)/,
    'a drag starting in the back-swipe gutter would be claimed by both');
  // only transform and opacity, so it composites
  assert.match(src, /style\.transform/);
  assert.match(src, /style\.opacity/);
  assert.doesNotMatch(src, /style\.(left|top|width|height)\s*=/, 'it animates a layout property');
});

test('reduced motion means gone, not slid away', async () => {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const src = await readFile(path.join(
    path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'dismissSwipe.js',
  ), 'utf8');
  assert.match(src, /prefers-reduced-motion/);
  assert.match(src, /if \(reduced\(\)\) \{ s\.gone = true; onDismiss\?\.\(\); return; \}/);
});
