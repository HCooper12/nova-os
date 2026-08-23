// Logging part of a stored recipe. The risk is arithmetic that quietly
// disagrees with itself: rounded grams that no longer add up to the kcal
// line, or a portion field that lets a typo poison a whole day's totals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scaleMacros, portionName, portionLabel, validPortion, PORTIONS } from '../../src/portion.js';

const BAG = { p: 21, c: 60, f: 12, kcal: 432 };

test('his example: a full bag logged as a third and a half', () => {
  assert.deepEqual(scaleMacros(BAG, 1 / 3), { p: 7, c: 20, f: 4, kcal: 144 });
  assert.deepEqual(scaleMacros(BAG, 1 / 2), { p: 11, c: 30, f: 6, kcal: 216 });
  assert.deepEqual(scaleMacros(BAG, 1), BAG, 'a full serving is untouched');
});

test('kcal scales from the recipe, never recomputed from rounded grams', () => {
  // 4/4/9 over the ROUNDED half-portion would give 11*4+30*4+6*9 = 218,
  // inventing 2 kcal the recipe never had. The measured value scales instead.
  const half = scaleMacros(BAG, 0.5);
  assert.equal(half.kcal, 216);
  assert.notEqual(half.kcal, half.p * 4 + half.c * 4 + half.f * 9);
});

test('names say what was eaten, and a full serving stays clean', () => {
  assert.equal(portionName('Chilli bag', 1 / 3), 'Chilli bag (⅓ serving)');
  assert.equal(portionName('Chilli bag', 0.5), 'Chilli bag (½ serving)');
  assert.equal(portionName('Chilli bag', 1), 'Chilli bag', 'no "(1 serving)" noise');
  assert.equal(portionName('Chilli bag', 2), 'Chilli bag (2 serving)');
  assert.equal(portionName('', 0.5), 'Recipe (½ serving)');
});

test('an unusual portion gets an honest multiplier label, not a fake fraction', () => {
  assert.equal(portionLabel(0.4), '0.4×');
  assert.equal(portionLabel(1 / 3), '⅓');
});

test('a portion must be positive and sane — a typo cannot poison the day', () => {
  assert.equal(validPortion(0), false, 'zero would log a phantom entry');
  assert.equal(validPortion(-1), false);
  assert.equal(validPortion(100), false, '100 servings is a typo, not a meal');
  assert.equal(validPortion('abc'), false);
  assert.equal(validPortion(NaN), false);
  assert.equal(validPortion(1 / 3), true);
  assert.equal(validPortion(2), true);
});

test('missing or partial macros degrade to zero rather than NaN in his totals', () => {
  assert.deepEqual(scaleMacros(null, 0.5), { p: 0, c: 0, f: 0, kcal: 0 });
  assert.deepEqual(scaleMacros({ p: 10 }, 0.5), { p: 5, c: 0, f: 0, kcal: 0 });
});

test('every offered portion is valid and uniquely labelled', () => {
  const labels = new Set();
  for (const p of PORTIONS) {
    assert.ok(validPortion(p.factor), `${p.label} must be a valid portion`);
    assert.equal(portionLabel(p.factor), p.label, 'the glyph must round-trip');
    labels.add(p.label);
  }
  assert.equal(labels.size, PORTIONS.length, 'no two portions may share a label');
});
