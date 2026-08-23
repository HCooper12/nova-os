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

export const INTENT_PX = 12;
export const HORIZONTAL_BIAS = 1.5;
export const COMMIT_FRACTION = 0.45;
export const FLICK_VELOCITY = 0.6; // px/ms
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
export function shouldCommit({ dir, dx, rowWidth, elapsedMs, hasRight, hasLeft }) {
  if (dir !== 'h') return false;
  if (dx > 0 && !hasRight) return false;
  if (dx < 0 && !hasLeft) return false;
  const past = Math.abs(dx) > rowWidth * COMMIT_FRACTION;
  const flick = Math.abs(dx) / Math.max(1, elapsedMs) > FLICK_VELOCITY;
  return past || flick;
}

// A gesture starting in the OS back-swipe gutter is never ours.
export function startsInEdgeGuard(clientX) {
  return clientX < EDGE_GUARD_PX;
}
