// THE SOCKET BACKLOG (18 Oct 2026 audit). The sidecar is a serial HTTPServer
// with a 5-deep listen backlog: a reply's sentences fired at once landed as
// 6 x 200 and the rest were refused in milliseconds, 469 dropped sentences in
// a week. The stand-in below accepts ONE request at a time and refuses any
// connection beyond a small backlog, the same shape. Twelve sentences asked
// for together must all come back, each with its own audio, and reach the
// engine in the order they were asked. Own file: the slot count is module
// state (node:test gives each file its own process).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRATCH = mkdtempSync(path.join(os.tmpdir(), 'nova-tts-sem-'));
process.env.NOVA_DATA_DIR = SCRATCH; // the disk cache writes here, never server/data
const FAKE_FF = path.join(SCRATCH, 'ffmpeg');
writeFileSync(FAKE_FF, '#!/bin/sh\ncat\n'); // bytes pass straight through
chmodSync(FAKE_FF, 0o755);
process.env.NOVA_FFMPEG = FAKE_FF;
process.env.NOVA_VOICE_DIR = SCRATCH; // never spawn the real engine

const BACKLOG = 1; // one rendering + one waiting; anything more is refused
let outstanding = 0;
let maxOutstanding = 0;
let refused = 0;
const seen = [];
let queue = Promise.resolve();
const server = http.createServer((req, res) => {
  if (req.url === '/health') return res.end('ok');
  if (outstanding >= 1 + BACKLOG) {
    refused++;
    req.socket.destroy(); // a full backlog: the connection never lands
    return;
  }
  outstanding++;
  maxOutstanding = Math.max(maxOutstanding, outstanding);
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    queue = queue.then(() => new Promise((done) => setTimeout(() => {
      const { text } = JSON.parse(body);
      seen.push(text);
      res.setHeader('Content-Type', 'audio/wav');
      res.end(Buffer.from(`wav:${text}`));
      outstanding--;
      done();
    }, 15)));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
process.env.NOVA_TTS_PORT = String(server.address().port);

const { synthesizeLocal, TtsBootingError } = await import('../lib/ttsLocal.js');

test('twelve sentences asked for at once all come back, in order, none refused', async () => {
  const lines = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1}.`);
  const results = await Promise.allSettled(lines.map((t) => synthesizeLocal(t, 'nova')));
  const failed = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
  assert.deepEqual(failed, [], 'no sentence is refused');
  results.forEach((r, i) => assert.equal(r.value.toString(), `wav:${lines[i]}`, 'each sentence gets its own audio'));
  // two are at the engine at once, so neighbours may swap on the wire; no
  // sentence may run more than one place from where it was asked
  assert.equal(seen.length, lines.length);
  seen.forEach((t, pos) => {
    const asked = lines.indexOf(t);
    assert.ok(Math.abs(asked - pos) <= 1, `${t} rendered at ${pos}, asked at ${asked}: ${seen.join(' | ')}`);
  });
  assert.equal(refused, 0, 'no connection hit the full backlog');
  assert.ok(maxOutstanding <= 2, `at most two at the engine (saw ${maxOutstanding})`);
});

test('a booting engine is a distinct error the route can answer with 503', () => {
  const e = new TtsBootingError();
  assert.equal(e.code, 'TTS_BOOTING');
  assert.match(e.message, /still starting up/);
  assert.ok(e.retryAfterSec > 0);
});

test.after(() => server.close());

test('a synthesis that just succeeded counts as ready without a health ping', async () => {
  const { localReady } = await import('../lib/ttsLocal.js');
  server.close(); // the engine stops answering /health at all
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(await localReady(), true, 'the good answers above are proof of life for 30s');
});
