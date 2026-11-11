import test from 'node:test';
import assert from 'node:assert/strict';
import { afterPaint, watchFrames, PAINT_CAP_MS } from './afterPaint.js';

// a hand-cranked frame clock and timer
function rig() {
  const frames = []; const timers = [];
  return {
    raf: (f) => { frames.push(f); return frames.length; },
    caf: (id) => { frames[id - 1] = null; },
    setTimer: (f, ms) => { timers.push({ f, ms }); return timers.length; },
    clearTimer: (id) => { timers[id - 1] = null; },
    frame: () => { const f = frames.find(Boolean); frames[frames.indexOf(f)] = null; f?.(); },
    fire: () => { const t = timers.find(Boolean); timers[timers.indexOf(t)] = null; t?.f(); },
    timers,
  };
}

test('the call waits for two frames, so the committed state is drawn first', () => {
  const r = rig(); let ran = 0;
  afterPaint(() => { ran += 1; }, r);
  assert.equal(ran, 0, 'not in the same task');
  r.frame();
  assert.equal(ran, 0, 'the first frame callback runs before that frame paints');
  r.frame();
  assert.equal(ran, 1);
});

test('a hidden page has no frames: the timer lands it, once', () => {
  const r = rig(); let ran = 0;
  afterPaint(() => { ran += 1; }, r);
  assert.equal(r.timers[0].ms, PAINT_CAP_MS);
  r.fire();
  assert.equal(ran, 1);
  r.frame(); r.frame();
  assert.equal(ran, 1, 'frames arriving late do not run it again');
});

test('frames first: the timer is cleared and cannot run it twice', () => {
  const r = rig(); let ran = 0;
  afterPaint(() => { ran += 1; }, r);
  r.frame(); r.frame();
  assert.equal(r.timers[0], null);
  assert.equal(ran, 1);
});

test('cancelled before it lands, it never runs', () => {
  const r = rig(); let ran = 0;
  const cancel = afterPaint(() => { ran += 1; }, r);
  r.frame();
  cancel();
  r.frame(); r.fire();
  assert.equal(ran, 0);
});

test('no frame clock at all (a test, a worker): the timer alone runs it', () => {
  let ran = 0; let fire = null;
  afterPaint(() => { ran += 1; }, { raf: null, caf: null, setTimer: (f) => { fire = f; return 1; }, clearTimer: () => {} });
  fire();
  assert.equal(ran, 1);
});

test('watchFrames: first frame and the longest gap, including one under the 600 ms clock line', () => {
  const r = rig(); let t = 1000;
  const w = watchFrames({ now: () => t, raf: r.raf, caf: r.caf });
  assert.deepEqual(w.read(), { paintMs: null, gapMs: null }, 'nothing drawn yet is said as nothing');
  t = 1012; r.frame();
  t = 1029; r.frame();
  t = 1489; r.frame();   // a 460 ms freeze
  t = 1506; r.frame();
  assert.deepEqual(w.read(), { paintMs: 12, gapMs: 460 });
});

test('watchFrames stops at its window and on stop()', () => {
  const r = rig(); let t = 0;
  const w = watchFrames({ windowMs: 100, now: () => t, raf: r.raf, caf: r.caf });
  t = 10; r.frame(); t = 120; r.frame();
  t = 5000; r.frame();   // nothing queued past the window
  assert.equal(w.read().gapMs, 110);
  const w2 = watchFrames({ now: () => t, raf: r.raf, caf: r.caf });
  w2.stop(); r.frame();
  assert.deepEqual(w2.read(), { paintMs: null, gapMs: null });
});
