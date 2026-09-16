// CONCENTRIC CORNERS — Apple's ConcentricRectangle rule, as arithmetic.
//
// From the third reel (16 Sep 2026): a shape nested inside a rounded shape
// takes `outer - gap`, so both corners share a centre point. Its own phrasing
// of the problem is the one that applied to Nova — "my corners are just
// hard-coded numbers that don't really relate to each other at all".
//
// Measured, not assumed: walking the live DOM in Safari across Mission, Train,
// Fuel, Inbox, Settings and Voice found 10 distinct off-concentric pairs over
// 62 instances, once the measurement was corrected to ignore children that sit
// PAST the parent's corner arc (where the rule does not apply and the naive
// formula wrongly demands a square corner).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { concentric, concentricApplies, concentricPx } from '../../src/concentric.js';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

test('inner = outer − gap, and the real cases measured in the app', () => {
  assert.equal(concentric(22, 14), 8);    // settings card -> its select
  assert.equal(concentric(50, 28), 22);   // the voice core's rings
  assert.equal(concentric(16, 12), 4);    // mission section -> its row
  assert.equal(concentric(12, 0), 12);    // a FLUSH child shares the radius exactly
});

test('it clamps rather than going negative — a corner cannot curve inside out', () => {
  assert.equal(concentric(10, 40), 0);
  assert.equal(concentric(0, 10), 0);
  assert.equal(concentricPx(22, 14), '8px');
});

test('garbage in does not become NaN in a style string', () => {
  // a NaN here reaches the DOM as `border-radius: NaNpx`, which drops the
  // declaration silently and leaves the corner at whatever it was
  for (const bad of [undefined, null, NaN, 'abc', {}]) {
    assert.equal(Number.isFinite(concentric(bad, 10)), true, `concentric(${String(bad)}) must be a number`);
    assert.equal(Number.isFinite(concentric(20, bad)), true);
  }
  assert.ok(!concentricPx(undefined, undefined).includes('NaN'));
});

test('the rule is scoped to children inside the corner arc', () => {
  assert.equal(concentricApplies(22, 14), true);
  assert.equal(concentricApplies(22, 22), false, 'exactly at the arc end, the curve has finished');
  assert.equal(concentricApplies(16, 30), false, 'inset past the radius: visually independent');
  assert.equal(concentricApplies(22, -2), false, 'a child hanging outside is not nested');
  // this is the correction that took the audit from 109 false-ish instances to 62 real ones
  assert.equal(concentricApplies(8, 11), false);
});

test('the CSS form puts the calc where var() resolves per element', () => {
  const css = readFileSync(root('src/index.css'), 'utf8');
  const rule = css.slice(css.indexOf('.nv-inner {'));
  assert.match(rule, /border-radius:\s*max\(0px,\s*calc\(var\(--nv-r/, 'the clamp and the calc must both be in the rule');
  assert.match(rule, /var\(--nv-r,\s*var\(--nv-radius\)\)/, 'a container that publishes nothing falls back to the house radius');
  assert.match(rule, /var\(--nv-pad,\s*0px\)/, 'and a missing gap means flush, which is the strictest case');
  // the version that silently does not work: hoisting the arithmetic to :root
  const rootBlock = css.slice(0, css.indexOf('.nv-inner {'));
  assert.ok(!/--nv-r-inner\s*:/.test(rootBlock), 'a :root-declared --nv-r-inner resolves once and inherits the answer');
});

test('THE FLUSH CASE: the swipe track and the card it wraps cannot disagree', () => {
  const src = readFileSync(root('src/SwipeRow.jsx'), 'utf8');
  assert.ok(!/borderRadius:\s*'12px'/.test(src), 'a hardcoded 12px around a var(--nv-radius) card bulged by 10px under cupertino');
  assert.equal((src.match(/borderRadius: 'var\(--nv-radius\)'/g) || []).length, 2, 'track and underlay both, or the reveal has different corners to the row');
});
