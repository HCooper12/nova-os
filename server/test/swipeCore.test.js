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
import { decideDirection, shouldCommit, startsInEdgeGuard, INTENT_PX, shouldPage, PAGE_PX , ROW_DECELERATION } from '../../src/swipeCore.js';

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
    { dx: 500, velocity: 12 },     // huge and fast — would commit if unlocked
    { dx: -500, velocity: -12 },
    { dx: ROW, velocity: 0 },      // full row width
    { dx: 199, velocity: 20 },     // flick velocity
  ];
  for (const h of hostile) {
    assert.equal(
      shouldCommit({ dir: 'v', rowWidth: ROW, hasRight: true, hasLeft: true, ...h }),
      false,
      `vertical lock must veto dx=${h.dx} at ${h.velocity} px/ms`,
    );
  }
});

test('an undecided gesture (a tap) never commits', () => {
  assert.equal(shouldCommit({ dir: null, dx: 0, rowWidth: ROW, velocity: 0, hasRight: true, hasLeft: true }), false);
});

test('a deliberate horizontal swipe past the line commits', () => {
  // 45% of 400 = 180
  assert.equal(shouldCommit({ dir: 'h', dx: 200, rowWidth: ROW, velocity: 0, hasRight: true, hasLeft: true }), true);
  assert.equal(shouldCommit({ dir: 'h', dx: -200, rowWidth: ROW, velocity: 0, hasRight: true, hasLeft: true }), true);
});

test('a short slow horizontal drag does NOT commit — it springs back', () => {
  assert.equal(shouldCommit({ dir: 'h', dx: 60, rowWidth: ROW, velocity: 0, hasRight: true, hasLeft: true }), false);
});

test('a fast flick commits short of the distance line — now from RELEASE velocity', () => {
  // 100px in 100ms = 1.0 px/ms, past the 0.6 flick threshold
  assert.equal(shouldCommit({ dir: 'h', dx: 100, rowWidth: ROW, velocity: 1.2, hasRight: true, hasLeft: true }), true);
});

test('a direction with no action wired to it never commits', () => {
  assert.equal(shouldCommit({ dir: 'h', dx: 300, rowWidth: ROW, velocity: 0, hasRight: false, hasLeft: true }), false, 'rightward with no right action');
  assert.equal(shouldCommit({ dir: 'h', dx: -300, rowWidth: ROW, velocity: 0, hasRight: true, hasLeft: false }), false, 'leftward with no left action');
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
    if (shouldCommit({ dir, dx: finalDx, rowWidth: ROW, velocity: ((i % 7) - 3) * 0.9, hasRight: true, hasLeft: true })) commits++;
  }
  assert.equal(commits, 0, 'not one scroll gesture may commit an action');
});

// Paging between a meal slot's options (7 Sep 2026). A lower distance bar than
// a destructive commit, but the SAME direction lock — the rotation strip
// scrolls horizontally, so a gesture the browser could read as a scroll must
// never silently reorder his day's plan.
test('paging needs a locked horizontal gesture, never a vertical one', () => {
  assert.equal(shouldPage({ dir: 'v', dx: 300, velocity: 4 }), false, 'a vertical lock can never page');
  assert.equal(shouldPage({ dir: null, dx: 300, velocity: 4 }), false, 'an undecided gesture can never page');
  assert.equal(shouldPage({ dir: 'h', dx: PAGE_PX - 1, velocity: 0 }), false, 'a slow, short drag settles back');
  assert.equal(shouldPage({ dir: 'h', dx: PAGE_PX + 1, velocity: 0 }), true, 'far enough pages even when slow');
  assert.equal(shouldPage({ dir: 'h', dx: -20, velocity: -1 }), true, 'a flick pages even when short');
  assert.equal(shouldPage({ dir: 'h', dx: -60, velocity: 0 }), true, 'backwards pages the same as forwards');
});

// ---------------------------------------------------------------- 16 Sep 2026
// The rule moved from AVERAGE velocity over the whole gesture to a projection
// from RELEASE velocity. These are the behaviours that changed, and the one
// that must not have.

test('PULLING BACK CANCELS, however far the row reached', () => {
  const ROW = 375;
  // dragged well past the commit bar, then flicked back toward home
  assert.equal(shouldCommit({ dir: 'h', dx: 250, rowWidth: ROW, velocity: -3, hasRight: true, hasLeft: true }), false);
  assert.equal(shouldCommit({ dir: 'h', dx: -250, rowWidth: ROW, velocity: 3, hasRight: true, hasLeft: true }), false);
  // released still at the same distance, it commits — so it is the SIGN doing it
  assert.equal(shouldCommit({ dir: 'h', dx: 250, rowWidth: ROW, velocity: 0, hasRight: true, hasLeft: true }), true);
});

test('a careful drag that ENDS in a flick now commits — the fault this fixed', () => {
  const ROW = 375;
  // 90px over a slow, deliberate second, then a decisive flick at release.
  // The old rule averaged 0.09 px/ms and refused; the finger said otherwise.
  assert.equal(shouldCommit({ dir: 'h', dx: 90, rowWidth: ROW, velocity: 1.6, hasRight: true, hasLeft: true }), true);
  // and the mirror: a fast drag that STOPS DEAD is not a flick
  assert.equal(shouldCommit({ dir: 'h', dx: 90, rowWidth: ROW, velocity: 0, hasRight: true, hasLeft: true }), false);
});

test('SAFETY: a row is harder to throw than a sheet, on purpose', () => {
  const ROW = 375;
  assert.ok(ROW_DECELERATION < 0.998, 'a row must project less far than a sheet');
  // The rightmost action on an Inbox row is DISCARD. A twitchy 30px flick —
  // which the OLD average rule committed outright (30/40ms = 0.75 > the 0.6
  // bar) — must not throw away a captured thought.
  assert.equal(shouldCommit({ dir: 'h', dx: 30, rowWidth: ROW, velocity: 0.75, hasRight: true, hasLeft: true }), false);
  // a genuine, committed flick still gets through
  assert.equal(shouldCommit({ dir: 'h', dx: 120, rowWidth: ROW, velocity: 1.5, hasRight: true, hasLeft: true }), true);
});

test('THE PROPERTY THAT MUST NOT CHANGE: a vertical lock still vetoes everything', () => {
  const ROW = 375;
  for (const velocity of [-20, -2, 0, 2, 20]) {
    for (const dx of [-600, -200, 0, 200, 600]) {
      assert.equal(
        shouldCommit({ dir: 'v', dx, rowWidth: ROW, velocity, hasRight: true, hasLeft: true }), false,
        `a scroll must never commit (dx=${dx}, v=${velocity})`,
      );
      assert.equal(shouldPage({ dir: 'v', dx, velocity }), false);
    }
  }
});
