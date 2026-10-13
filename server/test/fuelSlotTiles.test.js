import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotationSlotTiles, likelyNow } from '../../src/fuelSummaryFacts.js';

const opt = (id, extra = {}) => ({ id, name: id, p: 40, kcal: 400, focus: false, eaten: false, portionsLeft: null, ...extra });
const SLOTS = [
  { key: 'preworkout', name: 'Pre-workout', options: [] },
  { key: 'breakfast', name: 'Meal 1', options: [opt('smoothie', { focus: true, portionsLeft: 1 }), opt('oats', { p: 48 })] },
  { key: 'lunch', name: 'Meal 2', options: [opt('bowl', { focus: true }), opt('lasagna')] },
  { key: 'dinner', name: 'Meal 3', options: [opt('pasta', { focus: true, portionsLeft: 4 }), opt('burger')] },
];

test('one tile per slot, never one per option', () => {
  const r = rotationSlotTiles(SLOTS);
  assert.equal(r.tiles.length, 4);
  assert.deepEqual(r.tiles.map((t) => t.name || null), [null, 'smoothie', 'bowl', 'pasta']);
  assert.equal(r.tiles[0].empty, true);
  assert.equal(r.tiles[1].count, 2);
  assert.equal(r.tiles[1].alt.name, 'oats');
  assert.equal(r.nextIndex, 1);
});

test('an eaten option is the one shown, ticked, and the slot stops swapping', () => {
  const s = SLOTS.map((x) => (x.key === 'breakfast' ? { ...x, options: [opt('smoothie', { focus: true }), opt('oats', { eaten: true })] } : x));
  const t = rotationSlotTiles(s).tiles[1];
  assert.equal(t.name, 'oats');
  assert.equal(t.eaten, true);
  assert.equal(t.canSwap, false);
});

test('Likely now: the next dish, its swap, then history near this hour', () => {
  const { tiles } = rotationSlotTiles(SLOTS);
  const history = [
    { key: 'slice', name: 'Mini M&M slice', macros: { p: 4, kcal: 210 }, count: 3, lastAt: '2026-10-12 19:40 0004' },
    { key: 'shake', name: 'Protein shake', macros: { p: 24, kcal: 160 }, count: 9, lastAt: '2026-10-12 07:05 0000' },
  ];
  const r = likelyNow({ tiles, history, nowMin: 19 * 60 + 20 });
  assert.deepEqual(r.map((x) => x.name), ['smoothie', 'oats', 'Mini M&M slice']);
  assert.equal(r[2].why, 'last logged at 7:40 pm');
  assert.deepEqual(r.map((x) => x.kind), ['tick', 'swapTick', 'relog']);
});

test('Likely now falls back to recent history, and never repeats a name', () => {
  const r = likelyNow({ tiles: [], history: [
    { key: 'a', name: 'Shake', macros: { p: 24, kcal: 160 }, count: 2, lastAt: '2026-10-12 00:00 0000' },
    { key: 'b', name: 'shake', macros: { p: 24, kcal: 160 }, count: 1, lastAt: '2026-10-11 00:00 0000' },
  ], nowMin: 600 });
  assert.equal(r.length, 1);
  assert.equal(r[0].why, 'logged 2 times');
});
