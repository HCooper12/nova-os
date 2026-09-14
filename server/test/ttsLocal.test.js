// The local voice provider: pronunciation rewrites, provider dispatch, and
// the sidecar contract — exercised against a stub sidecar and REAL ffmpeg
// (fixture-only tests for a bytes pipeline are a known trap in this repo).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// 4299, NOT 4199: 4199 is the real Kokoro sidecar's port, and the stub collided
// with it (EADDRINUSE) whenever his voice engine was running — which, on his
// Mac, is always. A test that only passes when production is down is a test
// of the wrong thing.
process.env.NOVA_TTS_PORT = '4299';

// A TEST MUST NEVER LAUNCH THE REAL ENGINE — on his Mac that is an 82M-parameter
// model load. NOVA_VOICE_DIR points the spawn at an EMPTY scratch tree, so the
// background boot every readiness check fires fails instantly on "not
// installed" rather than lingering for three minutes and being joined by the
// next test. (The respawn rule needs a real spawn, so it has its own file:
// ttsSidecarRespawn.test.js.)
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';

process.env.NOVA_VOICE_DIR = mkdtempSync(nodePath.join(os.tmpdir(), 'nova-voice-'));

const { rewriteForSpeech, localVoices, synthesizeLocal, healthy, mp3Args } = await import('../lib/ttsLocal.js');
const { ttsEngine, ttsConfigured, listVoices, ttsReady } = await import('../lib/tts.js');

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
  await new Promise((r) => stub.listen(4299, '127.0.0.1', r));
  try {
    const mp3 = await synthesizeLocal('Your heart rate is steady, sir.', 'nova-jarvis');
    assert.equal(seen[0].voice, 'nova', 'the -jarvis suffix selects FX, not a sidecar voice');
    assert.match(seen[0].text, /heart-rate/, 'the engine receives the rewritten text');
    assert.ok(mp3.length > 100, 'mp3 came back non-trivial');
    const magicOk = mp3.slice(0, 3).toString() === 'ID3' || (mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0);
    assert.ok(magicOk, `mp3 magic bytes (got ${mp3.slice(0, 4).toString('hex')})`);
    // repeated fixed lines come from cache — the sidecar is not consulted again
    const before = seen.length;
    const again = await synthesizeLocal('Your heart rate is steady, sir.', 'nova-jarvis');
    assert.equal(seen.length, before, 'cache hit skips the sidecar');
    assert.equal(again, mp3, 'the exact cached buffer is returned');
  } finally {
    stub.close();
  }
});

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }


// ---------------------------------------------------------------------------
// READY IS NOT CONFIGURED. His 13 Sep: the sidecar was signal-killed at 06:57
// and Nova had no voice until 20:13. Nothing was misconfigured for a moment of
// it — /tts/status kept answering `configured: true`, so every reply committed
// to an engine that could not make a sound, and the browser voice that would
// have covered it was never asked.
// ---------------------------------------------------------------------------

const DEAD_PORT = '4298'; // nothing listens here — the point of it

test('a configured engine that cannot answer reports NOT ready, and says so without waiting out a boot', async () => {
  const hadPort = process.env.NOVA_TTS_PORT;
  const hadKey = process.env.ELEVENLABS_API_KEY;
  const hadLocal = process.env.NOVA_TTS_LOCAL;
  try {
    delete process.env.ELEVENLABS_API_KEY;
    process.env.NOVA_TTS_LOCAL = '1';
    process.env.NOVA_TTS_PORT = DEAD_PORT;

    assert.equal(ttsConfigured(), true, 'still configured — nothing is missing from the setup');
    const started = Date.now();
    assert.equal(await ttsReady(), false, 'and not ready, which is the half the client needed');
    assert.equal(await healthy(), false);
    // The answer must come back in the time a status poll has, not in the
    // three minutes a model load is allowed.
    assert.ok(Date.now() - started < 5000, `readiness answered in ${Date.now() - started}ms`);
  } finally {
    if (hadPort !== undefined) process.env.NOVA_TTS_PORT = hadPort; else delete process.env.NOVA_TTS_PORT;
    if (hadKey !== undefined) process.env.ELEVENLABS_API_KEY = hadKey; else delete process.env.ELEVENLABS_API_KEY;
    if (hadLocal !== undefined) process.env.NOVA_TTS_LOCAL = hadLocal; else delete process.env.NOVA_TTS_LOCAL;
  }
});

test('readiness dispatch: unconfigured is never ready, a keyed cloud engine always is, local answers for itself', async () => {
  const hadKey = process.env.ELEVENLABS_API_KEY;
  const hadLocal = process.env.NOVA_TTS_LOCAL;
  const hadPort = process.env.NOVA_TTS_PORT;
  const stub = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end('{"ok":true}');
  });
  try {
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.NOVA_TTS_LOCAL;
    assert.equal(await ttsReady(), false, 'no engine at all');

    process.env.ELEVENLABS_API_KEY = 'k';
    assert.equal(ttsEngine(), 'elevenlabs');
    assert.equal(await ttsReady(), true, 'reachable-or-not per request, with its own timeout — not ours to probe');

    delete process.env.ELEVENLABS_API_KEY;
    process.env.NOVA_TTS_LOCAL = '1';
    process.env.NOVA_TTS_PORT = '4297';
    await new Promise((r) => stub.listen(4297, '127.0.0.1', r));
    assert.equal(await ttsReady(), true, 'the local engine is answering, so it is ready');
  } finally {
    stub.close();
    if (hadKey !== undefined) process.env.ELEVENLABS_API_KEY = hadKey; else delete process.env.ELEVENLABS_API_KEY;
    if (hadLocal !== undefined) process.env.NOVA_TTS_LOCAL = hadLocal; else delete process.env.NOVA_TTS_LOCAL;
    if (hadPort !== undefined) process.env.NOVA_TTS_PORT = hadPort; else delete process.env.NOVA_TTS_PORT;
  }
});

test('a sentence is refused immediately while the engine boots — a reply never waits three minutes for one', async () => {
  const hadPort = process.env.NOVA_TTS_PORT;
  try {
    process.env.NOVA_TTS_PORT = DEAD_PORT;
    const started = Date.now();
    await assert.rejects(
      () => synthesizeLocal(`unique to this test ${Date.now()}`, 'nova'),
      /starting up/,
      'it names the state rather than failing blankly',
    );
    assert.ok(Date.now() - started < 5000, `refused in ${Date.now() - started}ms, not after a boot`);
  } finally {
    if (hadPort !== undefined) process.env.NOVA_TTS_PORT = hadPort; else delete process.env.NOVA_TTS_PORT;
  }
});


test('the wire carries speech, not a music bitrate — and his ear gets a knob', () => {
  // 24 kHz mono puts the encoder in MPEG-2 Layer III, capped at 160k, so the
  // old '192k' silently became 160k: a near-CD rate for one channel of voice,
  // and the largest thing on the wire for a phone on cellular.
  assert.deepEqual(mp3Args(null), ['-loglevel', 'error', '-i', 'pipe:0', '-f', 'mp3', '-b:a', '64k', 'pipe:1']);
  assert.deepEqual(mp3Args('afade=t=in:d=0.008'),
    ['-loglevel', 'error', '-i', 'pipe:0', '-af', 'afade=t=in:d=0.008', '-f', 'mp3', '-b:a', '64k', 'pipe:1'],
    'the treatment still rides in front of the encoder');
  const had = process.env.NOVA_TTS_BITRATE;
  try {
    process.env.NOVA_TTS_BITRATE = '128k';
    assert.equal(mp3Args(null).at(-2), '128k', 'turning it back up is one env line');
  } finally {
    if (had !== undefined) process.env.NOVA_TTS_BITRATE = had; else delete process.env.NOVA_TTS_BITRATE;
  }
});
