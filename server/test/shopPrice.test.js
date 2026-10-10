// THE PACK RULE (src/shopPrice.js): the need summed from the recipes behind
// a line, every way to buy it, the cheapest pick, and the waste guard (a
// pack that goes off inside 14 days and saves under 50c loses to singles).
// The mockup's three worked examples are the acceptance cases. Pure: no
// store, no network. Every price here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';

const S = await import('../../src/shopPrice.js');

const p = (chain, name, size, price) => ({ chain, id: `${chain}:${name}`, name, size, price });
const ONIONS = [
  p('w', 'Brown Onions Each', 'each', 0.8), p('w', 'Brown Onions Bag about 5', '1kg', 2.2),
  p('c', 'Coles Brown Onions Loose', 'each', 0.85), p('c', 'Coles Brown Onions Bag about 5', '1kg', 2.4),
  p('a', 'Brown Onions Bag about 10', '2kg', 3.49),
];

test('the need is the sum of every recipe amount behind the line', () => {
  const need = S.lineNeed([
    { name: 'brown onion', amount: '½', source: 'Weeknight chilli' },
    { name: 'brown onion', amount: '2', source: 'Beef and onion stew' },
    { name: 'brown onions', amount: '½', source: 'Omelette' },
  ]);
  assert.equal(need.fam, 'n');
  assert.equal(need.q, 3);
  assert.deepEqual(S.itemNeed({ amount: '1kg' }), { fam: 'g', q: 1000 });
  assert.deepEqual(S.itemNeed({ amount: '2 x 400g' }), { fam: 'g', q: 800 });
  assert.deepEqual(S.itemNeed({ amount: '500g', qty: 2 }), { fam: 'g', q: 1000 });
  assert.equal(S.itemNeed({ amount: '1 tsp' }).fam, 'any', 'a teaspoon is not a shop quantity');
  assert.equal(S.itemNeed({}), null, 'no amount: priced as written');
  assert.equal(S.lineNeed([{ amount: '1kg' }, { amount: '2' }]).fam, 'any', 'mixed units do not add up');
});

test('half a brown onion: one single, no bag', () => {
  const d = S.decide({ need: { fam: 'n', q: 0.5 }, products: ONIONS, keep: S.keepFor('brown onion') });
  assert.equal(d.pick.chain, 'w');
  assert.equal(d.pick.size, 1);
  assert.equal(d.pick.count, 1);
  assert.equal(d.pick.total, 0.8);
  assert.match(S.verdict(d, S.keepFor('brown onion')), /^One single at Woolworths\. You need ½; a bag of \d+ would cost/);
  assert.match(S.advice(d, S.keepFor('brown onion')).text, /^One single\. A bag of \d+ would leave/);
});

test('three onions across three meals: the bag, because onions keep a month', () => {
  const keep = S.keepFor('brown onions');
  const d = S.decide({ need: { fam: 'n', q: 3 }, products: ONIONS, keep });
  assert.equal(d.why, 'cheapest');
  assert.equal(d.pick.chain, 'w');
  assert.ok(d.pick.size > 1, 'a bag');
  assert.equal(d.pick.total, 2.2);
  assert.ok(d.pick.approx, 'a bag sold by weight is "about" a count');
  const a = S.advice(d, keep);
  assert.equal(a.tone, 'save');
  assert.match(a.save, /^20c under 3 singles$/);
});

test('two avocados: no bag. The bag saves 20c, but two would go off in three days', () => {
  const keep = S.keepFor('avocados');
  assert.ok(S.perishable(keep));
  const d = S.decide({ need: { fam: 'n', q: 2 }, keep, products: [
    p('w', 'Avocado Hass Each', 'each', 1.9), p('w', 'Avocados Bag 4 pack', '4 pack', 3.6),
    p('c', 'Coles Avocado Each', 'each', 2.1), p('a', 'Avocados 4 pack', '4 pack', 3.99),
  ] });
  assert.equal(d.why, 'waste');
  assert.equal(d.pick.size, 1);
  assert.equal(d.pick.count, 2);
  assert.equal(d.pick.total, 3.8);
  assert.equal(d.cheapest.total, 3.6);
  assert.match(S.verdict(d, keep), /^Two singles at Woolworths\. The bag of 4 is 20c cheaper, and 2 would go off before you used them\.$/);
  const a = S.advice(d, keep);
  assert.equal(a.tone, 'waste');
  assert.match(a.warn, /would go off in 3 days/);
});

test('the margin: a perishable pack that saves 50c or more is still the pick', () => {
  const keep = S.keepFor('avocados');
  const d = S.decide({ need: { fam: 'n', q: 2 }, keep, products: [p('w', 'Avocado Each', 'each', 2.0), p('w', 'Avocados 4 pack', '4 pack', 3.5)] });
  assert.equal(d.why, 'cheapest');
  assert.equal(d.pick.size, 4);
});

test('a frozen or freezing kind never takes the waste guard', () => {
  const keep = S.keepFor('chicken thighs');
  assert.ok(keep.fz);
  const d = S.decide({ need: { fam: 'g', q: 1000 }, keep, products: [
    p('w', 'Chicken Thigh Fillets 1kg', '1kg', 15), p('w', 'Chicken Thigh Fillets 500g', '500g', 8.5),
    p('c', 'Chicken Thigh Fillets 1kg', '1kg', 14), p('a', 'Market Farm Chicken Thigh Fillets 1kg', '1kg', 11.99),
  ] });
  assert.equal(d.pick.chain, 'a');
  assert.equal(d.pick.total, 11.99);
  assert.equal(d.other.chain, 'c');
  assert.equal(S.verdict(d, keep), 'Aldi, $2.01 less than Coles.');
});

test('cheapest across chains, ties named, $0.00 never counted, nothing priced is null', () => {
  const need = { fam: 'n', q: 1 };
  const tie = S.decide({ need, keep: null, products: [p('w', 'Sponges 5 pack', '5 pack', 3.5), p('c', 'Sponges 5 pack', '5 pack', 3.5)] });
  assert.ok(tie.tie);
  assert.match(S.verdict(tie, null), /^The same price at/);
  const zero = S.decide({ need, keep: null, products: [p('w', 'Thing', 'each', 0), p('c', 'Thing', 'each', 2)] });
  assert.equal(zero.pick.chain, 'c', 'a $0.00 read is not free');
  assert.equal(S.decide({ need, keep: null, products: [] }), null);
  assert.equal(S.decide({ need, keep: null, products: [p('w', 'Thing', 'each', 0)] }), null);
  const any = S.decide({ need: { fam: 'any', q: 2 }, keep: null, products: [p('w', 'Smoked Paprika 40g', '40g', 3), p('a', 'Smoked Paprika 40g', '40g', 1.99)] });
  assert.equal(any.pick.chain, 'a');
  assert.equal(any.pick.count, 2, 'priced as written: one product per item');
});

test('pack sizes from the product\'s own words', () => {
  assert.deepEqual([S.packOf('1kg').g, S.packOf('Limes 500g bag').g, S.packOf('1.25L').ml], [1000, 500, 1250]);
  assert.equal(S.packOf('Free Range Eggs 12 Pack').count, 12);
  assert.equal(S.packOf('Kidney Beans 3 x 400g').count, 3);
  assert.equal(S.packOf('Kidney Beans 3 x 400g').g, 1200);
  assert.ok(S.packOf('each').each);
  assert.equal(S.sizeFor({ name: 'Brown Onions Bag', size: '1kg' }, { fam: 'n', q: 3 }, S.keepFor('onion')).size, 6);
  assert.equal(S.sizeFor({ name: 'Lime Cordial', size: '1L' }, { fam: 'n', q: 3 }, S.keepFor('lime')), null, 'a litre is not a count of limes');
});

test('a product answers a line only when it is that thing', () => {
  assert.ok(S.productMatches('brown onion', 'Woolworths Brown Onions Bag 1kg'));
  assert.ok(S.productMatches('chicken thighs', 'Chicken Thigh Fillets 1kg'));
  assert.ok(!S.productMatches('limes', 'Lime Cordial 1L'));
  assert.ok(!S.productMatches('brown onion', 'Red Onions Each'));
  assert.ok(!S.productMatches('brown onion', 'Brown Onion Powder 50g'));
  assert.ok(S.productMatches('smoked paprika', 'Smoked Paprika 40g'), 'asked for by name, a prepared word is fine');
  assert.equal(S.lineKey('Brown Onions '), 'brown onion');
});

test('the words: fractions and money as a cook and a shopper say them', () => {
  assert.deepEqual([S.frac(0.5), S.frac(3), S.frac(2.5), S.frac(0.75)], ['½', '3', '2½', '¾']);
  assert.deepEqual([S.money(0.2), S.money(2.01), S.dollars(11.99)], ['20c', '$2.01', '$11.99']);
  assert.equal(S.ptsWorth(2000), 10);
  assert.match(S.verdictNoPrice({ fam: 'n', q: 0.5 }, S.keepFor('onion')), /buy one single/);
});

test('sold by the kilo: weighed to the need, or by the piece at what one weighs, and always "about"', () => {
  const thigh = S.decide({ need: { fam: 'g', q: 600 }, keep: S.keepFor('chicken thighs'), products: [{ chain: 'a', name: 'Chicken Thigh Fillets per kg', size: 'approx. 0.6 kg per package', price: 15.99, perKg: true }] });
  assert.equal(thigh.pick.total, 9.59);
  assert.ok(thigh.pick.approx);
  assert.equal(thigh.pick.perKgPrice, 15.99);
  const onion = S.decide({ need: { fam: 'n', q: 2 }, keep: S.keepFor('brown onion'), products: [{ chain: 'a', name: 'Brown Onions per kg', size: '', price: 3.49, perKg: true }] });
  assert.equal(onion.pick.count, 2);
  assert.equal(onion.pick.total, 1.26);
  assert.ok(!S.productMatches('brown onion', 'Gravox Brown Onion Liquid Gravy Pouch 165g'), 'live check: gravy is not an onion');
  assert.ok(!S.productMatches('brown onion', 'Coles Brown Onion Shallots Loose'));
  assert.ok(!S.productMatches('limes', 'BROOKDALE Lime Jelly 85g'));
});
