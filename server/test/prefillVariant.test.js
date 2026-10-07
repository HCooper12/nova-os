// A LIFT DONE ONLY UNDER ANOTHER NAME STARTS FROM THAT NAME'S LAST SETS
// (7 Oct 2026). He added Lat Pulldown to his pull session and it came in at
// 0 kg × 8: every set he had done was logged as Wide-Grip Lat Pulldown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { movementOf, variantFor } from '../lib/sessionPrefill.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lib = [
  { id: 'lat-pulldown', name: 'Lat Pulldown' },
  { id: 'wide-grip-lat-pulldown', name: 'Wide-Grip Lat Pulldown' },
  { id: 'close-grip-lat-pulldown', name: 'Close-Grip Lat Pulldown' },
  { id: 'single-arm-lat-pulldown', name: 'Single-Arm Lat Pulldown' },
  { id: 'machine-row', name: 'Machine Row' },
  { id: 'barbell-row', name: 'Barbell Row' },
];
const state = {
  'wide-grip-lat-pulldown': { lastDate: '2026-09-30', lastSets: [{ weight: 73, reps: 9 }] },
  'close-grip-lat-pulldown': { lastDate: '2026-08-01', lastSets: [{ weight: 60, reps: 10 }] },
  'barbell-row': { lastDate: '2026-10-01', lastSets: [{ weight: 80, reps: 8 }] },
};

test('grip and width words are stripped, the movement is not', () => {
  assert.equal(movementOf('Wide-Grip Lat Pulldown'), 'lat pulldown');
  assert.equal(movementOf('Close Grip Lat Pulldown'), 'lat pulldown');
  assert.equal(movementOf('Machine Row'), 'machine row');
});

test('the most recent grip variant fills a lift with no history of its own', () => {
  assert.equal(variantFor(lib, state, 'lat-pulldown').id, 'wide-grip-lat-pulldown');
});

test('a one-arm lift is never filled from a two-arm one, nor a machine from a barbell', () => {
  assert.equal(variantFor(lib, state, 'single-arm-lat-pulldown'), null);
  assert.equal(variantFor(lib, state, 'machine-row'), null);
});

test('the session start uses the variant only when the lift has no sets of its own, and says so', async () => {
  const app = await readFile(path.join(ROOT, 'src', 'App.jsx'), 'utf8');
  assert.match(app, /const base = e\.lastSets\?\.length \? e\.lastSets : e\.startSets\?\.length \? e\.startSets : null;/);
  const ss = await readFile(path.join(ROOT, 'src', 'screens', 'SessionSummary.jsx'), 'utf8');
  assert.match(ss, /started from <b>\{L\.startFrom\}<\/b>/);
});
