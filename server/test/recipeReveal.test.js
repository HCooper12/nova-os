// THE IMAGE REVEAL'S "JUST IMPORTED" (src/motion/recipeReveal.js). Pinned so
// the slats only ever open over a recipe his own inbox says a reel filed
// minutes ago: never an old one, never a page's, never one he typed in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { importedAt, revealFor, REVEAL_WINDOW_MS } from '../../src/motion/recipeReveal.js';

const NOW = Date.parse('2026-10-15T09:00:00Z');
const filed = (over = {}) => ({
  id: 'c1', status: 'filed', filedAt: new Date(NOW - 5 * 60_000).toISOString(),
  decision: { route: 'recipe', payload: { name: 'Chicken rice bowl' } },
  undoData: { route: 'recipe', recipeId: 'r1' },
  ...over,
});
const reel = { url: 'https://www.instagram.com/reel/abc', label: 'Instagram', reel: true };

test('a recipe filed from his inbox minutes ago is just imported', () => {
  assert.equal(importedAt([filed()], 'r1', NOW), NOW - 5 * 60_000);
  assert.deepEqual(revealFor({ inboxItems: [filed()], recipeId: 'r1', source: reel, photoUrl: 'blob:x', now: NOW }), { chip: 'From a reel' });
});

test('outside the window, another recipe, or not filed: no reveal', () => {
  assert.equal(importedAt([filed({ filedAt: new Date(NOW - REVEAL_WINDOW_MS - 1000).toISOString() })], 'r1', NOW), null);
  assert.equal(importedAt([filed()], 'r2', NOW), null);
  assert.equal(importedAt([filed({ status: 'pending' })], 'r1', NOW), null);
  assert.equal(importedAt([filed({ status: 'undone' })], 'r1', NOW), null);
  assert.equal(importedAt([filed({ decision: { route: 'note' } })], 'r1', NOW), null);
  // a stamp from the future is not "just now"
  assert.equal(importedAt([filed({ filedAt: new Date(NOW + 60_000).toISOString() })], 'r1', NOW), null);
  assert.equal(importedAt(null, 'r1', NOW), null);
});

test('only a reel, and only with a photo to reveal', () => {
  const base = { inboxItems: [filed()], recipeId: 'r1', now: NOW };
  assert.equal(revealFor({ ...base, source: { ...reel, reel: false }, photoUrl: 'blob:x' }), null);
  assert.equal(revealFor({ ...base, source: null, photoUrl: 'blob:x' }), null);
  assert.equal(revealFor({ ...base, source: reel, photoUrl: null }), null);
});
