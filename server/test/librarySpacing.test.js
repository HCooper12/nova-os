// Spaced resurfacing (Librarian Phase 3). The property that matters: the
// picker has a MEMORY. The beat it replaces picked the first and last items
// by list position, so the same two sources came back every day forever.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickForResurfacing, intervalFor, INTERVALS, briefDue, resurfaceLine, MIN_BRIEF_GAP_DAYS,
} from '../lib/librarySpacing.js';

const DAY = 86_400_000;
const NOW = new Date('2026-08-25T09:00:00Z').getTime();
const src = (id, over = {}) => ({ id, title: id, author: 'A', concepts: [`${id}-idea`], backlinks: 0, ...over });
const surfaced = (daysAgo, seen = 1, backlinksAtSurface = 0) => ({
  seen, lastSurfacedAt: new Date(NOW - daysAgo * DAY).toISOString(), backlinksAtSurface,
});

test('a never-surfaced source outranks one already seen', () => {
  const items = [src('seen'), src('fresh')];
  const state = { seen: surfaced(30, 1) };
  assert.equal(pickForResurfacing(items, state, NOW).item.id, 'fresh');
});

test('among never-surfaced, the most linked-to wins', () => {
  const items = [src('lonely', { backlinks: 0 }), src('central', { backlinks: 7 })];
  assert.equal(pickForResurfacing(items, {}, NOW).item.id, 'central');
});

test('the interval widens each time, so a repeat stops competing', () => {
  assert.deepEqual(INTERVALS.slice(0, 3), [1, 3, 7]);
  assert.equal(intervalFor(0), 1);
  assert.equal(intervalFor(2), 7);
  assert.equal(intervalFor(99), INTERVALS[INTERVALS.length - 1], 'the last interval repeats forever');
  // seen 3 times => the next gap is INTERVALS[2] = 7 days.
  // At 5 days it is not yet due...
  assert.equal(pickForResurfacing([src('a')], { a: surfaced(5, 3) }, NOW), null);
  // ...at 8 days it is.
  assert.equal(pickForResurfacing([src('a')], { a: surfaced(8, 3) }, NOW).item.id, 'a');
  // And a source seen only once is due again after a single day, so early
  // repetition still happens where it should.
  assert.equal(pickForResurfacing([src('b')], { b: surfaced(2, 1) }, NOW).item.id, 'b');
  assert.equal(pickForResurfacing([src('c')], { c: surfaced(4, 2) }, NOW).item.id, 'c');
});

test('nothing due returns null rather than repeating something', () => {
  const state = { a: surfaced(0, 1), b: surfaced(0, 1) };
  assert.equal(pickForResurfacing([src('a'), src('b')], state, NOW), null,
    'silence beats showing him the same idea twice in a day');
});

test('a source his vault newly linked to jumps the queue', () => {
  // 'linked' was shown yesterday (not due) but gained two backlinks since;
  // 'fresh' has never been shown at all and would otherwise win.
  const items = [src('fresh'), src('linked', { backlinks: 3 })];
  const state = { linked: surfaced(1, 1, 1) };
  const pick = pickForResurfacing(items, state, NOW);
  assert.equal(pick.item.id, 'linked');
  assert.equal(pick.reason, 'reconnected');
});

test('backlinks that have not changed do not fake a reconnection', () => {
  // Still due on its ordinary schedule, but it must NOT claim his vault
  // linked to it again — that would be Nova inventing a reason.
  const items = [src('same', { backlinks: 4 })];
  const pick = pickForResurfacing(items, { same: surfaced(3, 1, 4) }, NOW);
  assert.equal(pick.item.id, 'same');
  assert.equal(pick.reason, 'due');
  assert.notEqual(pick.reason, 'reconnected');
  // and a source that LOST a backlink is likewise not "reconnected"
  const lost = pickForResurfacing([src('same', { backlinks: 1 })], { same: surfaced(3, 1, 4) }, NOW);
  assert.equal(lost.reason, 'due');
});

test('the pick is stable, never random — same inputs, same answer', () => {
  const items = [src('b', { backlinks: 2 }), src('a', { backlinks: 2 })];
  const first = pickForResurfacing(items, {}, NOW).item.id;
  for (let i = 0; i < 20; i++) {
    assert.equal(pickForResurfacing([...items].reverse(), {}, NOW).item.id, first);
  }
});

test('every source eventually gets its turn — the old beat never did this', () => {
  const items = Array.from({ length: 6 }, (_, i) => src(`s${i}`, { backlinks: i }));
  const state = {};
  const seen = new Set();
  let clock = NOW;
  for (let day = 0; day < 30; day++) {
    const pick = pickForResurfacing(items, state, clock);
    if (pick) {
      seen.add(pick.item.id);
      const prev = state[pick.item.id] || {};
      state[pick.item.id] = {
        seen: (prev.seen || 0) + 1,
        lastSurfacedAt: new Date(clock).toISOString(),
        backlinksAtSurface: pick.item.backlinks,
      };
    }
    clock += DAY;
  }
  assert.equal(seen.size, items.length, 'all six surfaced within a month, not the same two forever');
});

test('brief rate limit: occasional, not a daily sermon', () => {
  assert.equal(briefDue(null, NOW), true, 'never briefed before means due');
  assert.equal(briefDue(new Date(NOW - 1 * DAY).toISOString(), NOW), false);
  assert.equal(briefDue(new Date(NOW - (MIN_BRIEF_GAP_DAYS + 1) * DAY).toISOString(), NOW), true);
});

test('the line names the source and flags researched-not-read', () => {
  const line = resurfaceLine({ item: src('Deep Work', { title: 'Deep Work', author: 'Cal Newport', concepts: ['Attention Residue'], provenance: 'researched' }), reason: 'new' });
  assert.match(line, /Deep Work/);
  assert.match(line, /Cal Newport/);
  assert.match(line, /Attention Residue/);
  assert.match(line, /researched, not read/, 'provenance is never quietly dropped');
});

test('a reconnected source says WHY it came back', () => {
  const line = resurfaceLine({ item: src('x', { title: 'Atomic Habits', concepts: ['Habit Stacking'] }), reason: 'reconnected' });
  assert.match(line, /gained a connection/);
});

test('a source with no idea and no excerpt produces no line rather than a hollow one', () => {
  assert.equal(resurfaceLine({ item: { id: 'a', title: 'T', concepts: [], excerpt: '' }, reason: 'new' }), null);
});
