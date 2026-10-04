// THE SKY RESTS WHEN HE DOES (his call, 4 Oct 2026, design/mockups/70):
// the drift runs for five seconds after his last touch, scroll or key, then
// pauses; the next one wakes it. Driven with a fake root, target and clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSkyRest, SKY_REST_ATTR, SKY_REST_MS, SKY_WAKE_EVENTS } from '../../src/skyRest.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function fakes() {
  const attrs = new Set();
  const root = { hasAttribute: (k) => attrs.has(k), setAttribute: (k) => attrs.add(k), removeAttribute: (k) => attrs.delete(k) };
  const listeners = new Map();
  const target = {
    addEventListener: (ev, fn, o) => { assert.equal(o.capture, true, `${ev} must listen in capture, or a scroll inside <main> never wakes the sky`); listeners.set(ev, fn); },
    removeEventListener: (ev) => listeners.delete(ev),
  };
  let now = 0, seq = 0; const pending = new Map();
  const timers = {
    setTimeout: (fn, ms) => { const id = ++seq; pending.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (id) => pending.delete(id),
  };
  const advance = (ms) => {
    now += ms;
    for (const [id, p] of [...pending]) if (p.at <= now) { pending.delete(id); p.fn(); }
  };
  return { attrs, root, target, listeners, timers, advance };
}

test('the sky drifts at first and rests five seconds after the last movement', () => {
  const f = fakes();
  startSkyRest({ root: f.root, target: f.target, timers: f.timers });
  assert.equal(f.attrs.has(SKY_REST_ATTR), false, 'resting before he has even looked');
  f.advance(SKY_REST_MS - 1);
  assert.equal(f.attrs.has(SKY_REST_ATTR), false, 'rested early');
  f.advance(1);
  assert.equal(f.attrs.has(SKY_REST_ATTR), true, 'never rests');
});

test('every kind of movement wakes it, and the countdown starts again', () => {
  const f = fakes();
  startSkyRest({ root: f.root, target: f.target, timers: f.timers });
  assert.deepEqual([...f.listeners.keys()].sort(), [...SKY_WAKE_EVENTS].sort());
  for (const ev of SKY_WAKE_EVENTS) {
    f.advance(SKY_REST_MS);
    assert.equal(f.attrs.has(SKY_REST_ATTR), true);
    f.listeners.get(ev)();
    assert.equal(f.attrs.has(SKY_REST_ATTR), false, `${ev} did not wake the sky`);
    f.advance(SKY_REST_MS - 1);
    assert.equal(f.attrs.has(SKY_REST_ATTR), false, `${ev} did not restart the countdown`);
  }
});

test('stopping leaves no listener, no timer and no paused sky behind', () => {
  const f = fakes();
  const stop = startSkyRest({ root: f.root, target: f.target, timers: f.timers });
  f.advance(SKY_REST_MS);
  stop();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.attrs.has(SKY_REST_ATTR), false);
  f.advance(SKY_REST_MS * 2);
  assert.equal(f.attrs.has(SKY_REST_ATTR), false, 'a timer outlived stop()');
});

test('the app starts it, and the attribute pauses both drifting layers', async () => {
  const app = await readFile(path.join(ROOT, 'src', 'App.jsx'), 'utf8');
  const css = await readFile(path.join(ROOT, 'src', 'index.css'), 'utf8');
  assert.match(app, /this\.stopSkyRest = startSkyRest\(\);/);
  assert.match(app, /this\.stopSkyRest\?\.\(\);/, 'the app never stops it on unmount');
  assert.match(css, /:root\[data-nv-sky-rest\] \.nv-sky::before,\s*:root\[data-nv-sky-rest\] \.nv-sky::after \{ animation-play-state: paused; \}/);
});
