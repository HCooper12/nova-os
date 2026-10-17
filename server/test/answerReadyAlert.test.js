// THE ANSWER THAT LANDED IN HIS POCKET (18 Oct 2026). iOS froze the phone
// mid-poll twice in a week while the answer sat finished on the Mac for
// 35 s and 7.5 min. When an ask finishes and its client has not polled for
// five seconds, a tier-now alert pushes; a client that is polling never
// sees one, and the alert closes the moment the phone picks the answer up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'nova-answer-ready-'));
const { watchAnswer, noteAnswerPoll, answerReadyAlert, normalizeAlert, _answerWatchForTests } = await import('../lib/alerts.js');

// a hand-cranked clock and timer queue: no real waiting
function rig() {
  let t = 1_000_000;
  const timers = [];
  return {
    now: () => t,
    setT: (fn, ms) => { timers.push({ at: t + ms, fn }); },
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        t = next.at;
        await next.fn();
      }
      t = end;
    },
  };
}

test('the alert has the bounded anatomy: label, one sentence, open the voice screen', () => {
  for (const [agent, label, who] of [['nova', 'NOVA', 'Nova'], ['coach', 'COACH', 'Coach'], ['leader', 'LEAD', 'Leader']]) {
    const a = normalizeAlert(answerReadyAlert({ jobId: 'abc12345', agent }));
    assert.equal(a.tier, 'now');
    assert.equal(a.label, label);
    assert.equal(a.what, `${who}'s answer is ready`);
    assert.deepEqual(a.action, { label: 'Open', open: '#/voice' });
    assert.equal(a.dedupeKey, 'answer:abc12345');
  }
});

test('an answer finished while the phone was frozen pushes once', async () => {
  const r = rig();
  const raised = [];
  const job = { status: 'running' };
  watchAnswer('j1', { agent: 'coach', getJob: () => job, now: r.now, setT: r.setT, raise: async (a) => { raised.push(a); return { id: 'al1' }; } });
  noteAnswerPoll('j1', { now: r.now() });
  await r.advance(3000);
  noteAnswerPoll('j1', { now: r.now() }); // last look at t+3s, then iOS froze it
  await r.advance(1000);
  job.status = 'ready';
  await r.advance(1000); // the watcher sees it finish
  assert.equal(raised.length, 0, 'not before five quiet seconds');
  await r.advance(5000);
  assert.equal(raised.length, 1);
  assert.equal(raised[0].label, 'COACH');
  await r.advance(20_000);
  assert.equal(raised.length, 1, 'once');
});

test('a phone that keeps polling never sees the alert', async () => {
  const r = rig();
  const raised = [];
  const job = { status: 'running' };
  watchAnswer('j2', { getJob: () => job, now: r.now, setT: r.setT, raise: async (a) => { raised.push(a); return { id: 'x' }; } });
  await r.advance(2000);
  job.status = 'ready';
  await r.advance(1000);
  noteAnswerPoll('j2', { now: r.now() }); // the very next poll picks it up
  await r.advance(10_000);
  assert.equal(raised.length, 0);
  assert.equal(_answerWatchForTests().has('j2'), false, 'the watch is cleaned up');
});

test('a job that errors or vanishes announces nothing', async () => {
  const r = rig();
  const raised = [];
  let job = { status: 'running' };
  watchAnswer('j3', { getJob: () => job, now: r.now, setT: r.setT, raise: async (a) => { raised.push(a); return { id: 'x' }; } });
  await r.advance(1500);
  job = { status: 'error' };
  await r.advance(10_000);
  assert.equal(raised.length, 0);
  assert.equal(_answerWatchForTests().has('j3'), false);
});

test('no cap: a seven-minute answer is still watched and still announced', async () => {
  const r = rig();
  const raised = [];
  const job = { status: 'running' };
  watchAnswer('j4', { getJob: () => job, now: r.now, setT: r.setT, raise: async (a) => { raised.push(a); return { id: 'x' }; } });
  await r.advance(7 * 60_000);
  job.status = 'ready';
  await r.advance(7000);
  assert.equal(raised.length, 1);
});
