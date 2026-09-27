// THE SUMMARY FUEL PAGE (mockup 59, variation A: "Fuel is the plate", his
// pick on 27 Sep 2026). The pure helpers behind the one instrument, the log
// rows and the rotation row; the view model run for real against a fixture
// day (src/vals/*.js import nothing that needs a browser); and the source
// contracts no screenshot would catch breaking.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plateInstrument, proteinLine, logRows, tonightRotation, clock12 } from '../../src/fuelSummaryFacts.js';
import { valsRecipes } from '../../src/vals/valsRecipes.js';
import { valsFuelSummary } from '../../src/vals/valsFuelSummary.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// ---- the plate --------------------------------------------------------------

test('no protein target is a dashed ring with no percentage and nothing "to go", never a zero', () => {
  const p = plateInstrument({ proteinCurrent: 94.4, proteinTarget: null, kcalCurrent: 1480, targetKcal: 2600, c: 150, f: 48 });
  assert.equal(p.protein.state, 'dashed');
  assert.equal(p.protein.pct, null);
  assert.equal(p.protein.target, null);
  assert.equal(p.protein.toGo, null);
  assert.equal(p.protein.value, 94, 'what was eaten is still said');
  assert.equal(proteinLine(p.protein), 'No protein target set yet');
  // a zero or a junk target is no target either
  assert.equal(plateInstrument({ proteinCurrent: 10, proteinTarget: 0 }).protein.state, 'dashed');
  assert.equal(plateInstrument({ proteinCurrent: 10, proteinTarget: 'x' }).protein.state, 'dashed');
});

test('with a target the ring is Home\'s arithmetic, and "to go" is what is left', () => {
  const p = plateInstrument({ proteinCurrent: 94.4, proteinTarget: 160 });
  // valsMission: pct = round(min(1, current / target) × 100), from the unrounded current
  assert.equal(p.protein.pct, Math.round(Math.min(1, 94.4 / 160) * 100));
  assert.equal(p.protein.toGo, 66);
  assert.equal(p.protein.state, 'arc');
  assert.equal(proteinLine(p.protein), '66 g protein to go');
  const none = plateInstrument({ proteinCurrent: 0, proteinTarget: 160 });
  assert.equal(none.protein.state, 'open', 'a target and nothing eaten is the track alone');
  assert.equal(none.protein.pct, 0);
  const met = plateInstrument({ proteinCurrent: 171, proteinTarget: 160 });
  assert.equal(met.protein.state, 'met');
  assert.equal(met.protein.pct, 100, 'the ring stops full, it never runs past');
  assert.equal(met.protein.toGo, 0);
  assert.equal(proteinLine(met.protein), 'Protein target reached');
});

test('calories: what is left against the target, or over it; no target means no bar', () => {
  const k = plateInstrument({ kcalCurrent: 1480.4, targetKcal: 2600 }).kcal;
  assert.deepEqual(k, { value: 1480, target: 2600, left: 1120, over: 0, pct: 57 });
  const over = plateInstrument({ kcalCurrent: 2750, targetKcal: 2600 }).kcal;
  assert.equal(over.left, 0);
  assert.equal(over.over, 150);
  assert.equal(over.pct, 100);
  const bare = plateInstrument({ kcalCurrent: 900, targetKcal: null }).kcal;
  assert.equal(bare.target, null);
  assert.equal(bare.left, null, 'no invented "left"');
  assert.equal(bare.pct, null);
});

test('carbs and fat are plain grams: no target, so no ring and no percentage', () => {
  const p = plateInstrument({ c: 150.6, f: 47.5 });
  assert.deepEqual(p.carbs, { value: 151 });
  assert.deepEqual(p.fat, { value: 48 });
});

// ---- the log rows -------------------------------------------------------------

test('a row carries the entry\'s own figures; lines are counted, never summed', () => {
  const rows = logRows([
    // the server keeps an entry's macros as the sum of its lines; if the two
    // ever disagreed, the row would still say the entry's, not a recount
    { id: 'a', time: '07:40', name: 'Greek yoghurt and oats', macros: { p: 32.4, c: 50, f: 9, kcal: 480 },
      items: [{ id: 'i1', macros: { p: 1, kcal: 1 } }, { id: 'i2', macros: { p: 1, kcal: 1 } }, { id: 'i3', macros: { p: 1, kcal: 1 } }] },
    { id: 'b', time: '12:30', name: 'Tuna wrap', source: 'rotation', macros: { p: 38, c: 60, f: 14, kcal: 610 } },
    { id: 'c', name: 'Retro entry', macros: { p: 24, c: 10, f: 5, kcal: 390 }, edited: true },
  ]);
  assert.equal(rows[0].p, 32);
  assert.equal(rows[0].kcal, 480);
  assert.equal(rows[0].lines, 3);
  assert.equal(rows[0].sub, '32 g protein · 480 kcal · 3 lines');
  assert.deepEqual(rows[0].time, { clock: '7:40', ampm: 'am' });
  assert.equal(rows[1].fromRotation, true);
  assert.equal(rows[1].sub, '38 g protein · 610 kcal · from the rotation');
  assert.deepEqual(rows[1].time, { clock: '12:30', ampm: 'pm' });
  assert.equal(rows[2].time, null, 'a retro entry has no clock time, and none is invented');
  assert.equal(rows[2].edited, true);
  assert.deepEqual(logRows(undefined), []);
  assert.equal(clock12('00:05').clock, '12:05');
  assert.equal(clock12('25:00'), null);
});

// ---- the rotation row ---------------------------------------------------------

test('the rotation row is the next unticked slot in his order, or nothing', () => {
  const slots = [{ key: 'breakfast', name: 'Breakfast' }, { key: 'lunch', name: 'Lunch' }, { key: 'dinner', name: 'Dinner' }, { key: 'snack', name: 'Snack' }];
  const rotation = { slots: {
    breakfast: { id: 'oats', name: 'Oats', consumed: true, macros: { p: 30, kcal: 420 } },
    lunch: null,
    dinner: { id: 'cr', name: 'Chicken and rice', consumed: false, portionsLeft: 2, macros: { p: 42.2, kcal: 640 } },
    snack: { id: 'ys', name: 'Yoghurt', consumed: false, macros: { p: 20, kcal: 200 } },
  } };
  const t = tonightRotation(rotation, slots);
  assert.equal(t.slot, 'dinner');
  assert.equal(t.label, 'Tonight');
  assert.equal(t.name, 'Chicken and rice');
  assert.equal(t.p, 42);
  assert.equal(t.portionsLeft, 2);
  const after = tonightRotation({ slots: { ...rotation.slots, dinner: { ...rotation.slots.dinner, consumed: true } } }, slots);
  assert.equal(after.slot, 'snack');
  assert.equal(after.label, 'Snack', 'only dinner is "tonight"');
  assert.equal(tonightRotation({ slots: { breakfast: rotation.slots.breakfast } }, slots), null);
  assert.equal(tonightRotation(null, slots), null);
});

// ---- the view model, run for real --------------------------------------------

const RECIPES = [
  { id: 'chicken-rice', name: 'Chicken and rice', category: 'CORE DAILY MEALS', makes: 'makes 4', macros: { p: 42, c: 60, f: 12, kcal: 640 },
    ingredients: [{ qty: '', name: 'Chicken thigh, 180 g' }, { qty: '', name: 'Rice, 150 g cooked' }], method: ['Cook it.'], alternates: [], notes: [] },
  { id: 'oats', name: 'Greek yoghurt and oats', category: 'CORE DAILY MEALS', macros: { p: 32, c: 50, f: 9, kcal: 480 }, ingredients: [], method: [], alternates: [], notes: [] },
];
const TODAY = {
  date: '2026-09-27',
  entries: [
    { id: 'e1', time: '07:40', name: 'Greek yoghurt and oats', source: 'recipe', macros: { p: 32, c: 50, f: 9, kcal: 480 },
      items: [{ id: 'i1', name: 'Yoghurt', grams: 200, macros: { p: 20, c: 10, f: 5, kcal: 200 } }, { id: 'i2', name: 'Oats', grams: 60, macros: { p: 12, c: 40, f: 4, kcal: 280 } }] },
    { id: 'e2', time: '12:30', name: 'Tuna wrap', source: 'rotation', slot: 'lunch', recipeId: 'tuna', macros: { p: 38, c: 60, f: 14, kcal: 610 } },
  ],
};
const ROTATION = {
  order: ['breakfast', 'lunch', 'dinner', 'snack', 'extra'],
  slots: { dinner: { id: 'chicken-rice', name: 'Chicken and rice', consumed: false, portionsLeft: 2, macros: { p: 42, c: 60, f: 12, kcal: 640 } } },
  options: { dinner: [{ id: 'chicken-rice', name: 'Chicken and rice', focus: true, eaten: false, portionsLeft: 2, macros: { p: 42, c: 60, f: 12, kcal: 640 } }] },
  totals: { p: 42, c: 60, f: 12, kcal: 640 },
};
function run(state, { demo = false } = {}) {
  const calls = [];
  const app = new Proxy({
    state: {
      novaStyle: 'summary', screen: 'recipes', connectionStatus: demo ? 'demo' : 'connected',
      recipeFilter: 'All', liveRecipePhotoUrls: {}, recipePhotoUploadBusy: {}, recipeChat: [],
      foodLogName: '', foodLogP: '', foodLogC: '', foodLogF: '', foodLogKcal: '', foodPortionCustom: '',
      liveRecipes: demo ? null : RECIPES, liveRecipeProfile: demo ? null : { proteinFloorG: 160, targetKcal: 2600 },
      liveFoodLog: demo ? null : TODAY, liveRotation: demo ? null : ROTATION, liveRecipesEmpty: false,
      ...state,
    },
    recipes: [{ id: 'demo-1', name: 'Demo power bowl', tag: 'High protein', filter: 'High protein', p: 52, c: 40, f: 14, kcal: 490, time: '15 min', hue: '216,181,115', ingredients: [], steps: [] }],
  }, { get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, ...args]); }) });
  const ctx = { demoMode: demo, isOffline: false };
  const v = { ...valsRecipes(app, ctx), foodLogDays: [], summary: true };
  return { ...valsFuelSummary(app, ctx, v), ctx, v, calls, app };
}

test('the plate reads the same protein fields as Home, so the two rings cannot disagree', () => {
  const { fuelSummary: F, ctx } = run({});
  assert.equal(F.state, 'live');
  // Home's ring (valsMission): value round(current), pct round(proteinRatio × 100)
  assert.equal(F.plate.protein.value, Math.round(ctx.proteinCurrent));
  assert.equal(F.plate.protein.pct, Math.round(ctx.proteinRatio * 100));
  assert.equal(F.plate.protein.target, 160);
  assert.equal(F.plate.protein.toGo, 160 - 70);
  assert.equal(F.plate.kcal.value, 1090);
  assert.equal(F.plate.kcal.left, 2600 - 1090);
  assert.equal(F.plate.carbs.value, 110);
});

test('the log is the day\'s entries as rows, with their lines and their way back', () => {
  const { fuelSummary: F } = run({ foodEntryUndo: { entry: { id: 'gone', name: 'Protein shake', macros: { p: 24, kcal: 390 } }, at: Date.now() } });
  assert.equal(F.log.rows.length, 2);
  assert.equal(F.log.rows[0].lines.length, 2);
  assert.equal(F.log.rows[0].tail, '2 lines');
  assert.equal(F.log.rows[1].fromRotation, true);
  assert.equal(F.log.heading, "Today's log");
  assert.equal(F.log.receipts.length, 1);
  assert.equal(F.log.receipts[0].title, 'Protein shake removed');
  assert.equal(F.log.receipts[0].sub, '24 g and 390 kcal came off the plate');
  assert.match(F.log.total, /the whole day$/, 'the total says it is the whole day, never "off-plan"');
});

test('the rotation row, the doors and the recipe list come from the existing vals', () => {
  const { fuelSummary: F } = run({});
  assert.equal(F.rotation.state, 'next');
  assert.equal(F.rotation.tonight.name, 'Chicken and rice');
  assert.equal(F.doors.recipes.count, 2);
  assert.equal(F.recipesPage.rows.length, 2);
  const cr = F.recipesPage.rows.find((r) => r.name === 'Chicken and rice');
  assert.equal(cr.slot.letter, 'D', 'a dish in a slot wears its letter');
  assert.equal(F.recipesPage.rows.find((r) => r.name !== 'Chicken and rice').slot.letter, null, 'a dish in no slot wears the dashed +');
  assert.equal(F.recipesPage.open, false);
  assert.equal(run({ fuelView: 'recipes' }).fuelSummary.recipesPage.open, true);
});

test('the recipe sheet logs the version he is looking at through the existing portion write', () => {
  const { fuelSummary: F, calls } = run({ openRecipeId: 'chicken-rice' });
  const R = F.recipeSheet;
  assert.equal(R.name, 'Chicken and rice');
  assert.match(R.meta, /in today's dinner/);
  assert.deepEqual([R.macros.p, R.macros.kcal], [42, 640]);
  assert.equal(R.lines.length, 2);
  assert.ok(R.rotation.slots.find((s) => s.key === 'dinner').active);
  R.log(0.5, '');
  const set = calls.find((c) => c[0] === 'setState');
  assert.ok(set, 'the portion is handed to state first');
  assert.equal(set[1].foodPortionFactor, 0.5);
  assert.equal(set[1].foodRecipePick.name, 'Chicken and rice');
  // the write itself is App.logRecipePortion, run from setState's callback
  set[2]();
  assert.ok(calls.some((c) => c[0] === 'logRecipePortion'));
});

test('a past day in view says so: its own heading, and where an entry lands', () => {
  const past = { date: '2026-09-26', entries: [{ id: 'p1', name: 'Oats and whey', macros: { p: 38, c: 60, f: 9, kcal: 520 } }] };
  const { fuelSummary: F } = run({ foodLogDate: '2026-09-26', liveFoodLogView: past, openRecipeId: 'chicken-rice' });
  assert.equal(F.log.viewingPast, true);
  assert.equal(F.log.heading, "Saturday's log");
  assert.equal(F.log.rows.length, 1, 'the rows are that day\'s');
  assert.equal(F.composer.logsTo, 'Entries land on Saturday 26 September');
  assert.equal(F.recipeSheet.logsTo, 'Logs to Saturday 26 September');
  // the plate stays on today: it is Home's ring, and Home draws today
  assert.equal(F.plate.protein.value, 70);
});

test('demo mode draws no plate and no log: they are his data, not a showcase', () => {
  const { fuelSummary: F } = run({}, { demo: true });
  assert.equal(F.state, 'demo');
  assert.equal(F.plate, null);
  assert.equal(F.log, null);
  assert.equal(F.composer, null);
  assert.equal(F.recipesPage.demo, true);
  assert.equal(F.recipesPage.rows.length, 1);
});

test('off the summary style the view model is null, so cupertino and command never see it', () => {
  assert.equal(run({ novaStyle: 'cupertino' }).fuelSummary, null);
  assert.equal(run({ novaStyle: 'command' }).fuelSummary, null);
});

// ---- source contracts ---------------------------------------------------------

test('the summary branch is the first thing Recipes does, before any hook runs', () => {
  const src = read('src/screens/Recipes.jsx');
  const start = src.indexOf('export function Recipes({ v }) {');
  assert.ok(start > 0);
  const body = src.slice(start, src.indexOf('\n}\n', start));
  const firstStatement = body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('//') && !l.startsWith('export function'));
  assert.equal(firstStatement, 'if (v.summary && v.fuelSummary) return <FuelSummary v={v} />;');
  assert.doesNotMatch(body, /use[A-Z]\w*\(/, 'no hook may run in the component that picks the idiom');
});

test('no type on the summary Fuel page or its sheet is below 12px', () => {
  const sizes = [];
  for (const f of ['src/screens/FuelSummary.jsx', 'src/RecipeSheet.jsx']) {
    const src = read(f);
    for (const m of src.matchAll(/font: ?[`'"]([^`'"]*)[`'"]/g)) {
      const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
      if (px) sizes.push({ where: f, px: Number(px[1]) });
    }
    assert.doesNotMatch(src, /fontSize: ?['"]?(?:[0-9]|1[01])(?:\.\d+)?px/, `${f} sets a size under 12px`);
  }
  const css = read('src/index.css');
  const start = css.indexOf('THE SUMMARY FUEL PAGE');
  const end = css.indexOf('/* shared panes for the new components */');
  assert.ok(start > 0 && end > start, 'the .nv-fs-* block sits inside the summary section the Home floor reads');
  const section = css.slice(css.indexOf('*/', start) + 2, end).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of section.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const m of rule[2].matchAll(/font(?:-size)?:\s*([^;]+);/g)) {
      const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
      if (px) sizes.push({ where: `index.css ${rule[1].trim()}`, px: Number(px[1]) });
    }
  }
  assert.ok(sizes.length > 40, `expected to read the page's type, found ${sizes.length}`);
  const small = sizes.filter((s) => s.px < 12).map((s) => `${s.where}: ${s.px}px`);
  assert.deepEqual(small, [], `below the floor:\n  ${small.join('\n  ')}`);
});

test('the recipe sheet is a modal the back swipe can find and close', () => {
  const sheet = read('src/RecipeSheet.jsx');
  const root = /<div ref=\{exit\.scrimRef\}[^>]*>/.exec(sheet)?.[0] || '';
  assert.match(root, /role="dialog"/);
  assert.match(root, /aria-modal="true"/);
  assert.match(root, /style=\{\{ zIndex: 140 \}\}/, 'edgeBack.js reads the inline z-index');
  assert.match(root, /onClick=\{exit\.close\}/, 'the backdrop tap (and the swipe\'s click) closes it');
  assert.match(sheet, /onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  // the other three sheets are the house GlassSheet, itself an aria-modal root with its z inline
  const fuel = read('src/screens/FuelSummary.jsx');
  assert.equal((fuel.match(/<GlassSheet /g) || []).length, 3, 'the week, the rotation and Pick it up');
  const glass = read('src/GlassSheet.jsx');
  assert.match(glass, /role="dialog" aria-modal="true"/);
  assert.match(glass, /z-index:145/);
});

test('the new files add no network path: every write is an existing app method', () => {
  for (const f of ['src/screens/FuelSummary.jsx', 'src/RecipeSheet.jsx', 'src/FuelIcon.jsx', 'src/vals/valsFuelSummary.js', 'src/fuelSummaryFacts.js']) {
    const src = read(f);
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|from ['"][./]*api\.js['"]|\bapi\.\w+\(|getConnection\(/, `${f} reaches the network`);
  }
});

test('App renders the sheet only under summary, and the Fuel vals go last', () => {
  const app = read('src/App.jsx');
  assert.match(app, /\{v\.recipeOpen && <Suspense fallback=\{null\}>\{v\.fuelSummary\?\.recipeSheet \? <RecipeSheet v=\{v\} \/> : <RecipeOverlay v=\{v\} \/>\}<\/Suspense>\}/);
  assert.match(app, /return \{ \.\.\.withTrain, \.\.\.valsFuelSummary\(this, ctx, withTrain\) \};/);
  // the Recipes list is its own history entry, and popstate closes it
  assert.match(app, /novaView: 'fuelRecipes'/);
  assert.match(app, /\.\.\.this\.pagesFromHistory\(\)/);
  assert.match(app, /pagesFromHistory\(\) \{\n    return \{ \.\.\.this\.pinnedFromHistory\(\), \.\.\.this\.trainCoachFromHistory\(\), \.\.\.this\.viewFromHistory\(\) \};/);
});
