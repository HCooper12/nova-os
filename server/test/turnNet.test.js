// THE PHONE'S SIDE OF A SPOKEN TURN (22 Nov 2026). Polls the Mac answered in
// 1 to 4 ms took 2.3 to 4 s to reach the phone's code, and nothing could say
// whether the path, the main thread or a re-made connection cost it.
// src/turnNet.js keeps two clocks per request (what the code waited, what the
// network took), a 100 ms watchdog and the turn's sync story. These tests pin
// the matching, the breakdown, the watchdog and the receipt's fields.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNetRing, createTurnNet, timingOf, matches, watchResources, bindTurnNet, noteTurnRequest, STALL_TICK_MS } from '../../src/turnNet.js';

const BASE = 'https://mac.example.ts.net';
const ASK = `${BASE}/api/ask`;
const POLL = `${BASE}/api/claude-code/message/j1`;
const TX = `${BASE}/api/voice/transcribe`;
// an entry as the browser would give it: no detail without Timing-Allow-Origin
const entry = (name, startTime, duration, detail = null) => ({
  name, startTime, duration,
  connectStart: 0, connectEnd: 0, secureConnectionStart: 0, requestStart: 0, responseStart: 0,
  ...(detail || {}),
});

test('the code\'s wait and the network\'s time for the same request, whichever arrives first', () => {
  const ring = createNetRing();
  const net = createTurnNet({ ring });
  // the entry is already in the ring when the code gets the answer
  ring.add(entry(ASK, 1000.4, 60));
  net.request('ask', { url: ASK, t0: 1000, t1: 2800 });
  // the code got this one before the observer's callback ran
  net.request('poll', { url: POLL, t0: 3000, t1: 5300 });
  ring.add(entry(POLL, 3001, 4));
  const f = net.fields();
  assert.equal(f.askRtMs, 1800);
  assert.equal(f.askNetMs, 60, 'the response sat 1.74 s waiting for the main thread');
  assert.equal(f.pollN, 1);
  assert.equal(f.pollNetN, 1);
  assert.equal(f.pollHeldMaxMs, 2296);
  assert.equal(f.pollHeldSumMs, 2296);
  assert.ok(!('askConnectMs' in f), 'without Timing-Allow-Origin the breakdown is left out, never zero');
});

test('with Timing-Allow-Origin: connect, TLS and first byte, and a reused connection reads as none', () => {
  const fresh = timingOf(entry(POLL, 100, 900, { connectStart: 101, connectEnd: 700, secureConnectionStart: 300, requestStart: 701, responseStart: 990 }));
  assert.deepEqual(fresh, { netMs: 900, ttfbMs: 289, connectMs: 599, tlsMs: 400 });
  const reused = timingOf(entry(POLL, 100, 12, { connectStart: 100, connectEnd: 100, secureConnectionStart: 0, requestStart: 101, responseStart: 110 }));
  assert.deepEqual(reused, { netMs: 12, ttfbMs: 9, connectMs: 0, tlsMs: 0 });
  assert.equal(timingOf(null), null);
  assert.equal(timingOf({ startTime: 'x', duration: 1 }), null);
});

test('a peek still in flight is never taken for the turn\'s own upload', () => {
  const ring = createNetRing();
  ring.add(entry(TX, 500, 900));            // the clip-so-far read, started earlier
  const net = createTurnNet({ ring });
  net.request('tx', { url: TX, t0: 1200, t1: 1700 });
  assert.equal(net.fields().txNetMs, undefined, 'no entry started inside the upload\'s own window yet');
  const ring2 = createNetRing();
  ring2.add(entry(TX, 500, 900));
  ring2.add(entry(TX, 1201, 330));
  const net2 = createTurnNet({ ring: ring2 });
  net2.request('tx', { url: TX, t0: 1200, t1: 8500 });
  const f = net2.fields();
  assert.equal(f.txRtMs, 7300);
  assert.equal(f.txNetMs, 330, 'the 18 Nov shape: 0.33 s on the wire, 7.3 s for the code');
  assert.equal(matches({ url: TX, t0: 1200, t1: 1300 }, entry(TX, 1250, 200)), false, 'finished after the code saw it: not this call');
});

test('the watchdog: worst and summed lateness of a 100 ms timer, jitter and hidden spans ignored', () => {
  const net = createTurnNet();
  let t = 0;
  net.tick(t);
  for (const gap of [100, 104, 130, 700, 100, 2100]) { t += gap; net.tick(t); }
  net.tick(t + 9000, true);                 // the screen went away
  t += 9000 + STALL_TICK_MS;
  net.tick(t);                              // back: this gap says nothing
  t += 400;
  net.tick(t);
  const f = net.fields();
  assert.equal(f.stallMaxMs, 2000);
  assert.equal(f.stallSumMs, 600 + 2000 + 300, '4 and 30 ms of jitter are not stalls');
});

test('the sync story: the heaviest refresh, how many were held, and one called off', () => {
  const quiet = createTurnNet();
  const f0 = quiet.fields();
  assert.equal(f0.sync, 'none');
  assert.equal(f0.syncDeferred, 0);
  assert.ok(!('syncAborted' in f0));
  const busy = createTurnNet();
  busy.sync('aborted');
  busy.sync('deferred');
  busy.sync('slices');
  busy.sync('fallback');
  busy.sync('snapshot');
  busy.sync('nonsense');
  const f = busy.fields();
  assert.equal(f.sync, 'fallback');
  assert.equal(f.syncDeferred, 2, 'the called-off sync counts as held');
  assert.equal(f.syncAborted, true);
});

test('polls are summed over all of them; a poll the observer missed is counted, not guessed', () => {
  const ring = createNetRing();
  const net = createTurnNet({ ring });
  net.request('ask', { url: ASK, t0: 0, t1: 70 });
  for (let i = 0; i < 5; i += 1) {
    const t0 = 100 + i * 1000;
    net.request('poll', { url: POLL, t0, t1: t0 + 300 });
    if (i !== 2) ring.add(entry(POLL, t0 + 1, 10, { connectStart: t0 + 1, connectEnd: i === 4 ? t0 + 5 : t0 + 1, requestStart: t0 + 5, responseStart: t0 + 9 }));
  }
  const f = net.fields();
  assert.equal(f.pollN, 5);
  assert.equal(f.pollNetN, 4);
  assert.equal(f.pollRtSumMs, 1500);
  assert.equal(f.pollRtMaxMs, 300);
  assert.equal(f.pollHeldSumMs, 4 * 290);
  assert.equal(f.pollConnectN, 1, 'one poll built a new connection');
  assert.equal(f.pollConnectMaxMs, 4);
  assert.equal(f.askRtMs, 70);
  assert.ok(!('askNetMs' in f), 'the ask\'s entry never came: no number, not zero');
});

test('a reflex answer has an ask and no polls; nothing is recorded once the receipt is read', () => {
  const net = createTurnNet();
  net.request('ask', { url: ASK, t0: 0, t1: 40 });
  net.tick(0);
  const f = net.fields();
  assert.equal(f.pollN, 0);
  assert.ok(!('stallMaxMs' in f), 'one tick measures no gap');
  assert.equal(net.request('poll', { url: POLL, t0: 1, t1: 2 }), null);
  net.sync('fallback');
  assert.equal(net.fields().sync, 'none');
  assert.equal(net.request('nonsense', { url: ASK, t0: 0, t1: 1 }), null);
});

test('the ring stays small', () => {
  const ring = createNetRing({ max: 8 });
  for (let i = 0; i < 50; i += 1) ring.add(entry(`${BASE}/api/x${i}`, i, 1));
  assert.equal(ring.size(), 8);
});

test('the observer keeps only the API\'s own requests, and is optional', () => {
  let cb = null;
  let watched = null;
  class FakeObserver {
    constructor(fn) { cb = fn; }
    observe(o) { watched = o; }
    disconnect() { cb = null; }
  }
  const seen = [];
  const stop = watchResources({ Observer: FakeObserver, origin: () => BASE, onEntry: (e) => seen.push(e.name) });
  assert.equal(watched.type, 'resource');
  cb({ getEntries: () => [entry(ASK, 1, 2), entry('https://hcooper12.github.io/nova-os/a.js', 1, 2), entry(`${BASE}.evil.example/api/ask`, 1, 2)] });
  assert.deepEqual(seen, [ASK]);
  stop();
  assert.equal(cb, null);
  assert.equal(typeof watchResources({ Observer: null, origin: () => BASE, onEntry: () => {} }), 'function', 'no observer: nothing watched, nothing breaks');
});

test('the hook\'s bridge reaches the bound instrument, and is a no-op unbound', () => {
  noteTurnRequest('tx', { url: TX, t0: 0, t1: 1 });
  const got = [];
  const unbind = bindTurnNet((kind, timing) => got.push([kind, timing.t1]));
  noteTurnRequest('tx', { url: TX, t0: 0, t1: 9 });
  unbind();
  noteTurnRequest('tx', { url: TX, t0: 0, t1: 10 });
  assert.deepEqual(got, [['tx', 9]]);
});
