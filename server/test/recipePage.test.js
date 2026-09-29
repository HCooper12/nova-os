// THE RECIPE PAGE (29 Sep 2026). His ask, with the Osta reel: a recipe he
// shares becomes a clean page — the dish, how many it makes, how long it
// takes, the servings scaled, the batch onto the shopping list. The page is
// ONE view model (v.recipePage, src/vals/valsRecipes.js) that the cupertino
// page (RecipeOverlay) and the summary sheet (RecipeSheet, through
// valsFuelSummary) both render. Run for real against a realistic recipe; then
// the source contracts no screenshot would catch breaking.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { valsRecipes, fmtMinutes, splitAmount, cardMeta } from '../../src/vals/valsRecipes.js';
import { valsFuelSummary } from '../../src/vals/valsFuelSummary.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const BOWLS = {
  id: 'burrito-bowls', name: 'Chicken burrito bowls', category: 'CORE DAILY MEALS', makes: '6 bowls',
  servings: 6, prepMin: 15, cookMin: 25,
  source: { url: 'https://www.instagram.com/reel/abc123/', label: 'Instagram reel' },
  macros: { p: 48, c: 62, f: 14, kcal: 560 },
  ingredients: [
    { qty: '', name: '1.2 kg chicken thigh, diced' },
    { qty: '', name: '480 g basmati rice (dry)' },
    { qty: '', name: '2 x 400g cans black beans' },
    { qty: '', name: '1 1/2 cups corn' },
    { qty: '', name: '— Sauce —', group: true },
    { qty: '', name: '200 g light sour cream' },
    { qty: '', name: '2 tbsp chipotle in adobo' },
    { qty: '', name: '1 lime, juiced' },
    { qty: '', name: 'Salt, to taste' },
  ],
  method: ['Season the chicken.', 'Sear it.', 'Cook the rice.', 'Warm the beans and corn.', 'Make the sauce.', 'Build six bowls.', 'Sauce them.'],
  alternates: [], notes: ['Keeps four days.'], description: 'A batch of lunches.',
};
const UNSERVED = { id: 'mystery', name: 'Mystery stew', category: 'TREATS', makes: '1 batch', servings: null, prepMin: null, cookMin: null, source: null,
  macros: null, ingredients: [{ qty: '', name: '500 g beef' }], method: [], alternates: [], notes: [] };

function run(state = {}, { demo = false, style = 'cupertino' } = {}) {
  const calls = [];
  const app = new Proxy({
    state: {
      novaStyle: style, screen: 'recipes', connectionStatus: demo ? 'demo' : 'connected',
      recipeFilter: 'All', liveRecipePhotoUrls: demo ? {} : { 'burrito-bowls': 'blob:photo-1' }, recipePhotoUploadBusy: {}, recipeChat: [],
      foodLogName: '', foodLogP: '', foodLogC: '', foodLogF: '', foodLogKcal: '', foodPortionCustom: '',
      liveRecipes: demo ? null : [BOWLS, UNSERVED], liveRecipeProfile: demo ? null : { proteinFloorG: 160, targetKcal: 2600 },
      liveFoodLog: null, liveRotation: null, liveRecipesEmpty: false,
      openRecipeId: 'burrito-bowls',
      ...state,
    },
    recipes: [{ id: 'r6', name: 'Turkey chili (batch ×4)', tag: 'Batch', filter: 'Batch', p: 45, c: 38, f: 14, kcal: 470, time: '45 min', servings: 4, prepMin: 10, cookMin: 35, hue: '90,168,124',
      ingredients: [[500, 'g', 'turkey mince (batch)'], [0.5, '', 'lime, juiced'], [1, '', 'onion, diced']], steps: ['Brown it.', 'Simmer it.'] }],
  }, { get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, ...args]); }) });
  const ctx = { demoMode: demo, isOffline: false };
  const v = valsRecipes(app, ctx);
  return { v, P: v.recipePage, calls, app, ctx };
}
const lineTexts = (P) => P.ingredients.filter((it) => !it.group).map((it) => it.line);

test('at the recipe\'s own servings the lines are exactly as he wrote them', () => {
  const { P } = run();
  assert.equal(P.scale.base, 6);
  assert.equal(P.scale.servings, 6);
  assert.equal(P.scale.changed, false);
  assert.deepEqual(lineTexts(P), BOWLS.ingredients.filter((i) => !i.group).map((i) => i.name));
});

test('scaled to 9 servings, every amount moves by 1.5 and reads the way a cook writes it', () => {
  const { P } = run({ recipeScaleView: { id: 'burrito-bowls', n: 9 } });
  assert.equal(P.scale.servings, 9);
  assert.equal(P.scale.factor, 1.5);
  assert.equal(P.scale.changed, true);
  assert.equal(P.scale.noun, 'bowls', 'the stepper counts in the recipe\'s own noun');
  assert.deepEqual(lineTexts(P), [
    '1.8 kg chicken thigh, diced',
    '720 g basmati rice (dry)',
    '3 x 400g cans black beans',        // the COUNT scales; a can is still a 400 g can
    '2¼ cups corn',                     // never "2.25 cups"
    '300 g light sour cream',
    '3 tbsp chipotle in adobo',
    '1½ lime, juiced',
    'Salt, to taste',                   // no amount: left alone
  ]);
  // the group label is drawn as a label, never scaled
  const group = P.ingredients.find((it) => it.group);
  assert.equal(group.label, 'Sauce');
  // the amount is split from the item, so the page can set it in the mono face
  const chicken = P.ingredients[0];
  assert.equal(chicken.amount, '1.8 kg');
  assert.equal(chicken.item, 'chicken thigh, diced');
  assert.equal(P.ingredients.find((it) => it.line === 'Salt, to taste').amount, '');
});

test('the per-serving macros do not move with the batch', () => {
  const at6 = run().P.macros;
  const at9 = run({ recipeScaleView: { id: 'burrito-bowls', n: 9 } }).P.macros;
  const at2 = run({ recipeScaleView: { id: 'burrito-bowls', n: 2 } }).P.macros;
  assert.deepEqual([at9.p, at9.c, at9.f, at9.kcal], [48, 62, 14, 560]);
  assert.deepEqual(at9, at6);
  assert.deepEqual(at2, at6);
});

test('a scale set on another recipe is not this one\'s: it opens at its own servings', () => {
  const { P } = run({ recipeScaleView: { id: 'something-else', n: 12 } });
  assert.equal(P.scale.servings, 6);
  assert.equal(P.scale.factor, 1);
});

test('the stepper walks the view, never the recipe; one serving is the floor', () => {
  const { P, calls } = run({ recipeScaleView: { id: 'burrito-bowls', n: 9 } });
  P.scale.inc();
  assert.deepEqual(calls.at(-1), ['setState', { recipeScaleView: { id: 'burrito-bowls', n: 10 } }]);
  P.scale.reset();
  assert.deepEqual(calls.at(-1), ['setState', { recipeScaleView: null }]);
  assert.ok(!calls.some((c) => c[0] === 'saveRecipeMeta' || c[0] === 'editRecipe'), 'scaling wrote the recipe');
  assert.equal(run({ recipeScaleView: { id: 'burrito-bowls', n: 1 } }).P.scale.dec, null);
});

test('the shopping list gets the batch he is looking at: the scaled lines, groups and dropped lines left out', () => {
  const { P, calls } = run({ recipeScaleView: { id: 'burrito-bowls', n: 9 } });
  assert.equal(P.shopping.count, 8);
  assert.equal(P.shopping.scaled, true);
  P.shopping.add();
  const add = calls.find((c) => c[0] === 'addToShoppingList');
  assert.ok(add, 'nothing reached the shopping list');
  assert.deepEqual(add[1], lineTexts(P));
  assert.ok(add[1].includes('720 g basmati rice (dry)'), 'the list got the recipe\'s amounts, not the batch\'s');
  assert.ok(!add[1].some((l) => /Sauce/.test(l)), 'a group label went onto the list');
  assert.equal(add[2], 'Chicken burrito bowls');
  // one line alone, from the hold menu, is scaled too
  P.ingredients[1].shop();
  assert.deepEqual(calls.at(-1), ['addToShoppingList', ['720 g basmati rice (dry)'], 'Chicken burrito bowls']);
  assert.equal(P.ingredients[1].hold.items.length, 2);
  // a line dropped from this version is not bought
  const dropped = run({ recipeScaleView: { id: 'burrito-bowls', n: 9 }, recipeRemovals: ['480 g basmati rice (dry)'] });
  assert.equal(dropped.P.shopping.count, 7);
  assert.ok(!dropped.P.shopping.lines.some((l) => /basmati/.test(l)));
});

test('the meta row draws what the recipe says and simply omits what it does not', () => {
  const { P } = run();
  assert.deepEqual(P.meta.map((m) => [m.key, m.text]), [
    ['serves', 'Makes 6 bowls'],
    ['prep', 'Prep 15 min'],
    ['cook', 'Cook 25 min'],
    ['source', 'Instagram reel'],
  ]);
  const src = P.meta.find((m) => m.key === 'source');
  assert.equal(src.url, BOWLS.source.url);
  assert.equal(src.glyph, 'reel');
  assert.deepEqual(P.unset, [], 'nothing left to add');
  // no prep time and no source: those two are simply not drawn, no dashes
  const bare = run({ liveRecipes: [{ ...BOWLS, prepMin: null, source: null }, UNSERVED] }).P;
  assert.deepEqual(bare.meta.map((m) => m.key), ['serves', 'cook']);
  assert.ok(!bare.meta.some((m) => /—|-{1,2}/.test(m.text)));
  assert.deepEqual(bare.unset.map((u) => u.field), ['prepMin'], 'offered once, in the ⋯ sheet');
  assert.equal(fmtMinutes(65), '1 hr 5 min');
  assert.equal(fmtMinutes(60), '1 hr');
  assert.equal(fmtMinutes(45), '45 min');
});

test('serves, prep and cook save through the existing edit route, one field at a time', () => {
  const { P, calls } = run();
  P.setMeta({ cookMin: 30 });
  assert.deepEqual(calls.at(-1), ['saveRecipeMeta', 'burrito-bowls', { cookMin: 30 }]);
  const app = read('src/App.jsx');
  const fn = app.slice(app.indexOf('  saveRecipeMeta(recipeId, patch) {'));
  assert.ok(fn.length > 0 && app.includes('THE RECIPE PAGE (29 Sep 2026)'), 'the method lives in its own named region');
  assert.match(fn.slice(0, 1400), /api\.editRecipe\(conn, recipeId, patch\)/);
  assert.match(fn.slice(0, 1400), /\{ \.\.\.r, \.\.\.was \}/, 'a refused save puts the old values back');
});

test('the hero carries the photo, or the way to add one; the name and category ride with it', () => {
  const { P } = run();
  assert.equal(P.hero.photoUrl, 'blob:photo-1');
  assert.equal(P.name, 'Chicken burrito bowls');
  assert.equal(P.category, 'Core');
  assert.equal(P.method.length, 7);
  assert.deepEqual(P.method[0], { n: 1, text: 'Season the chicken.' });
  assert.equal(typeof P.hero.onFile, 'function');
  assert.equal(typeof P.log, 'function');
});

test('a recipe that does not say what it makes is not scaled, and says so rather than guessing', () => {
  const { P } = run({ openRecipeId: 'mystery', recipeScaleView: { id: 'mystery', n: 4 } });
  assert.equal(P.scale, null);
  assert.deepEqual(lineTexts(P), ['500 g beef']);
  assert.equal(P.macros, null);
  assert.ok(P.pending, 'macros not set is the gold state');
  assert.equal(P.log, null);
  assert.deepEqual(P.meta.map((m) => m.text), ['Makes 1 batch']);
  assert.deepEqual(P.unset.map((u) => u.field), ['servings', 'prepMin', 'cookMin']);
});

test('demo mode builds the page from the demo bank (and only there); it logs nothing', () => {
  const { P } = run({ openRecipeId: 'r6', recipeScaleView: { id: 'r6', n: 8 } }, { demo: true });
  assert.equal(P.demo, true);
  assert.deepEqual(lineTexts(P), ['1000 g turkey mince (batch)', '1 lime, juiced', '2 onion, diced']);
  assert.deepEqual([P.macros.p, P.macros.kcal], [45, 470], 'per serving, unscaled');
  assert.equal(P.log, null);
  assert.equal(P.shopping, null);
  assert.equal(P.setMeta, null);
  assert.match(P.logNote, /Demo recipe/);
});

test('the summary sheet reads the same page: the same scaled lines, the same shopping payload', () => {
  const { v, calls } = run({ recipeScaleView: { id: 'burrito-bowls', n: 9 } }, { style: 'summary' });
  const withSheet = valsFuelSummary({ state: { novaStyle: 'summary', screen: 'recipes', liveRecipes: [BOWLS], openRecipeId: 'burrito-bowls', liveRecipePhotoUrls: {}, recipePhotoUploadBusy: {} }, recipes: [] }, { demoMode: false }, { ...v, foodLogVisible: true, foodLogDays: [] });
  const R = withSheet.fuelSummary.recipeSheet;
  assert.equal(R.page, v.recipePage);
  assert.equal(R.lines.length, 8, 'the group label is the page\'s, not a line');
  assert.equal(R.lines[1].name, '720 g basmati rice (dry)');
  assert.equal(R.shopping.count, 8);
  assert.equal(R.shopping.scaled, true);
  R.shopping.all();
  assert.deepEqual(calls.at(-1)[1][0], '1.8 kg chicken thigh, diced');
});

test('a bank card says serves and time in one line, and never draws a dash for what is missing', () => {
  assert.equal(cardMeta(BOWLS), 'Serves 6 · 40 min');
  assert.equal(cardMeta({ makes: '6 jars' }), '6 jars');
  assert.equal(cardMeta({ servings: 2, time: '25 min' }), 'Serves 2 · 25 min');
  assert.equal(cardMeta({}), null);
  assert.deepEqual(splitAmount('2 x 400g cans black beans'), { amount: '2 x', item: '400g cans black beans' });
  const { v } = run();
  const card = v.recipeList.find((r) => r.name === 'Chicken burrito bowls');
  assert.equal(card.meta, 'Serves 6 · 40 min');
  assert.equal(card.reel, true);
});

// ---- source contracts ---------------------------------------------------------

test('the scaling is recipeScale\'s, read once in the view model; both idioms draw the same parts', () => {
  const vals = read('src/vals/valsRecipes.js');
  assert.match(vals, /import \{[^}]*scaleRecipe[^}]*\} from '\.\.\/recipeScale\.js';/);
  const overlay = read('src/RecipeOverlay.jsx');
  assert.match(overlay, /from '\.\/RecipePage\.jsx';/);
  assert.match(overlay, /const P = v\.recipePage;/);
  for (const part of ['RecipeMetaRow', 'RecipeFigures', 'RecipeScale', 'RecipeIngredients', 'RecipeMethod']) {
    assert.match(overlay, new RegExp(`<${part} `), `the page lacks ${part}`);
  }
  const sheet = read('src/RecipeSheet.jsx');
  for (const part of ['RecipeMetaRow', 'RecipeScale', 'RecipeIngredients', 'RecipeMethod']) {
    assert.match(sheet, new RegExp(`<${part} `), `the summary sheet lacks ${part}`);
  }
});

test('Delete lives in the ⋯ sheet, not beside Back; the striped placeholder and window.prompt are gone', () => {
  const overlay = read('src/RecipeOverlay.jsx');
  const bar = overlay.slice(overlay.indexOf('<div className="nv-rp-bar">'), overlay.indexOf('</header>'));
  assert.ok(bar.length > 100, 'the floating bar moved; re-point this test');
  assert.doesNotMatch(bar, /orDelete|Delete/, 'Delete is back beside the dismiss control');
  const more = overlay.slice(overlay.indexOf('const more = {'), overlay.indexOf('const hasMore'));
  assert.match(more, /v\.orDelete && \{ label: v\.orDeleteArmed \? 'Tap again to delete this recipe' : 'Delete recipe', danger: true/);
  assert.match(more, /Open the source/);
  assert.match(more, /Rename this version/);
  const count = (src) => (src.match(/orDelete\b/g) || []).length;
  assert.equal(count(overlay), count(more), 'Delete is reachable from somewhere other than the ⋯ sheet');
  assert.doesNotMatch(overlay, /dish photo —/);
  assert.doesNotMatch(overlay, /window\.prompt/);
  assert.doesNotMatch(overlay, /🎙/);
  // the back swipe's contract: a page root, and a named close control
  assert.match(overlay, /role="dialog" aria-modal="true" aria-label=\{P\.name\} data-edge-page="" onClick=\{v\.closeRecipe\}/);
  assert.match(overlay, /onClick=\{v\.closeRecipe\} data-edge-close=""/);
});

test('the page adds no network path: every write is an existing app method', () => {
  for (const f of ['src/RecipePage.jsx', 'src/RecipeOverlay.jsx', 'src/RecipeSheet.jsx']) {
    const src = read(f);
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|from ['"][./]*api\.js['"]|\bapi\.\w+\(|getConnection\(/, `${f} reaches the network`);
  }
});

test('the page\'s styles sit at the end of index.css, tokens only, with a reduced-motion answer', () => {
  const css = read('src/index.css');
  const start = css.indexOf('THE RECIPE PAGE (29 Sep 2026)');
  assert.ok(start > 0);
  const block = css.slice(start);
  assert.doesNotMatch(block, /--nv-blue|--nv-ink70/, 'a token that does not exist fails silently');
  assert.match(block, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.nv-rp-photo \{ animation: fadeIn/);
  // no type below 13px in the page's own rules
  const sizes = [...block.matchAll(/font:\s*[^;]*?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length > 20);
  assert.deepEqual(sizes.filter((n) => n < 13), []);
});
