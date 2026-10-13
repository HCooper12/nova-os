import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuelRead, readScore, planWords } from '../../src/fuelRead.js';

const T = { proteinTarget: 150, kcalTarget: 2200 };

test('nothing logged: no read, no score, no facts', () => {
  const r = fuelRead({ logged: 0, ...T });
  assert.equal(r.state, 'empty');
  assert.equal(r.score, null);
  assert.deepEqual(r.facts, []);
});

test('mid-day is projected from the uneaten rotation, never scored as under-eaten', () => {
  const r = fuelRead({ logged: 3, p: 132, kcal: 1605, f: 52, c: 140, ...T,
    rest: [{ label: 'Meal 3', p: 46, kcal: 494, f: 16, c: 41 }, { label: 'Snack', p: 1, kcal: 4, f: 0, c: 1 }] });
  assert.equal(r.state, 'partial');
  assert.equal(r.plan, 'Meal 3 and Snack');
  assert.match(r.news, /^On track\. Meal 3 and Snack take protein to 179 g and calories to 2,103\.$/);
  assert.equal(r.score.projected, true);
  assert.equal(r.score.value, readScore({ p: 179, kcal: 2103 }, T));
  const prot = r.facts.find((x) => x.key === 'p');
  assert.equal(prot.value, 132);
  assert.equal(prot.sub, '18 g to go · 179 g with Meal 3 and Snack');
  assert.ok(prot.then > prot.now, 'the planned part is drawn beyond what is logged');
});

test('a finished day reads what happened, with a final score', () => {
  const r = fuelRead({ logged: 4, p: 96, kcal: 2840, f: 131, c: 262, ...T, rest: [] });
  assert.equal(r.state, 'done');
  assert.equal(r.news, 'Protein stopped 54 g short and calories ran 640 over.');
  assert.equal(r.score.projected, false);
  assert.deepEqual(r.dots, ['warn', 'warn']);
});

test('a good finished day says so', () => {
  const r = fuelRead({ logged: 4, p: 178, kcal: 2099, f: 68, ...T, rest: [] });
  assert.equal(r.news, 'Protein cleared the floor and calories landed 101 from target.');
  assert.deepEqual(r.dots, ['good', 'good']);
});

test('fat is a fact, never a verdict (his profile has no fat target)', () => {
  const r = fuelRead({ logged: 2, p: 80, kcal: 1000, f: 60, ...T, rest: [] });
  const fat = r.facts.find((x) => x.key === 'f');
  assert.equal(fat.ok, null);
  assert.equal(r.dots.length, 2);
  assert.equal(fat.sub, '54% of the day\'s calories');
});

test('no targets: no verdicts and no score, never a zero', () => {
  const r = fuelRead({ logged: 1, p: 30, kcal: 400, f: 10, proteinTarget: null, kcalTarget: null });
  assert.equal(r.score, null);
  assert.deepEqual(r.dots, []);
  assert.equal(r.facts.length, 1);
});

test('the score is the published formula', () => {
  assert.equal(readScore({ p: 150, kcal: 2200 }, T), 100);
  assert.equal(readScore({ p: 75, kcal: 2200 }, T), 75);
  assert.equal(readScore({ p: 150, kcal: 3300 }, T), 75);
  assert.equal(readScore({ p: 150, kcal: 2200 }, { proteinTarget: 150, kcalTarget: null }), null);
});

test('plans read as a sentence', () => {
  assert.equal(planWords(['Meal 3']), 'Meal 3');
  assert.equal(planWords(['Meal 2', 'Meal 3', 'Snack']), 'Meal 2, Meal 3 and Snack');
});
