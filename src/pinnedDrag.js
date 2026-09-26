// THE REORDER, AS ARITHMETIC — where a dragged Pinned row lands, and how far
// each other row steps aside while it hovers (src/PinnedEditSheet.jsx). Pure,
// no DOM and no React, for the reason sheetPhysics.js gives: an off-by-one
// here is invisible in a screenshot and certain in a test.

// `mids` are the rows' vertical midpoints, measured ONCE at pick-up, top to
// bottom; `center` is the dragged row's midpoint now. The row drops at the
// furthest slot whose ORIGINAL midpoint it has crossed, in either direction,
// which is exactly the `to` that movePinned(list, from, to) (src/pinned.js)
// splices into. Anything malformed leaves it where it started.
export function dropIndex(mids, from, center) {
  const n = Array.isArray(mids) ? mids.length : 0;
  if (!n || !Number.isInteger(from) || from < 0 || from >= n || !Number.isFinite(center)) return from;
  let to = from;
  for (let i = from + 1; i < n && center > mids[i]; i++) to = i;
  for (let i = from - 1; i >= 0 && center < mids[i]; i--) to = i;
  return to;
}

// How far row `i` steps aside while row `from` hovers over slot `to`. The rows
// it has passed close the gap it left (up, when it travelled down) or open one
// for it (down, when it travelled up), by one row height; every other row
// stays put. The dragged row itself is the finger's to move, never this one's.
export function rowShift(i, from, to, height) {
  if (i === from) return 0;
  if (from < to && i > from && i <= to) return -height;
  if (to < from && i >= to && i < from) return height;
  return 0;
}
