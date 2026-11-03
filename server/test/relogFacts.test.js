import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAmount, amountName, amountLabel, amountMacros, stepAmount, amountChips, buildRelog,
  regulars, usualNow, searchFoods, whenShort, dayHeading, validAmount, usedHint,
} from '../../src/relogFacts.js';

const M = (p, c, f, kcal) => ({ p, c, f, kcal });

test('a count in the name makes a count food; grams and a bare (4) do not', () => {
  assert.deepEqual(parseAmount('Pringles Salt & Vinegar (1 crisp)'), { base: 'Pringles Salt & Vinegar', kind: 'count', amount: 1, unit: 'crisp', sep: 'paren' });
  assert.deepEqual(parseAmount('Maltesers (3 balls)'), { base: 'Maltesers', kind: 'count', amount: 3, unit: 'ball', sep: 'paren' });
  assert.deepEqual(parseAmount('Oreo BTS limited edition (2 cookies)').unit, 'cookie');
  assert.equal(parseAmount('Crisp Power Sea Salt protein pretzel (1 piece) (8× serving)').amount, 8);
  assert.deepEqual(parseAmount('White sandwich bread (high fibre), 3 slices'), { base: 'White sandwich bread (high fibre)', kind: 'count', amount: 3, unit: 'slice', sep: 'comma' });
  assert.equal(parseAmount('YoPRO 20g Perform Mixed Berries pouch (175g)').kind, 'serving');
  assert.equal(parseAmount("Tian's BBQ Mallow (40g pack)").kind, 'serving');
  assert.equal(parseAmount('Coles Crumbed Chicken Tenders (4) with sourdough and mozzarella').kind, 'serving');
  assert.deepEqual(parseAmount('Chilli bag (⅓ serving)'), { base: 'Chilli bag', kind: 'serving', amount: 1 / 3 });
  assert.deepEqual(parseAmount('Easy Meal Prep Lasagna'), { base: 'Easy Meal Prep Lasagna', kind: 'serving', amount: 1 });
});

test('twelve crisps is one entry with its own name and macros (frame 4)', () => {
  const food = { base: 'Pringles Salt & Vinegar', kind: 'count', unit: 'crisp', sep: 'paren', unitMacros: M(0.04, 0.58, 0.28, 5) };
  assert.equal(amountName(food, 12), 'Pringles Salt & Vinegar (12 crisps)');
  assert.equal(amountName(food, 1), 'Pringles Salt & Vinegar (1 crisp)');
  assert.equal(amountLabel(food, 12), '12 crisps');
  assert.deepEqual(amountMacros(food, 12), { p: 0.5, c: 7, f: 3.4, kcal: 60 });
  assert.equal(stepAmount(food, 12, 1), 13);
  assert.equal(stepAmount(food, 1, -1), 1);
  assert.equal(validAmount(food, 150), true);
  assert.equal(validAmount(food, 0), false);
});

test('half a lasagna (frame 5), and servings step through the recipe fractions', () => {
  const food = { base: 'Easy Meal Prep Lasagna', kind: 'serving', unitMacros: M(49.2, 38.4, 12.2, 456) };
  assert.equal(amountName(food, 0.5), 'Easy Meal Prep Lasagna (½ serving)');
  assert.equal(amountName(food, 2), 'Easy Meal Prep Lasagna (2 servings)');
  assert.equal(amountName(food, 1), 'Easy Meal Prep Lasagna');
  assert.deepEqual(amountMacros(food, 0.5), { p: 24.6, c: 19.2, f: 6.1, kcal: 228 });
  assert.equal(stepAmount(food, 0.5, 1), 2 / 3);
  assert.equal(stepAmount(food, 1, 1), 1.5);
  assert.equal(stepAmount(food, 0.25, -1), 0.25);
  assert.deepEqual(amountChips(food).whole, [1, 1.5, 2]);
  assert.equal(parseAmount(amountName(food, 0.5)).amount, 0.5);
  assert.equal(parseAmount(amountName(food, 2)).amount, 2);
});

// his real log, shaped as /food-log/recent returns it
const DAYS = [
  { date: '2026-10-19', entries: [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: 'Pringles Salt & Vinegar (1 crisp)', time: `22:${String(40 + i).padStart(2, '0')}`, macros: M(0.04, 0.58, 0.28, 5) })),
  ] },
  { date: '2026-11-01', entries: [
    { id: 'a', name: 'Rice cakes with banana and honey', time: '10:35', macros: M(2, 43, 1, 189) },
    ...Array.from({ length: 4 }, (_, i) => ({ id: `t${i}`, name: "Fry's Turkish Delight Chocolate Jellies (1 piece)", time: '13:34', macros: M(0.2, 3.7, 0.7, 22) })),
    { id: 's1', name: "Allen's Speckled Snakes (1 snake)", time: '13:57', macros: M(0.3, 6.9, 0.1, 31) },
    { id: 's2', name: "Allen's Speckled Snakes (1 snake)", time: '13:57', macros: M(0.3, 6.9, 0.1, 31) },
    { id: 'l', name: 'Easy Meal Prep Lasagna', time: '17:14', macros: M(49.2, 38.4, 12.2, 456), source: 'rotation' },
  ] },
  { date: '2026-10-30', entries: [
    { id: 'z1', name: 'Crisp Power Sea Salt protein pretzel (1 piece) (4× serving)', time: '23:06', macros: M(4, 0, 0, 16) },
  ] },
  { date: '2026-10-31', entries: [
    { id: 'z2', name: 'Crisp Power Sea Salt protein pretzel (1 piece)', time: '11:12', macros: M(1, 0, 0, 4) },
    { id: 'r1', name: 'Creamy sun-dried tomato rigatoni', macros: M(26, 74, 15, 531) },
  ] },
  { date: '2026-11-03', entries: [
    { id: 'c', name: 'Cheesy Pizza Bowls', time: '22:02', macros: M(51, 36, 17, 489) },
  ] },
];
const NOW = new Date('2026-11-03T22:44:00');

test('the rotation is left out; everything else is newest first, one food per row', () => {
  const r = buildRelog({ days: DAYS, rotationNames: ['Easy Meal Prep Lasagna', 'Rice cakes with banana and honey'], now: NOW });
  const names = r.foods.map((f) => f.base);
  assert.equal(names[0], 'Cheesy Pizza Bowls');
  assert.ok(!names.includes('Easy Meal Prep Lasagna'), 'a rotation dish is not in Log again');
  assert.ok(!names.includes('Rice cakes with banana and honey'));
  const pretzel = r.foods.filter((f) => f.base.startsWith('Crisp Power'));
  assert.equal(pretzel.length, 1, 'the pretzel portions are one food');
  assert.equal(pretzel[0].last.amount, 1);
  assert.equal(pretzel[0].unitMacros.kcal, 4);
  // a dish that LEFT the rotation comes back into Log again
  const r2 = buildRelog({ days: DAYS, rotationNames: [], now: NOW });
  assert.ok(r2.foods.some((f) => f.base === 'Easy Meal Prep Lasagna'));
});

test('a retro entry with no time sorts after the timed one before it, and shows no time', () => {
  const r = buildRelog({ days: DAYS, now: NOW });
  const rig = r.foods.find((f) => f.base === 'Creamy sun-dried tomato rigatoni');
  assert.equal(rig.last.time, null);
  const pz = r.foods.find((f) => f.base.startsWith('Crisp Power'));
  assert.ok(rig.last.at > pz.last.at);
  assert.equal(whenShort(rig.last, '2026-11-03'), 'Sat');
});

test('a day is groups within ten minutes, and the same food in a group is one row with its total', () => {
  const r = buildRelog({ days: DAYS, now: NOW });
  const nov1 = r.days.find((d) => d.date === '2026-11-01');
  const rows = nov1.groups.flatMap((g) => g.rows.map((x) => [x.food.base, x.amount, x.entries]));
  assert.deepEqual(rows.find((x) => x[0].startsWith("Fry's")), ["Fry's Turkish Delight Chocolate Jellies", 4, 4]);
  assert.deepEqual(rows.find((x) => x[0].startsWith("Allen's")), ["Allen's Speckled Snakes", 2, 2]);
  assert.equal(nov1.groups.length, 4, '10:35, 13:34, 13:57 and 17:14 are four groups');
  assert.equal(nov1.groups[0].from, '17:14', 'newest group first');
  const oct19 = r.days.find((d) => d.date === '2026-10-19');
  assert.equal(oct19.groups.length, 1);
  assert.equal(oct19.groups[0].rows[0].amount, 10, 'his ten separate crisps read as one row of ten');
});

test('the counts he uses are day totals; regulars count entries; usual now is two days within the hour', () => {
  const r = buildRelog({ days: DAYS, now: NOW });
  const pr = r.foods.find((f) => f.base.startsWith('Pringles'));
  assert.deepEqual(amountChips(pr), { counts: [10, 12, 15, 20, 25], used: [10] });
  const reg = regulars(r.foods, NOW);
  assert.equal(reg[0].food.base, 'Pringles Salt & Vinegar');
  assert.equal(reg[0].count, 10);
  // ten crisps on one evening is one day, not a habit
  assert.equal(usualNow(pr, new Date('2026-11-04T22:30:00')), false);
  const two = { occ: [{ date: '2026-10-30', time: '22:10' }, { date: '2026-11-01', time: '22:50' }] };
  assert.equal(usualNow(two, new Date('2026-11-04T22:30:00')), true);
  assert.equal(usualNow(pr, new Date('2026-11-04T09:00:00')), false);
});

test('search finds the middle of a word, newest first', () => {
  const r = buildRelog({ days: DAYS, now: NOW });
  assert.deepEqual(searchFoods(r.foods, 'retz').map((f) => f.base), ['Crisp Power Sea Salt protein pretzel']);
  assert.deepEqual(searchFoods(r.foods, 'izza').map((f) => f.base), ['Cheesy Pizza Bowls']);
  assert.deepEqual(searchFoods(r.foods, ''), []);
});

test('day headings and short whens', () => {
  assert.deepEqual(dayHeading('2026-11-03', '2026-11-03'), { label: 'Today', date: 'Tue 3 Nov' });
  assert.deepEqual(dayHeading('2026-11-02', '2026-11-03'), { label: 'Yesterday', date: 'Mon 2 Nov' });
  assert.deepEqual(dayHeading('2026-11-01', '2026-11-03'), { label: 'Sunday', date: '1 Nov' });
  assert.equal(whenShort({ date: '2026-11-03', time: '22:02' }, '2026-11-03'), 'Today 22:02');
  assert.equal(whenShort({ date: '2026-11-02', time: '22:21' }, '2026-11-03'), 'Yest. 22:21');
});

test('the tray says when he used his counts, and that he logs this one a unit at a time', () => {
  const r = buildRelog({ days: DAYS, now: NOW });
  const pr = r.foods.find((f) => f.base.startsWith('Pringles'));
  assert.equal(usedHint(pr), '10 is the count you logged on 19 Oct');
  assert.equal(pr.oneAtATime, true);
  const td = r.foods.find((f) => f.base.startsWith("Fry's"));
  assert.equal(td.oneAtATime, true);
  const sn = r.foods.find((f) => f.base.startsWith("Allen's"));
  assert.equal(sn.oneAtATime, false, 'two snakes is not a habit of ones');
});
