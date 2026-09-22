// THE FOOD LOG HE ASKED FOR (22 Sep 2026).
//
// "I need the food log to be revised to be cleaner, easier, more apple-like
// aesthetic and have recently logged or added foods added to the top so I
// don't need to keep scrolling to search for something I just added."
//
// Three separable claims, and this file pins all three so a later pass cannot
// quietly undo them:
//   1. the fastest path is at the TOP and always on screen — not behind a
//      disclosure at the foot of the day's entries;
//   2. the composer is one object, not a field followed by four boxes;
//   3. the day reads as ONE grouped list in the Apple grammar, and every
//      number on the surface carries its meaning in colour (CLAUDE.md, §2b
//      r7: nothing is a plain box with text, and colour means something).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
// NOT comment-stripped, deliberately, and the reason is worth keeping: the
// obvious `replace(/\/\*[\s\S]*?\*\//g, '')` treats the `/*` inside
// `accept="image/*"` as the start of a comment and eats the rest of the file.
// Every assertion below therefore anchors on CODE — a style string, a prop, a
// call — never on the text of a comment, which is the trap that guard exists
// for. A negative assertion is sliced tight enough that a comment cannot
// satisfy it.
const SCREEN = readFileSync(root('src/screens/Recipes.jsx'), 'utf8');
const APP = readFileSync(root('src/App.jsx'), 'utf8');
const CSS = readFileSync(root('src/index.css'), 'utf8');

test('the quick-log rail is above the day, not below it', () => {
  const rail = SCREEN.indexOf('v.foodQuickLog.length > 0');
  const entries = SCREEN.indexOf('v.foodLogEntries.map(');
  const archive = SCREEN.indexOf('v.foodHistory.map(');
  assert.ok(rail > 0, 'the rail must exist');
  assert.ok(rail < entries, 'the rail comes before the day it adds to');
  assert.ok(entries < archive, 'and the full archive stays at the foot, where it was');
});

test('its data loads on arrival and re-reads after a log — it is never stale or empty by accident', () => {
  assert.match(APP, /screen === 'recipes' && this\.state\.liveFoodHistory == null\) this\.loadFoodHistory\(\)/,
    'waiting for him to open a disclosure is what made it useless');
  // the SUBMIT path specifically — the first `api.addFoodLogEntry(` in the
  // file is the offline outbox's replay map, which is a different journey
  const add = APP.slice(APP.indexOf('api.addFoodLogEntry(conn, { name, macros, source, date, items })'));
  assert.match(add.slice(0, add.indexOf('.catch(')), /this\.loadFoodHistory\(\)/,
    'the thing he just logged must be on the rail the moment it lands');
  assert.ok(!/if \(this\.state\.foodHistoryOpen\) this\.loadFoodHistory\(\)/.test(APP),
    'the refresh must not be conditional on the closed disclosure any more');
});

test('a rail card draws the food, it does not spell it out', () => {
  const at = SCREEN.indexOf('function QuickLogCard');
  const card = SCREEN.slice(at, SCREEN.indexOf('\n}', at));
  assert.match(card, /var\(--nv-cy\)/, 'protein cyan');
  assert.match(card, /var\(--nv-gold\)/, 'carbs gold');
  assert.match(card, /var\(--nv-vi\)/, 'fat violet');
  assert.match(card, /grams > 0 &&/, 'a food with no macros draws no bar rather than a bar of zeros');
  assert.match(card, /font:700 19px/, 'the energy is the figure, at display size');
  assert.match(card, /onClick=\{item\.log\}/, 'one tap is the whole point');
  assert.match(card, /haptic="commit"/, 'logging something is a commit and must be felt');
});

test('the composer is ONE field: the ways of saying it live inside it', () => {
  const open = SCREEN.indexOf('<div style={css("margin-top:12px;display:flex;align-items:center;gap:2px;background:var(--nv-well)');
  assert.ok(open > 0, 'the one-field composer is gone — this is its container, by its own style string');
  const field = SCREEN.slice(open, SCREEN.indexOf('{v.foodScanBusy &&', open));
  for (const [what, re] of [['dictation', /dict\.toggle/], ['camera', /type="file"/], ['barcode', /openBarcodeScanner/]]) {
    assert.match(field, re, `${what} must be inside the field, not a box beside it`);
  }
  assert.ok(!/width:42px;height:42px/.test(field), 'the four 42px boxes are what made it a toolbar');
  assert.match(field, /\{v\.canDescribeFood && \(/, 'send ARRIVES when there is something to send');
  assert.match(CSS, /@keyframes nvSendArrive/);
  assert.ok(!/from \{ opacity: 0; transform: scale\(0\)/.test(CSS), 'nothing appears from nothing');
});

test('the camera stays a label wrapping its own input — the one shape iOS opens a picker for', () => {
  const at = SCREEN.indexOf('aria-label="Shoot or add photos"');
  const label = SCREEN.slice(at, SCREEN.indexOf('</label>', at));
  assert.match(label, /<input type="file" accept="image\/\*" multiple/);
  assert.ok(!/capture=/.test(label), 'capture would force the camera and take the photo library away');
});

test('the day is one grouped list, with the separator inset to the text', () => {
  const at = SCREEN.indexOf('v.foodLogEntries.map(');
  const list = SCREEN.slice(at - 700, at + 2200);
  assert.match(list, /\{i > 0 && <div aria-hidden="true" style=\{css\("height:1px;margin-left:58px/,
    'a full-bleed rule reads as a table; the inset is the Apple signature');
  assert.ok(!/padding:6px 0;border-top:1px solid/.test(SCREEN),
    'the old per-row top border drew one hairline per entry across the full width');
});

test('the day strip is one rail and can never wrap to a second row', () => {
  const at = SCREEN.indexOf("<Meta tone=\"faint\" style={{ flex: 'none' }}>For</Meta>");
  assert.ok(at > 0, 'the day strip is gone');
  const row = SCREEN.slice(SCREEN.lastIndexOf('<div style={css(', at), SCREEN.indexOf('</div>', at));
  assert.match(row, /overflow-x:auto/, 'seven chips plus a label wrapped at 402px');
  assert.ok(!/flex-wrap:wrap/.test(row), 'wrapping is exactly what this replaced');
  assert.match(row, /v\.foodLogDays\.map\(/, 'and it is still the same set of days');
});
