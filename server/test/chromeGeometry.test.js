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

test('the bar lifts its content with a real z-index, not painting order', () => {
  assert.match(strip(CSS), /\.nv-liquid-flush > \.nv-liquid-content \{ position: relative; z-index: 1; \}/);
  assert.match(CHROME, /className="nv-liquid-content"/, 'the wrapper has to exist in the markup');
  // and the bar itself must no longer be the flex container, or the wrapper
  // becomes a flex item and the layout collapses to one column
  const bar = CHROME.slice(CHROME.indexOf('nv-liquid nv-liquid-flush'));
  assert.ok(!bar.slice(0, 260).includes('display:flex'), 'the flex moved to the wrapper');
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
