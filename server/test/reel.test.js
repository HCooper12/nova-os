// THE REEL'S CLOCK (src/reel.js) — the reveal he asked for off the Hormozi
// reel. The picture and the sound are both read off this one timeline, so the
// properties that make it feel right are pinned here rather than eyeballed:
// it answers his finger at once, it slows the way a real drum slows, the last
// tick comes before the catch, and it lands EXACTLY on the target.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reelTimeline, reelDuration, buildReelRows, REEL } from '../../src/reel.js';

test('it answers his finger at once: the first tick is within a few frames', () => {
  // the strip moves on the very next frame; the first TICK is when half a row
  // has passed. ~100ms is where a response stops feeling instant, so 60 leaves
  // margin on the shortest reel (6 rows → 51ms; a real reel is ≥ 10)
  for (const steps of [6, 10, 16]) {
    const tl = reelTimeline(steps);
    assert.ok(tl.ticks[0] <= 60, `first tick at ${tl.ticks[0]}ms for ${steps} steps — a slow start reads as lag`);
  }
});

test('one tick per row passed, each later than the last, and they spread out as it slows', () => {
  const tl = reelTimeline(12);
  assert.equal(tl.ticks.length, 12);
  for (let i = 1; i < tl.ticks.length; i++) {
    assert.ok(tl.ticks[i] > tl.ticks[i - 1], 'ticks strictly increase');
    const gap = tl.ticks[i] - tl.ticks[i - 1];
    const prev = i > 1 ? tl.ticks[i - 1] - tl.ticks[i - 2] : 0;
    assert.ok(gap >= prev - 1, `tick ${i} came faster than the one before (${gap} < ${prev}) — a drum never speeds up`);
  }
  assert.ok(tl.ticks.at(-1) - tl.ticks.at(-2) > 150, 'the last passes are slow enough to count');
});

test('the last tick comes before the catch, and the catch is where the chime lands', () => {
  const tl = reelTimeline(10);
  assert.ok(tl.ticks.at(-1) < tl.landAt);
  assert.equal(tl.landAt, tl.duration - REEL.settleMs);
});

test('each tick is the moment a row boundary crosses the band', () => {
  const tl = reelTimeline(10);
  tl.ticks.forEach((ms, i) => {
    assert.ok(Math.abs(tl.posAt(ms) - (i + 0.5)) < 0.02, `tick ${i + 1} at ${ms}ms is at ${tl.posAt(ms).toFixed(3)} rows, not ${i + 0.5}`);
  });
});

test('it lands EXACTLY on the target, after a hair of overshoot', () => {
  const tl = reelTimeline(10);
  assert.equal(tl.frames[0].pos, 0);
  assert.equal(tl.frames.at(-1).pos, 10, 'the last frame is the target, not a float near it');
  assert.equal(tl.frames.at(-1).offset, 1);
  const peak = Math.max(...tl.frames.map((f) => f.pos));
  assert.ok(peak > 10 && peak <= 10 + REEL.overshoot + 1e-9, `overshoot ${peak - 10} rows`);
  // never goes backwards before the catch
  const spin = tl.frames.filter((f) => f.offset * tl.duration <= tl.spinMs);
  for (let i = 1; i < spin.length; i++) assert.ok(spin[i].pos >= spin[i - 1].pos);
});

test('the duration stays inside the delight budget whatever the reel length', () => {
  assert.equal(reelDuration(1), 1900);
  assert.equal(reelDuration(10), 2250);
  assert.equal(reelDuration(40), 2900);
});

/* -------------------------------- the rows -------------------------------- */

const item = (key) => ({ key, text: key.toUpperCase() });

test('the drum is [above, start, passes…, target, below] and lands on the target', () => {
  const rows = buildReelRows({ start: { key: 'cta', cta: true }, others: ['a', 'b', 'c', 'd', 'e'].map(item), target: item('t') });
  assert.equal(rows[0].role, 'above');
  assert.equal(rows[1].role, 'start');
  assert.equal(rows.at(-2).key, 't');
  assert.equal(rows.at(-2).role, 'target');
  assert.equal(rows.at(-1).role, 'below');
  const passes = rows.filter((r) => r.role === 'pass').map((r) => r.key);
  assert.deepEqual(passes, ['a', 'b', 'c', 'd', 'e', 'a', 'b', 'c', 'd'], 'the others cycle in order until the reel is long enough');
  // the drum is continuous: what peeks above the start is the last of the
  // cycle, and what peeks below the landing is the next one in it
  assert.equal(rows[0].key, 'e');
  assert.equal(rows.at(-1).key, 'e');
});

test('the target is never among the passes, nor is the start', () => {
  const rows = buildReelRows({ start: item('now'), others: ['now', 'a', 't', 'b'].map(item), target: item('t') });
  assert.ok(!rows.filter((r) => r.role === 'pass').some((r) => r.key === 't' || r.key === 'now'));
});

test('a long list is capped and a one-item list still makes a drum', () => {
  const many = Array.from({ length: 40 }, (_, i) => item(`n${i}`));
  const rows = buildReelRows({ start: item('s'), others: many, target: item('t') });
  assert.equal(rows.filter((r) => r.role === 'pass').length, 15, 'maxSteps 16 = 15 passes + the target');
  const lone = buildReelRows({ start: item('s'), others: [], target: item('t') });
  assert.deepEqual(lone.map((r) => r.role), ['above', 'start', 'target', 'below']);
  assert.equal(lone[0].text, '', 'nothing to peek at is drawn as nothing, never a made-up name');
});
