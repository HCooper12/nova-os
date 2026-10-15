import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootPoints, phaseAt, drawBoot, MAX_POINTS, ASSEMBLE_MS, GLINT_MS, LEAVE_MS } from '../../src/motion/bootAssemble.js';

test('under the point budget, each landing on a ring of the boot core, each starting off screen', () => {
  const w = 375; const h = 812; const cx = 187.5; const cy = 380;
  const pts = bootPoints(w, h, cx, cy);
  assert.ok(pts.length <= MAX_POINTS, `${pts.length} points`);
  for (const p of pts) {
    const r = Math.hypot(p.tx - cx, p.ty - cy);
    assert.ok([0, 18, 38, 61, 75].some((R) => Math.abs(r - R) < 0.01), `lands on a ring (r=${r})`);
    assert.ok(p.sx <= 0 || p.sx >= w || p.sy <= 0 || p.sy >= h, 'starts at an edge, outside the screen');
    assert.ok(p.delay >= 0 && p.delay <= 0.3);
  }
  assert.deepEqual(bootPoints(w, h, cx, cy), pts, 'seeded: the same every cold open');
});

test('the timeline: assemble with the swirl unwinding, one glint, then the handover', () => {
  assert.deepEqual(phaseAt(0), { k: 0, swirl: 1, glint: null, handover: false });
  assert.equal(phaseAt(ASSEMBLE_MS / 2).swirl, 0.5);
  const g = phaseAt(ASSEMBLE_MS + GLINT_MS / 2);
  assert.equal(g.k, 1); assert.equal(g.swirl, 0); assert.equal(g.glint, 0.5); assert.equal(g.handover, false);
  assert.equal(phaseAt(ASSEMBLE_MS + GLINT_MS).handover, true);
  assert.ok(LEAVE_MS <= 250, 'once the app is ready the boot is gone within ~250 ms');
});

test('one frame costs a few hundred canvas calls, four colour changes', () => {
  const calls = { fillStyle: 0, arc: 0, other: 0 };
  const ctx = new Proxy({}, {
    get: (_, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => { if (k === 'arc') calls.arc += 1; else calls.other += 1; }),
    set: (_, k) => { if (k === 'fillStyle') calls.fillStyle += 1; return true; },
  });
  const pts = bootPoints(375, 812, 187, 380);
  drawBoot(ctx, pts, { w: 375, h: 812, cx: 187, cy: 380, dpr: 2, colors: { cy: '#0ff', gold: '#fc0', vi: '#90f', ink: '#fff' }, k: 0.5, swirl: 0.5, glint: null });
  assert.equal(calls.arc, pts.length);
  assert.equal(calls.fillStyle, 4);
  assert.ok(calls.arc + calls.other < 400, `${calls.arc + calls.other} calls`);
});
