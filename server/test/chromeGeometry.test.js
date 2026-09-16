// THE THREE THINGS HE SAW ON HIS PHONE, 16 Sep 2026.
//
// Reported with two screenshots from a live gym session:
//   "the bottom bar on the phone is too high and the nova icon is not
//    symmetrically positioned in the bar. Parts of the top panel are also
//    partially blurred as well like the buttons and nova os icon"
//
// Measured off the screenshot (iPhone 16 Pro, 402x874 CSS at 3x): the dock sat
// ~108 CSS px above the bottom where the CSS asks for ~46, and the core
// protruded 8px above the pill while leaving 15px of pill beneath it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const CSS = readFileSync(root('src/index.css'), 'utf8');
const CHROME = readFileSync(root('src/MobileChrome.jsx'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('NO backdrop-filter sits on a negative z-index layer, anywhere', () => {
  // This is what blurred the bar's own text on iOS. By the spec a negative-index
  // positioned descendant paints BEFORE static inline content, so the text
  // should have been on top — and on macOS Safari 26.5 it was, which is exactly
  // how it shipped. His iPhone disagreed. The app no longer contains the
  // construct, so the disagreement cannot matter.
  const css = strip(CSS);
  const rules = css.split('}');
  const offenders = [];
  for (const r of rules) {
    if (/z-index:\s*-\d/.test(r) && /backdrop-filter/.test(r)) offenders.push(r.trim().slice(0, 70));
  }
  assert.deepEqual(offenders, [], 'a blurred layer below the content is the bug he photographed');
});

test('no separate backdrop layer over the bar, ever', () => {
  // Two attempts at a scroll-edge fade each broke the bar on his phone in a
  // different way — a ::before at z-index -1 blurred its text, the same layer
  // at z-index 0 stopped it taking taps — and neither reproduced on macOS.
  const css = strip(CSS);
  assert.ok(!/\.nv-liquid-flush::before/.test(css), 'a second backdrop layer over the bar is what kept breaking it');
  assert.ok(!/nv-liquid-content/.test(css), 'and the wrapper that existed only to sit above it');
  assert.ok(!CHROME.includes('nv-liquid-content'), 'markup too');
  const bar = CHROME.slice(CHROME.indexOf('nv-liquid nv-liquid-flush'));
  assert.match(bar.slice(0, 300), /display:flex/, 'the bar is the flex container, as it always was');
});

test('the dock cannot be pushed up by an inflated safe-area inset', () => {
  // `12px + env()` STACKS. env(safe-area-inset-bottom) is 34px for a home
  // indicator but reports the browser bottom bar (60-85px) in a Safari tab,
  // which is how a 46px gap became the 108px he photographed. min() caps what
  // the inset may contribute so the dock lands in the same place either way.
  assert.match(CHROME, /bottom:calc\(6px \+ min\(env\(safe-area-inset-bottom\), 34px\)\)/);
  assert.ok(!/bottom:calc\(12px \+ env\(safe-area-inset-bottom\)\)/.test(CHROME));
});

test('the Nova core is centred in the dock, not hung off its top', () => {
  // it protruded 8px above the pill and left 15px of pill below it — read as
  // "slightly wrong" rather than as a deliberate raised throne
  assert.ok(!/marginTop: '-23px'/.test(CHROME), 'the negative margin is what made it asymmetric');
  const core = CHROME.slice(CHROME.indexOf("aria-label=\"Talk to Nova\""));
  assert.match(core.slice(0, 700), /width: '54px', height: '54px'/, 'the core keeps its size; only its offset changed');
});

test('THE BAR CARRIES NO COMPOSITING HINT AT ALL', () => {
  // Removing backdrop-filter did not stop his phone rendering the bar's own
  // text soft, so everything else `.nv-liquid` contributes is neutralised on
  // the bar too. What is left is a plain fixed div with a background and a
  // real border — the only shape he has never complained about.
  const css = strip(CSS);
  const at = css.indexOf('.nv-liquid-flush {');
  const block = css.slice(at, css.indexOf('}', at));
  assert.match(block, /isolation: auto/, 'isolate creates a stacking context — the last compositing hint');
  assert.match(block, /backdrop-filter: none/);
  assert.match(block, /box-shadow: none/);
  assert.match(block, /border-bottom: 1px solid var\(--nv-edge\)/, 'a real border, not a pseudo-element');
  assert.match(css, /\.nv-liquid-flush::after \{ display: none; \}/, 'and the pseudo is off');
});

test('NOTHING SNAPSHOTS THE CHROME — glass cannot survive being captured', () => {
  // Naming the bar and dock stopped them cross-fading and did NOT stop the
  // glitch: a named element still gets its own snapshot, and a snapshot of a
  // backdrop-filtered element bakes in the backdrop it had at capture time.
  // He filmed the dock doubling and washing out with page text readable
  // through it. So navigation stops snapshotting the page entirely.
  const css = strip(CSS);
  assert.ok(!/view-transition-name/.test(css), 'naming the chrome only moved the problem');
  assert.ok(!/nova-topbar|nova-dock/.test(css));
  const app = readFileSync(root('src/App.jsx'), 'utf8');
  assert.match(app, /this\.navigate\(screen, \{ paletteOpen: false, instant: true \}\)/,
    'a tab hop must not snapshot the page');
  // …but it must still MOVE. instant means no snapshot, not no motion.
  assert.match(app, /this\.mainRef\.current\.animate\(/, 'the live content animates instead');
  assert.match(app, /translateY\(6px\)/);
  assert.match(app, /cubic-bezier\(\.32,\.72,0,1\)/, 'the house curve, not a new one');
  assert.match(app, /prefers-reduced-motion: reduce/);
  // and it animates MAIN, which excludes the chrome by construction
  const at = app.indexOf('this.mainRef.current.animate(');
  assert.ok(app.lastIndexOf('mainRef', at) > 0, 'it has to be main — the chrome lives outside it');
});

test('the app root fills the screen it is actually on', () => {
  const app = readFileSync(root('src/App.jsx'), 'utf8');
  // svh is the SMALLEST viewport: measured on his phone it resolved to 812
  // against a 874px screen, leaving 62px of bare ground under the content —
  // the "black bar" he photographed twice. dvh tracks the chrome and made the
  // page jump under his scroll. lvh is the largest AND stable: never shorter
  // than the screen, never resizes.
  assert.match(app, /min-height:100lvh/, 'the root must never be shorter than the viewport');
  assert.ok(!/min-height:100svh/.test(app), 'svh leaves a dead band at the foot');
  assert.ok(!/min-height:100dvh/.test(app), 'dvh resizes mid-scroll and the page jumps');
});
