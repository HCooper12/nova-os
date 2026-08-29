// The arithmetic half of food accuracy. He asked the same pizza twice and
// got 1050 kcal/50g protein, then 940/36g — because the model was RECALLING
// numbers, which is the one thing it cannot do reliably. These tests pin the
// properties that make an answer trustworthy: energy derived from macros,
// weights scaled linearly, and the same input giving the same output.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-nutri-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { kcalFrom, scaleTo, computeFromComponents, ATWATER } = await import('../lib/nutritionFacts.js');

test('energy is DERIVED from the macros, never taken on trust', () => {
  assert.equal(ATWATER.p, 4);
  assert.equal(ATWATER.f, 9);
  assert.equal(kcalFrom({ p: 50, c: 100, f: 30 }), 50 * 4 + 100 * 4 + 30 * 9);
  assert.equal(kcalFrom({}), 0);
  // his own two answers could not BOTH be right; this makes disagreement
  // between macros and kcal impossible by construction
  assert.equal(kcalFrom({ p: 36, c: 100, f: 40 }), 904);
});

test('weights scale linearly, which is what makes a portion correction work', () => {
  const per100 = { p: 11, c: 33, f: 10 };
  assert.deepEqual(scaleTo(per100, 100), { p: 11, c: 33, f: 10 });
  assert.deepEqual(scaleTo(per100, 50), { p: 5.5, c: 16.5, f: 5 });
  assert.deepEqual(scaleTo(per100, 0), { p: 0, c: 0, f: 0 });
  // doubling the weight doubles the food — the property his "refine the
  // size" step needs in order to mean anything
  const a = scaleTo(per100, 450), b = scaleTo(per100, 900);
  assert.equal(+(b.p / a.p).toFixed(3), 2);
});

test('a component with model-supplied per-100g is used but LABELLED as unsourced', async () => {
  // offline-safe: supplying per100g means no network call is needed
  const out = await computeFromComponents([
    { name: 'zzz not a real food zzz', grams: 200, per100g: { p: 10, c: 20, f: 5 } },
  ], { lookup: false });
  assert.equal(out.components.length, 1);
  const c = out.components[0];
  assert.equal(c.macros.p, 20);
  assert.equal(c.macros.kcal, kcalFrom({ p: 20, c: 40, f: 10 }));
  assert.equal(c.sourced, false, 'an unmatched food must not claim a database source');
  assert.match(c.source, /not matched/i);
  assert.equal(out.unsourced, 1);
});

test('the total is the sum of its parts, and says how much of it was sourced', async () => {
  const out = await computeFromComponents([
    { name: 'zzz a zzz', grams: 100, per100g: { p: 10, c: 0, f: 0 } },
    { name: 'zzz b zzz', grams: 100, per100g: { p: 5, c: 10, f: 2 } },
  ], { lookup: false });
  assert.equal(out.macros.p, 15);
  assert.equal(out.macros.c, 10);
  assert.equal(out.macros.f, 2);
  assert.equal(out.macros.kcal, kcalFrom({ p: 15, c: 10, f: 2 }));
  assert.match(out.note, /0 of 2 components matched/);
});

test('junk components are dropped rather than silently counted as zero', async () => {
  const out = await computeFromComponents([
    { name: '', grams: 100, per100g: { p: 9, c: 9, f: 9 } },
    { name: 'zzz real zzz', grams: 0, per100g: { p: 9, c: 9, f: 9 } },
    { name: 'zzz keep zzz', grams: 50, per100g: { p: 10, c: 0, f: 0 } },
  ], { lookup: false });
  assert.equal(out.components.length, 1, 'a nameless or weightless component is not a component');
  assert.equal(out.macros.p, 5);
});

test('nothing resolvable means an honest empty, not a confident zero', async () => {
  const out = await computeFromComponents([]);
  assert.equal(out.components.length, 0);
  assert.equal(out.macros.kcal, 0);
  assert.match(out.note, /no components could be resolved/);
});
