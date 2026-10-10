// THE SHOPPING PAGE'S VIEW MODEL (src/shopModel.js) on the invented week
// (src/shopDemo.js): the mockup's sentences, written by code, and the honest
// states: a blocked chain's prices hidden and named, no prices said in words,
// an offer with no end date never shown, a pin that prices only its product.
// Pure: no store, no network. Every figure is invented.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || { location: { search: '' } };
const M = await import('../../src/shopModel.js');
const D = await import('../../src/shopDemo.js');

const view = (variant, extra = {}) => {
  const st = D.demoShopState(variant);
  return M.buildShopView({ list: st.items ? { items: st.items } : null, prices: st.prices, offers: st.offers, rotation: D.demoShopRotation(), recipes: D.demoShopRecipes(), syncedLabel: '9:41', ...extra });
};
const text = (parts) => parts.map((p) => p.text || p.b || '').join('');

test('the week: the news names the cheapest shop by count, the basket splits by shop', () => {
  const v = view('demo');
  assert.match(text(v.head.news), /^Woolworths is cheapest on \d+ of \d+ priced lines\.$/);
  assert.equal(v.head.stat.tone, 'ok');
  assert.match(v.head.stat.text, /^Synced 9:41 · prices read /);
  const legend = v.basket.legend.filter((l) => l.ok);
  assert.equal(legend.length, 3);
  assert.ok(v.basket.foot.split > 0 && v.basket.foot.less > 0);
});

test('a line wanted by several meals is ONE line, its need summed', () => {
  const v = view('demo');
  const limes = v.groups.flatMap((g) => g.rows).find((r) => r.name === 'limes');
  assert.equal(limes.ids.length, 2);
  assert.deepEqual(limes.meta[0], { b: '3', text: 'for 2 meals' });
});

test('a blocked chain: its prices hidden, the status says so with Try again, its legend dashed', () => {
  const v = view('blocked');
  assert.equal(v.head.stat.tone, 'bad');
  assert.match(v.head.stat.text, /^Coles blocked since .* · its prices are hidden$/);
  assert.equal(v.head.stat.retry, 'c');
  assert.deepEqual(v.basket.legend.find((l) => l.chain === 'c'), { chain: 'c', name: 'Coles', ok: false, why: 'blocked' });
  const cells = v.groups.flatMap((g) => g.rows).map((r) => r.cell).filter((c) => c.kind === 'price');
  assert.ok(cells.every((c) => !c.chains.includes('c')), 'no Coles price is shown');
});

test('no prices: no dollar figure anywhere, the need still decides', () => {
  const v = view('noprices');
  assert.equal(v.basket.noPrices, true);
  assert.equal(v.basket.foot, null);
  assert.ok(v.groups.flatMap((g) => g.rows).every((r) => r.cell.kind === 'none'));
  assert.match(text(v.head.news), /to get, across \d+ aisles\./);
  assert.match(M.priceSheet(v, 'brown onion').verdict, /buy one single/);
});

test('offers: a rate comes to an amount on what the line costs; no end date is never shown; unmatched lines say how many', () => {
  const v = view('demo');
  const peas = [...v._cards.values()].find((c) => /frozen peas/.test(c.on));
  assert.equal(peas.mult, 10);
  assert.equal(peas.pts, 30, '10x on the $3.00 Coles price');
  assert.equal(v.points.total, 2000 + 1000 + 30);
  const worst = view('worst');
  assert.ok(![...worst._cards.values()].some((c) => /no end date/.test(c.on)));
  assert.ok(worst.points.cards.length + worst.points.gifts.length >= 14);
});

test('loading, offline with nothing, and an empty list each say so', () => {
  assert.equal(view('loading').state, 'loading');
  assert.equal(M.buildShopView({ list: null, offline: true }).state, 'offline-empty');
  const e = view('empty');
  assert.equal(e.state, 'empty');
  assert.equal(text(e.head.news), 'Nothing to get.');
  const off = view('offline', { offline: true, outboxCount: 1 });
  assert.equal(off.head.stat.tone, 'off');
  assert.match(off.head.stat.text, /^Offline · the list as of 9:41 · 1 change waiting in the Outbox$/);
});

test('a pin prices only the one he buys', () => {
  const st = D.demoShopState('demo');
  st.prices.pins = { 'beef mince': { chain: 'w', id: 'w-woolworths-lean-beef-mince-5-fat', name: 'Woolworths Lean Beef Mince 5% Fat' } };
  const v = M.buildShopView({ list: { items: st.items }, prices: st.prices, offers: st.offers });
  const mince = v.groups.flatMap((g) => g.rows).find((r) => r.name === 'beef mince');
  assert.equal(mince.cell.total, 13);
  assert.deepEqual(mince.cell.chains, ['w']);
  assert.ok(mince.meta.some((m) => m.pin));
});
