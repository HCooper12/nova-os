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
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const CSS = readFileSync(root('src/index.css'), 'utf8');
const RAW = readFileSync(root('src/PersonalRecord.jsx'), 'utf8');
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
const APP = readFileSync(root('src/App.jsx'), 'utf8');

test('THE FOREVER PULSE IS GONE, and cannot come back by accident', () => {
  assert.ok(!/@keyframes prStar/.test(CSS), 'an infinite celebration is an idling one');
  assert.ok(!/@keyframes prPop/.test(CSS), 'and scaling from .6 reads as a pop-up ad');
  assert.ok(!/animation:[^;'"`]*infinite/.test(SRC), 'nothing in this card may loop');
  assert.ok(!SRC.includes('◆'), 'the glyph that said nothing');
});

test('it MATERIALISES rather than fading, and never overshoots', () => {
  // "Materialize, don't just fade — animate blur radius and scale together on
  // enter, so the surface reads as a real material arriving." The card is a
  // glass surface, so it uses the shared material entrance, not one of its own.
  assert.match(SRC, /nv-materialize/, 'the card must arrive as a material');
  assert.ok(!/@keyframes prRise/.test(CSS), 'its private keyframe is gone — one entrance, shared');
  const kf = CSS.slice(CSS.indexOf('@keyframes nvMaterialize'));
  const block = kf.slice(0, kf.indexOf('\n}'));
  assert.match(block, /backdrop-filter: blur\(0px\)/, 'the blur has to start at nothing');
  assert.match(block, /transform: none/);
  const scales = [...block.matchAll(/scale\(([\d.]+)\)/g)].map((m) => Number(m[1]));
  assert.ok(scales.every((n) => n <= 1), `entrance overshoots: ${scales.join(', ')}`);
});

test('the gauge is OPEN, so a mark can be seen being passed', () => {
  // a closed ring completes and shows no start, which is why the first cut's
  // tick read as an artifact rather than as the record being beaten
  assert.match(SRC, /const SWEEP = 0\.75;/, '270deg, with a visible beginning and end');
  assert.match(SRC, /strokeDasharray=\{`\$\{ARC\} \$\{CIRC - ARC\}`\}/);
  assert.match(SRC, /strokeDashoffset=\{run \? 0 : ARC\}/, 'it must sweep, not appear');
});

test('an absent previous record is SAID, never invented', () => {
  assert.match(SRC, /'first on record'/);
  assert.match(SRC, /from != null &&/, 'no mark is drawn when there is nothing to have passed');
  assert.match(SRC, /Number\.isFinite\(Number\(lead\.previous\)\)/, 'a non-numeric previous is not a previous');
});

test('the delta reads as measured, not as a typo', () => {
  // 40.3 - 39.3 rounds to 1, and "+1 kg" next to "40.3" looks like a mistake
  assert.match(SRC, /delta\.toFixed\(1\)/);
});

test('reduced motion gets the finished state, not a slow one', () => {
  assert.match(SRC, /useState\(reduced\(\)\)/, 'the sweep starts already complete');
  assert.match(SRC, /transition: reduced\(\) \? 'none'/);
});

test('hooks run before the early return', () => {
  const effect = SRC.indexOf('useEffect(() => {\n    const onKey');
  const bail = SRC.indexOf('if (!lead) return null;');
  assert.ok(effect > 0 && bail > effect, 'a hook after a conditional return changes hook order and React throws');
});

test('it leaves the way it arrived, like every other overlay', () => {
  assert.match(SRC, /useExit\(onClose\)/);
  assert.match(SRC, /ref=\{exit\.scrimRef\}/);
  assert.match(SRC, /ref=\{exit\.panelRef\}/);
  assert.ok(!/onClick=\{onClose\}/.test(SRC), 'a direct close path would cut while the others animate');
});

test('App renders the component, not sixteen lines of inline banner', () => {
  assert.match(APP, /<PersonalRecord records=\{this\.state\.prCelebration\}/);
  assert.ok(!APP.includes('PERSONAL RECORD'), 'the old inline copy is gone');
});
