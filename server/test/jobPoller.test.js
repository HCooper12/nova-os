// THE LOST COACH ANSWER (25 Sep 2026). His detailed question ended in
// "Timed out waiting for the server". What must hold now: nothing is
// declared without asking the server; slow is not failed; a job the server
// forgot is named as lost at once; a blip is retried; and coming back to the
// app looks immediately instead of waiting out a frozen timer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pollJob, nextDelay, LOST_MESSAGE } from '../../src/jobPoller.js';
import { registerJobMap, activeJobs } from '../lib/jobRegistry.js';

function rig({ responses, timeoutMs = 3000, intervalMs = 500, ceilingMs } = {}) {
  let t = 0;
  let next = 1;
  const timers = new Map();
  const listeners = {};
  const doc = {
    visibilityState: 'visible',
    addEventListener: (k, fn) => { listeners[k] = fn; },
    removeEventListener: (k) => { delete listeners[k]; },
  };
  const log = [];
  let calls = 0;
  const fetchJob = async () => {
    calls += 1;
    const r = typeof responses === 'function' ? responses(calls, t) : responses[Math.min(calls - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  const poll = pollJob(fetchJob, {
    intervalMs, timeoutMs, ceilingMs, doc,
    now: () => t,
    setT: (fn, ms) => { const id = next++; timers.set(id, { fn, at: t + ms }); return id; },
    clearT: (id) => timers.delete(id),
    onReady: (j) => log.push(['ready', j]),
    onError: (m, extra) => log.push(['error', m, extra]),
    onProgress: () => log.push(['progress']),
    onSlow: () => log.push(['slow']),
  });
  const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };
  const advance = async (ms) => {
    const end = t + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      t = due[1].at;
      timers.delete(due[0]);
      due[1].fn();
      await flush();
    }
    t = end;
  };
  return { poll, log, advance, doc, listeners, get calls() { return calls; }, setT: (v) => { t = v; } };
}

const running = { status: 'running' };
const notFound = () => Object.assign(new Error('/api/claude-code/message/x failed: 404'), { status: 404 });

test('slow is not failed: past the budget it says so once and keeps waiting', async () => {
  const r = rig({ responses: (n) => (n < 30 ? running : { status: 'ready', result: { text: 'the answer' } }) });
  await r.advance(3500);
  assert.ok(r.log.some((e) => e[0] === 'slow'), 'told once that it is slow');
  assert.ok(!r.log.some((e) => e[0] === 'error'), 'and never called it a failure');
  await r.advance(120_000);
  assert.equal(r.log.filter((e) => e[0] === 'slow').length, 1);
  assert.equal(r.log.at(-1)[0], 'ready', 'the answer still lands');
});

test('a job the server forgot (404) is named lost at once, not "may still be running"', async () => {
  const r = rig({ responses: [running, notFound()] });
  await r.advance(1200);
  const err = r.log.find((e) => e[0] === 'error');
  assert.equal(err[1], LOST_MESSAGE);
  assert.deepEqual(err[2], { lost: true });
});

test('a network blip is retried with backoff instead of three strikes', async () => {
  const blip = new Error('network down');
  const r = rig({ responses: (n) => (n <= 5 ? blip : { status: 'ready', result: {} }) });
  await r.advance(60_000);
  assert.ok(!r.log.some((e) => e[0] === 'error'), 'five failures in a row is still just a blip');
  assert.equal(r.log.at(-1)[0], 'ready');
  assert.equal(nextDelay({ age: 0, failures: 1, intervalMs: 700, timeoutMs: 1 }), 1000);
  assert.equal(nextDelay({ age: 0, failures: 9, intervalMs: 700, timeoutMs: 1 }), 16000, 'capped');
});

test('coming back to the app looks NOW, and never declares a timeout without asking', async () => {
  const r = rig({ responses: (n) => (n < 2 ? running : { status: 'ready', result: {} }) });
  await r.advance(600);                   // one look, still running
  // he locks the phone for five minutes: iOS freezes the timers
  r.setT(5 * 60_000);
  r.doc.visibilityState = 'visible';
  r.listeners.visibilitychange();
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  assert.equal(r.log.at(-1)[0], 'ready', 'the first thing it did was ask — and the answer was there');
  assert.ok(!r.log.some((e) => e[0] === 'error'));
});

test('there is still a ceiling, and it says what happened', async () => {
  const r = rig({ responses: () => running, timeoutMs: 1000, ceilingMs: 20_000 });
  await r.advance(40_000);
  const err = r.log.find((e) => e[0] === 'error');
  assert.ok(err && /very long time/.test(err[1]));
});

test('the registry counts only work that is still running', () => {
  const a = registerJobMap('test-a', new Map([['1', { status: 'running' }], ['2', { status: 'ready' }]]));
  registerJobMap('test-b', new Map([['3', { status: 'digesting' }], ['4', { status: 'filed' }], ['5', { status: 'error' }]]));
  const r = activeJobs();
  assert.equal(r.byLane['test-a'], 1);
  assert.equal(r.byLane['test-b'], 1);
  a.set('1', { status: 'done' });
  assert.equal(activeJobs().byLane['test-a'], undefined);
});
