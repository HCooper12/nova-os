// THE LEFT-EDGE BACK SWIPE. 19 Sep 2026, from a reel on Jakob's Law: people
// have already learned this gesture in every other app, and one that does not
// honour it makes them learn something instead.
//
// Nova reserved the space for it a fortnight before it existed —
// swipeCore.EDGE_GUARD_PX is 24 and every swipeable row refuses to start a
// gesture there, on the stated grounds that "a gesture starting in the OS
// back-swipe gutter is never ours". True in a browser. Nova's manifest is
// `display: 'standalone'`, and an installed PWA has no back button and no edge
// swipe at all — so the gutter was kept clear for nothing.
//
// Pinned here: the gesture only starts in that gutter, it never fires on the
// entry the app booted with, and the thresholds are numbers rather than a
// thumb's opinion.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  edgeDecision, canGoBack, depthOf, pageOffset, lastEdgeGesture,
  COMMIT_PX, FLICK_PX_PER_MS,
} from '../../src/edgeBack.js';
import { EDGE_GUARD_PX, INTENT_PX, startsInEdgeGuard } from '../../src/swipeCore.js';

// dt defaults SLOW on purpose: at the default 100ms almost any real distance
// is also a flick, and a distance case would pass for the wrong reason.
const drag = (over = {}) => ({ startX: 4, dx: 0, dy: 0, dt: 900, ...over });

test('THE GESTURE LIVES IN THE GUTTER THE ROWS ALREADY AVOID', () => {
  // if these two ever disagree, a row swipe and the back swipe fight for the
  // same pixels and one of them loses silently
  assert.equal(edgeDecision(drag({ startX: EDGE_GUARD_PX - 1, dx: 200 })), 'lock');
  assert.equal(edgeDecision(drag({ startX: EDGE_GUARD_PX, dx: 200 })), 'none');
  // ...and 'none' wins even once locked: a gesture that never started in the
  // gutter can never become a back swipe partway through
  assert.equal(edgeDecision(drag({ startX: EDGE_GUARD_PX, dx: 200, locked: true })), 'none');
  assert.equal(startsInEdgeGuard(EDGE_GUARD_PX - 1), true);
  assert.equal(startsInEdgeGuard(EDGE_GUARD_PX), false);
});

test('it commits on distance, or on a flick that never got there', () => {
  const locked = (o) => drag({ locked: true, ...o });
  assert.equal(edgeDecision(locked({ dx: COMMIT_PX - 1 })), 'tracking');
  assert.equal(edgeDecision(locked({ dx: COMMIT_PX })), 'commit');
  // a fast flick: 40px in 40ms is 1.0 px/ms, twice the threshold
  assert.equal(edgeDecision(locked({ dx: 40, dt: 40 })), 'commit');
  // the same distance taken slowly is still just tracking
  assert.equal(edgeDecision(locked({ dx: 40, dt: 400 })), 'tracking');
  // and a flick that has barely left the gutter is a brush, not a gesture
  assert.equal(edgeDecision(locked({ dx: EDGE_GUARD_PX, dt: 10 })), 'tracking');
  assert.ok(FLICK_PX_PER_MS > 0);
});

// ---- 22 Sep: the three ways a THUMB broke what a synthetic drag passed ----

test('A FINGER JITTERS. One pixel left at the start must not kill the gesture', () => {
  // the shipped bug: `if (dx < 0) return "cancel"` on the very first move,
  // before any direction was established. A finger landing on glass always
  // wobbles; the test data never did.
  assert.equal(edgeDecision(drag({ dx: -1, dy: 0 })), 'waiting');
  assert.equal(edgeDecision(drag({ dx: -3, dy: 2 })), 'waiting');
  assert.equal(edgeDecision(drag({ dx: 0, dy: 0 })), 'waiting');
});

test('A THUMB ARCS. A locked gesture cannot be taken away by vertical drift', () => {
  // the second shipped bug: the vertical test re-ran on every move, so a drag
  // that had been horizontal for 80px was cancelled by the upward curve a
  // thumb makes as it travels right across a phone.
  assert.equal(edgeDecision(drag({ dx: 90, dy: 40, locked: true })), 'commit');
  assert.equal(edgeDecision(drag({ dx: 60, dy: 55, locked: true })), 'tracking');
  // ...and a finger wandering back toward the edge is undoing the drag, not
  // cancelling it — only the release decides
  assert.equal(edgeDecision(drag({ dx: -30, locked: true })), 'tracking');
});

test('the direction is decided by the app\u2019s OWN rule, not a private one', () => {
  // inventing a second rule here was the mistake under the other two:
  // swipeCore.decideDirection is tuned and proven on his device.
  assert.equal(edgeDecision(drag({ dx: 2, dy: 30 })), 'cancel', 'a real scroll is not cancelled');
  assert.equal(edgeDecision(drag({ dx: INTENT_PX + 8, dy: 4 })), 'lock');
  // the ambiguous middle waits rather than guessing
  assert.equal(edgeDecision(drag({ dx: INTENT_PX + 8, dy: INTENT_PX + 3 })), 'waiting');
});

test('the gesture leaves a receipt, so "not working" is answerable', () => {
  // the first cut shipped verified-on-synthetic-events and failed on his
  // phone with no way to find out why. Settings reads this.
  assert.equal(typeof lastEdgeGesture, 'function');
  assert.equal(lastEdgeGesture(), null, 'a fresh module should have no gesture recorded');
});

test('IT NEVER FIRES ON THE ENTRY NOVA BOOTED WITH', () => {
  // at depth 0 "back" leaves the app entirely, which is not what the gesture
  // means and is not something a swipe should be able to do by accident
  assert.equal(canGoBack(null), false);
  assert.equal(canGoBack({}), false);
  assert.equal(canGoBack({ novaDepth: 0 }), false);
  assert.equal(canGoBack({ novaDepth: 1 }), true);
  assert.equal(canGoBack({ novaDepth: 7 }), true);
  // a foreign history entry (another script's pushState) reads as depth 0
  assert.equal(depthOf({ something: 'else' }), 0);
  assert.equal(depthOf(undefined), 0);
  assert.equal(depthOf({ novaDepth: 'three' }), 0);
});

test('navigate stamps the depth it reads back', async () => {
  // the wiring: if App stops stamping, canGoBack is false forever and the
  // gesture silently never fires — the failure mode that kept haptics dead
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const app = await readFile(path.join(
    path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'App.jsx',
  ), 'utf8');
  assert.match(app, /pushState\(\{ novaDepth: depthOf\(window\.history\.state\) \+ 1 \}/,
    'navigate no longer stamps the history entry');
  assert.match(app, /<EdgeBack getEl=/, 'the gesture is not mounted');
});

test('the page follows the finger, damped, and never goes left', () => {
  assert.equal(pageOffset(0), 0);
  assert.equal(pageOffset(-50), 0, 'the page moved into the edge');
  assert.equal(pageOffset(100), 62);
  assert.ok(pageOffset(200) < 200, 'the page is outrunning the finger');
  // monotonic, so the page never stutters backwards mid-drag
  let prev = -1;
  for (let dx = 0; dx <= 300; dx += 10) {
    const px = pageOffset(dx);
    assert.ok(px >= prev, `page offset went backwards at dx=${dx}`);
    prev = px;
  }
});
