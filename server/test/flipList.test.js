// LISTS THAT FIND THEIR PLACE (9 Oct 2026, the motion audit's third gap).
//
// Measured before: Fuel's High protein chip moved Salmon from 397 px to
// 332 px in one frame, a 0.05 to 0.07 layout-shift cluster. Library's FLIP
// was lifted into one shared hook (src/useFlipList.js) and Fuel's filter now
// wears it. A FLIP is only as right as its keys: an index key hands one
// record's node to another, so the move plays on the wrong row. Notes keyed
// its rows by index; it is keyed by note id now.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { measure, FLIP_MS, FLIP_EASE, FADE_MS } from '../../src/useFlipList.js';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p) => readFileSync(root(p), 'utf8');

// a tiny fake of the DOM the hook reads: offsets up an offsetParent chain
function el({ id, x = 0, y = 0, w = 100, h = 40, parent = null }) {
  return { dataset: id == null ? {} : { flip: id }, offsetLeft: x, offsetTop: y, offsetWidth: w, offsetHeight: h, offsetParent: parent };
}

test('positions are layout boxes relative to the list, keyed by the record id', () => {
  const page = el({ x: 0, y: 0 });
  const list = el({ x: 16, y: 300, parent: page });
  const rows = [el({ id: 'salmon', x: 16, y: 365, parent: page }), el({ id: 'oats', x: 16, y: 430, parent: page })];
  list.querySelectorAll = () => rows;
  const m = measure(list);
  assert.deepEqual([...m.keys()], ['salmon', 'oats']);
  assert.equal(m.get('salmon').y, 65);
  assert.equal(m.get('oats').y, 130);
  assert.equal(m.get('salmon').x, 0);
});

test('an item with no id, or a repeated id, is never paired with another row', () => {
  const list = el({});
  const rows = [el({ id: 'a', y: 0 }), el({ id: '', y: 10 }), el({ id: 'a', y: 20 }), el({ id: 'b', y: 30 })];
  list.querySelectorAll = () => rows;
  const m = measure(list);
  assert.deepEqual([...m.keys()], ['a', 'b']);
  assert.equal(m.get('a').y, 0, 'the first node wins; a duplicate does not overwrite it');
});

test('offsets, not client rects: a running move or a scroll cannot skew the next one', () => {
  const src = read('src/useFlipList.js');
  const measureFn = src.slice(src.indexOf('export function measure'), src.indexOf('function offsetChain'));
  assert.ok(!/getBoundingClientRect/.test(measureFn), 'resting boxes come from offsets');
  assert.match(src, /offsetTop/);
  // interrupted, an item starts from where it is drawn
  assert.match(src, /drawn\.set\(id/);
});

test('transform only, the house drawer curve, and a fade under reduced motion', () => {
  assert.equal(FLIP_MS, 280);
  assert.equal(FLIP_EASE, 'cubic-bezier(.32,.72,0,1)');
  assert.equal(FADE_MS, 160);
  const src = read('src/useFlipList.js');
  assert.match(src, /prefers-reduced-motion: reduce/);
  assert.match(src, /if \(reduce\) \{\s*play\(id, it\.el, \[\{ opacity: 0\.4 \}, \{ opacity: 1 \}\]/);
  assert.ok(!/\b(top|left|width|height|margin):/.test(src.slice(src.indexOf('const t0'), src.indexOf('prev.current = after'))), 'no layout property is animated');
});

test('Library moved onto the shared hook, with its own size morph kept', () => {
  const lib = read('src/screens/Library.jsx');
  assert.ok(!/function useShelfFlip/.test(lib), 'one FLIP in the app, not two');
  assert.match(lib, /useFlipList\(flipRoot, v\.libraryView, SHELF_FLIP\)/);
  assert.match(lib, /const SHELF_FLIP = \{ duration: 520, scale: true, dim: 0\.75 \}/);
  assert.match(lib, /<div key=\{b\.id\} data-flip=\{b\.id\}/);
});

test("Fuel's recipe filter moves its rows, keyed by the same id React keys them by", () => {
  const fuel = read('src/screens/FuelSummary.jsx');
  assert.match(fuel, /useFlipList\(listRef, page\.scope\.filter\(\(f\) => f\.active\)/);
  assert.match(fuel, /<div ref=\{listRef\} className="nv-sum-card nv-fs-rlist/);
  assert.match(fuel, /<div key=\{r\.key\} data-flip=\{r\.key\}>/);
});

test("Notes' rows are keyed by note id, never by index", () => {
  const notes = read('src/screens/Notes.jsx');
  assert.match(notes, /v\.noteList\.map\(\(n\) => \(\s*<Interactive key=\{n\.id\}/);
  assert.ok(!/noteList\.map\(\(n, i\) => \(\s*<Interactive key=\{i\}/.test(notes));
  assert.match(read('src/vals/valsNotes.js'), /\.map\(n => \(\{ id: n\.id, title: n\.title/);
});
