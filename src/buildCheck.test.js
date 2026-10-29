// The UPDATE tap, pinned (his report, 29 Oct 2026: "I will press it about
// three different times… until it eventually seems to restart and update
// itself"). The tap used to reload after 1.2 s while the new service worker
// was still installing, so the reload came up on the old build. These pin
// the replacement: wait for the new worker to take the page, then reload;
// fall back to the network only when there is nothing to wait for.
//
//   node --test src/buildCheck.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { applyUpdate, switchWorker, attemptsFor, clearAttempt, isStale } from './buildCheck.js';

// A ServiceWorkerContainer stand-in: a controlled page whose registration
// has a new worker installing that takes over after `installMs`.
function fakeSW({ installMs = 50, newWorker = true, updateHangs = false } = {}) {
  const listeners = new Set();
  const reg = {
    installing: null, waiting: null, active: {},
    update() {
      if (!newWorker) return Promise.resolve();
      reg.installing = {};
      // like the browser: update() settles when the install has finished,
      // and the worker (skipWaiting + clientsClaim) takes the page then
      return new Promise((resolve) => setTimeout(() => {
        reg.installing = null;
        reg.active = {};
        sw.controller = reg.active;
        for (const fn of listeners) fn();
        resolve();
      }, installMs)).then(() => (updateHangs ? new Promise(() => {}) : undefined));
    },
  };
  const sw = {
    controller: {},
    getRegistration: () => Promise.resolve(reg),
    addEventListener: (type, fn) => { if (type === 'controllerchange') listeners.add(fn); },
    removeEventListener: (type, fn) => { if (type === 'controllerchange') listeners.delete(fn); },
    listeners,
  };
  return sw;
}

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('the regression: a slow install is waited for, not raced (no reload onto the old build)', async () => {
  const events = [];
  const sw = fakeSW({ installMs: 1500 }); // longer than the old 1.2 s guard
  const how = await applyUpdate({
    sw, storage: memStorage(), target: 'b2',
    reload: () => events.push(['reload', !!sw.controller && sw.listeners.size === 0]),
    clear: () => { events.push(['clear']); return Promise.resolve(); },
    onStage: (s) => events.push(['stage', s]),
  });
  assert.equal(how, 'worker');
  // exactly one reload, after the new worker took the page, and the network
  // fallback never ran
  assert.deepEqual(events, [['stage', 'downloading'], ['reload', true]]);
});

test('nothing new to install: falls straight back to clearing and a network reload', async () => {
  const events = [];
  const how = await applyUpdate({
    sw: fakeSW({ newWorker: false }), storage: memStorage(), target: 'b2',
    reload: () => events.push('reload'),
    clear: () => { events.push('clear'); return Promise.resolve(); },
    onStage: (s) => events.push(s),
  });
  assert.equal(how, 'network');
  assert.deepEqual(events, ['downloading', 'clearing', 'clear', 'reload']);
});

test('no service worker controlling the page: a network reload, no waiting', async () => {
  const events = [];
  const how = await applyUpdate({
    sw: undefined, storage: memStorage(),
    reload: () => events.push('reload'),
    clear: () => { events.push('clear'); return Promise.resolve(); },
  });
  assert.equal(how, 'network');
  assert.deepEqual(events, ['clear', 'reload']);
});

test('an install still running at the deadline is waited for, not abandoned', async () => {
  const sw = fakeSW({ installMs: 1300 });
  const how = await applyUpdate({
    sw, storage: memStorage(), reload: () => {}, clear: () => Promise.resolve(),
    switchByMs: 80, // the plain deadline passes mid-install
  });
  assert.equal(how, 'worker');
});

test('the new worker never takes over: it gives up at the cap and reloads anyway', async () => {
  let reloads = 0;
  const started = Date.now();
  const how = await applyUpdate({
    sw: fakeSW({ installMs: 10_000 }), storage: memStorage(),
    reload: () => { reloads += 1; },
    clear: () => Promise.resolve(),
    switchByMs: 80, installCapMs: 150,
  });
  assert.equal(how, 'network');
  assert.equal(reloads, 1);
  assert.ok(Date.now() - started < 3000);
});

test('a cleanup that never settles still reloads (the 22 Sep guarantee holds)', async () => {
  let reloads = 0;
  await applyUpdate({
    sw: undefined, storage: memStorage(),
    reload: () => { reloads += 1; },
    clear: () => new Promise(() => {}),
    clearByMs: 50,
  });
  assert.equal(reloads, 1);
});

test('a getRegistration that hangs does not hang the tap', async () => {
  const sw = { ...fakeSW(), getRegistration: () => new Promise(() => {}) };
  const t0 = Date.now();
  assert.equal(await switchWorker(sw, 60_000), false);
  assert.ok(Date.now() - t0 < 4000);
});

test('attempts are counted per build, so the same build is never offered as new twice', async () => {
  const storage = memStorage();
  const opts = { sw: undefined, storage, reload: () => {}, clear: () => Promise.resolve() };
  assert.equal(attemptsFor('b2', { storage }), 0);
  await applyUpdate({ ...opts, target: 'b2' });
  assert.equal(attemptsFor('b2', { storage }), 1);
  await applyUpdate({ ...opts, target: 'b2' });
  assert.equal(attemptsFor('b2', { storage }), 2);
  // a different build starts its own count
  assert.equal(attemptsFor('b3', { storage }), 0);
  // an old attempt (over half an hour) no longer counts
  assert.equal(attemptsFor('b2', { storage, now: Date.now() + 31 * 60_000 }), 0);
  clearAttempt(storage);
  assert.equal(attemptsFor('b2', { storage }), 0);
});

test('isStale: a different deployed id is stale; unknown or dev is not', () => {
  assert.equal(isStale('a1', 'b2'), true);
  assert.equal(isStale('a1', 'a1'), false);
  assert.equal(isStale('a1', null), false);
  assert.equal(isStale('dev', 'b2'), false);
});
