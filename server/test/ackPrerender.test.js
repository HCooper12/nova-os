// Pre-rendering the finite ack vocabulary to disk (18 Oct 2026). Every
// collaborator here (synth/has/list/busy) is injected, so this never touches
// the real ttsLocal.js sidecar path and never spawns the real Kokoro engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Set before any import, per this repo's test-data-isolation rule, even
// though this suite never touches the real data dir (defensive habit).
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'nova-data-'));

const { prerenderAcks } = await import('../lib/ackPrerender.js');

test('renders each voice × sentence not already on disk, skips the rest, and never runs two synths at once', async () => {
  const sentences = ['Checking your sleep.', 'Looking that up.'];
  const voiceIds = ['nova', 'nova-light'];
  const onDisk = new Set(['nova|Checking your sleep.']);
  let concurrent = 0;
  let maxConcurrent = 0;
  const calls = [];
  const synth = async (text, voiceId) => {
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    calls.push(`${voiceId}|${text}`);
    await new Promise((r) => setTimeout(r, 10));
    concurrent--;
    return Buffer.from('ok');
  };
  const has = async (text, voiceId) => onDisk.has(`${voiceId}|${text}`);
  const list = async () => sentences;

  const out = await prerenderAcks({ voiceIds, synth, has, list, sleepMs: 1, busy: () => 0 });

  assert.equal(maxConcurrent, 1, 'synths ran strictly sequentially');
  assert.equal(out.skipped, 1, 'the one already on disk was skipped');
  assert.equal(out.rendered, 3, '2 voices × 2 sentences minus the 1 already cached');
  assert.equal(out.failed, 0);
  assert.deepEqual(calls, [
    'nova|Looking that up.',
    'nova-light|Checking your sleep.',
    'nova-light|Looking that up.',
  ], 'voice outer, sentence inner, in order, the disk hit never synthesized');
});

test('waits for a live /api/tts reply to go idle before the next pre-render synth', async () => {
  const sentences = ['Checking your sleep.'];
  const voiceIds = ['nova'];
  const busyUntil = Date.now() + 60;
  const busy = () => (Date.now() < busyUntil ? 1 : 0);
  let synthAt = null;
  const synth = async () => { synthAt = Date.now(); return Buffer.from('ok'); };
  const has = async () => false;
  const list = async () => sentences;

  const started = Date.now();
  await prerenderAcks({ voiceIds, synth, has, list, sleepMs: 5, busy });
  assert.ok(synthAt !== null, 'it did eventually synthesize');
  assert.ok(synthAt >= busyUntil, 'did not start until the engine reported idle');
  assert.ok(synthAt - started >= 40, `waited for busy to clear (started synth after ${synthAt - started}ms)`);
});

test('stops early when the signal is aborted mid-run, never rendering what is left', async () => {
  const sentences = ['one.', 'two.', 'three.'];
  const voiceIds = ['nova'];
  const controller = new AbortController();
  let calls = 0;
  const synth = async () => {
    calls++;
    if (calls === 1) controller.abort();
    return Buffer.from('ok');
  };
  const has = async () => false;
  const list = async () => sentences;

  const out = await prerenderAcks({
    voiceIds, synth, has, list, sleepMs: 1, signal: controller.signal, busy: () => 0,
  });
  assert.equal(calls, 1, 'stopped right after the abort — never reached "two." or "three."');
  assert.equal(out.rendered, 1);
});

test('each voice × sentence is attempted at most once per run (a failure does not retry forever)', async () => {
  const sentences = ['a.', 'b.'];
  const voiceIds = ['nova'];
  let calls = 0;
  const synth = async (text) => {
    calls++;
    if (text === 'a.') throw new Error('boom');
    return Buffer.from('ok');
  };
  const has = async () => false;
  const list = async () => sentences;

  const out = await prerenderAcks({ voiceIds, synth, has, list, sleepMs: 1, busy: () => 0 });
  assert.equal(calls, 2, 'one attempt per sentence, a failure does not retry within the run');
  assert.equal(out.rendered, 1);
  assert.equal(out.failed, 1);
});

// The real acks.js is out of scope here (the parent is rewriting it
// concurrently, and its ackVocabulary() walk is real-vault work this suite
// must never trigger), so this exercises the guard the same way a real
// missing export would surface: list() rejecting with a clear message.
test('a failing list() (the shape of a missing acks.ackPrerenderList export) rejects with its message intact, never swallowed', async () => {
  const list = async () => {
    throw new Error('acks.js has no ackPrerenderList() export yet');
  };
  await assert.rejects(
    () => prerenderAcks({
      voiceIds: ['nova'], synth: async () => Buffer.from('ok'), has: async () => false, list,
    }),
    /ackPrerenderList/,
    'the real failure reason survives, not a generic error',
  );
});

test('list() must resolve to an array, or prerenderAcks says so rather than looping over something else', async () => {
  const list = async () => ({ not: 'an array' });
  await assert.rejects(
    () => prerenderAcks({
      voiceIds: ['nova'], synth: async () => Buffer.from('ok'), has: async () => false, list,
    }),
    /array/,
  );
});
