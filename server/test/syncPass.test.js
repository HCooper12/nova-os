// THE DOUBLE REFRESH (18 Nov 2026). As his spoken turn began, his phone ran a
// whole snapshot and, 90 ms later, the per-slice fallback: a sync iOS froze
// mid-flight woke, failed, pinged a network that was back, and fell back
// beside the newer sync the resume handler had started. src/syncPass.js
// gives every bulk sync a generation and one retry before the fallback;
// these tests pin both rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotPass, failureStep } from '../../src/syncPass.js';

// a snapshot that fails as the network does (no HTTP status) or as the Mac does (a status)
const netError = () => Object.assign(new TypeError('Offline. Requires Mac connection.'));
const httpError = (status = 502) => Object.assign(new Error(`/api/snapshot failed: ${status}`), { status });
const unreachable = (e) => !Number.isFinite(e?.status) && (e instanceof TypeError || e?.name === 'AbortError' || e?.name === 'TimeoutError');

// a scripted pass: `answers` is what each snapshot try does, in order
function rig({ answers, pings = [], current = () => true }) {
  const calls = { snapshot: 0, ping: 0 };
  const run = () => snapshotPass({
    isCurrent: current,
    snapshot: async () => {
      const a = answers[calls.snapshot++];
      if (a instanceof Error) throw a;
      return a;
    },
    ping: async () => {
      const ok = pings[calls.ping++];
      if (ok === 'throw') throw new TypeError('Load failed');
      return ok;
    },
    unreachable,
  });
  return { calls, run };
}

test('a sync that fails after a newer one started abandons: no ping, no retry, no fallback', async () => {
  const { calls, run } = rig({ answers: [netError()], pings: [true], current: () => false });
  const r = await run();
  assert.equal(r.outcome, 'abandon');
  assert.equal(calls.snapshot, 1);
  assert.equal(calls.ping, 0, 'a stale sync does not even ask');
});

test('the 18 Nov order: the frozen sync wakes after the resume sync started, and steps aside', async () => {
  // two passes share one generation counter, as App.refreshLiveData's do
  let gen = 0;
  let fallbacks = 0;
  const pass = (fail) => {
    const mine = ++gen;
    return snapshotPass({
      isCurrent: () => gen === mine,
      snapshot: () => fail,
      ping: async () => true,
      unreachable,
    }).then((r) => { if (r.outcome === 'fallback') fallbacks += 1; return r; });
  };
  let wake;
  const frozen = pass(new Promise((_, reject) => { wake = reject; }));   // in flight when iOS froze the app
  const fresh = pass(Promise.resolve({ slices: { notes: { notes: [] } } }));   // the resume handler's sync
  wake(netError());                                                       // the frozen one fails on waking
  const [a, b] = await Promise.all([frozen, fresh]);
  assert.equal(a.outcome, 'abandon');
  assert.equal(b.outcome, 'ok');
  assert.equal(fallbacks, 0, 'one refresh, not two');
});

test('a newer sync starting while this one pings still makes this one step aside', async () => {
  let current = true;
  const r = await snapshotPass({
    isCurrent: () => current,
    snapshot: async () => { throw netError(); },
    ping: async () => { current = false; return true; },
    unreachable,
  });
  assert.equal(r.outcome, 'abandon');
});

test('a first failure with a good ping retries the snapshot once, and the retry\'s answer is used', async () => {
  const value = { slices: { todos: { items: [] } } };
  const { calls, run } = rig({ answers: [netError(), value], pings: [true] });
  const r = await run();
  assert.equal(r.outcome, 'ok');
  assert.equal(r.value, value);
  assert.equal(r.tries, 2);
  assert.equal(calls.snapshot, 2);
  assert.equal(calls.ping, 1);
});

test('the Mac answering with an error is pinged and retried too, then falls back', async () => {
  const { calls, run } = rig({ answers: [httpError(502), httpError(502)], pings: [true] });
  const r = await run();
  assert.equal(r.outcome, 'fallback');
  assert.equal(calls.snapshot, 2, 'exactly one retry');
  assert.equal(calls.ping, 1, 'a second answer with a status needs no second ping');
});

test('a second failure falls back, and only then', async () => {
  const { calls, run } = rig({ answers: [netError(), netError()], pings: [true, true] });
  const r = await run();
  assert.equal(r.outcome, 'fallback');
  assert.equal(calls.snapshot, 2, 'never a third snapshot');
  assert.equal(calls.ping, 2, 'a retry lost on the network is judged by the old rule: ping, then fall back');
});

test('a retry lost on the network with a dead ping says OFFLINE, never the fallback', async () => {
  const { run } = rig({ answers: [netError(), netError()], pings: [true, false] });
  assert.equal((await run()).outcome, 'offline');
});

test('a failed ping follows today\'s path: OFFLINE when nothing answered, the fallback when the Mac answered', async () => {
  const gone = rig({ answers: [netError()], pings: [false] });
  const r1 = await gone.run();
  assert.equal(r1.outcome, 'offline');
  assert.equal(gone.calls.snapshot, 1, 'no retry after a failed ping');
  const thrown = rig({ answers: [netError()], pings: ['throw'] });
  assert.equal((await thrown.run()).outcome, 'offline', 'a ping that throws is a failed ping');
  const answered = rig({ answers: [httpError(500)], pings: [false] });
  const r2 = await answered.run();
  assert.equal(r2.outcome, 'fallback');
  assert.equal(answered.calls.snapshot, 1);
});

test('a sync called off on purpose (its signal aborted, its generation moved on) never falls back', async () => {
  const abort = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
  const { calls, run } = rig({ answers: [abort], pings: [true], current: () => false });
  const r = await run();
  assert.equal(r.outcome, 'abandon');
  assert.equal(calls.ping, 0);
});

test('a first snapshot that works is used as it is', async () => {
  const { calls, run } = rig({ answers: [{ slices: {} }] });
  const r = await run();
  assert.equal(r.outcome, 'ok');
  assert.equal(r.tries, 1);
  assert.equal(calls.ping, 0);
});

test('the step table', () => {
  assert.equal(failureStep({ current: false, attempt: 1, ping: null }), 'abandon');
  assert.equal(failureStep({ current: false, attempt: 1, ping: true }), 'abandon');
  assert.equal(failureStep({ current: true, attempt: 1, unreachable: true, ping: null }), 'ping');
  assert.equal(failureStep({ current: true, attempt: 1, unreachable: false, ping: null }), 'ping');
  assert.equal(failureStep({ current: true, attempt: 1, unreachable: true, ping: true }), 'retry');
  assert.equal(failureStep({ current: true, attempt: 1, unreachable: false, ping: true }), 'retry');
  assert.equal(failureStep({ current: true, attempt: 1, unreachable: true, ping: false }), 'offline');
  assert.equal(failureStep({ current: true, attempt: 1, unreachable: false, ping: false }), 'fallback');
  assert.equal(failureStep({ current: true, attempt: 2, unreachable: false, ping: null }), 'fallback');
  assert.equal(failureStep({ current: true, attempt: 2, unreachable: true, ping: null }), 'ping');
  assert.equal(failureStep({ current: true, attempt: 2, unreachable: true, ping: true }), 'fallback');
  assert.equal(failureStep({ current: true, attempt: 2, unreachable: true, ping: false }), 'offline');
});
