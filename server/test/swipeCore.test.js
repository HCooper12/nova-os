// The swipe gesture's safety property, pinned permanently.
//
// One of the swipe actions is DISCARD on an inbox row — an accidental commit
// while scrolling would throw away a captured thought. So the rule under test
// is absolute, not statistical: A GESTURE THAT LOCKS VERTICAL CAN NEVER
// COMMIT, no matter how far sideways the finger later travels or how fast it
// is released. This file is a Node test rather than a browser check so it
// runs on every `npm test` forever.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideDirection, shouldCommit, startsInEdgeGuard, INTENT_PX } from '../../src/swipeCore.js';

const ROW = 400;

test('direction is undecided until the finger has actually moved', () => {
  assert.equal(decideDirection(0, 0), null);
  assert.equal(decideDirection(5, 5), null);
  assert.equal(decideDirection(INTENT_PX - 1, 0), null, 'just under the intent threshold stays undecided');
});

test('a clearly horizontal drag locks horizontal; an ambiguous one does not', () => {
  assert.equal(decideDirection(30, 2), 'h');
  assert.equal(decideDirection(-30, 2), 'h', 'leftward counts too');
  // 1.5x bias: 20 horizontal against 15 vertical is NOT clear enough
  assert.equal(decideDirection(20, 15), null, 'diagonal drift must not be read as a swipe');
});

test('a vertical drag locks vertical', () => {
  assert.equal(decideDirection(0, 30), 'v');
  assert.equal(decideDirection(6, -40), 'v', 'a scroll with slight sideways drift is still a scroll');
});

test('THE SAFETY PROPERTY: a vertical-locked gesture can never commit', () => {
  // every shape of "scroll that later drifts sideways", including ones far
  // past the distance and velocity thresholds
  const hostile = [
    { dx: 500, elapsedMs: 40 },    // huge and fast — would commit if unlocked
    { dx: -500, elapsedMs: 40 },
    { dx: ROW, elapsedMs: 1000 },  // full row width
    { dx: 199, elapsedMs: 10 },    // flick velocity
  ];
  for (const h of hostile) {
    assert.equal(
      shouldCommit({ dir: 'v', rowWidth: ROW, hasRight: true, hasLeft: true, ...h }),
      false,
      `vertical lock must veto dx=${h.dx} in ${h.elapsedMs}ms`,
    );
  }
});

test('an undecided gesture (a tap) never commits', () => {
  assert.equal(shouldCommit({ dir: null, dx: 0, rowWidth: ROW, elapsedMs: 120, hasRight: true, hasLeft: true }), false);
});

test('a deliberate horizontal swipe past the line commits', () => {
  // 45% of 400 = 180
  assert.equal(shouldCommit({ dir: 'h', dx: 200, rowWidth: ROW, elapsedMs: 400, hasRight: true, hasLeft: true }), true);
  assert.equal(shouldCommit({ dir: 'h', dx: -200, rowWidth: ROW, elapsedMs: 400, hasRight: true, hasLeft: true }), true);
});

test('a short slow horizontal drag does NOT commit — it springs back', () => {
  assert.equal(shouldCommit({ dir: 'h', dx: 60, rowWidth: ROW, elapsedMs: 600, hasRight: true, hasLeft: true }), false);
});

test('a fast flick commits short of the distance line', () => {
  // 100px in 100ms = 1.0 px/ms, past the 0.6 flick threshold
  assert.equal(shouldCommit({ dir: 'h', dx: 100, rowWidth: ROW, elapsedMs: 100, hasRight: true, hasLeft: true }), true);
});

test('a direction with no action wired to it never commits', () => {
  assert.equal(shouldCommit({ dir: 'h', dx: 300, rowWidth: ROW, elapsedMs: 300, hasRight: false, hasLeft: true }), false, 'rightward with no right action');
  assert.equal(shouldCommit({ dir: 'h', dx: -300, rowWidth: ROW, elapsedMs: 300, hasRight: true, hasLeft: false }), false, 'leftward with no left action');
});

test('a gesture starting in the OS back-swipe gutter is not ours', () => {
  assert.equal(startsInEdgeGuard(0), true);
  assert.equal(startsInEdgeGuard(10), true);
  assert.equal(startsInEdgeGuard(80), false);
});

test('simulated scrolling: 200 realistic scroll gestures, zero commits', () => {
  // A scroll is a mostly-vertical drag with human sideways wobble. Replay a
  // spread of them through the real decision path and assert nothing fires.
  let commits = 0;
  for (let i = 0; i < 200; i++) {
    const dy = (i % 2 ? 1 : -1) * (INTENT_PX + (i % 90) + 5); // always past intent
    const wobble = ((i * 7) % 25) - 12;                        // -12..+12 px sideways
    const dir = decideDirection(wobble, dy);
    // the finger then drifts further sideways before release, as fingers do
    const finalDx = wobble + ((i * 13) % 120) - 60;
    if (shouldCommit({ dir, dx: finalDx, rowWidth: ROW, elapsedMs: 60 + (i % 300), hasRight: true, hasLeft: true })) commits++;
  }
  assert.equal(commits, 0, 'not one scroll gesture may commit an action');
});
