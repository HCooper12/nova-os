// THE REDESIGN IS A SKIN, NOT A REWRITE OF WHAT HAPPENS (his instruction,
// 13 Oct 2026): "all of the upgrades and animations ... should ideally still
// be in place." Each keynote moment added on 13 Oct is pinned here by the hook
// that makes it happen, so a reskin can restyle any of them freely but cannot
// silently drop one. Changing one ON PURPOSE: update the line here and say why.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const CSS = read('src/index.css');

const KEPT = [
  ['spring tokens', 'src/index.css', /--nv-spring-snappy:linear\(/],
  ['the odometer on Fuel\'s kcal ring', 'src/screens/Recipes.jsx', /<NumberRoll value=\{ring\.eaten\} \/>/],
  ['the odometer on Fuel\'s protein figure', 'src/screens/Recipes.jsx', /<NumberRoll value=\{hero\.p\} \/>/],
  ['the quick-log check on the card', 'src/screens/Recipes.jsx', /className="nv-logged"/],
  ['the set tick that springs and draws', 'src/screens/Workouts.jsx', /className="nv-setdone"/],
  ['Finish workout shows saving and blocks a double tap', 'src/screens/Workouts.jsx', /<TickButton state=\{v\.sessionFinishing \? 'working' : 'idle'\}/],
  ['a ring closing on its goal bursts', 'src/RingTile.jsx', /useGoalHit\(/],
  ['Home top-3 Done draws its strike', 'src/screens/MissionStructured.jsx', /className="nv-struck"/],
  ['the segmented pill rides the snappy spring', 'src/Controls.jsx', /clip-path var\(--nv-spring-snappy-ms\) var\(--nv-spring-snappy\)/],
  ['the redesigned Fuel dish tick lands on a spring', 'src/index.css', /\.nv-fs-rt\.on \.nv-fs-rt-tk \.nv-fs-ico \{ transform: scale\(1\); \}/],
  ['the rest ring lands after a set tick', 'src/index.css', /\.nv-ss-rest \{ animation: nvSsRestIn/],
  ['the Builder\'s run shows its stage', 'src/screens/ClaudeCode.jsx', /className="runsteps"/],
  // second batch, 15 Oct
  ['Fuel\'s rotation day totals roll', 'src/screens/Recipes.jsx', /<NumberRoll value=\{Number\(v\.rotationTotals\.kcal\) \|\| 0\} \/>/],
  ['skipping a lift draws its strike and fades the card', 'src/screens/Workouts.jsx', /className="nv-struck" data-struck=\{e\.skipped/],
  ['a shopping tick pops and draws', 'src/screens/Shopping.jsx', /className="nv-checkmark"/],
];

for (const [what, file, re] of KEPT) {
  test(`kept through the redesign: ${what}`, () => {
    assert.match(read(file), re, `${what} is gone from ${file}. A reskin restyles it; it does not remove it.`);
  });
}

test('every moment still honours reduced motion', () => {
  for (const sel of ['.nv-roll-d .col', '.nv-setdone', '.nv-ring-burst', '.nv-struck', '.nv-fs-rt-tk .nv-fs-ico', '.nv-checkmark']) {
    const at = CSS.indexOf(sel);
    assert.ok(at >= 0, `${sel} missing`);
    const reduced = [...CSS.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([^\n]*)\}/g)].map((m) => m[1]).join('\n');
    assert.ok(reduced.includes(sel.split(' ')[0]), `${sel} has no reduced-motion rule`);
  }
});
