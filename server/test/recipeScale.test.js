// Scaling a recipe to the servings he is cooking (src/recipeScale.js, shared
// by the server and the Fuel screen). His ask, 29 Sep: a recipe page whose
// servings he can scale, like the Osta reel. Pure module: no vault, no data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, scaleLine, scaleRecipe, servingsOf, formatQuarter } from '../../src/recipeScale.js';

const pick = (a) => ({ qty: a.qty, unit: a.unit, rest: a.rest });

test('parseAmount reads the leading amount of every shape his lines take', () => {
  assert.deepEqual(pick(parseAmount('240g')), { qty: 240, unit: 'g', rest: '' });
  assert.deepEqual(pick(parseAmount('240 g oats')), { qty: 240, unit: 'g', rest: 'oats' });
  assert.deepEqual(pick(parseAmount('1.5 kg beef mince')), { qty: 1.5, unit: 'kg', rest: 'beef mince' });
  assert.deepEqual(pick(parseAmount('700ml milk')), { qty: 700, unit: 'ml', rest: 'milk' });
  assert.deepEqual(pick(parseAmount('1/2 cup oats')), { qty: 0.5, unit: 'cup', rest: 'oats' });
  assert.deepEqual(pick(parseAmount('1 1/2 cups milk')), { qty: 1.5, unit: 'cups', rest: 'milk' });
  assert.deepEqual(pick(parseAmount('½ tsp salt')), { qty: 0.5, unit: 'tsp', rest: 'salt' });
  assert.deepEqual(pick(parseAmount('2 x 400g cans chickpeas')), { qty: 2, unit: null, rest: '400g cans chickpeas' });
  assert.equal(parseAmount('2 x 400g cans chickpeas').times, true);
  assert.deepEqual(pick(parseAmount('3 ripe bananas')), { qty: 3, unit: null, rest: 'ripe bananas' });
  assert.deepEqual(pick(parseAmount('43g kinder bueno (FROZEN for 4 hours)')), { qty: 43, unit: 'g', rest: 'kinder bueno (FROZEN for 4 hours)' });
  assert.deepEqual(pick(parseAmount('salt')), { qty: null, unit: null, rest: 'salt' });
  assert.equal(parseAmount('salt').raw, 'salt');
});

test('an egg is the thing counted, never a unit; words that start like units are not units', () => {
  assert.deepEqual(pick(parseAmount('2 eggs')), { qty: 2, unit: null, rest: 'eggs' });
  assert.deepEqual(pick(parseAmount('2 garlic cloves')), { qty: 2, unit: null, rest: 'garlic cloves' });
  assert.deepEqual(pick(parseAmount('2 cloves garlic')), { qty: 2, unit: 'cloves', rest: 'garlic' });
  assert.deepEqual(pick(parseAmount('1 large egg')), { qty: 1, unit: null, rest: 'large egg' });
  assert.deepEqual(pick(parseAmount('2 tinned tomatoes')), { qty: 2, unit: null, rest: 'tinned tomatoes' });
  assert.deepEqual(pick(parseAmount('1 scoop whey')), { qty: 1, unit: 'scoop', rest: 'whey' });
  assert.deepEqual(pick(parseAmount('3 slices bread')), { qty: 3, unit: 'slices', rest: 'bread' });
  // a percentage names the product ("0% Greek yogurt"), it is not an amount
  assert.equal(parseAmount('2% milk').qty, null);
  assert.equal(scaleLine('0% Greek yogurt', 2), '0% Greek yogurt');
});

test('grams and millilitres: whole numbers, and the nearest 5 from 100 up', () => {
  assert.equal(scaleLine('240g oats', 1.5), '360g oats');
  assert.equal(scaleLine('240 g oats', 1.5), '360 g oats', 'his spacing is kept');
  assert.equal(scaleLine('43g kinder bueno (FROZEN for 4 hours)', 1.5), '65g kinder bueno (FROZEN for 4 hours)', 'the parenthetical is verbatim');
  assert.equal(scaleLine('700ml milk', 0.5), '350ml milk');
  assert.equal(scaleLine('121g rice', 3), '365g rice', '363 → nearest 5');
  assert.equal(scaleLine('15g cocoa', 1 / 3), '5g cocoa');
});

test('kilograms and litres: two decimals, trailing zeros trimmed', () => {
  assert.equal(scaleLine('1.5 kg beef mince', 2), '3 kg beef mince');
  assert.equal(scaleLine('1.5 kg beef mince', 1.5), '2.25 kg beef mince');
  assert.equal(scaleLine('1 l stock', 0.5), '0.5 l stock');
});

test('cups, spoons and counts: the nearest quarter as ¼ ½ ¾ and mixed numbers, never 1.5', () => {
  assert.equal(scaleLine('1 cup milk', 1.5), '1½ cups milk');
  assert.equal(scaleLine('1 1/2 cups milk', 2), '3 cups milk');
  assert.equal(scaleLine('1 1/2 cups milk', 0.5), '¾ cup milk', 'the unit follows the number');
  assert.equal(scaleLine('½ tsp salt', 2), '1 tsp salt');
  assert.equal(scaleLine('1/2 cup oats', 1.5), '¾ cup oats');
  assert.equal(scaleLine('3 ripe bananas', 1.5), '4½ ripe bananas');
  assert.equal(scaleLine('1 egg', 0.5), '½ egg');
  assert.equal(scaleLine('2 cloves garlic', 0.5), '1 clove garlic');
  assert.equal(scaleLine('2-3 tbsp honey', 2), '4-6 tbsp honey', 'a range scales at both ends');
  assert.doesNotMatch(scaleLine('1 cup milk', 1.5), /\d\.\d/);
  assert.equal(formatQuarter(0.1), '¼', 'never rounds a real amount down to nothing');
});

test('2 x 400g cans: the count scales, the can stays a 400 g can', () => {
  assert.equal(scaleLine('2 x 400g cans chickpeas', 2), '4 x 400g cans chickpeas');
  assert.equal(scaleLine('2 x 400g cans chickpeas', 1.5), '3 x 400g cans chickpeas');
});

test('no amount is left alone, and factor 1 is the exact original line', () => {
  assert.equal(scaleLine('salt', 3), 'salt');
  assert.equal(scaleLine('Juice of a lime', 2), 'Juice of a lime');
  for (const l of ['240 g oats', '1 1/2 cups milk', '  2 x 400g cans ', '1.50 kg beef', '½ tsp salt', 'salt']) {
    assert.equal(scaleLine(l, 1), l, `factor 1 leaves "${l}" byte for byte`);
  }
});

test('servingsOf: the Serves count first, else the number that opens Makes', () => {
  assert.equal(servingsOf({ servings: 3, makes: '6 jars' }), 3);
  assert.equal(servingsOf({ makes: '6 jars' }), 6);
  assert.equal(servingsOf({ makes: '4 servings' }), 4);
  assert.equal(servingsOf({ makes: '14 sliders = 7 meals' }), 14);
  assert.equal(servingsOf({ makes: 'serves 4' }), 4);
  assert.equal(servingsOf({ makes: 'Makes 8 big slices' }), 8);
  assert.equal(servingsOf({ makes: '4 servings | *Cold meal — no reheating required*' }), 4);
  assert.equal(servingsOf({ makes: '1 batch of brownies' }), null, 'a batch is not a portion count');
  assert.equal(servingsOf({ makes: 'Two bowls' }), null);
  assert.equal(servingsOf({ makes: null }), null);
  assert.equal(servingsOf({ servings: null, makes: null }), null);
  assert.equal(servingsOf(null), null);
});

test('scaleRecipe: factor = servings ÷ what it makes; group labels and unknown bases stay put', () => {
  const recipe = {
    makes: '6 jars',
    ingredients: [{ qty: '', name: '240 g oats' }, { qty: '', name: '— Topping —', group: true }, { qty: '', name: '3 ripe bananas' }, { qty: '', name: 'salt' }],
  };
  const out = scaleRecipe(recipe, 9);
  assert.equal(out.factor, 1.5);
  assert.deepEqual(out.lines, ['360 g oats', '— Topping —', '4½ ripe bananas', 'salt']);
  assert.deepEqual(scaleRecipe(recipe, 6).lines, ['240 g oats', '— Topping —', '3 ripe bananas', 'salt']);
  // a recipe that does not say how many it makes cannot be scaled honestly
  const unknown = scaleRecipe({ makes: '1 batch of brownies', ingredients: [{ qty: '', name: '2 bananas' }] }, 4);
  assert.deepEqual(unknown, { factor: 1, lines: ['2 bananas'] });
});
