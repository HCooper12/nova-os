// REDUCED MOTION FADES, IT DOES NOT CUT (9 Oct 2026, the motion audit's
// fourth gap). Measured before, in headless Chrome with
// prefers-reduced-motion: reduce: a screen change played nothing on <main>,
// and every summary card's rise computed to `none`. Every screen and card
// cut. The standard (apple-design) is a short cross-fade instead.
//
// The trap this pins: index.css carries a global reduced-motion rule that
// sets EVERY animation to .01s with !important. A fade written without
// !important is crushed into a cut by it, which is what had silently
// happened to Settings' own nvSetFade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p) => readFileSync(root(p), 'utf8');

test('a screen change cross-fades under reduced motion (riseMain), opacity only', () => {
  const app = read('src/App.jsx');
  const body = app.slice(app.indexOf('  riseMain() {'), app.indexOf('  navigate(rawScreen'));
  assert.ok(!/if \(reduce \|\|/.test(body), 'reduced motion no longer returns early');
  assert.match(body, /reduce\s*\?\s*\[\{ opacity: 0 \}, \{ opacity: 1 \}\]/);
  assert.match(body, /\{ duration: 160, easing: 'ease', fill: 'both' \}/);
});

test('the two rise classes fade under reduced motion, past the global .01s rule', () => {
  const css = read('src/index.css');
  assert.match(css, /\* \{ animation-duration: \.01s !important;/, 'the global rule this has to beat is still there');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.nv-deck-rise \{ animation: fadeIn \.16s ease both !important; \} \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ :root:not\(\[data-nv-calm="1"\]\) \.nv-sum-rise \{ animation: fadeIn \.16s ease backwards !important; \} \}/);
  assert.ok(!/\.nv-sum-rise \{ animation: none; \} \}/.test(css.replace(/:root\[data-nv-calm="1"\] \.nv-sum-rise \{ animation: none; \}/, '')),
    'no reduced-motion rule turns the rise into a cut');
  assert.match(css, /@keyframes fadeIn \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/, 'the fade moves nothing');
});

test("Settings' own fades now survive the global rule", () => {
  const css = read('src/settings.css');
  for (const sel of ['.nv-set-rise', '.nv-set-flip', '.nv-set-stg']) {
    const re = new RegExp(`\\${sel} \\{ animation: nvSetFade [^;]+ !important; \\}`);
    assert.match(css, re, sel);
  }
});
