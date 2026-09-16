// THE SHEET GESTURE'S CONTRACT.
//
// Written 16 Sep 2026, after an audit against Apple's *Designing Fluid
// Interfaces* found that `useSheetDrag` had a velocity rule which had NEVER
// RUN: `end()` nulled `drag.current` and then called `settle()`, which read
// `drag.current.v`. The flick branch was permanently false, so every sheet in
// the app could only be dismissed by dragging slowly past its full threshold —
// a flick, which is how an iOS sheet is actually dismissed, sprang back.
//
// Nothing could see it. It is not a syntax error, not a render error, and the
// sheet still dismissed if you dragged far enough, so it read as "sheets feel
// stiff" rather than as a bug. These tests exist so it cannot come back
// silently: the decision is now a pure function that TAKES velocity, and a
// wiring mistake that stops supplying it fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  settleDecision, project, throwDuration, velocityFrom, rubberband,
  MIN_MS, MAX_MS, SAMPLE_MS,
} from '../../src/sheetPhysics.js';

test('THE REGRESSION: a flick dismisses, at a distance a drag never would', () => {
  // 40px is well inside the 110px threshold — the old code sprang back here
  assert.equal(settleDecision({ dy: 40, v: 2.0 }), 'dismiss', 'a hard flick must throw the sheet');
  assert.equal(settleDecision({ dy: 60, v: 0.55 }), 'dismiss', 'and a moderate one too');
  assert.equal(settleDecision({ dy: 60, v: 0 }), 'return', 'but the same distance released still must not');
});

test('the decision is made on where the gesture is GOING, not where it stopped', () => {
  // dragged past the threshold, then flicked back up: a rescue, not a dismiss.
  // the old rule dismissed this, because it only looked at final position.
  assert.equal(settleDecision({ dy: 140, v: -1.5 }), 'return');
  assert.equal(settleDecision({ dy: 140, v: 0 }), 'dismiss');
  // and the sign is what decides it, at every distance
  for (const dy of [120, 200, 400]) {
    assert.equal(settleDecision({ dy, v: -2 }), 'return', `flicking up at ${dy}px must rescue`);
  }
});

test("Apple's projection, not the textbook one", () => {
  // exponential decay: v * d/(1-d). At d=0.998 that is a 499x multiplier on
  // px/ms. The physics-class v^2/2a form is NOT what iOS ships.
  assert.equal(Math.round(project(1)), 499);
  assert.equal(project(0), 0);
  assert.equal(project(NaN), 0, 'a missing sample must not produce a NaN transform');
  // faster always projects further — the property, not the constant
  let last = -Infinity;
  for (const v of [0.1, 0.5, 1, 2, 4]) { const p = project(v); assert.ok(p > last); last = p; }
});

test('VELOCITY HANDOFF: the throw leaves at the speed the finger arrived at', () => {
  const fast = throwDuration(600, 3.0);
  const slow = throwDuration(600, 0.6);
  assert.ok(fast < slow, 'a harder flick must throw faster, or there is a seam');
  assert.ok(fast >= MIN_MS && slow <= MAX_MS, 'and both stay inside the clamp');
  assert.equal(throwDuration(600, 0), MAX_MS, 'no velocity falls back to the slowest, never to zero');
  assert.equal(throwDuration(600, NaN), MAX_MS);
});

test('velocity comes from a history — a flick that stalls on the last frame still counts', () => {
  // a real 120Hz flick: fast, then the finger slows just before lifting
  const samples = [{ t: 0, y: 0 }, { t: 16, y: 40 }, { t: 32, y: 80 }, { t: 48, y: 118 }, { t: 64, y: 120 }];
  const v = velocityFrom(samples, 64);
  const lastTwoPoints = (120 - 118) / 16;
  assert.ok(v > 1.5, `history velocity ${v} must survive the final-frame stall`);
  assert.ok(v > lastTwoPoints * 10, 'the old last-two-points reading loses it by more than 10x');
  assert.equal(settleDecision({ dy: 120, v }), 'dismiss');
  assert.equal(settleDecision({ dy: 120, v: lastTwoPoints }), 'dismiss'); // past threshold anyway
  assert.equal(settleDecision({ dy: 40, v: lastTwoPoints }), 'return', 'which is exactly how the flick was lost');
});

test('velocity degrades honestly rather than throwing', () => {
  assert.equal(velocityFrom([]), 0);
  assert.equal(velocityFrom([{ t: 0, y: 0 }]), 0, 'one sample is not a velocity');
  assert.equal(velocityFrom([{ t: 5, y: 0 }, { t: 5, y: 90 }], 5), 0, 'a zero dt must not divide');
  // samples older than the window are ignored, so a pause mid-drag resets it
  const stale = [{ t: 0, y: 0 }, { t: 1000, y: 300 }, { t: 1016, y: 302 }];
  assert.ok(Math.abs(velocityFrom(stale, 1016)) < 0.2, `a long pause then a nudge is not a flick (${SAMPLE_MS}ms window)`);
});

test('the boundary resists progressively instead of stopping dead', () => {
  const h = 800;
  const a = rubberband(100, h), b = rubberband(400, h), c = rubberband(1200, h);
  assert.ok(a < 100 && b < 400 && c < 1200, 'always less than the finger travelled');
  assert.ok(a / 100 > b / 400 && b / 400 > c / 1200, 'and the ratio keeps falling — resistance grows');
  assert.equal(rubberband(50, 0), 50, 'a zero-height element must not divide by zero');
});

test('the hook actually WIRES the physics in — the bug was wiring, not maths', () => {
  const SRC = fileURLToPath(new URL('../../src/useSheetDrag.js', import.meta.url));
  // comments stripped first: the header of that file NAMES the old broken
  // expression, on purpose, because a rule with no recorded reason gets
  // deleted by the next session. Same reason liquidGlass.test.js does this.
  const src = readFileSync(SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const fn of ['settleDecision', 'throwDuration', 'velocityFrom', 'rubberband']) {
    assert.ok(src.includes(fn), `${fn} is imported but never used — the physics is decorative again`);
  }
  // the exact shape of the original fault: reading velocity off state that the
  // caller has already cleared
  assert.ok(!/drag\.current\s*=\s*null[\s\S]{0,400}drag\.current\.v/.test(src),
    'settle must not read velocity off drag.current after end() cleared it');
  // and the throw must be cancellable, or a grabbed sheet closes under the finger
  assert.match(src, /cancelClose/, 'a closing sheet must be able to be grabbed back');
  assert.match(src, /presentationY/, 'and the new drag must start from the on-screen value, not the target');
});
