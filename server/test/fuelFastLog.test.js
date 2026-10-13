import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('hold the camera: a confident read is logged through the same write Add makes, and a question never is', () => {
  const app = read('src/App.jsx');
  assert.match(app, /runFoodScan\(photosArg, noteArg, \{ auto = false \} = \{\}\)/);
  assert.match(app, /attachFoodScanPoll\(conn, jobId, \{ kind: 'scan', photos, note, auto \}\)/);
  // inside the setState callback, so the fields already hold the read
  assert.match(app, /\}, \(\) => \{\n[^]*?if \(meta\.auto && !asks && r\.name && r\.macros\) this\.submitFoodLog\(\);\n\s*\}\);/);
  const vals = read('src/vals/valsRecipes.js');
  assert.match(vals, /const auto = !!app\.state\.foodSnapAuto;/);
  assert.match(vals, /app\.runFoodScan\(null, null, \{ auto: true \}\)/);
  // the page opens the picker on release of a hold, and a tap still reviews first
  const page = read('src/screens/FuelSummary.jsx');
  assert.match(page, /camRef\.current\?\.click\(\)/);
  assert.match(page, /c\.armSnap\?\.\(true\)/);
});

test('instant matches: rotation and past logs log on the tap, recipes open for a portion', () => {
  const vals = read('src/vals/valsFuelSummary.js');
  assert.match(vals, /kind: 'log', name: o\.name/);
  assert.match(vals, /kind: 'log', name: it\.name[^]*?open: \(\) => app\.relogFoodItem\(it\)/);
  assert.match(vals, /kind: 'recipe'[^]*?open: \(\) => app\.openRecipe\(r\.id\)/);
});
