// ROUND 3 OF THE REEL WORK (4 Nov 2026): late data settles instead of
// jumping, sheets are built as they land, a refresh over the phone's copy
// says how old the copy is, and a sync never runs a whole-page transition.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), 'utf8');
const app = read('src/App.jsx');

test('a change he did not cause settles; his own and the session keep their motion', () => {
  const settle = read('src/settle.js');
  assert.match(settle, /if \(now - lastInputAt < INPUT_QUIET_MS\) return null;/);
  assert.match(settle, /export const INPUT_QUIET_MS = 700;/);
  assert.match(settle, /if \(document\.querySelector\('\.nv-set-layer'\)\) return null;/, 'a hand-off in flight is settled over');
  // transform and opacity only: an ancestor filter flattens the glass in WebKit
  assert.ok(!/filter/.test(settle.replace(/\/\/[^\n]*/g, '')), 'the settle animates a filter');
  assert.match(settle, /quiet\(\)\) return null;/, 'reduced motion settles anyway');
  assert.match(app, /if \(e\?\.type === 'pointerdown' \|\| e\?\.type === 'keydown'\) settleNoteInput\(\);/);
  assert.match(app, /if \(this\.state\.screen === 'workouts' && this\.state\.workoutsView === 'session'\) return null;/);
  assert.match(app, /if \(motion\?\.settle\) requestAnimationFrame\(\(\) => settlePlay\(motion\.settle\)\);/);
});

test('a sync never photographs the page: the note preselect is quiet', () => {
  assert.match(app, /this\.selectNote\(r\.notes\[0\]\.id, \{ quiet: true \}\)/);
  assert.match(app, /this\.selectNote\(notesRes\.notes\[0\]\.id, \{ quiet: true \}\)/);
  assert.match(app, /if \(quiet \|\| this\.state\.screen !== 'notes'\) this\.setState\(\{ openNoteId: id \}\);/);
});

test('a glass sheet is built as it lands', () => {
  const sheet = read('src/GlassSheet.jsx');
  assert.match(sheet, /import \{ buildIn \} from '\.\/handoff\.js';/);
  assert.match(sheet, /buildIn\(bodyRef\.current, \{ startDelay: 90 \}\);/);
  assert.match(sheet, /<div ref=\{bodyRef\}/);
});

test('a refresh over the copy says the copy’s age, a first connect says connecting', () => {
  const vm = read('src/vals/valsMission.js');
  assert.match(vm, /const copyAsOf = st\.connectionStatus === 'connecting' && st\.lastSyncAt \?/);
  assert.match(vm, /label: copyAsOf \? `AS OF \$\{copyAsOf\.toUpperCase\(\)\}` : 'CONNECTING…'/);
});
