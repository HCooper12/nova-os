// THE PERSONAL RECORD MOMENT.
//
// His note, 16 Sep 2026: "improve the animation and icon shown for a personal
// record as the diamond feels very random and not as exciting as it could be."
//
// It was a gold ◆ at 56px on an INFINITE 1.4s pulse. Two faults. The glyph
// said nothing — a generic trophy that would suit a coupon — and a celebration
// that never stops moving is not celebrating, it is idling. That second one is
// what *Principles of Great Design* means by delight being the result of
// getting everything else right, "not confetti tacked on top".
//
// 29 Sep 2026: src/PersonalRecord.jsx (the ring) was replaced by
// src/RecordMoment.jsx (one moment per lift, chosen by the kit; mockup 65).
// The invariants that outlived the ring are pinned here against the new
// file; what is new about it is pinned in recordKit.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const CSS = readFileSync(root('src/index.css'), 'utf8');
const RAW = readFileSync(root('src/RecordMoment.jsx'), 'utf8');
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
const APP = readFileSync(root('src/App.jsx'), 'utf8');
const REC_CSS = CSS.slice(CSS.indexOf('THE PERSONAL-BEST MOMENT (29 Sep 2026'), CSS.indexOf('/* end of the personal-best moment */'));

test('THE FOREVER PULSE IS GONE, and cannot come back by accident', () => {
  assert.ok(!/@keyframes prStar/.test(CSS), 'an infinite celebration is an idling one');
  assert.ok(!/@keyframes prPop/.test(CSS), 'and scaling from .6 reads as a pop-up ad');
  assert.ok(!/animation:[^;'"`]*infinite/.test(SRC), 'nothing in this card may loop');
  assert.ok(!/infinite/.test(REC_CSS), 'nor in its styles');
  assert.ok(!SRC.includes('◆'), 'the glyph that said nothing');
  assert.equal(existsSync(root('src/PersonalRecord.jsx')), false, 'one record overlay, not two');
});

test('it MATERIALISES rather than fading, and the entrance never overshoots', () => {
  assert.match(SRC, /nv-materialize/, 'the card must arrive as a material');
  const kf = CSS.slice(CSS.indexOf('@keyframes nvMaterialize'));
  const block = kf.slice(0, kf.indexOf('\n}'));
  assert.ok(!/backdrop-filter/.test(block), 'the keyframe carries only what every engine can animate');
  const scales = [...block.matchAll(/scale\(([\d.]+)\)/g)].map((m) => Number(m[1]));
  assert.ok(scales.every((n) => n <= 1), `entrance overshoots: ${scales.join(', ')}`);
});

test('an absent previous record is SAID, never invented', () => {
  assert.match(SRC, /from != null &&/, 'no old number is drawn when there is nothing to have passed');
  assert.match(SRC, /rec\.delta != null && rec\.delta > 0 &&/, 'and no rise');
});

test('hooks run before the early return', () => {
  const effect = SRC.indexOf("const onKey = (e) => { if (e.key === 'Escape') exit.close(); };");
  const bail = SRC.indexOf('if (!rec) return null;');
  assert.ok(effect > 0 && bail > effect, 'a hook after a conditional return changes hook order and React throws');
});

test('it leaves the way it arrived, like every other overlay', () => {
  assert.match(SRC, /useExit\(/);
  assert.match(SRC, /ref=\{exit\.scrimRef\}/);
  assert.match(SRC, /ref=\{exit\.panelRef\}/);
  assert.ok(!/onClick=\{onDismiss\}/.test(SRC), 'a direct close path would cut while the others animate');
});

test('App renders the component, not sixteen lines of inline banner', () => {
  assert.match(APP, /<RecordMoment key=\{this\.state\.prIndex \|\| 0\} records=\{this\.state\.prCelebration\}/);
  assert.ok(!APP.includes('PERSONAL RECORD'), 'the old inline copy is gone');
  assert.ok(!/PersonalRecord/.test(APP));
});
