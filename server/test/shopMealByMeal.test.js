// Mockup 118 (his yes, 17 Nov 2026): a shopping line opened meal by meal,
// the ask before a recipe goes on twice, and a tick made with no Mac.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShopView, priceSheet, mealShares } from '../../src/shopModel.js';
import { alreadyOn, onAmount } from '../../src/shopAsk.js';
import { shoppingWithQueued } from '../../src/outboxOverlay.js';

const mince = (id, amount, source, checked = false) => ({ id, name: 'extra lean beef mince', amount, source, category: 'Meat & Protein', checked, qty: 1 });
const ITEMS = [mince('a', '400 g', 'Burger Bowls'), mince('b', '400 g', 'Burger Bowls'), mince('c', '450 g', 'Pizza Bowls'), mince('d', '300g', 'Chilli Bowls', true)];

test('the line opens on each meal: its amount, its copies, its share, and what is bought', () => {
  const v = buildShopView({ list: { items: ITEMS }, prices: null });
  const P = priceSheet(v, [...v._lines.keys()][0]);
  const M = P.meals;
  assert.deepEqual(M.rows.map((r) => [r.name, r.amt, r.allLabel, r.got]), [
    ['Burger Bowls', '400 g × 2', '800 g', false],
    ['Pizza Bowls', '450 g', null, false],
    ['Chilli Bowls', '300 g', null, true],
  ]);
  assert.equal(M.rows[0].slot, 'added twice');
  assert.deepEqual([M.totalLabel, M.leftLabel, M.gotLabel], ['1.55 kg', '1.25 kg', '300 g']);
  assert.ok(Math.abs(M.rows.reduce((t, r) => t + r.s, 0) - 1) < 1e-9, 'the shares make the whole');
});

test('a meal share ticked on its own leaves the rest to price', () => {
  const v = buildShopView({ list: { items: ITEMS }, prices: null });
  const l = [...v._lines.values()][0];
  assert.equal(l.need.q, 1550);
  assert.equal(l.open.q, 1250);
  assert.equal(l.got, false);
});

test('a line he typed has no meal breakdown', () => {
  const v = buildShopView({ list: { items: [{ id: 'e', name: 'eggs', amount: '', source: null, category: 'Dairy & Eggs', checked: false, qty: 2 }] }, prices: null });
  assert.equal(mealShares([...v._lines.values()][0]), null);
});

test('the slot comes from his week when the meal is in it', () => {
  const v = buildShopView({ list: { items: ITEMS }, prices: null });
  const M = mealShares([...v._lines.values()][0], [{ name: 'Pizza Bowls', slot: 'Lunch' }]);
  assert.equal(M.rows[1].slot, 'Lunch');
});

test('adding a recipe asks about the lines already on the list, unticked, for that recipe', () => {
  const items = [
    { id: 1, name: 'extra lean beef mince', amount: '400 g', source: 'Burger Bowls' },
    { id: 2, name: 'cos lettuce', amount: '1', source: 'Burger Bowls', checked: true },
    { id: 3, name: 'brioche buns', amount: '4', source: 'Burger Bowls' },
    { id: 4, name: 'tomatoes', amount: '2', source: 'Pizza Bowls' },
  ];
  const { on, missing } = alreadyOn(items, ['400 g extra lean beef mince', '1 cos lettuce', '4 brioche buns', '2 tomatoes'], 'Burger Bowls');
  assert.deepEqual(on.map((o) => o.item.id), [1, 3]);
  assert.deepEqual(missing, ['1 cos lettuce', '2 tomatoes'], 'a ticked line and another meal\'s line do not count');
  assert.deepEqual(alreadyOn(items, ['400 g extra lean beef mince'], null).on, [], 'a line with no recipe never asks');
  assert.equal(onAmount({ amount: '160 g', qty: 2 }), '160 g × 2');
});

test('each item answers one line, so a recipe on twice is matched twice', () => {
  const items = [{ id: 1, name: 'eggs', amount: '2', source: 'Muffins' }];
  assert.equal(alreadyOn(items, ['2 eggs', '2 eggs'], 'Muffins').missing.length, 1);
});

test('a tick made with no Mac shows as ticked and waiting until the Outbox drains', () => {
  const list = { items: ITEMS };
  const out = shoppingWithQueued(list, [{ id: 'q1', kind: 'shopTick', status: 'queued', payload: { ids: ['c'], checked: true } }]);
  const c = out.items.find((i) => i.id === 'c');
  assert.equal(c.checked, true);
  assert.equal(c.tickQueued, true);
  assert.equal(shoppingWithQueued(list, []), list, 'nothing waiting changes nothing');
});
