// FUEL, 3 OCT 2026 — his report, verbatim in part: "I was trying to log the
// lasagne as what I ate yesterday but when I clicked on it from my meals it
// logged it to today. I am unable to delete the lasagne from my current
// plan." Pinned here:
//   - every write lands on the day the log is showing (one helper, every path);
//   - every log row comes off, a rotation row by un-ticking its slot;
//   - the rotation strip lists every dish and ticks the one tapped;
//   - the bottom of Fuel keeps his order and his switches.
// The server half (a past-day tick writes that day) is rotationRetro.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { logDate, dayWord, loggedLine, removalFor, rotationTickedIn, localIso } from '../../src/fuelDay.js';
import { rotationStrip } from '../../src/fuelSummaryFacts.js';
import { FUEL_CARDS, FUEL_CARDS_KEY, reconcileFuelCards, getFuelCards, saveFuelCards, moveFuelCard, fuelCardRuns } from '../../src/fuelCards.js';
import { valsRecipes } from '../../src/vals/valsRecipes.js';
import { valsFuelSummary } from '../../src/vals/valsFuelSummary.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const isoBack = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localIso(d); };
const TODAY = localIso();
const YESTERDAY = isoBack(1);

// ---- the one helper ------------------------------------------------------------

test('a write targets the day in view, and today is "no date" (the server reads that as today)', () => {
  assert.equal(logDate({ foodLogDate: null }), undefined);
  assert.equal(logDate({}), undefined);
  assert.equal(logDate({ foodLogDate: YESTERDAY }), YESTERDAY);
  assert.equal(logDate({ foodLogDate: 'garbage' }), undefined, 'a malformed day never reaches the server as a date');
});

test('the receipt names the day whenever it is not today', () => {
  assert.equal(dayWord(TODAY, TODAY), null);
  assert.equal(dayWord(undefined, TODAY), null);
  assert.equal(dayWord('2026-10-02', '2026-10-03'), 'yesterday');
  assert.equal(dayWord('2026-09-30', '2026-10-03'), 'Wednesday');
  assert.equal(dayWord('2026-09-20', '2026-10-03'), '20 September');
  assert.equal(loggedLine('Easy Meal Prep Lasagna', '2026-10-02', '2026-10-03'), 'Logged Easy Meal Prep Lasagna to yesterday');
  assert.equal(loggedLine('Easy Meal Prep Lasagna', undefined, '2026-10-03'), 'Logged Easy Meal Prep Lasagna');
});

test('EVERY food add in App asks this.logDate() for its day, and nothing reads foodLogDate by hand', () => {
  const app = read('src/App.jsx');
  assert.doesNotMatch(app, /this\.state\.foodLogDate \|\| undefined/, 'the hand-rolled read is gone');
  const drainAt = app.indexOf('outboxDrainFns() {');
  const drainEnd = app.indexOf('\n  }\n', drainAt);
  const calls = [...app.matchAll(/api\.addFoodLogEntry\(conn, \{/g)].map((m) => m.index).filter((i) => i < drainAt || i > drainEnd);
  assert.ok(calls.length >= 4, `expected the composer, portion sheet, recipe and log-again adds, found ${calls.length}`);
  // each add's enclosing method: the last class-method header before it
  const heads = [...app.matchAll(/\n  ([a-zA-Z]+)\([^)\n]*\) \{\n/g)];
  for (const at of calls) {
    const head = heads.filter((h) => h.index < at).at(-1);
    const body = app.slice(head.index, at);
    assert.match(body, /const date = this\.logDate\(\);/, `${head[1]} must take its day from logDate`);
    assert.match(app.slice(at, at + 120), /\bdate\b/, `and ${head[1]} must hand it to the server`);
  }
  // the outbox replays a queued add, and a queued rotation tick, with the day it was made for
  assert.match(app, /food: \(conn, p\) => api\.addFoodLogEntry\(conn, \{[^}]*date: p\.date \}\)/);
  assert.match(app, /rotationEaten: \(conn, p\) => api\.setRotationEaten\(conn, p\.slot, p\.recipeId, p\.eaten, p\.date\)/);
});

test('a rotation tick from Fuel is routed by the day in view; a past day goes to the server WITH that day', () => {
  const app = read('src/App.jsx');
  const at = app.indexOf('  tickRotation(slot, recipeId, eaten, { date = this.logDate(), receipt = true } = {}) {');
  assert.ok(at > 0, 'tickRotation defaults its day to the one in view');
  const body = app.slice(at, app.indexOf('\n  setRotationReceipt(', at));
  assert.match(body, /if \(!date\) \{\n\s+return this\.toggleOptionEaten\(slot, recipeId, eaten\)/, 'today is the rotation\'s own tick');
  assert.match(body, /api\.setRotationEaten\(conn, slot, recipeId, eaten, date\)/, 'a past day sends the day');
  // the api client forwards it
  assert.match(read('src/api.js'), /setRotationEaten: \(conn, slot, recipeId, eaten, date\) => post\(conn, '\/api\/rotation\/eaten', \{ slot, recipeId, eaten, \.\.\.\(date \? \{ date \} : \{\}\) \}\)/);
  // and the server sends a past date to the retro write, not to today's tick
  const route = read('server/routes/recipes.js');
  assert.match(route, /if \(date && resolveLogDate\(date\) !== resolveLogDate\(\)\) \{\n\s+const out = await setRotationEatenOn\(/);
});

// ---- the view model, run for real while YESTERDAY is in view -------------------

const RECIPES = [
  { id: 'lasagne', name: 'Easy Meal Prep Lasagna', category: 'CORE DAILY MEALS', macros: { p: 52, c: 48, f: 22, kcal: 610 }, ingredients: [], method: [], alternates: [], notes: [] },
  { id: 'oats', name: 'Protein oats', category: 'CORE DAILY MEALS', macros: { p: 38, c: 55, f: 11, kcal: 470 }, ingredients: [], method: [], alternates: [], notes: [] },
  { id: 'yog', name: 'Greek yoghurt', category: 'CORE DAILY MEALS', macros: { p: 20, c: 12, f: 4, kcal: 170 }, ingredients: [], method: [], alternates: [], notes: [] },
  { id: 'bar', name: 'Protein bar', category: 'TREATS', macros: { p: 20, c: 22, f: 7, kcal: 230 }, ingredients: [], method: [], alternates: [], notes: [] },
];
const opt = (r, extra = {}) => ({ id: r.id, name: r.name, focus: true, eaten: false, macros: r.macros, ...extra });
const ROTATION = {
  order: ['breakfast', 'lunch', 'dinner', 'snack', 'extra'],
  slots: {
    breakfast: { ...opt(RECIPES[1]), eaten: true, consumed: true },
    dinner: { ...opt(RECIPES[0]), portionsLeft: 3 },
    snack: opt(RECIPES[2]),
  },
  options: {
    breakfast: [{ ...opt(RECIPES[1]), eaten: true, consumed: true }],
    dinner: [opt(RECIPES[0], { portionsLeft: 3 })],
    snack: [opt(RECIPES[2]), opt(RECIPES[3], { focus: false })],
  },
  totals: { p: 110, c: 115, f: 37, kcal: 1250 },
};
const TODAY_LOG = { date: TODAY, entries: [
  { id: 't1', time: '07:30', name: 'Protein oats', source: 'rotation', slot: 'breakfast', recipeId: 'oats', macros: RECIPES[1].macros },
  // the lasagne he ticked by mistake, ON TODAY
  { id: 't2', time: '08:10', name: 'Easy Meal Prep Lasagna', source: 'rotation', slot: 'dinner', recipeId: 'lasagne', macros: RECIPES[0].macros },
  { id: 't3', time: '10:00', name: 'Flat white', source: 'history', macros: { p: 9, c: 10, f: 7, kcal: 140 } },
] };

function run(state = {}) {
  const calls = [];
  const app = new Proxy({
    state: {
      novaStyle: 'summary', screen: 'recipes', connectionStatus: 'connected',
      recipeFilter: 'All', liveRecipePhotoUrls: {}, recipePhotoUploadBusy: {}, recipeChat: [],
      foodLogName: '', foodLogP: '', foodLogC: '', foodLogF: '', foodLogKcal: '', foodPortionCustom: '',
      liveRecipes: RECIPES, liveRecipeProfile: { proteinFloorG: 160, targetKcal: 2600 },
      liveFoodLog: TODAY_LOG, liveRotation: ROTATION, liveRecipesEmpty: false,
      liveFoodHistory: [{ key: 'flat-white', name: 'Flat white', count: 4, macros: { p: 9, c: 10, f: 7, kcal: 140 } }],
      ...state,
    },
    recipes: [],
  }, { get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, ...args]); }) });
  const ctx = { demoMode: false, isOffline: false };
  const v = { ...valsRecipes(app, ctx), foodLogDays: [], summary: true };
  return { ...valsFuelSummary(app, ctx, v), v, calls };
}

test('THE STRIP lists every dish in every slot, in his order, with the next one to eat marked', () => {
  const { fuelSummary: F } = run();
  const tiles = F.rotation.strip.tiles;
  assert.deepEqual(tiles.map((t) => t.key), ['breakfast:oats', 'lunch:empty', 'dinner:lasagne', 'snack:yog', 'snack:bar']);
  assert.equal(tiles[0].eaten, true, 'breakfast is ticked today');
  assert.equal(tiles[1].empty, true, 'an empty slot says so, it is not skipped');
  assert.equal(tiles[3].of, '1 of 2', 'several snacks each get a tile');
  assert.equal(F.rotation.strip.nextKey, 'dinner:lasagne', 'the first dish not yet eaten');
  assert.equal(F.rotation.strip.line, '1 of 4 eaten today');
});

test('the strip ticks the dish tapped, not "the next slot", and un-ticks a ticked one', () => {
  const { fuelSummary: F, calls } = run();
  F.rotation.strip.tiles.find((t) => t.key === 'snack:bar').toggle();
  assert.deepEqual(calls.at(-1), ['tickRotation', 'snack', 'bar', true]);
  F.rotation.strip.tiles.find((t) => t.key === 'breakfast:oats').toggle();
  assert.deepEqual(calls.at(-1), ['tickRotation', 'breakfast', 'oats', false]);
});

test('viewing YESTERDAY: the strip reads yesterday\'s log, so a dish eaten today is not ticked there, and a tick goes through the routed path', () => {
  const past = { date: YESTERDAY, entries: [
    { id: 'y1', name: 'Greek yoghurt', source: 'rotation', slot: 'snack', recipeId: 'yog', macros: RECIPES[2].macros },
  ] };
  const { fuelSummary: F, calls } = run({ foodLogDate: YESTERDAY, liveFoodLogView: past });
  const byKey = Object.fromEntries(F.rotation.strip.tiles.map((t) => [t.key, t]));
  assert.equal(byKey['breakfast:oats'].eaten, false, "today's breakfast tick is not yesterday's");
  assert.equal(byKey['snack:yog'].eaten, true, "yesterday's log holds the yoghurt");
  assert.match(F.rotation.strip.line, /1 of 4 eaten on \w+day$/);
  byKey['dinner:lasagne'].toggle();
  assert.deepEqual(calls.at(-1), ['tickRotation', 'dinner', 'lasagne', true], 'App.tickRotation defaults the day to the one in view');
  // the cupertino rotation card's tick reads and routes the same way
  const { v } = run({ foodLogDate: YESTERDAY, liveFoodLogView: past });
  const snack = v.rotationSlots.find((s) => s.key === 'snack');
  assert.equal(snack.options.find((o) => o.id === 'yog').eaten, true);
});

test('viewing YESTERDAY: "Log it again" and "Everything you\'ve logged" go through the add that takes the day in view', () => {
  const { fuelSummary: F, calls } = run({ foodLogDate: YESTERDAY, liveFoodLogView: { date: YESTERDAY, entries: [] } });
  F.composer.again[0].log();
  assert.equal(calls.at(-1)[0], 'relogFoodItem');
  F.log.history.items[0].relog();
  assert.equal(calls.at(-1)[0], 'relogFoodItem');
  assert.match(F.composer.logsTo, /^Entries land on /);
});

test('an add to yesterday leaves a receipt that says so, with its Undo', () => {
  const entry = { id: 'n1', name: 'Easy Meal Prep Lasagna', macros: RECIPES[0].macros };
  const { fuelSummary: F, calls } = run({ foodLogDate: YESTERDAY, liveFoodLogView: { date: YESTERDAY, entries: [entry] },
    foodLoggedReceipt: { entry, date: YESTERDAY, at: Date.now() } });
  const r = F.log.receipts.find((x) => x.key === 'logged-n1');
  assert.ok(r, 'the receipt is on the page');
  assert.equal(r.title, 'Logged Easy Meal Prep Lasagna to yesterday');
  r.undo();
  assert.deepEqual(calls.at(-1), ['undoLoggedReceipt', entry, YESTERDAY]);
  // an add to today does not need one: the row itself is under his thumb
  assert.equal(run({ foodLoggedReceipt: { entry, date: TODAY, at: Date.now() } }).fuelSummary.log.receipts.length, 0);
});

// ---- every row comes off -----------------------------------------------------

test('EVERY log row has a way off, and a rotation row un-ticks its slot rather than leaving the plan ticked', () => {
  assert.deepEqual(removalFor(TODAY_LOG.entries[1]), { kind: 'untick', slot: 'dinner', recipeId: 'lasagne' });
  assert.deepEqual(removalFor(TODAY_LOG.entries[2]), { kind: 'delete', id: 't3' });
  assert.deepEqual(removalFor({ id: 'old', source: 'rotation', slot: 'lunch' }), { kind: 'delete', id: 'old' }, 'a legacy row with no recipe cannot name what to un-tick');
  const { fuelSummary: F, calls } = run();
  const lasagne = F.log.rows.find((r) => r.id === 't2');
  assert.equal(lasagne.fromRotation, true);
  assert.equal(lasagne.removeWord, 'Remove and un-tick');
  lasagne.remove();
  assert.equal(calls.at(-1)[0], 'removeFoodLogRow');
  assert.equal(calls.at(-1)[1].id, 't2', 'App decides untick vs delete from the entry itself');
  assert.equal(F.log.rows.find((r) => r.id === 't3').removeWord, 'Remove');
});

test('App: a rotation row un-ticks on its own day; a dish no longer in today\'s slot is deleted plainly', () => {
  const app = read('src/App.jsx');
  const at = app.indexOf('  removeFoodLogRow(entry) {');
  const body = app.slice(at, app.indexOf('\n  }\n', at));
  assert.match(body, /removalFor\(entry\)/);
  assert.match(body, /this\.tickRotation\(plan\.slot, plan\.recipeId, false, \{ date \}\)/);
  assert.match(body, /this\.deleteFoodLogEntry\(entry\.id\)/);
});

test('the un-tick leaves a receipt whose Undo re-ticks it', () => {
  const { fuelSummary: F, calls } = run({ rotationReceipt: { kind: 'untick', slot: 'dinner', recipeId: 'lasagne', name: 'Easy Meal Prep Lasagna', macros: RECIPES[0].macros, at: Date.now() } });
  const r = F.log.receipts.find((x) => x.key === 'rot-dinner-lasagne');
  assert.equal(r.title, 'Easy Meal Prep Lasagna removed');
  assert.equal(r.sub, 'Un-ticked · 52 g, 610 kcal off the plate');
  r.undo();
  assert.equal(calls.at(-1)[0], 'undoRotationReceipt');
  // the cupertino page's undo rail carries it too
  const { v } = run({ rotationReceipt: { kind: 'untick', slot: 'dinner', recipeId: 'lasagne', name: 'Easy Meal Prep Lasagna', date: YESTERDAY, at: Date.now() } });
  assert.equal(v.foodLogUndos.find((u) => u.key === 'rot').label, 'Undo — put Easy Meal Prep Lasagna back on yesterday');
});

test('rotationTickedIn reads a day\'s log by slot and recipe', () => {
  assert.equal(rotationTickedIn(TODAY_LOG.entries, 'dinner', 'lasagne'), true);
  assert.equal(rotationTickedIn(TODAY_LOG.entries, 'dinner', 'oats'), false);
  assert.equal(rotationTickedIn(null, 'dinner', 'lasagne'), false);
});

test('rotationStrip: an empty rotation has no dishes and no next', () => {
  const s = rotationStrip([{ key: 'breakfast', name: 'Breakfast', options: [] }]);
  assert.equal(s.dishes, 0);
  assert.equal(s.nextIndex, -1);
  assert.equal(rotationStrip([]).tiles.length, 0);
});

// ---- the bottom of Fuel, in his order ------------------------------------------

test('the cards reconcile: unknown keys drop, new ones append on, his order and his switches survive', () => {
  assert.deepEqual(reconcileFuelCards(null).map((c) => c.key), FUEL_CARDS.map(([k]) => k));
  const r = reconcileFuelCards({ order: ['pick', 'gone', 'log'], off: ['history'] });
  assert.deepEqual(r.map((c) => c.key), ['pick', 'log', 'rotation', 'history', 'recipes']);
  assert.equal(r.find((c) => c.key === 'history').on, false);
  assert.equal(r.find((c) => c.key === 'rotation').on, true);
  assert.deepEqual(reconcileFuelCards('garbage').map((c) => c.key), FUEL_CARDS.map(([k]) => k));
});

test('order and visibility persist in localStorage under novaos.fuelCards, and nothing is lost', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, val) => store.set(k, String(val)), removeItem: (k) => store.delete(k) };
  try {
    assert.equal(FUEL_CARDS_KEY, 'novaos.fuelCards');
    let list = getFuelCards();
    list = moveFuelCard(list, list.findIndex((c) => c.key === 'rotation'), 0);
    list = list.map((c) => (c.key === 'pick' ? { ...c, on: false } : c));
    saveFuelCards(list);
    assert.deepEqual(JSON.parse(store.get('novaos.fuelCards')), { order: ['rotation', 'log', 'history', 'recipes', 'pick'], off: ['pick'] });
    const back = getFuelCards();
    assert.deepEqual(back.map((c) => [c.key, c.on]), [['rotation', true], ['log', true], ['history', true], ['recipes', true], ['pick', false]]);
    assert.equal(back.length, FUEL_CARDS.length, 'a hidden card is still in the list, one tap away in the sheet');
    store.set('novaos.fuelCards', '{not json');
    assert.equal(getFuelCards().length, FUEL_CARDS.length, 'a corrupt value falls back to the house order');
  } finally {
    delete globalThis.localStorage;
  }
});

test('the page draws only the cards that are on, in order, and the two doors share a card when they sit together', () => {
  const list = reconcileFuelCards({ order: ['rotation', 'recipes', 'pick', 'log', 'history'], off: ['history'] });
  assert.deepEqual(fuelCardRuns(list), [
    { kind: 'card', key: 'rotation' }, { kind: 'doors', keys: ['recipes', 'pick'] }, { kind: 'card', key: 'log' },
  ]);
  const apart = reconcileFuelCards({ order: ['recipes', 'log', 'pick'] });
  assert.deepEqual(fuelCardRuns(apart).filter((r) => r.kind === 'doors'), [{ kind: 'doors', keys: ['recipes'] }, { kind: 'doors', keys: ['pick'] }]);
  assert.deepEqual(fuelCardRuns(list, { log: false }).map((r) => r.key || r.keys.join()), ['rotation', 'recipes,pick'], 'a card with nothing to draw is skipped, never drawn empty');
});

test('the view model carries the cards and the Edit sheet, and the sheet is the house one', () => {
  const { fuelSummary: F, calls } = run({ fuelCards: reconcileFuelCards({ off: ['pick'] }) });
  assert.equal(F.cards.hidden, 1);
  assert.equal(F.cards.rows.length, FUEL_CARDS.length);
  F.cards.edit.show();
  assert.equal(calls.at(-1)[0], 'openFuelCardsEdit');
  F.cards.edit.setList(F.cards.rows);
  assert.equal(calls.at(-1)[0], 'setFuelCards');
  const page = read('src/screens/FuelSummary.jsx');
  assert.match(page, /<PinnedEditSheet edit=\{F\.cards\.edit\} rows=\{F\.cards\.rows\} title="Fuel"/);
  // the sheet is a history level, so the back swipe closes it rather than leaving Fuel under it
  const app = read('src/App.jsx');
  assert.match(app, /window\.history\.pushState\(\{ novaDepth: depthOf\(st\) \+ 1, novaOverlay: 'fuelCards' \}, ''\)/);
  assert.match(app, /\.\.\.this\.fuelCardsFromHistory\(\), \.\.\.this\.moneyFromHistory\(\) \};/);
});
