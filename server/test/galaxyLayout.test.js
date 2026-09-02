// The Galaxy's force layout — pure arithmetic, so the "real graph" claim is
// tested rather than eyeballed: linked stars end up closer than unlinked
// ones, everything stays in frame, a seed makes it reproducible, and a hub
// is sized by its links.
import test from 'node:test';
import assert from 'node:assert/strict';
import { forceLayout, degrees } from '../../src/galaxyLayout.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('linked stars end closer than unlinked ones, and two clusters separate', () => {
  // two tight clusters of 6, no links between them
  const links = [];
  for (const base of [0, 6]) for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) links.push([base + i, base + j]);
  const pos = forceLayout(12, links, { width: 800, height: 600 });
  const within = [];
  const across = [];
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) ((i < 6) === (j < 6) ? within : across).push(dist(pos[i], pos[j]));
  const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(avg(within) < avg(across) * 0.6, `clusters should separate: within ${avg(within).toFixed(0)} vs across ${avg(across).toFixed(0)}`);
});

test('every star stays in frame, no two overlap, and the layout is deterministic under its seed', () => {
  const links = Array.from({ length: 300 }, (_, i) => [i % 200, (i * 7 + 3) % 200]);
  const a = forceLayout(200, links, { width: 390, height: 520, padding: 20 }); // a phone canvas
  const b = forceLayout(200, links, { width: 390, height: 520, padding: 20 });
  assert.deepEqual(a, b, 'same seed, same sky');
  for (const p of a) {
    assert.ok(p.x >= 20 && p.x <= 370 && p.y >= 20 && p.y <= 500, `off frame: ${p.x},${p.y}`);
  }
  let overlapping = 0;
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (dist(a[i], a[j]) < 2) overlapping++;
  assert.equal(overlapping, 0, 'no two stars on the same pixel');
  assert.notDeepEqual(forceLayout(200, links, { width: 390, height: 520, seed: 99 }), a, 'a different seed is a different sky');
});

test('an orphan drifts to the fringe of a connected core, not the middle of it', () => {
  const links = [];
  for (let i = 0; i < 20; i++) for (let j = i + 1; j < 20; j++) if ((i + j) % 3 === 0) links.push([i, j]);
  const pos = forceLayout(21, links, { width: 800, height: 600 }); // node 20 has no links
  const core = pos.slice(0, 20);
  const c = { x: core.reduce((s, p) => s + p.x, 0) / 20, y: core.reduce((s, p) => s + p.y, 0) / 20 };
  const coreSpread = core.reduce((s, p) => s + dist(p, c), 0) / 20;
  assert.ok(dist(pos[20], c) > coreSpread, 'the orphan sits outside the core\'s mean radius');
});

test('degrees counts links per star, ignoring links past the cap', () => {
  assert.deepEqual(degrees(4, [[0, 1], [0, 2], [1, 2], [3, 9]]), [2, 2, 2, 1]);
  assert.deepEqual(forceLayout(0, [], { width: 10, height: 10 }), []);
});

// ---- the view: pinch-zoom + pan ----
import { clampView, zoomAt, panBy, toWorld, recencyAlpha, GALAXY_ZOOM_MAX } from '../../src/galaxyLayout.js';

const box = { width: 300, height: 400 };

test('zoomAt keeps the world point under the fingers fixed, and clamps to the range', () => {
  const v0 = { s: 1, tx: 0, ty: 0 };
  const v1 = zoomAt(v0, 2, 100, 150, box);
  assert.equal(v1.s, 2);
  const w = toWorld(v1, 100, 150);
  assert.ok(Math.abs(w.x - 100) < 1e-9 && Math.abs(w.y - 150) < 1e-9, 'the point under the pinch does not move');
  const far = zoomAt(v1, 100, 100, 150, box);
  assert.equal(far.s, GALAXY_ZOOM_MAX, 'zoom is capped');
  const back = zoomAt(far, 0.0001, 10, 10, box);
  assert.deepEqual(back, { s: 1, tx: 0, ty: 0 }, 'zooming out lands exactly on the unpanned 1× view');
});

test('panBy cannot lose the graph: no panning at 1×, and the world always covers the box', () => {
  assert.deepEqual(panBy({ s: 1, tx: 0, ty: 0 }, 50, -30, box), { s: 1, tx: 0, ty: 0 });
  const zoomed = zoomAt({ s: 1, tx: 0, ty: 0 }, 2, 150, 200, box); // centred 2×
  const dragged = panBy(zoomed, 10_000, 10_000, box);
  assert.deepEqual(dragged, { s: 2, tx: 0, ty: 0 }, 'left/top edge of the world stops at the box edge');
  const other = panBy(zoomed, -10_000, -10_000, box);
  assert.deepEqual(other, { s: 2, tx: -300, ty: -400 }, 'right/bottom edge of the world stops at the box edge');
  assert.deepEqual(clampView({ s: 0.2, tx: 5, ty: 5 }, box), { s: 1, tx: 0, ty: 0 });
});

test('recencyAlpha: this week bright, older dimmer, undated dim without pretending', () => {
  const now = Date.parse('2026-09-02T12:00:00Z');
  assert.equal(recencyAlpha('2026-09-01', now), 1);
  assert.equal(recencyAlpha('2026-08-10', now), 0.8);
  assert.equal(recencyAlpha('2026-07-01', now), 0.55);
  assert.equal(recencyAlpha('2025-01-01', now), 0.3);
  assert.equal(recencyAlpha(null, now), 0.4);
  assert.equal(recencyAlpha('not a date', now), 0.4);
});
