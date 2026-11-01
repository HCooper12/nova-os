// NOVA'S LOCAL EARS, the node side (2 Nov 2026). Its own file because a boot
// is proven by really spawning a process, and a spawn leaves module state (a
// live handle, an in-flight boot) that would make sibling tests order-
// dependent; node:test gives each file its own process.
//
// The real transcriber is NEVER started here: NOVA_STT_DIR points at a
// scratch folder whose env/bin/python is a stand-in that runs a tiny HTTP
// server speaking the same contract as server/voice-stt/server.py, on a port
// no other test uses.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRATCH = mkdtempSync(path.join(os.tmpdir(), 'nova-stt-'));
process.env.NOVA_DATA_DIR = path.join(SCRATCH, 'data');
process.env.NOVA_STT_PORT = '4387';
process.env.NOVA_STT_BOOT_MS = '15000';

// The stand-in ears: health, a transcript that says what it received, a 500
// on request, and it stops on its own if this test process is gone.
const STUB = path.join(SCRATCH, 'stub.mjs');
writeFileSync(STUB, `
import http from 'node:http';
const parent = process.ppid;
setInterval(() => { if (process.ppid !== parent) process.exit(0); }, 500).unref();
setTimeout(() => process.exit(0), 60000).unref();
http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.url === '/health') return send(200, { ok: true });
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const u = new URL(req.url, 'http://x');
    if (req.headers['content-type']?.startsWith('application/json')) {
      const j = JSON.parse(body.toString());
      return send(200, { text: 'from file ' + j.path.split('/').pop(), seconds: 0.2, language: j.language });
    }
    if (body.toString().includes('FAIL')) return send(500, { error: 'ValueError: could not decode' });
    send(200, { text: '  heard ' + body.length + ' bytes as ' + u.searchParams.get('ext') + ' ', seconds: 0.1, language: u.searchParams.get('language') });
  });
}).listen(Number(process.env.NOVA_STT_PORT), '127.0.0.1');
`);

function makeEars(dir, script) {
  mkdirSync(path.join(dir, 'env', 'bin'), { recursive: true });
  writeFileSync(path.join(dir, 'server.py'), '# stand-in\n');
  const py = path.join(dir, 'env', 'bin', 'python');
  writeFileSync(py, script);
  chmodSync(py, 0o755);
}
const EARS = path.join(SCRATCH, 'ears');
makeEars(EARS, `#!/bin/sh\nexec "${process.execPath}" "${STUB}"\n`);
process.env.NOVA_STT_DIR = EARS;

const stt = await import('../lib/sttLocal.js');

after(() => {
  stt.stopEars();
  rmSync(SCRATCH, { recursive: true, force: true });
});

test('configured means installed: the venv python and server.py both there, and NOVA_STT_LOCAL=0 switches it off', () => {
  assert.equal(stt.localSttConfigured(), true);
  process.env.NOVA_STT_LOCAL = '0';
  assert.equal(stt.localSttConfigured(), false, 'his kill switch');
  delete process.env.NOVA_STT_LOCAL;
  const prev = process.env.NOVA_STT_DIR;
  process.env.NOVA_STT_DIR = path.join(SCRATCH, 'nowhere');
  assert.equal(stt.localSttConfigured(), false, 'setup.sh never ran');
  process.env.NOVA_STT_DIR = prev;
});

test('configured is not ready: nothing answering reads false, and a status check does not boot 1.5 GB', async () => {
  assert.equal(await stt.localSttReady(), false);
  assert.equal(stt._bootStats().running, false, 'no spawn without boot:true');
});

test('the first transcription boots the ears, waits for them, and labels the result', async () => {
  const out = await stt.transcribeLocal(Buffer.from('fake-audio-bytes'), { mime: 'audio/webm' });
  assert.equal(out.text, 'heard 16 bytes as webm', 'whitespace tidied, the type became the extension');
  assert.equal(out.model, 'whisper-large-v3-turbo (mlx)');
  assert.equal(out.cold, true, 'this call paid the boot');
  assert.ok(Number.isFinite(out.ms) && out.ms >= 0);
  assert.equal(out.seconds, 0.1);
  assert.equal(await stt.localSttReady(), true);
  const again = await stt.transcribeLocal(Buffer.from('more'), { name: 'voice.ogg' });
  assert.equal(again.text, 'heard 4 bytes as ogg', 'the filename extension wins');
  assert.equal(again.cold, false, 'warm the second time');
});

test('a file path is sent as a path, not read into the request', async () => {
  const f = path.join(SCRATCH, 'note.ogg');
  writeFileSync(f, 'x');
  const out = await stt.transcribeLocal(f, { language: 'en' });
  assert.equal(out.text, 'from file note.ogg');
});

test('errors say the real cause in plain words, never an empty message', async () => {
  await assert.rejects(stt.transcribeLocal(Buffer.alloc(0)), /the recording arrived empty/);
  await assert.rejects(stt.transcribeLocal(path.join(SCRATCH, 'missing.m4a')), /there is no audio file at/);
  await assert.rejects(stt.transcribeLocal(Buffer.from('FAIL')), (e) => {
    assert.match(e.message, /refused the recording \(500\): ValueError: could not decode/);
    return true;
  });
});

test('ears that die while starting are named as such, not waited on for the whole allowance', async () => {
  stt.stopEars();
  const prevDir = process.env.NOVA_STT_DIR;
  const prevPort = process.env.NOVA_STT_PORT;
  const DEAD = path.join(SCRATCH, 'dead');
  makeEars(DEAD, '#!/bin/sh\nexit 3\n');
  process.env.NOVA_STT_DIR = DEAD;
  process.env.NOVA_STT_PORT = '4388'; // nothing listens here
  const started = Date.now();
  await assert.rejects(stt.transcribeLocal(Buffer.from('abc')), /died while starting/);
  assert.ok(Date.now() - started < 10_000, 'the exit event ended the wait');
  process.env.NOVA_STT_DIR = path.join(SCRATCH, 'nowhere');
  await assert.rejects(stt.transcribeLocal(Buffer.from('abc')), /not installed \(run server\/voice-stt\/setup\.sh\)/);
  process.env.NOVA_STT_DIR = prevDir;
  process.env.NOVA_STT_PORT = prevPort;
});
