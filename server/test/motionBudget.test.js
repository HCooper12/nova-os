// THE FRAME BUDGET FIXES (9 Oct 2026, the motion audit's fifth and sixth
// gaps). His bar: no frame over ~33 ms at 4x CPU during a transition.
// Measured before, in demo at 4x: a session start 83 to 89 ms of main-thread
// work in one task (a view transition's flushSync made the first render
// synchronous), Segmented's layout read 52 ms of forced reflow across two
// starts and two ticks, and the Settings push 64 to 82 ms frames with 26 ms
// of forced layout inside the deep copy of the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p) => readFileSync(root(p), 'utf8');
const between = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));

test('Segmented measures on selection and resize, never because a caller passed a new array', () => {
  const src = between(read('src/Controls.jsx'), 'export function Segmented', '// PHOTOS AND VIDEOS WITH A QUESTION');
  assert.ok(!/\[value, options, apple, stretch\]/.test(src), 'options (a fresh literal per render) is not a dependency');
  assert.match(src, /useLayoutEffect\(\(\) => \{ measure\.current\(\); \}, \[value, optionsKey, apple, stretch\]\)/);
  assert.match(src, /const optionsKey = options\.map\(/);
  assert.match(src, /new ResizeObserver\(/, 'a width change still re-measures');
});

test('a session start rises like every other hop, with no synchronous view transition', () => {
  const app = read('src/App.jsx');
  const fn = between(app, '  startWorkoutSession(routine) {', '  updateSessionExerciseField(');
  assert.ok(!/withTransition/.test(fn));
  assert.match(fn, /sessionCancelConfirm: false \}, \(\) => this\.riseMain\(\)\);/);
});

test("the summary recipe sheet opens and closes without a view transition; cupertino's morph stays", () => {
  const app = read('src/App.jsx');
  assert.match(between(app, '  openRecipe(id, servings = 1) {', '  closeRecipe() {'), /this\.recipeTransition\(\(\) => this\.setState\(\{/);
  assert.match(between(app, '  closeRecipe() {', '  recipeFromHistory() {'), /this\.recipeTransition\(\(\) => this\.setState\(RECIPE_CLOSED\)\)/);
  const rt = between(app, '  recipeTransition(fn) {', '  recipeFromHistory() {');
  assert.match(rt, /if \(this\.state\.novaStyle === 'summary'\) fn\(\);\s*else this\.withTransition\(fn\);/);
});

test('the Settings push copies only what can be seen, reading everything before writing', () => {
  const nav = read('src/settingsNav.js');
  const snap = between(nav, 'export function snapshot() {', '\n}\n');
  assert.ok(!/main\.children\)\) clone\.appendChild\(child\.cloneNode\(true\)\)/.test(snap), 'no deep clone of the whole page');
  // scrolled, not translated (a transform moved the sticky search field), and
  // only when there is a scroll to restore
  assert.match(snap, /if \(scrollTop > 0\) clone\.scrollTop = scrollTop;/);
  assert.ok(!/translateY/.test(snap));
  const firstWrite = snap.indexOf("document.createElement('div')");
  const lastRead = snap.lastIndexOf('getBoundingClientRect');
  assert.ok(lastRead > 0 && lastRead < firstWrite, 'every layout read happens before the first DOM write');
  assert.match(nav, /function copyVisible\(node, held\)/);
  assert.match(nav, /visibility: 'hidden'/, 'an off-screen box keeps its size and shows nothing');
  // a parent left at the top skips the scrollTop write that forced the new page's layout
  assert.match(read('src/screens/Settings.jsx'), /if \(main && p\?\.snap\?\.scrollTop !== 0\) main\.scrollTop = 0;/);
});

// STEP 2 (9 Oct 2026). Measured in demo at 4x CPU, a real tap on the
// Appearance row: the push frame was 50 to 91 ms. It mounted four live
// miniatures of Home and three NovaCore canvases in the slide's first frame,
// and laid out every group below the fold. Now 33 to 44 ms; what remains is
// App's whole-tree render on the path change (every App setState pays it).
test('the Appearance previews mount after the slide lands, into frames already their size', () => {
  const src = read('src/screens/SettingsPages.jsx');
  const page = between(src, 'export function AppearancePage', '\n}\n');
  assert.match(src, /const t = setTimeout\(\(\) => step\(1\), \(reducedMotion\(\) \? FADE_MS : PUSH_MS\) \+ 40\);/);
  assert.match(page, /stage >= 1 \? <span className="nv-set-later"><Mini look=\{look\} k=\{0\.86\}/);
  assert.match(page, /: <span className="nvm-wrap" style=\{\{ '--k': 0\.86 \}\} aria-hidden="true" \/>/, 'the empty frame is the preview\'s own box');
  assert.match(page, /stage >= 2 \? <span className="nv-set-later"><Mini look=\{\{ \.\.\.look, style: s\.value \}\} k=\{0\.34\}/);
  assert.match(page, /\{stage >= 3 && <span className="nv-set-later"><NovaCore size=\{104\}/);
  assert.match(read('src/settings.css'), /\.nv-set-later > \* \{ animation: nvSetLater \.2s ease both; \}/);
});

test('a Settings group below the fold is not laid out until near, and nothing moves or clips', () => {
  const css = read('src/settings.css');
  assert.match(css, /\.nv-set-grp \{\n  content-visibility: auto; contain-intrinsic-size: auto 260px;\n  padding: 24px; margin: -24px -24px -26px;\n\}/);
  assert.match(css, /\.nv-set-grp:last-child \{ margin-bottom: -2px; \}/, 'the last group keeps its 22 px');
});
