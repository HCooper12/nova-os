// THE iOS MAIL SWIPE, AS ARITHMETIC (3 Oct 2026, his words: "swipe to delete
// just like iOS typically allows ... consistent across the platform").
//
// The house row (src/SwipeRow.jsx) used to have one move: drag past 45% and
// let go, and the action ran. iOS has three, and this file is all three as
// pure functions so the rules carry a Node test (server/test/swipeReveal.test.js)
// rather than living only in a browser:
//
//   REVEAL  a partial swipe opens the row on its buttons (a red Delete, and
//           any second action) and it STAYS open until a button is tapped,
//           the row is tapped, the page scrolls, or another row opens;
//   COMMIT  a swipe past FULL_FRACTION of the row, or a flick whose
//           projection lands there once the finger has already uncovered
//           the buttons, runs the edge-most action with that button
//           stretched across the row;
//   CLOSE   anything else, and every gesture that locked vertical.
//
// THE SAFETY PROPERTY swipeCore.js was written for still holds and is tested
// again here: a gesture that locked vertical can never commit and never
// open. It CLOSES an open row, which is what a scroll does on iOS.
//
// Offsets are px, negative = the row moved left (the trailing actions, the
// ones passed as `left`), positive = moved right (the leading ones, `right`).

import { project, rubberband } from './sheetPhysics.js';
import { ROW_DECELERATION } from './swipeCore.js';

// One revealed button's width. iOS's trailing buttons are ~74pt.
export const ACTION_WIDTH = 74;
// Past this fraction of the row, a release commits (iOS's full swipe).
export const FULL_FRACTION = 0.6;

const sideOf = (offset) => (offset < 0 ? 'left' : offset > 0 ? 'right' : null);

// How wide the open state is for a side with `count` buttons.
export function revealWidth(count) {
  return Math.max(0, Number(count) || 0) * ACTION_WIDTH;
}

// Where the row sits for a raw finger offset (`raw` = where it was at
// pick-up + how far the finger has moved). A side with no actions does not
// move at all (the row is inert that way, never moving and then doing
// nothing). A side WITH actions follows the finger 1:1 up to the row's own
// width, then rubber-bands: further pull, less travel.
export function trackOffset({ raw, rowWidth, leftCount = 0, rightCount = 0 }) {
  const w = Math.max(1, Number(rowWidth) || 1);
  const r = Number(raw) || 0;
  if (r < 0 && !leftCount) return 0;
  if (r > 0 && !rightCount) return 0;
  const a = Math.abs(r);
  if (a <= w) return r;
  return Math.sign(r) * (w + rubberband(a - w, w * 0.5));
}

// Is the row past the full-swipe line right now? (The buttons stretch, and
// the threshold haptic fires once on the way in.)
export function isFull(offset, rowWidth) {
  return Math.abs(Number(offset) || 0) >= Math.max(1, Number(rowWidth) || 1) * FULL_FRACTION;
}

// +1 when this move crossed INTO the full zone, -1 when it crossed back out,
// 0 otherwise. One haptic per crossing, never one per frame.
export function fullCrossing(prev, next, rowWidth) {
  const a = isFull(prev, rowWidth);
  const b = isFull(next, rowWidth);
  return a === b ? 0 : b ? 1 : -1;
}

// What a release does. `dir` is the LOCKED direction ('h' | 'v' | null);
// `offset` is where the row is; `velocity` px per ms at release (from
// sheetPhysics.velocityFrom); `fullLeft`/`fullRight` say whether that side's
// edge-most action may run on a full swipe (default yes).
//
// Returns { to: 'closed' | 'open' | 'commit', side: 'left' | 'right' | null }.
export function releaseSwipe({ dir, offset, velocity = 0, rowWidth, leftCount = 0, rightCount = 0, fullLeft = true, fullRight = true }) {
  const closed = { to: 'closed', side: null };
  // a scroll never opens and never commits; it closes
  if (dir !== 'h') return closed;
  const side = sideOf(offset);
  if (!side) return closed;
  const count = side === 'left' ? leftCount : rightCount;
  if (!count) return closed;
  const w = Math.max(1, Number(rowWidth) || 1);
  const projected = offset + project(velocity, ROW_DECELERATION);
  // PULLING BACK CANCELS: a projection on the other side of rest means the
  // finger was returning the row, however far it had been
  if (Math.sign(projected) !== Math.sign(offset)) return closed;
  const reveal = revealWidth(count);
  const full = side === 'left' ? fullLeft : fullRight;
  // A COMMIT NEEDS THE FINGER TO HAVE UNCOVERED THE BUTTONS. A flick from a
  // standing start projects a long way; on its own it opens the row, so a
  // careless flick shows Delete rather than deleting.
  if (full && Math.abs(projected) >= w * FULL_FRACTION && Math.abs(offset) >= Math.min(reveal, w * FULL_FRACTION)) {
    return { to: 'commit', side };
  }
  if (Math.abs(projected) >= reveal / 2) return { to: 'open', side };
  return closed;
}

// Where an open row rests.
export function openOffset(side, count) {
  const w = revealWidth(count);
  return side === 'left' ? -w : side === 'right' ? w : 0;
}

// ONE ROW OPEN AT A TIME. Opening a row closes whichever was open before;
// a row that closes itself leaves the registry; closeAll is what a scroll
// or a tap elsewhere calls. Pure enough to test: a closer is just a function.
export function createOpenRegistry() {
  let current = null;
  return {
    open(id, close) {
      if (current && current.id !== id) {
        const prev = current;
        current = null;
        prev.close();
      }
      current = { id, close };
    },
    closed(id) {
      if (current && current.id === id) current = null;
    },
    closeAll() {
      const prev = current;
      current = null;
      if (prev) prev.close();
    },
    get openId() { return current ? current.id : null; },
  };
}

// The house's single registry: every SwipeRow on every page shares it.
export const openRows = createOpenRegistry();
