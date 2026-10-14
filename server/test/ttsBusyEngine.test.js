// A BUSY ENGINE IS NOT A DEAD ONE — its own file, because the rule lives in
// module state (the in-flight count, the last good answer) that sibling tests
// would otherwise share. node:test gives each file its own process.
//
// 14 Oct 23:39 UTC, his first voice turn the iPhone shell could hear: the
// phone asked for the reply's sentences at once, the serial sidecar was busy
// rendering the first, its /health could not answer inside 1.5s, and 30 of 33
// sentences were refused as "local tts is still starting up". The stand-in
// below is the same shape: one request at a time, /health stuck behind /tts.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRATCH = mkdtempSync(path.join(os.tmpdir(), 'nova-busy-tts-'));
// ffmpeg stand-in: the bytes pass straight through
const FAKE_FF = path.join(SCRATCH, 'ffmpeg');
writeFileSync(FAKE_FF, '#!/bin/sh\ncat\n');
chmodSync(FAKE_FF, 0o755);
process.env.NOVA_FFMPEG = FAKE_FF;
process.env.NOVA_VOICE_DIR = SCRATCH; // never spawn the real engine

// Serial: each request waits for the one before it, /health included.
let queue = Promise.resolve();
let healthCalls = 0;
const server = http.createServer((req, res) => {
  queue = queue.then(() => new Promise((done) => {
    if (req.url === '/health') {
      healthCalls++;
      res.end('ok');
      return done();
    }
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => setTimeout(() => {
      res.setHeader('Content-Type', 'audio/wav');
      res.end(Buffer.from(`wav:${JSON.parse(body).text}`));
      done();
    }, 1800)); // longer than the 1.5s health limit, like a real sentence
  }));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
process.env.NOVA_TTS_PORT = String(server.address().port);

const { synthesizeLocal } = await import('../lib/ttsLocal.js');

test('sentences asked for together are all spoken, not refused while the engine is busy', async () => {
  const lines = ['First sentence.', 'Second sentence.', 'Third sentence.'];
  // the first is already rendering when the rest arrive, as on his phone
  const first = synthesizeLocal(lines[0], 'nova');
  await new Promise((r) => setTimeout(r, 300));
  const results = await Promise.allSettled([first, ...lines.slice(1).map((t) => synthesizeLocal(t, 'nova'))]);
  const refused = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
  assert.deepEqual(refused, [], 'no sentence is refused while another is rendering');
  results.forEach((r, i) => assert.match(r.value.toString(), new RegExp(lines[i].replace('.', '\\.'))));
});

test('a sentence just after a good answer goes straight to the engine', async () => {
  const before = healthCalls;
  // fresh text, and time has not run past the trust window: no ping needed
  await synthesizeLocal('Fourth sentence.', 'nova');
  assert.equal(healthCalls, before, 'a recent good answer is trusted');
});

test.after(() => server.close());
