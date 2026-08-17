// The local voice provider: pronunciation rewrites, provider dispatch, and
// the sidecar contract — exercised against a stub sidecar and REAL ffmpeg
// (fixture-only tests for a bytes pipeline are a known trap in this repo).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NOVA_TTS_PORT = '4199'; // test stub, never the real sidecar

const { rewriteForSpeech, localVoices, synthesizeLocal } = await import('../lib/ttsLocal.js');
const { ttsEngine, ttsConfigured, listVoices } = await import('../lib/tts.js');

test('spoken rewrites: compounds hyphenated for the engine, display text untouched by anyone', () => {
  assert.equal(
    rewriteForSpeech('Your resting heart rate is down; step count is 8,538.'),
    'Your resting heart-rate is down; step-count is 8,538.',
  );
  // case-insensitive match, lowercase replacement — fine for an engine that never sees casing
  assert.equal(rewriteForSpeech('Heart Rate zones'), 'heart-rate zones');
  assert.equal(rewriteForSpeech('nothing to rewrite'), 'nothing to rewrite');
});

test('provider dispatch: local when enabled and unkeyed, elevenlabs wins when keyed', async () => {
  const hadKey = process.env.ELEVENLABS_API_KEY;
  const hadLocal = process.env.NOVA_TTS_LOCAL;
  try {
    delete process.env.ELEVENLABS_API_KEY;
    process.env.NOVA_TTS_LOCAL = '1';
    assert.equal(ttsEngine(), 'local');
    assert.equal(ttsConfigured(), true);
    const voices = await listVoices();
    assert.ok(voices.some((v) => v.id === 'nova'), 'the default blend is offered');
    assert.ok(voices.some((v) => v.id === 'nova-jarvis'), 'the treated variant is offered');

    process.env.ELEVENLABS_API_KEY = 'k';
    assert.equal(ttsEngine(), 'elevenlabs', 'a paid key is an explicit choice and wins');

    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.NOVA_TTS_LOCAL;
    assert.equal(ttsEngine(), null);
    assert.equal(ttsConfigured(), false);
  } finally {
    if (hadKey !== undefined) process.env.ELEVENLABS_API_KEY = hadKey; else delete process.env.ELEVENLABS_API_KEY;
    if (hadLocal !== undefined) process.env.NOVA_TTS_LOCAL = hadLocal; else delete process.env.NOVA_TTS_LOCAL;
  }
});

import { spawnSync } from 'node:child_process';
const hasFfmpeg = ['/opt/homebrew/bin/ffmpeg', 'ffmpeg']
  .some((p) => spawnSync(p, ['-version']).status === 0);

test('local synthesis: stub sidecar wav → real ffmpeg → mp3 bytes; -jarvis maps to the base voice', { skip: !hasFfmpeg && 'no ffmpeg on this machine (CI)' }, async () => {
  // A minimal valid 24kHz mono 16-bit WAV: header + 2400 samples of silence.
  const samples = 2400;
  const data = Buffer.alloc(samples * 2);
  const wav = Buffer.concat([
    Buffer.from('RIFF'), u32(36 + data.length), Buffer.from('WAVEfmt '),
    u32(16), u16(1), u16(1), u32(24000), u32(48000), u16(2), u16(16),
    Buffer.from('data'), u32(data.length), data,
  ]);
  const seen = [];
  const stub = http.createServer((req, res) => {
    if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); return res.end('{"ok":true}'); }
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      seen.push(JSON.parse(body));
      res.setHeader('Content-Type', 'audio/wav');
      res.end(wav);
    });
  });
  await new Promise((r) => stub.listen(4199, '127.0.0.1', r));
  try {
    const mp3 = await synthesizeLocal('Your heart rate is steady, sir.', 'nova-jarvis');
    assert.equal(seen[0].voice, 'nova', 'the -jarvis suffix selects FX, not a sidecar voice');
    assert.match(seen[0].text, /heart-rate/, 'the engine receives the rewritten text');
    assert.ok(mp3.length > 100, 'mp3 came back non-trivial');
    const magicOk = mp3.slice(0, 3).toString() === 'ID3' || (mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0);
    assert.ok(magicOk, `mp3 magic bytes (got ${mp3.slice(0, 4).toString('hex')})`);
  } finally {
    stub.close();
  }
});

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
