// THE WISHLIST PAGE'S MODEL (src/wishlistModel.js, mockup 107). Pure, so no
// server, no Notion and no data directory is touched here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWishlistView, sheetFor, sizeFor, priceLabel, agoLabel } from '../../src/wishlistModel.js';

const NOW = Date.parse('2026-10-30T02:00:00Z');
const it = (id, o = {}) => ({ id, name: id, rawName: id, stars: 0, link: null, store: null, price: null, priority: null, status: 'Considering Purchase', categories: [], notes: null, image: null, ...o });
const src = (items, o = {}) => ({ items, categories: [], sizes: {}, lastSync: '2026-10-30T01:58:00Z', syncing: false, shared: true, reason: null, error: null, ...o });

test('no read yet is a loading state, never an empty one', () => {
  assert.equal(buildWishlistView({ source: null, now: NOW }).state, 'loading');
  assert.equal(buildWishlistView({ source: null, offline: true, now: NOW }).state, 'offline-empty');
});

test('not shared says what to do, as steps, and the Settings path when Notion is not connected', () => {
  const v = buildWishlistView({ source: src([], { shared: false, lastSync: null, reason: 'Share My Shopping Wishlist with the Nova connection in Notion' }), now: NOW });
  assert.equal(v.state, 'not-shared');
  assert.equal(v.syncLine, 'Not read yet');
  assert.equal(v.notice.steps.length, 3);
  assert.match(v.notice.steps[1], /Connections/);
  const c = buildWishlistView({ source: src([], { shared: false, reason: 'Connect Notion in Settings first' }), now: NOW });
  assert.match(c.notice.steps[0], /Settings/);
});

test('his Status groups the page; Purchased folds; an empty group says so', () => {
  const v = buildWishlistView({ source: src([it('a'), it('b', { status: 'Purchased', price: 429 }), it('c', { status: 'Purchased' })]), now: NOW });
  assert.equal(v.syncLine, 'From your Notion list · read 2 min ago');
  assert.deepEqual(v.groups.map((g) => [g.key, g.countLabel]), [['considering', '1'], ['month', 'none']]);
  assert.match(v.groups[1].empty, /This month/);
  assert.equal(v.purchased.fold.title, '2 bought');
  assert.match(v.purchased.fold.preview, /b · \$429/);
  assert.equal(v.purchased.open, false);
});

test('priority leads, then his stars; no priority is no dot, no link is "no link"', () => {
  const v = buildWishlistView({ source: src([it('low', { priority: 'Low' }), it('none'), it('hi1', { priority: 'High', stars: 1 }), it('hi3', { priority: 'High', stars: 3 })]), now: NOW });
  const cards = v.groups[0].cards;
  assert.deepEqual(cards.map((c) => c.id), ['hi3', 'hi1', 'low', 'none']);
  assert.equal(cards[0].starMark, '★★★');
  assert.equal(cards[3].pri, null);
  assert.equal(cards[3].store, 'no link');
  assert.equal(cards[3].price, null, 'no price is shown where his row has none');
});

test('six chips up front, the rest behind Show all; a chip filters', () => {
  const cats = ['A', 'B', 'C', 'D', 'E', 'F'];
  const items = cats.flatMap((c, i) => Array.from({ length: 6 - i }, (_, k) => it(`${c}${k}`, { categories: [c], stars: k === 0 ? 1 : 0 })));
  const v = buildWishlistView({ source: src(items), now: NOW });
  assert.deepEqual(v.chips.map((c) => c.label), ['All', '★ Most wanted', 'A', 'B', 'C', 'D']);
  assert.equal(v.moreCount, 2);
  const f = buildWishlistView({ source: src(items), ui: { cat: 'c:F' }, now: NOW });
  assert.equal(f.groups[0].cards.length, 1);
  assert.ok(f.chips.some((c) => c.key === 'c:F' && c.on), 'a chosen chip from behind Show all stays in view');
  const s = buildWishlistView({ source: src(items), ui: { cat: 'star' }, now: NOW });
  assert.equal(s.groups[0].cards.length, 6);
});

test('a failed read keeps what it had and says why it is old', () => {
  const v = buildWishlistView({ source: src([it('a')], { error: 'Notion took too long', lastSync: '2026-10-29T00:00:00Z' }), now: NOW });
  assert.equal(v.state, 'ready');
  assert.match(v.readError, /Notion took too long/);
});

test('the sheet: his size only when his Sizes name the item; link shown without the query string', () => {
  const sizes = { Shoes: ['US 10'], Pants: ['32 waist'], 'Shirt size': ['Slim fit = medium'] };
  const s = sheetFor(src([it('Air Force 1', { categories: ['Shoes'], link: 'https://www.nike.com/p/af1?utm=x', status: 'Purchasing This Month' })], { sizes }), 'Air Force 1');
  assert.deepEqual(s.size, { label: 'Shoes', lines: ['US 10'] });
  assert.equal(s.linkShown, 'nike.com/p/af1');
  assert.equal(s.thisMonth, true);
  assert.equal(sizeFor({ name: 'Union Bomber Jacket', categories: ['Clothing'] }, sizes), null, 'a jacket matches no label, so no size is guessed');
  assert.equal(sizeFor({ name: 'Linen shirt', categories: ['Clothing'] }, sizes)?.label, 'Shirt size');
});

test('labels', () => {
  assert.equal(priceLabel(429), '$429');
  assert.equal(priceLabel(12.5), '$12.50');
  assert.equal(priceLabel(null), null);
  assert.equal(agoLabel('2026-10-30T01:59:50Z', NOW), 'just now');
  assert.equal(agoLabel(null, NOW), null);
});
