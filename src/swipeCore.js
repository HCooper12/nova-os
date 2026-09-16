// The swipe gesture's decision logic, as pure functions — no DOM, no React —
// so the property that actually matters can be tested deterministically and
// permanently (server/test/swipeCore.test.js) rather than only by hand in a
// browser.
//
// The property: A GESTURE THAT STARTS VERTICAL CAN NEVER COMMIT. Scrolling a
// list where one action is DISCARD must not be able to throw away a captured
// thought, and no amount of threshold tuning makes an unlocked implementation
// safe. Direction is decided once, on the first movement past INTENT_PX, and
// a vertical verdict is final for the rest of that gesture.

import { project } from './sheetPhysics.js';

// A ROW IS NOT A SHEET. Both project momentum to decide, but a row's rightmost
// action is DISCARD, so its projection uses Apple's snappier deceleration
// (0.99, ~99x on px/ms) rather than the sheet's 0.998 (~499x). A flick that
// would throw a sheet clean off the screen should not, on its own, throw away
// a captured thought.
export const ROW_DECELERATION = 0.99;

export const INTENT_PX = 12;
export const HORIZONTAL_BIAS = 1.5;
export const COMMIT_FRACTION = 0.45;
// (FLICK_VELOCITY was removed 16 Sep 2026 — it only ever fed the average-
// velocity rule that projection replaced. A constant nothing reads is a
// number waiting to be believed.)
export const EDGE_GUARD_PX = 24;

// Decide the direction for a gesture that has not yet locked one.
// Returns 'h', 'v', or null (not enough movement to tell yet).
export function decideDirection(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ay >= INTENT_PX && ay > ax) return 'v';
  if (ax >= INTENT_PX && ax > ay * HORIZONTAL_BIAS) return 'h';
  return null;
}

// Should this release commit? `dir` is the LOCKED direction — a 'v' gesture
// returns false no matter how far sideways the finger ended up.
//
// 16 Sep 2026: this used to take `elapsedMs` and read AVERAGE velocity over the
// whole gesture, which is the wrong number twice over. A careful drag that ends
// in a decisive flick averaged out as slow and did not commit; a fast drag that
// stopped dead still did. And a row dragged past the bar and then pulled BACK
// committed anyway, because nothing looked at where the finger was going — the
// same fault the sheets had, one layer up.
//
// `velocity` is px per MILLISECOND at RELEASE, taken from a short history.
export function shouldCommit({ dir, dx, rowWidth, velocity = 0, hasRight, hasLeft }) {
  if (dir !== 'h') return false;
  if (dx > 0 && !hasRight) return false;
  if (dx < 0 && !hasLeft) return false;
  const projected = dx + project(velocity, ROW_DECELERATION);
  // PULLING BACK CANCELS. If the projection lands on the other side of the
  // start, the finger was returning the row, whatever distance it reached.
  if (Math.sign(projected) !== Math.sign(dx)) return false;
  return Math.abs(projected) > rowWidth * COMMIT_FRACTION;
}

// A gesture starting in the OS back-swipe gutter is never ours.
export function startsInEdgeGuard(clientX) {
  return clientX < EDGE_GUARD_PX;
}

// PAGING (the rotation card's options, 7 Sep 2026). Switching which option is
// in focus is not a commit — it writes a preference, is visible instantly and
// is undone by swiping back — so it needs a lower bar than shouldCommit's
// destructive-action threshold. What it does NOT get is a lower bar on the
// direction lock: a gesture that started as a scroll can never page, same rule
// and same mechanism as everything else in this file.
export const PAGE_PX = 40;

export function shouldPage({ dir, dx, velocity = 0 }) {
  if (dir !== 'h') return false;
  const projected = dx + project(velocity, ROW_DECELERATION);
  if (Math.sign(projected) !== Math.sign(dx)) return false;
  return Math.abs(projected) > PAGE_PX;
}
