// routes/drill.js — the token, the shapes, and a watched local turn with
// stubbed engines (no real model, voice or network).
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-drillroute-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { drillRouter, runLocalTurn, drillSentence } from '../routes/drill.js';
import { disableOutboundWatch, _resetOutboundForTests, outboundWatchOn } from '../lib/outbound.js';

const TOKEN = 'test-token-drill';
test.after(() => rm(dataDir, { recursive: true, force: true }));
test.afterEach(() => { disableOutboundWatch(); _resetOutboundForTests(); });

const stubs = (realFetch) => ({
  localModel: { completeLocal: async () => { await realFetch('http://127.0.0.1:9/api/chat').catch(() => {}); return { text: '{"kind":"task"}', model: 'stub:4b' }; } },
  tts: { ttsEngine: () => 'local', synthesize: async () => Buffer.from('mp3') },
  transcribe: { loadWhisperBackend: async () => ({ backend: 'groq' }), transcribeBuffer: async () => { throw new Error('must not be called'); } },
  internetNeeds: async () => [
    { feature: 'Ears (speech to text)', needs: 'internet', why: 'w', state: 'Groq (internet)', configured: true },
    { feature: 'Voice (text to speech)', needs: 'none', why: 'w', state: 'Kokoro on this Mac', configured: true },
  ],
});

function start(deps) {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    app.use('/api', drillRouter({ token: TOKEN, deps }));
    const srv = app.listen(0, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}/api` }));
  });
}
const auth = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

test('every drill route refuses a missing or wrong token', async (t) => {
  const { srv, base } = await start(stubs(globalThis.fetch));
  t.after(() => srv.close());
  for (const [method, p] of [['GET', '/drill/connections'], ['POST', '/drill/turn'], ['GET', '/drill/needs'], ['POST', '/drill/run'], ['POST', '/drill/watch']]) {
    const none = await fetch(base + p, { method });
    assert.equal(none.status, 401, `${method} ${p}`);
    const wrong = await fetch(base + p, { method, headers: { Authorization: 'Bearer nope' } });
    assert.equal(wrong.status, 401, `${method} ${p} wrong`);
  }
});

test('turn → connections: the watcher is on, the turn is marked, rows carry hosts', async (t) => {
  const realFetch = globalThis.fetch;
  const { srv, base } = await start(stubs(realFetch));
  t.after(() => srv.close());
  const turn = await (await realFetch(`${base}/drill/turn`, { method: 'POST', headers: auth, body: JSON.stringify({ label: 'unit turn' }) })).json();
  assert.equal(turn.watching, true);
  assert.equal(turn.turn.label, 'unit turn');
  assert.equal(typeof turn.since, 'number');
  await globalThis.fetch('http://127.0.0.1:9/x?y=z').catch(() => {});
  const c = await (await realFetch(`${base}/drill/connections?since=${turn.since}`, { headers: auth })).json();
  assert.equal(c.watching, true);
  assert.ok(Array.isArray(c.rows));
  const mine = c.rows.find((r) => r.port === 9);
  assert.ok(mine, 'the call after the mark is recorded');
  assert.equal(mine.local, true);
  assert.equal(mine.turn, 'unit turn');
  assert.deepEqual(c.nonLocal, []);
  const off = await (await realFetch(`${base}/drill/watch`, { method: 'POST', headers: auth, body: JSON.stringify({ on: false }) })).json();
  assert.equal(off.watching, false);
  const bad = await realFetch(`${base}/drill/watch`, { method: 'POST', headers: auth, body: JSON.stringify({}) });
  assert.equal(bad.status, 400);
});

test('run: one watched turn with stubbed engines; Groq ears are named, not called', async (t) => {
  const realFetch = globalThis.fetch;
  const { srv, base } = await start(stubs(realFetch));
  t.after(() => srv.close());
  const r = await (await realFetch(`${base}/drill/run`, { method: 'POST', headers: auth, body: '{}' })).json();
  assert.equal(r.steps.classify.ok, true);
  assert.equal(r.steps.classify.model, 'stub:4b');
  assert.equal(r.steps.tts.ok, true);
  assert.equal(r.steps.ears.skipped, true);
  assert.match(r.steps.ears.error, /Groq \(internet\); not exercised/);
  assert.ok(Array.isArray(r.rows) && Array.isArray(r.nonLocal));
  assert.equal(outboundWatchOn(), false, 'a run that switched the watcher on switches it off after');
});

test('needs: the list and the "still needs" subset', async (t) => {
  const { srv, base } = await start(stubs(globalThis.fetch));
  t.after(() => srv.close());
  const n = await (await fetch(`${base}/drill/needs`, { headers: auth })).json();
  assert.equal(n.needs.length, 2);
  assert.deepEqual(n.stillNeeds.map((e) => e.feature), ['Ears (speech to text)']);
});

test('the voice is never ElevenLabs in a drill', async () => {
  const out = await runLocalTurn({ deps: {
    localModel: { completeLocal: async () => ({ text: '{}', model: 'm' }) },
    tts: { ttsEngine: () => 'elevenlabs', synthesize: async () => { throw new Error('must not be called'); } },
    transcribe: { loadWhisperBackend: async () => null },
  } });
  assert.equal(out.tts.skipped, true);
  assert.match(out.tts.error, /ElevenLabs/);
  assert.match(out.ears.error, /no transcriber/);
});

test('the drill sentence is over 80 characters (the disk cache skips it)', () => {
  assert.ok(drillSentence().length > 80);
});
