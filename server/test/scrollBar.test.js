// THE BAR BREATHES WITH THE SCROLL — and degrades to what shipped before.
//
// His reference (22 Sep 2026) was Apple Notes: the large title collapses into
// the compact bar as you scroll and the bar takes on its material only once
// content passes beneath it. Nova's version: the NOVA·OS wordmark is the
// compact-title slot and yields to the screen's title.
//
// Scroll-driven CSS, hoisted from <main> to the fixed bar with timeline-scope.
// The @supports gate is the load-bearing line: without it an engine with no
// scroll timeline runs the keyframes on the document timeline, jumps to their
// end, and hides the wordmark PERMANENTLY. Verified the hoist in Safari 26.5
// on a visible page — a fixed sibling of the scroller tracked it 0 → .64 → .86.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const CSS = readFileSync(root('src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const CHROME = readFileSync(root('src/MobileChrome.jsx'), 'utf8');
const VALS = readFileSync(root('src/vals/valsChrome.js'), 'utf8');

// brace-matched body of the one @supports (animation-timeline…) block
function supportsBlock() {
  const at = CSS.indexOf('@supports (animation-timeline: scroll())');
  assert.ok(at > 0, 'the @supports gate is missing — the fallback would hide the wordmark forever');
  let i = CSS.indexOf('{', at) + 1, depth = 1;
  const start = i;
  while (i < CSS.length && depth > 0) { if (CSS[i] === '{') depth++; else if (CSS[i] === '}') depth--; i++; }
  return CSS.slice(start, i - 1);
}

test('the timeline is named on the scroller and hoisted to the root', () => {
  assert.match(CSS, /#root \{ timeline-scope: --nv-main; \}/, 'the bar is not inside main; the name must be hoisted');
  assert.match(CSS, /#root main \{ scroll-timeline: --nv-main block; \}/);
});

test('every scroll-driven rule lives INSIDE the gate', () => {
  const inside = supportsBlock();
  for (const name of ['nvBarSolid', 'nvWordmarkYield', 'nvTitleArrive']) {
    assert.ok(inside.includes(`@keyframes ${name}`), `${name} must be gated`);
    assert.ok(inside.includes(`animation: ${name} linear both`), `${name} must run on the scroll timeline`);
  }
  assert.equal((inside.match(/animation-timeline: --nv-main/g) || []).length, 3, 'all three ride the same timeline');
  // and NONE of them outside it
  const outside = CSS.replace(inside, '');
  for (const name of ['nvBarSolid', 'nvWordmarkYield', 'nvTitleArrive']) {
    assert.ok(!outside.includes(name), `${name} leaked outside the gate`);
  }
});

test('the ranges are ordered: bar first, wordmark yields, then the title arrives', () => {
  const inside = supportsBlock();
  const range = (sel) => {
    const at = inside.indexOf(sel);
    const m = inside.slice(at, inside.indexOf('}', at)).match(/animation-range: (\d+)(?:px)? (\d+)px/);
    return m ? [Number(m[1]), Number(m[2])] : null;
  };
  const bar = range('.nv-liquid-flush {'), wm = range('.nv-wordmark {'), title = range('.nv-compact-title {');
  assert.ok(bar && wm && title, 'all three need pixel ranges — percentages would drift with page height');
  assert.equal(bar[0], 0, 'the bar starts solidifying the moment anything passes under it');
  assert.ok(wm[0] > bar[0] && title[0] > wm[0], 'the title must not arrive before the wordmark has begun to leave');
  assert.ok(title[1] > wm[1], 'and must finish arriving after the wordmark has finished leaving');
});

test('THE FALLBACK IS WHAT SHIPPED BEFORE: solid bar, wordmark shown, no title', () => {
  const inside = supportsBlock();
  const outside = CSS.replace(inside, '');
  const flush = outside.slice(outside.indexOf('.nv-liquid-flush {'));
  assert.match(flush.slice(0, flush.indexOf('}')), /background: var\(--nv-glass2\)/, 'solid by default');
  const title = outside.slice(outside.indexOf('.nv-compact-title {'));
  assert.match(title.slice(0, title.indexOf('}')), /opacity: 0/, 'the title layer is invisible unless a timeline drives it');
  assert.match(title.slice(0, title.indexOf('}')), /pointer-events: none/, 'and never intercepts the wordmark tap');
});

test('reduced motion: the bar is simply solid and the wordmark simply stays', () => {
  const inside = supportsBlock();
  const rm = inside.slice(inside.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /\.nv-liquid-flush \{ animation: none; background: var\(--nv-glass2\)/);
  assert.match(rm, /\.nv-wordmark, \.nv-compact-title \{ animation: none; \}/);
});

test('one slot, two layers, both on the tappable element', () => {
  assert.match(CHROME, /className="nv-title-slot"/);
  assert.match(CHROME, /className="nv-wordmark"/);
  assert.match(CHROME, /className="nv-compact-title" aria-hidden="true"/, 'the title is decorative; the wordmark carries the semantics');
  assert.match(CSS, /\.nv-title-slot > \* \{ grid-area: 1 \/ 1; \}/, 'the layers must overlap, not stack');
});

test('the compact title agrees with the clock the large title uses', () => {
  assert.match(VALS, /compactTitle:/);
  for (const g of ['Good morning', 'Good afternoon', 'Good evening']) assert.ok(VALS.includes(`'${g}'`), g);
  assert.match(VALS, /h < 12 \? 'Good morning' : h < 17 \? 'Good afternoon' : 'Good evening'/,
    'the same 12/17 boundaries MissionStructured uses, or the two can disagree at 4pm');
});

test('the dock reads as glass: bright rim, light tint, lifted labels — and the core is a well, not a hole', () => {
  const at = CSS.indexOf('.nv-liquid-dock {');
  const dock = CSS.slice(at, CSS.indexOf('}', at));
  assert.match(dock, /--nv-liquid-rim: conic-gradient\(from 212deg,\s*rgba\(255,255,255,1\)/, 'the rim peaks at full white');
  assert.match(dock, /--nv-liquid-tint: color-mix\(in srgb, var\(--nv-void\) 22%, transparent\)/, 'lighter than the 28% it wore');
  assert.match(dock, /--nv-ink40: color-mix\(in srgb, var\(--nv-ink\) 66%, transparent\)/, 'labels lifted rather than the tint raised');
  const core = CHROME.slice(CHROME.indexOf('aria-label="Talk to Nova"'));
  const box = core.slice(0, core.indexOf('}}>'));
  assert.ok(!/0 0 0 4px/.test(box), 'the 4px dark ring was the black hole');
  assert.ok(!/88%, black/.test(box), 'and so was the near-black fill');
  assert.match(box, /inset 0 1px 0 rgba\(255,255,255,\.35\)/, 'it wears the bright edge every other glass surface has');
});
