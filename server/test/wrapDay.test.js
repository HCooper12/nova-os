// WRAP THE DAY — the sentence that says the floor was missed while there is
// still an evening left to fix it. Code counts; no model anywhere in it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapFacts, composeWrap, closerFor, askFor, shouldShowCard, PROTEIN_NOISE_G } from '../lib/wrapDay.js';

// a plain facts object — every test starts from a day that went well
const facts = (over = {}) => ({
  date: '2026-09-08', hour: 19, entries: 4,
  eaten: { kcal: 2100, p: 160, c: 200, f: 70 },
  targets: { kcal: 2540, protein: 159 },
  kcalLeft: 440, proteinShort: 0, floorMet: true,
  dishes: [], fridge: [{ id: 'r1', name: 'Chicken & Rice Bowl', portions: 3 }],
  planNames: ['Chicken & Rice Bowl'], planTicked: true,
  tomorrow: { kind: 'train', name: 'Upper Body' }, weighStaleDays: 1, missing: [],
  ...over,
});

test('the floor is missed and something in the fridge closes it — the sentence the sweep says nobody wrote', () => {
  const { line, closer } = composeWrap(facts({
    eaten: { kcal: 1750, p: 108, c: 160, f: 60 }, kcalLeft: 790, proteinShort: 51, floorMet: false,
    dishes: [
      { id: 'r1', name: 'Chicken & Rice Bowl', macros: { p: 52, kcal: 620 }, inFridge: true, slot: 'Dinner' },
      { id: 'r2', name: 'Beef Burrito Bowl', macros: { p: 48, kcal: 780 }, inFridge: false, slot: 'Dinner' },
    ],
  }));
  assert.match(line, /^1,750 of 2,540 kcal and 108 of 159 g protein today, 790 kcal to spare/);
  assert.match(line, /the floor is 51 g away, and one Chicken & Rice Bowl from the fridge closes it for 620 kcal\./);
  // a missed floor outranks tomorrow's session: it is the thing that repeats
  assert.match(line, /Tomorrow: protein earlier — Chicken & Rice Bowl is 52 g/);
  assert.deepEqual(closer, { name: 'Chicken & Rice Bowl', protein: 52, kcal: 620, inFridge: true, closes: true });
});

test('a cleared floor is said plainly, and going over is said plainly too', () => {
  assert.match(composeWrap(facts()).line, /2,100 of 2,540 kcal and 160 of 159 g protein today, 440 kcal to spare — floor cleared\./);
  const over = composeWrap(facts({ eaten: { kcal: 2890, p: 165 }, kcalLeft: -350 })).line;
  assert.match(over, /350 over — floor cleared\./);
  assert.match(composeWrap(facts({ kcalLeft: 0 })).line, /square on target/);
});

test('with no targets it refuses to judge the day, and points at the Intake', () => {
  const line = composeWrap(facts({ targets: null, kcalLeft: null, proteinShort: null, floorMet: null })).line;
  assert.match(line, /2,100 kcal and 160 g of protein across 4 entries today/);
  assert.match(line, /no targets are set/);
  assert.match(line, /set my numbers/);
});

test('an empty day is not wrapped, and a day with unreadable sources says so', () => {
  assert.match(composeWrap(facts({ entries: 0 })).line, /Nothing is logged today, so there is nothing to wrap/);
  assert.match(composeWrap(facts({ entries: 0, missing: ['your food log'] })).line, /could not read your food log — so there is nothing honest to wrap/);
  assert.match(composeWrap(facts({ missing: ["today's rotation"] })).line, /\(I could not read today's rotation, so this is partial\.\)$/);
});

test('after 9pm the wrap stops offering fixes — the day is done', () => {
  const late = facts({ hour: 21, eaten: { kcal: 1750, p: 108 }, kcalLeft: 790, proteinShort: 51, floorMet: false,
    dishes: [{ id: 'r1', name: 'Chicken & Rice Bowl', macros: { p: 52, kcal: 620 }, inFridge: true, slot: 'Dinner' }] });
  assert.equal(closerFor(late), null);
  assert.match(composeWrap(late).line, /the floor is 51 g away, too late to fix tonight\./);
});

test('a gap smaller than the noise floor is not nagged about', () => {
  const small = facts({ proteinShort: PROTEIN_NOISE_G - 1, floorMet: false, dishes: [{ id: 'r1', name: 'X', macros: { p: 40, kcal: 300 }, inFridge: true }] });
  assert.equal(closerFor(small), null);
  assert.match(composeWrap(small).line, /the floor is 9 g away, and nothing you have on hand closes it\./);
});

test('the closer is the smallest fridge dish that fits the calories — never one that blows them', () => {
  const base = { hour: 18, proteinShort: 40, kcalLeft: 500 };
  assert.equal(closerFor({ ...base, dishes: [{ name: 'Huge', macros: { p: 60, kcal: 1200 }, inFridge: true }] }), null, '1200 kcal is not a fix for 650 of room');
  const pick = closerFor({ ...base, dishes: [
    { name: 'Big Fridge Bowl', macros: { p: 45, kcal: 600 }, inFridge: true },
    { name: 'Small Fridge Pot', macros: { p: 30, kcal: 320 }, inFridge: true },
    { name: 'Uncooked', macros: { p: 50, kcal: 200 }, inFridge: false },
  ] });
  assert.equal(pick.name, 'Big Fridge Bowl', 'fridge first, and one that FINISHES the job beats a smaller one that does not');
  assert.equal(pick.closes, true);
  // when nothing closes it, the one that takes the most off wins — and says so
  const partial = closerFor({ ...base, dishes: [
    { name: 'Small Fridge Pot', macros: { p: 30, kcal: 320 }, inFridge: true },
    { name: 'Snack', macros: { p: 25, kcal: 200 }, inFridge: true },
  ] });
  assert.equal(partial.name, 'Small Fridge Pot');
  assert.equal(partial.closes, false, 'and it says honestly that it only takes 30 g off');
  const uncooked = closerFor({ ...base, dishes: [{ name: 'On the plan', macros: { p: 45, kcal: 500 }, inFridge: false, slot: 'Dinner' }] });
  assert.equal(uncooked.inFridge, false);
  assert.match(composeWrap(facts({ ...base, entries: 3, floorMet: false, dishes: [{ name: 'On the plan', macros: { p: 45, kcal: 500 }, inFridge: false, slot: 'Dinner' }] })).line,
    /On the plan — on today's plan, not ticked — closes it for 500 kcal\./);
});

test('the one thing tomorrow needs is ranked: an empty fridge beats everything, then the floor, then the scales, then training', () => {
  assert.equal(askFor(facts({ fridge: [] })).kind, 'cook');
  assert.match(askFor(facts({ fridge: [] })).text, /the fridge is empty and Chicken & Rice Bowl is on the plan/);
  const shortDay = facts({ floorMet: false, proteinShort: 40, dishes: [
    { name: 'Yoghurt Pouch', macros: { p: 20, kcal: 150 }, inFridge: true },
    { name: 'Steak Bowl', macros: { p: 55, kcal: 700 }, inFridge: true },
  ] });
  assert.equal(askFor(shortDay).kind, 'protein');
  assert.match(askFor(shortDay).text, /Steak Bowl is 55 g/, 'the highest-protein thing he actually owns');
  assert.equal(askFor(facts({ weighStaleDays: 11 })).kind, 'weigh');
  assert.match(askFor(facts({ weighStaleDays: 11 })).text, /11 days ago/);
  assert.equal(askFor(facts({ tomorrow: { kind: 'active-rest', name: 'active rest' } })).text, 'active rest — a walk, not a session.');
  assert.equal(askFor(facts({ tomorrow: { kind: 'rest', name: null } })).kind, 'hold');
  assert.match(askFor(facts({ tomorrow: { kind: 'rest', name: null } })).text, /2,540 kcal, 159 g/);
});

test('the Home card waits for the evening or a ticked plan, and never shows on an empty day', () => {
  assert.equal(shouldShowCard(facts({ entries: 0 })), false);
  assert.equal(shouldShowCard(facts({ hour: 13, planTicked: false })), false);
  assert.equal(shouldShowCard(facts({ hour: 13, planTicked: true })), true, 'the plan is done — the day is effectively wrapped');
  assert.equal(shouldShowCard(facts({ hour: 18, planTicked: false })), true);
});

// ---- the facts themselves, from injected loaders (no vault, no model) ----
const deps = (over = {}) => ({
  loadRecipeData: async () => ({ recipes: [{ id: 'r9', name: 'Tuna Pasta', macros: { p: 45, kcal: 520 } }], profile: { targetKcal: 2540, proteinFloorG: 159 } }),
  loadRotation: async () => ({
    order: ['dinner'], labels: { dinner: 'Dinner' },
    slots: { dinner: { id: 'r1', name: 'Chicken & Rice Bowl', eaten: false, eatenCount: 0 } },
    options: { dinner: [{ id: 'r1', name: 'Chicken & Rice Bowl', macros: { p: 52, kcal: 620 }, eaten: false, portionsLeft: 2 }] },
    portions: { r9: 1 },
  }),
  getToday: async () => ({ entries: [{ macros: { p: 108, c: 160, f: 60, kcal: 1750 } }, { macros: { p: 0, c: 0, f: 0, kcal: 0 } }] }),
  loadExerciseLibrary: async () => ({ exercises: [] }), // the real loader returns a wrapper, not the array
  loadRoutines: async () => ({ routines: [{ id: 'up', name: 'Upper Body' }], schedule: { wednesday: 'up' } }),
  loadRecentDays: async () => [],
  ...over,
});

test('the facts come from his real files — targets, what is uneaten, what is in the fridge, tomorrow', async () => {
  const f = await wrapFacts('/vault', { now: new Date(2026, 8, 8, 19, 30), deps: deps() }); // Tue → tomorrow is Wednesday
  assert.equal(f.date, '2026-09-08');
  assert.equal(f.hour, 19);
  assert.equal(f.entries, 2);
  assert.deepEqual(f.eaten, { kcal: 1750, p: 108, c: 160, f: 60 });
  assert.deepEqual(f.targets, { kcal: 2540, protein: 159 });
  assert.equal(f.kcalLeft, 790);
  assert.equal(f.proteinShort, 51);
  assert.equal(f.floorMet, false);
  assert.deepEqual(f.tomorrow, { kind: 'train', name: 'Upper Body' });
  const rest = await wrapFacts('/vault', { now: new Date(2026, 8, 8, 19, 30), deps: deps({ loadRoutines: async () => ({ routines: [], schedule: { wednesday: 'active-rest' } }) }) });
  assert.deepEqual(rest.tomorrow, { kind: 'active-rest', name: 'active rest' });
  assert.deepEqual(f.planNames, ['Chicken & Rice Bowl']);
  assert.deepEqual(f.fridge, [{ id: 'r9', name: 'Tuna Pasta', portions: 1 }]);
  assert.deepEqual(f.dishes.map((d) => [d.name, d.inFridge]), [['Chicken & Rice Bowl', true], ['Tuna Pasta', true]]);
  assert.deepEqual(f.missing, []);
  assert.match(composeWrap(f).line, /one Chicken & Rice Bowl from the fridge closes it for 620 kcal/);
});

test('a source it cannot read is named, not papered over', async () => {
  const f = await wrapFacts('/vault', {
    now: new Date(2026, 8, 8, 19, 30),
    deps: deps({ loadRotation: async () => { throw new Error('no rotation file'); }, loadRoutines: async () => { throw new Error('no routines'); } }),
  });
  assert.deepEqual(f.missing, ["today's rotation"]);
  assert.equal(f.tomorrow, null);
  assert.deepEqual(f.dishes, []);
  assert.match(composeWrap(f).line, /\(I could not read today's rotation, so this is partial\.\)$/);
});
