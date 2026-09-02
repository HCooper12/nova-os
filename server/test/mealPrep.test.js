// Meal prep's deterministic helpers — quantities only when honest, the
// off-plan regulars labelled, the SHORT warning's computed fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toShoppingItems, aggregateAmounts, appendRegulars, floorFix } from '../lib/mealPrep.js';

test('amounts: same unit sums; mixed units, a missing amount or a pack form → no number; one line keeps its own', () => {
  assert.equal(aggregateAmounts(['1kg', '500g']), '~1.5kg');
  assert.equal(aggregateAmounts(['400g', '300g']), '700g');
  assert.equal(aggregateAmounts(['10 slices', '2 slices']), '12 slices');
  assert.equal(aggregateAmounts(['1 slice']), '1 slice', 'a single occurrence is verbatim');
  assert.equal(aggregateAmounts(['1 x 250g']), '1 x 250g', 'verbatim even when a pack form');
  assert.equal(aggregateAmounts(['1 x 250g', '1 x 250g']), null, 'two pack forms are not summed — a wrong quantity is worse than none');
  assert.equal(aggregateAmounts(['500g', '1 cup']), null, 'mixed units → nothing');
  assert.equal(aggregateAmounts(['2 tbsp', '1 tbsp']), null, 'spoons are not in the summable set');
  assert.equal(aggregateAmounts([]), null);
  const items = toShoppingItems([
    { qty: '', name: '1kg lean beef patties (cooked, drained)' }, { qty: '500g', name: 'lean beef patties' }, // the parser's object shape, both ways round
    '10 slices Wonder white bread', '2 slices Wonder white bread',
    'Cinnamon, to taste', 'Avocado oil', '— Assembly —', '1 hash brown', 'Hash brown',
  ]);
  const by = Object.fromEntries(items.map((i) => [i.name, i]));
  assert.equal(by['Lean beef patties'].amount, '~1.5kg');
  assert.equal(by['Wonder white bread'].amount, '12 slices');
  assert.equal(by['Cinnamon, to taste'].amount, null);
  assert.equal(by['Hash brown'].amount, null, 'one line with an amount and one without → no total claimed');
  assert.ok(!items.some((i) => /Assembly/.test(i.name)), 'section headings are not ingredients');
  assert.equal(items.filter((i) => i.name === 'Hash brown').length, 1, 'deduped by name');
});

test('off-plan regulars join the list labelled, never duplicating a recipe ingredient', () => {
  const items = [{ name: 'Greek yoghurt', category: 'Dairy & Eggs', amount: '1kg' }];
  const out = appendRegulars(items, [{ name: 'Greek yoghurt', count: 5 }, { name: 'Banana', count: 4 }, { name: 'Works Burger', count: 3 }], { exclude: ['Works Burger', 'Baked Oats'] });
  assert.equal(out.length, 2, 'a chosen recipe he logs as eaten is on-plan, not a regular');
  assert.equal(out[1].name, 'Banana');
  assert.equal(out[1].source, 'off-plan regular ×4');
  assert.ok(out[1].category, 'aisle assigned');
  assert.equal(out[0].source, undefined, 'the recipe ingredient stays unlabelled');
});

test('floorFix: the single swap that closes the most gap — only when it clears it or closes half; otherwise nothing', () => {
  const recipes = [
    { id: 'oats', name: 'Baked Oats', macros: { p: 22 } },
    { id: 'burger', name: 'Works Burger', macros: { p: 52 } },
    { id: 'pasta', name: 'Chicken Caesar Pasta', macros: { p: 46 } },
    { id: 'wrap', name: 'Chicken Wrap', macros: { p: 70 }, alternates: [{ id: 'w2', label: 'double chicken', macros: { p: 95 } }] },
    { id: 'pouch', name: 'Yoghurt pouch', macros: { p: 12 } },
  ];
  const slots = { breakfast: { id: 'oats', name: 'Baked Oats', macros: { p: 22 } }, lunch: { id: 'burger', name: 'Works Burger', macros: { p: 52 } }, snack: { id: 'pouch', name: 'Yoghurt pouch', macros: { p: 12 } } };
  const fix = floorFix({ slots, recipes, gap: 30 });
  assert.equal(fix.slot, 'snack', 'the biggest gain is swapping the 12g snack for the 70g wrap');
  assert.equal(fix.to, 'Chicken Wrap');
  assert.equal(fix.gain, 58);
  assert.equal(fix.clears, true);
  assert.equal(fix.line, 'closest fix: snack → Chicken Wrap (+58g, clears it)');
  // alternates with macros count as candidates for their own slot
  const withWrap = floorFix({ slots: { lunch: { id: 'wrap', name: 'Chicken Wrap', macros: { p: 70 } } }, recipes, gap: 40 });
  assert.equal(withWrap.to, 'Chicken Wrap (double chicken)');
  assert.equal(withWrap.gain, 25);
  assert.equal(withWrap.clears, false);
  assert.match(withWrap.line, /\+25g of the 40g gap/);
  // a swap that closes less than half the gap is noise — say the gap, stop
  assert.equal(floorFix({ slots: { lunch: { id: 'wrap', name: 'Chicken Wrap', macros: { p: 70 } } }, recipes, gap: 60 }), null);
  assert.equal(floorFix({ slots, recipes, gap: 0 }), null);
  assert.equal(floorFix({ slots: {}, recipes, gap: 30 }), null);
});
