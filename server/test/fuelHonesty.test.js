// TWO THINGS FUEL SAID THAT WERE NOT TRUE (the Fuel audit, 27 Sep 2026).
//
// Finding 3: the strip under the composer read "N KCAL OFF-PLAN" over the
// whole day's sum, and a ticked rotation meal writes into the food log too
// (`source: 'rotation'`), so the plan sat inside a number labelled as
// excluding it. Finding 13: a live session whose recipes were loading,
// unreachable or empty drew the DEMO recipe bank, because the grid fell back
// to `app.recipes` whenever `liveRecipes` was null. Demo content is
// demoMode's alone.
//
// The val is run for real here: src/vals/valsRecipes.js imports nothing that
// needs a browser, so a fixture app and ctx exercise the same code his phone
// runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { offPlanTotals, recipeBankState, RECIPE_BANK_COPY } from '../../src/fuelFacts.js';
import { valsRecipes } from '../../src/vals/valsRecipes.js';

const DEMO = [
  { id: 'demo-1', name: 'Demo power bowl', tag: 'High protein', filter: 'High protein', p: 52, c: 40, f: 14, kcal: 490, time: '15 min', hue: '216,181,115' },
  { id: 'demo-2', name: 'Demo overnight oats', tag: 'Quick', filter: 'Quick', p: 30, c: 60, f: 9, kcal: 430, time: '5 min', hue: '107,229,245' },
];
const LIVE = [
  { id: 'chicken-rice', name: 'Chicken rice', category: 'CORE DAILY MEALS', macros: { p: 45, c: 60, f: 12, kcal: 520 }, ingredients: [], method: [] },
];
// his real day, by shape (the audit's frame yst-1): four entries, the first a
// ticked rotation dish
const DAY = {
  date: '2026-09-26',
  entries: [
    { id: 'r1', name: 'Chicken rice', source: 'rotation', slot: 'lunch', recipeId: 'chicken-rice', macros: { p: 45, c: 60, f: 12, kcal: 520 } },
    { id: 'a1', name: 'Protein bar', source: 'barcode', macros: { p: 20, c: 22, f: 7, kcal: 230 } },
    { id: 'a2', name: 'Flat white', source: 'manual', macros: { p: 8, c: 12, f: 7, kcal: 140 } },
    { id: 'a3', name: 'Half a burrito', source: 'recipe', macros: { p: 18.4, c: 40.2, f: 11.6, kcal: 355 } },
  ],
};

// a fixture app: real state where the val reads it, a no-op for every action
function run(state, ctx = {}) {
  const app = new Proxy({
    state: {
      recipeFilter: 'All', liveRecipePhotoUrls: {}, recipePhotoUploadBusy: {}, recipeChat: [],
      foodLogName: '', foodLogP: '', foodLogC: '', foodLogF: '', foodLogKcal: '', foodPortionCustom: '',
      liveRecipes: null, liveRecipesEmpty: false,
      ...state,
    },
    recipes: DEMO,
  }, { get: (t, k) => (k in t ? t[k] : () => {}) });
  return valsRecipes(app, { demoMode: state.connectionStatus === 'demo', isOffline: state.connectionStatus === 'offline', ...ctx });
}

// ---- finding 3: off-plan means off-plan ----

test('offPlanTotals leaves out ticked rotation meals and keeps everything else', () => {
  assert.deepEqual(offPlanTotals(DAY.entries), { p: 46, c: 74, f: 26, kcal: 725 });
  assert.deepEqual(offPlanTotals([]), { p: 0, c: 0, f: 0, kcal: 0 });
  assert.deepEqual(offPlanTotals(undefined), { p: 0, c: 0, f: 0, kcal: 0 });
  // a legacy entry with no source was logged by hand, so it is off-plan
  assert.equal(offPlanTotals([{ name: 'x', macros: { p: 1, c: 1, f: 1, kcal: 10 } }]).kcal, 10);
});

test('the val gives the strip the off-plan sum, and the day total stays the whole day', () => {
  const v = run({ connectionStatus: 'connected', liveRecipes: LIVE, liveFoodLog: DAY });
  assert.equal(v.foodLogOffPlanTotals.kcal, 725, 'the rotation dish is not off-plan');
  assert.equal(v.foodLogTotals.kcal, 1245, 'the whole day is still available to what means the whole day');
  // a past day in the retro view is read the same way
  const past = run({ connectionStatus: 'connected', liveRecipes: LIVE, liveFoodLog: { date: '2026-09-27', entries: [] }, foodLogDate: DAY.date, liveFoodLogView: DAY });
  assert.equal(past.foodLogOffPlanTotals.kcal, 725);
});

test('the number drawn beside "KCAL OFF-PLAN" is the off-plan sum', () => {
  const src = readFileSync(new URL('../../src/screens/Recipes.jsx', import.meta.url), 'utf8');
  const label = src.indexOf('>KCAL OFF-PLAN<');
  assert.ok(label > 0, 'the label is still there');
  const strip = src.slice(src.lastIndexOf('v.foodLogEntries.length > 0 && (', label), src.indexOf('Log part of something already in his collection', label));
  assert.ok(strip.includes('{v.foodLogOffPlanTotals.kcal}'), 'the figure reads the off-plan sum');
  assert.ok(!strip.includes('v.foodLogTotals'), 'nothing in the strip reads the whole-day total');
});

// ---- finding 13: the demo bank is demo mode's alone ----

test('recipeBankState names every way a live bank can be absent', () => {
  assert.equal(recipeBankState({ demoMode: true, liveRecipes: null }), 'demo');
  assert.equal(recipeBankState({ demoMode: false, liveRecipes: LIVE, connectionStatus: 'offline' }), 'live', 'cached recipes stay his, offline or not');
  assert.equal(recipeBankState({ demoMode: false, liveRecipes: null, connectionStatus: 'connecting' }), 'loading');
  assert.equal(recipeBankState({ demoMode: false, liveRecipes: null, connectionStatus: 'offline' }), 'offline');
  assert.equal(recipeBankState({ demoMode: false, liveRecipes: null, connectionStatus: 'connected' }), 'missing');
  assert.equal(recipeBankState({ demoMode: false, liveRecipes: null, connectionStatus: 'connected', recipesEmpty: true }), 'empty');
  assert.equal(recipeBankState({ demoMode: false, liveRecipes: [], connectionStatus: 'connected' }), 'missing');
});

for (const [status, extra, expected] of [
  ['connecting', {}, 'loading'],
  ['offline', {}, 'offline'],
  ['connected', {}, 'missing'],
  ['connected', { liveRecipesEmpty: true }, 'empty'],
]) {
  test(`a live session with no recipes (${expected}) never draws the demo bank`, () => {
    const v = run({ connectionStatus: status, ...extra });
    assert.equal(v.recipeBankState, expected);
    assert.deepEqual(v.recipeList, [], 'no cards at all, and so no demo cards');
    assert.equal(v.recipeCount, 0);
    assert.ok(!/demo/i.test(v.recipesHeaderLabel), `header says "${v.recipesHeaderLabel}"`);
    assert.deepEqual(v.recipeFilters, [], 'the demo filter chips go with the demo cards');
    assert.equal(v.recipeBankNote, RECIPE_BANK_COPY[expected] || null);
    if (expected === 'loading') assert.equal(v.recipeBankNote, null, 'loading is a skeleton, not a sentence');
    else assert.ok(v.recipeBankNote && v.recipeBankNote.length > 20, 'every other absence says which one it is');
  });
}

test('a demo recipe id left in state cannot open a demo overlay in a live session', () => {
  const v = run({ connectionStatus: 'connected', openRecipeId: 'demo-1' });
  assert.equal(v.recipeOpen, false);
});

test('demo mode still shows the showcase bank, labelled as demo', () => {
  const v = run({ connectionStatus: 'demo' });
  assert.equal(v.recipeBankState, 'demo');
  assert.deepEqual(v.recipeList.map((r) => r.name), DEMO.map((r) => r.name));
  assert.match(v.recipesHeaderLabel, /demo data/);
});

test('live recipes are drawn as they were', () => {
  const v = run({ connectionStatus: 'connected', liveRecipes: LIVE });
  assert.equal(v.recipeBankState, 'live');
  assert.deepEqual(v.recipeList.map((r) => r.name), ['Chicken rice']);
  assert.equal(v.recipeBankNote, null);
  assert.equal(v.recipesHeaderLabel, '1 recipes · live from Obsidian');
});

test('the grid draws the skeleton and the honest line from the val, with no demo fallback left in the source', () => {
  const screen = readFileSync(new URL('../../src/screens/Recipes.jsx', import.meta.url), 'utf8');
  assert.ok(screen.includes("v.recipeBankState === 'loading' && <SkeletonGrid"), 'loading draws the bank skeleton');
  assert.ok(screen.includes('{v.recipeBankNote && ('), 'the other absences draw their line');
  assert.ok(/import \{ SkeletonGrid \} from '\.\.\/Skeleton\.jsx'/.test(screen), 'SkeletonGrid is imported');
  const val = readFileSync(new URL('../../src/vals/valsRecipes.js', import.meta.url), 'utf8');
  const fallback = val.indexOf(': app.recipes.filter(');
  assert.ok(fallback > 0, 'the demo branch still exists for demo mode');
  assert.ok(val.slice(fallback - 60, fallback).includes("recipeBank !== 'demo' ? []"), 'and is reachable only in demo mode');
});
