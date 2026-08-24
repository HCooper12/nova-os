// A tweak can now carry photos of a DIFFERENT ingredient — his ask: swap in
// a substitute (protein powder, a different bread, whatever) and have Nova
// read its actual label rather than guess. These tests pin the prompt's
// honesty rules (read the label, don't invent one) and that the text-only
// path is byte-for-byte unchanged when no photos are attached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../lib/tweakRecipe.js';

const RECIPE = {
  name: 'Protein Pancakes',
  macros: { p: 30, c: 40, f: 8, kcal: 350 },
  ingredients: [{ name: '2 whole eggs' }, { name: '1 scoop vanilla whey' }],
  method: ['Blend everything', 'Cook on a hot pan'],
};

test('no photos: the prompt is IDENTICAL to before this feature existed', () => {
  const withEmptyArray = buildPrompt(RECIPE, 'cut the carbs', null, []);
  const withNoArgAtAll = buildPrompt(RECIPE, 'cut the carbs', null);
  assert.equal(withEmptyArray, withNoArgAtAll);
  assert.ok(!withEmptyArray.includes('Photo path'), 'no photo section leaks in when nothing was attached');
});

test('one photo: the model is told to read a label as ground truth, not guess', () => {
  const prompt = buildPrompt(RECIPE, 'swap in this instead', null, ['/tmp/nova-tweak/abc/photo-1.jpg']);
  assert.match(prompt, /1 photo/);
  assert.match(prompt, /nutrition label is visible, read it precisely/);
  assert.match(prompt, /use its per-serving values as ground truth/);
  assert.match(prompt, /Photo path\(s\):\n- \/tmp\/nova-tweak\/abc\/photo-1\.jpg/);
});

test('multiple photos: plural wording, every path listed', () => {
  const prompt = buildPrompt(RECIPE, 'swap', null, ['/tmp/a.jpg', '/tmp/b.jpg']);
  assert.match(prompt, /2 photos/);
  assert.match(prompt, /- \/tmp\/a\.jpg/);
  assert.match(prompt, /- \/tmp\/b\.jpg/);
});

test('kJ-to-kcal conversion guidance survives into the image path (AU labels)', () => {
  const prompt = buildPrompt(RECIPE, 'swap', null, ['/tmp/label.jpg']);
  assert.match(prompt, /convert kJ to kcal by dividing by 4\.184/);
});

test('a refinement (prior on screen) plus a photo carries BOTH sections', () => {
  const prior = { label: 'Lower carb version', macros: { p: 28, c: 20, f: 10, kcal: 300 }, ingredients: ['2 whole eggs'], method: [] };
  const prompt = buildPrompt(RECIPE, 'now swap in this protein powder', prior, ['/tmp/whey.jpg']);
  assert.match(prompt, /He is REFINING a version you already proposed/);
  assert.match(prompt, /Photo path\(s\):\n- \/tmp\/whey\.jpg/);
  assert.match(prompt, /now swap in this protein powder/);
});

test('the scale-to-quantity-actually-used rule is present, so a whole pack is never assumed', () => {
  const prompt = buildPrompt(RECIPE, 'swap', null, ['/tmp/label.jpg']);
  assert.match(prompt, /scale a label's per-serving numbers to the amount actually used, not the whole pack/);
});
