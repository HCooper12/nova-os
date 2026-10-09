// THE COUNT-UP PRIMITIVE (9 Oct 2026, the motion audit's first gap).
//
// His bar (the Bento reel): a write is acted out on every number it changes.
// Home's rings, Fuel's plate and the live session's progress used to swap
// their digits in one frame. They now count, through one primitive that
// writes its digits through a ref and never re-renders per frame, counts only
// when the value changes (an arrival count is a single switch, off), and
// snaps under reduced motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { countStart, countAt, parseFigure, isFigure, COUNT_MS } from '../../src/countFigure.js';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p) => readFileSync(root(p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('CountUp never re-renders per frame: no state, digits written through a ref', () => {
  const src = strip(read('src/CountUp.jsx'));
  assert.ok(!/useState\s*\(/.test(src), 'CountUp holds no React state');
  assert.ok(!/set[A-Z]\w*\s*\(/.test(src), 'no setter is called inside the count');
  assert.match(src, /nodeValue\s*=/, 'the frames are written into the text node');
  assert.match(src, /requestAnimationFrame\(tick\)/);
  assert.ok(!/forceUpdate|setState/.test(src), 'nothing in it asks React to render');
});

test('the first paint is still; a change counts from what was on screen', () => {
  assert.equal(countStart({ prev: undefined, next: 96 }), null, 'arrival: no count by default');
  assert.equal(countStart({ prev: 96, next: 96 }), null, 'same value: no count');
  assert.equal(countStart({ prev: 96, next: 120 }), 96, 'a write counts from the old figure');
  assert.equal(countStart({ prev: 104.6, next: 140 }), 104.6, 'mid-count: from the digits on screen');
  assert.equal(countStart({ prev: 120, next: 96 }), 120, 'a figure that went down counts down');
});

test('fromZero is the one switch for an arrival count; the primitive stays off unless asked', () => {
  assert.equal(countStart({ prev: undefined, next: 96, fromZero: true }), 0);
  assert.equal(countStart({ prev: undefined, next: 0, fromZero: true }), null, 'zero has nothing to count');
  const src = read('src/CountUp.jsx');
  assert.match(src, /fromZero = false/, 'a figure counts on arrival only where its page asks (his call, 9 Oct: server/test/arrivalCount.test.js)');
});

test('reduced motion: no count, the figure lands', () => {
  assert.equal(countStart({ prev: 96, next: 120, reduced: true }), null);
  assert.equal(countStart({ prev: undefined, next: 96, fromZero: true, reduced: true }), null);
  assert.match(read('src/CountUp.jsx'), /prefers-reduced-motion: reduce/);
});

test('never invents a value: null, NaN and Infinity are not figures', () => {
  for (const v of [null, undefined, NaN, Infinity, -Infinity, '96']) {
    assert.equal(isFigure(v), false, String(v));
    assert.equal(countStart({ prev: 10, next: v }), null);
  }
  // and a count FROM a non-figure does not start from it
  assert.equal(countStart({ prev: null, next: 10 }), null);
  assert.equal(countStart({ prev: NaN, next: 10 }), null);
});

test('the curve starts where it was, ends exactly on the figure, and never overshoots', () => {
  assert.equal(countAt(0, 96, 0), 0);
  assert.equal(countAt(0, 96, COUNT_MS), 96);
  assert.equal(countAt(0, 96, COUNT_MS * 3), 96);
  let last = -1;
  for (let t = 0; t <= COUNT_MS; t += 16) {
    const n = countAt(0, 96, t);
    assert.ok(n >= last && n <= 96, `monotonic at ${t}`);
    last = n;
  }
  assert.ok(countAt(0, 100, COUNT_MS / 2) > 50, 'decelerating: past halfway by half time');
  assert.equal(countAt(5, -3, COUNT_MS), -3);
});

test('a formatted figure reads back to the same string', () => {
  const cases = ['2,361', '96', '7:12', '78.2', '1,000,000', '0', '-3', '12345', '0:05', '93.5'];
  for (const c of cases) {
    const p = parseFigure(c);
    assert.ok(p, c);
    assert.equal(p.format(p.value), c, `round trip ${c}`);
  }
  assert.equal(parseFigure('7:12').value, 432);
  assert.equal(parseFigure('2,361').format(999.6), '1,000');
  for (const c of ['—', '', null, '7h', 'NaN', '1.2.3', '12:75']) assert.equal(parseFigure(c), null, String(c));
});

test('the three numerals that move most count when a write changes them', () => {
  const home = read('src/screens/MissionSummary.jsx');
  assert.match(home, /<CountText text=\{r\.value\} fromZero \/>/, 'Home: the three ring values');
  const fuel = read('src/screens/FuelSummary.jsx');
  assert.match(fuel, /<CountUp value=\{protein\.value\} fromZero \/>/, 'Fuel: the plate centre');
  assert.match(fuel, /<CountUp value=\{k\.value\} format=\{kc\} fromZero \/>/, 'Fuel: calories');
  const ses = read('src/screens/SessionSummary.jsx');
  assert.match(ses, /<CountUp value=\{S\.progressDone\}/, 'the live session progress');
  const vm = read('src/vals/valsSessionSummary.js');
  assert.match(vm, /progressDone: ticked/);
  assert.match(vm, /progress: `\$\{ticked\} of \$\{total\} sets`/, 'the sentence is still there for its other readers');
});

test('a page\'s descendant span rule cannot turn a counted figure into a block', () => {
  const css = read('src/index.css');
  assert.match(css, /span\.nv-count \{ display: inline-block !important; margin: 0 !important; \}/);
  assert.match(css, /span\.nv-count > span \{ display: inline !important; margin: 0 !important; \}/);
  assert.match(css, /\.nv-ss-st > span \{ display: block;/, 'the session header styles its own line, not every span inside it');
});

test('the count holds its width: tabular numerals and a box sized to the wider figure', () => {
  const css = read('src/index.css');
  assert.match(css, /\.nv-count \{ display: inline-block; font-variant-numeric: tabular-nums; white-space: pre; \}/);
  assert.match(css, /\.nv-count::before \{ content: attr\(data-w\); display: block; height: 0; visibility: hidden;/);
  // not a grid: a grid box split "96" from "/180 g" in the page's text
  assert.ok(!/\.nv-count \{ display: inline-grid/.test(css));
});
