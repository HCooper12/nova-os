// Speech to text: the key store and the preference order mirror the watch
// toolchain (Groq first, OpenAI second); the network call itself needs a real
// voice note and is not exercised here.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Everything this file could write goes to scratch, set BEFORE any lib module
// loads; the real transcriber is never spawned (a stand-in answers on its own
// port, so the ears read as already running) and Groq is never called (fetch
// is replaced for api.groq.com only).
const SCRATCH = mkdtempSync(path.join(os.tmpdir(), 'nova-transcribe-'));
process.env.NOVA_DATA_DIR = path.join(SCRATCH, 'data');
process.env.NOVA_STT_PORT = '4389';
const EARS = path.join(SCRATCH, 'ears');
mkdirSync(path.join(EARS, 'env', 'bin'), { recursive: true });
writeFileSync(path.join(EARS, 'env', 'bin', 'python'), '#!/bin/sh\nexit 1\n'); // installed, never run
writeFileSync(path.join(EARS, 'server.py'), '# stand-in\n');
process.env.NOVA_STT_DIR = EARS;
const KEYS = path.join(SCRATCH, 'watch.env');
writeFileSync(KEYS, 'GROQ_API_KEY=gsk_test\n');
process.env.NOVA_WHISPER_ENV = KEYS;
delete process.env.NOVA_STT_PROVIDER;
delete process.env.NOVA_STT_LOCAL;

const { parseEnvKeys, pickBackend } = await import('../lib/transcribe.js');

test('the env file parses like a shell would read it: quotes off, comments and blanks ignored', () => {
  const env = parseEnvKeys('# keys\nGROQ_API_KEY="gsk_abc"\n\nOPENAI_API_KEY=sk-def\nBROKEN LINE\n=nokey\n');
  assert.deepEqual(env, { GROQ_API_KEY: 'gsk_abc', OPENAI_API_KEY: 'sk-def' });
});

test('Groq is preferred, OpenAI is the fallback, and no key is an honest null', () => {
  const both = pickBackend({ GROQ_API_KEY: 'g', OPENAI_API_KEY: 'o' });
  assert.equal(both.backend, 'groq');
  assert.equal(both.model, 'whisper-large-v3');
  const openai = pickBackend({ OPENAI_API_KEY: 'o' });
  assert.equal(openai.backend, 'openai');
  assert.equal(openai.model, 'whisper-1');
  assert.equal(pickBackend({}), null);
  assert.equal(pickBackend(null), null);
});

// 29 Oct 2026: a live clip of room noise sent with X-Vad: heard came back as
// "." and was kept as his words; the mid-turn read always sends heard.
test('a transcript with no letter or digit is never his words, heard or not', async () => {
  const { heardText } = await import('../lib/transcribe.js');
  assert.equal(heardText('.', { spoke: true }), '');
  assert.equal(heardText(' … ', { spoke: true }), '');
  assert.equal(heardText('', { spoke: true }), '');
  assert.equal(heardText('.', { spoke: false }), '');
  // the meter heard him: a bare thanks is his
  assert.equal(heardText('Thank you.', { spoke: true }), 'Thank you.');
  // the meter heard nothing: the silence line goes
  assert.equal(heardText('Thank you.', { spoke: false }), '');
  assert.equal(heardText('How many steps today?', { spoke: false }), 'How many steps today?');
  assert.equal(heardText('5.', { spoke: true }), '5.');
});

// ---------------------------------------------------------------------------
// WHICH EARS (2 Nov 2026): the provider choice, the fallback when the cloud
// cannot be reached, and the labels every result carries.
// ---------------------------------------------------------------------------
let localCalls = 0;
let localDelayMs = 0;
const ears = http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.url === '/health') return send(200, { ok: true });
  req.resume();
  req.on('end', () => {
    localCalls++;
    setTimeout(() => send(200, { text: 'How many steps today', seconds: 0.4, language: 'en' }), localDelayMs);
  });
});
await new Promise((r) => ears.listen(4389, '127.0.0.1', r));

const realFetch = globalThis.fetch;
let groq = () => new Response(JSON.stringify({ text: 'How many steps today?' }), { status: 200 });
let groqCalls = 0;
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith('https://api.groq.com')) { groqCalls++; return groq(url, opts); }
  return realFetch(url, opts);
};
after(() => {
  globalThis.fetch = realFetch;
  ears.close();
  rmSync(SCRATCH, { recursive: true, force: true });
});
const reset = () => { localCalls = 0; groqCalls = 0; localDelayMs = 0; delete process.env.NOVA_STT_PROVIDER; groq = () => new Response(JSON.stringify({ text: 'How many steps today?' }), { status: 200 }); };
const AUDIO = Buffer.from('a real enough recording');
const offline = () => { throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } }); };

test('the provider: groq until the ears are installed, then shadow; an explicit choice wins, local never without the ears', async () => {
  const { sttProvider } = await import('../lib/transcribe.js');
  assert.equal(sttProvider({}, false), 'groq', 'nothing installed: the cloud, as today');
  assert.equal(sttProvider({}, true), 'shadow', 'installed: measure on his real turns');
  assert.equal(sttProvider({ NOVA_STT_PROVIDER: 'groq' }, true), 'groq');
  assert.equal(sttProvider({ NOVA_STT_PROVIDER: 'LOCAL' }, true), 'local');
  assert.equal(sttProvider({ NOVA_STT_PROVIDER: 'local' }, false), 'groq', 'cannot choose ears that are not there');
  assert.equal(sttProvider({ NOVA_STT_PROVIDER: 'shadow' }, false), 'groq');
  assert.equal(sttProvider({ NOVA_STT_PROVIDER: 'nonsense' }, true), 'shadow');
});

test('groq: the cloud answers, labelled with provider and ms; the ears are not touched', async () => {
  reset();
  process.env.NOVA_STT_PROVIDER = 'groq';
  const { transcribeBuffer } = await import('../lib/transcribe.js');
  const out = await transcribeBuffer(AUDIO, { source: 'voice' });
  assert.equal(out.text, 'How many steps today?');
  assert.equal(out.provider, 'groq');
  assert.equal(out.backend, 'groq');
  assert.ok(Number.isFinite(out.ms));
  assert.equal(out.fallback, undefined);
  assert.equal(localCalls, 0);
});

test('no network: the local ears stand in, labelled fallback with the reason', async () => {
  reset();
  process.env.NOVA_STT_PROVIDER = 'groq';
  groq = offline;
  const { transcribeBuffer } = await import('../lib/transcribe.js');
  const out = await transcribeBuffer(AUDIO, { source: 'voice' });
  assert.equal(out.text, 'How many steps today');
  assert.equal(out.provider, 'local');
  assert.equal(out.fallback, true);
  assert.match(out.reason, /groq could not be reached \(ENOTFOUND\)/);
  assert.equal(out.model, 'whisper-large-v3-turbo (mlx)');
  assert.ok(Number.isFinite(out.ms));
});

test('a 5xx, a 429, a timeout and a missing key all fall back; a 400 about the audio does not', async () => {
  const { transcribeBuffer } = await import('../lib/transcribe.js');
  for (const status of [503, 429]) {
    reset();
    groq = () => new Response('upstream down', { status });
    const out = await transcribeBuffer(AUDIO);
    assert.equal(out.provider, 'local', `status ${status}`);
    assert.match(out.reason, new RegExp(`\\(${status}\\)`));
  }
  reset();
  groq = (url, opts) => new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))));
  const slow = await transcribeBuffer(AUDIO, { timeoutMs: 50 });
  assert.equal(slow.provider, 'local');
  assert.match(slow.reason, /did not answer within/);

  reset();
  writeFileSync(KEYS, '# no keys\n');
  const nokey = await transcribeBuffer(AUDIO);
  assert.equal(nokey.provider, 'local');
  assert.match(nokey.reason, /no transcription key is configured/);
  writeFileSync(KEYS, 'GROQ_API_KEY=gsk_test\n');

  reset();
  groq = () => new Response('could not process file', { status: 400 });
  await assert.rejects(transcribeBuffer(AUDIO), /groq transcription failed \(400\)/);
  assert.equal(localCalls, 0, 'bad audio is not hidden behind a second engine');
});

test('no network and no ears installed: the honest cloud error, nothing invented', async () => {
  reset();
  groq = offline;
  process.env.NOVA_STT_LOCAL = '0';
  const { transcribeBuffer } = await import('../lib/transcribe.js');
  await assert.rejects(transcribeBuffer(AUDIO), /groq could not be reached/);
  delete process.env.NOVA_STT_LOCAL;
});

test('local: the ears answer first, and the cloud stands in only if they fail', async () => {
  reset();
  process.env.NOVA_STT_PROVIDER = 'local';
  const { transcribeBuffer } = await import('../lib/transcribe.js');
  const out = await transcribeBuffer(AUDIO);
  assert.equal(out.provider, 'local');
  assert.equal(out.fallback, undefined);
  assert.equal(groqCalls, 0);
  // the ears installed but dead (nothing on this port, and the stand-in
  // python exits at once): the cloud, labelled
  process.env.NOVA_STT_PORT = '4390';
  process.env.NOVA_STT_BOOT_MS = '2000';
  const fell = await transcribeBuffer(AUDIO);
  assert.equal(fell.provider, 'groq');
  assert.equal(fell.fallback, true);
  assert.match(fell.reason, /local transcriber/);
  process.env.NOVA_STT_PORT = '4389';
  delete process.env.NOVA_STT_BOOT_MS;
});

test('shadow: his turn gets the cloud words without waiting on the ears, and one row lands', async () => {
  reset();
  process.env.NOVA_STT_PROVIDER = 'shadow';
  localDelayMs = 300; // the ears are slower than the cloud here: the turn must not wait
  const { transcribeBuffer } = await import('../lib/transcribe.js');
  const { SHADOW_PATH } = await import('../lib/sttShadow.js');
  const started = Date.now();
  const out = await transcribeBuffer(AUDIO, { source: 'voice', device: 'iPhone' });
  assert.ok(Date.now() - started < 250, 'answered before the ears finished');
  assert.equal(out.provider, 'groq');
  assert.equal(out.text, 'How many steps today?');
  assert.equal(out.shadow, true);
  const deadline = Date.now() + 5000;
  while (!existsSync(SHADOW_PATH()) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  const rows = readFileSync(SHADOW_PATH(), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row.wer, 0, 'the same words, punctuation aside');
  assert.equal(row.agree, true);
  assert.equal(row.device, 'iPhone');
  assert.equal(row.source, 'voice');
  assert.equal(row.bytes, AUDIO.length);
  assert.ok(row.localMs >= 300);
  assert.ok(!JSON.stringify(row).includes(AUDIO.toString()), 'no audio in the row');

  // no source (another person's video): never shadowed
  localCalls = 0;
  await transcribeBuffer(AUDIO);
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(localCalls, 0);
  assert.equal(readFileSync(SHADOW_PATH(), 'utf8').split('\n').filter(Boolean).length, 1);
});

test('shadow and offline: the shadow run already in flight is the fallback, heard once, and no comparison row', async () => {
  reset();
  process.env.NOVA_STT_PROVIDER = 'shadow';
  groq = offline;
  const { transcribeBuffer } = await import('../lib/transcribe.js');
  const { SHADOW_PATH } = await import('../lib/sttShadow.js');
  const before = readFileSync(SHADOW_PATH(), 'utf8');
  const out = await transcribeBuffer(AUDIO, { source: 'voice' });
  assert.equal(out.provider, 'local');
  assert.equal(out.fallback, true);
  assert.equal(localCalls, 1, 'one local pass, not two');
  assert.equal(readFileSync(SHADOW_PATH(), 'utf8'), before);
});
