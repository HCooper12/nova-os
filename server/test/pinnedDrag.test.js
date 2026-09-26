// The Edit sheet's reorder (src/pinnedDrag.js): where a dragged Pinned row
// lands, how far the others step aside, and — the property that matters to
// him — that what he sees at the moment he lets go is exactly the order that
// gets saved (movePinned, src/pinned.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dropIndex, rowShift } from '../../src/pinnedDrag.js';
import { movePinned } from '../../src/pinned.js';

const H = 52;                                   // the sheet's row height
const mids = [0, 1, 2, 3, 4].map((i) => i * H + H / 2); // 26, 78, 130, 182, 234

test('a row that has not crossed a neighbour\'s midpoint stays in its slot', () => {
  assert.equal(dropIndex(mids, 2, 130), 2);
  assert.equal(dropIndex(mids, 2, 181), 2, 'one pixel short of the row below');
  assert.equal(dropIndex(mids, 2, 79), 2, 'one pixel short of the row above');
});

test('down: past one midpoint is one slot, past two is two, and the end clamps', () => {
  assert.equal(dropIndex(mids, 1, 131), 2);
  assert.equal(dropIndex(mids, 1, 183), 3);
  assert.equal(dropIndex(mids, 1, 9999), 4);
});

test('up: the same, mirrored, and the top clamps', () => {
  assert.equal(dropIndex(mids, 3, 129), 2);
  assert.equal(dropIndex(mids, 3, 77), 1);
  assert.equal(dropIndex(mids, 3, -9999), 0);
});

test('the rows it passes step aside by one row, and nothing else moves', () => {
  const shifts = (from, to) => [0, 1, 2, 3, 4].map((i) => rowShift(i, from, to, H));
  assert.deepEqual(shifts(1, 3), [0, 0, -H, -H, 0]);
  assert.deepEqual(shifts(3, 1), [0, H, H, 0, 0]);
  assert.deepEqual(shifts(2, 2), [0, 0, 0, 0, 0]);
  assert.deepEqual(shifts(0, 4), [0, -H, -H, -H, -H]);
});

test('what he sees when he lets go is exactly the order that is saved, for every move', () => {
  const list = ['body', 'today', 'plan', 'waiting', 'training'].map((key) => ({ key, on: true }));
  for (let from = 0; from < list.length; from++) {
    for (let to = 0; to < list.length; to++) {
      // the screen at release: every other row at its slot plus its shift,
      // the dragged row over the slot it is dropping into
      const screen = new Array(list.length);
      list.forEach((r, i) => { if (i !== from) screen[i + rowShift(i, from, to, H) / H] = r.key; });
      screen[to] = list[from].key;
      assert.deepEqual(screen, movePinned(list, from, to).map((r) => r.key), `from ${from} to ${to}`);
    }
  }
});

test('a drag measured from real midpoints lands where movePinned puts it', () => {
  const list = ['a', 'b', 'c', 'd', 'e'].map((key) => ({ key }));
  // "b" picked up at its centre (78) and carried 110px down: past c and d
  const to = dropIndex(mids, 1, 78 + 110);
  assert.equal(to, 3);
  assert.deepEqual(movePinned(list, 1, to).map((r) => r.key), ['a', 'c', 'd', 'b', 'e']);
});

test('garbage in leaves the row where it started', () => {
  assert.equal(dropIndex([], 0, 50), 0);
  assert.equal(dropIndex(null, 2, 50), 2);
  assert.equal(dropIndex(mids, 7, 50), 7);
  assert.equal(dropIndex(mids, 1, Number.NaN), 1);
  assert.equal(dropIndex(mids, 1.5, 200), 1.5);
});
