// The disk cache for short spoken lines (18 Oct 2026): a memory Map is lost
// on every restart, so a finite vocabulary of sentences (acks) gets a disk
// slot too, keyed exactly like the memory cache. Exercised against a stub
// sidecar and REAL ffmpeg — a fixture-only test of a bytes pipeline is a
// known trap in this repo (see ttsLocal.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync, unlinkSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// NOVA_DATA_DIR must be set before anything that might derive a data path is
// imported — a missed one here is how a test writes into his real vault
// state (server/test/nova-test-data-isolation memory).
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'nova-data-'));
// 4396, not the real sidecar's 4175 nor the other tts test files' 4297-4299
// — a port collision across test files is a false failure, not a real one.
process.env.NOVA_TTS_PORT = '4396';
// an EMPTY scratch tree so a readiness check's background boot fails
// instantly on "not installed" instead of spawning the real 82M-parameter
// Kokoro engine on his Mac.
process.env.NOVA_VOICE_DIR = mkdtempSync(path.join(os.tmpdir(), 'nova-voice-'));

const {
  synthesizeLocal,
  diskCacheHas,
  diskCacheStats,
  _resetAudioCacheForTest,
  _writeDiskCacheForTest,
  _pruneNow,
} = await import('../lib/ttsLocal.js');

import { spawnSync } from 'node:child_process';
const hasFfmpeg = ['/opt/homebrew/bin/ffmpeg', 'ffmpeg']
  .some((p) => spawnSync(p, ['-version']).status === 0);

// A non-silent fixture: pure silence gets eaten whole by ttsLocal.js's
// TRIM_FX (it trims silence from both edges), which left an earlier version
// of this test asserting on a near-empty mp3. A simple tone survives it.
function wavFixture(samples = 2400) {
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(8000 * Math.sin(i / 10)), i * 2);
  return Buffer.concat([
    Buffer.from('RIFF'), u32(36 + data.length), Buffer.from('WAVEfmt '),
    u32(16), u16(1), u16(1), u32(24000), u32(48000), u16(2), u16(16),
    Buffer.from('data'), u32(data.length), data,
  ]);
}
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }

function startStub() {
  let hits = 0;
  const stub = http.createServer((req, res) => {
    if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); return res.end('{"ok":true}'); }
    hits++;
    req.on('data', () => {});
    req.on('end', () => {
      res.setHeader('Content-Type', 'audio/wav');
      res.end(wavFixture());
    });
  });
  return { stub, hits: () => hits };
}

test(
  'a miss synthesizes and writes to disk; a second call after clearing memory is served from disk without the sidecar',
  { skip: !hasFfmpeg && 'no ffmpeg on this machine (CI)' },
  async () => {
    const { stub, hits } = startStub();
    await new Promise((r) => stub.listen(4396, '127.0.0.1', r));
    try {
      const text = `disk cache miss ${Date.now()}`;
      assert.equal(await diskCacheHas(text, 'nova'), false, 'nothing on disk yet');

      const mp3 = await synthesizeLocal(text, 'nova');
      assert.ok(mp3.length > 100, 'got real audio back');
      assert.equal(hits(), 1, 'one real synthesis happened');

      // the disk write is fire-and-forget — give it a moment to land
      await new Promise((r) => setTimeout(r, 250));
      assert.equal(await diskCacheHas(text, 'nova'), true, 'written to disk after synthesis');

      _resetAudioCacheForTest(); // simulate a restart: the memory Map is gone
      const again = await synthesizeLocal(text, 'nova');
      assert.equal(hits(), 1, 'the sidecar was NOT asked again — served from disk');
      assert.deepEqual(again, mp3, 'the exact same audio comes back');
    } finally {
      stub.close();
    }
  },
);

test(
  'a long line (>80 chars) is cached in memory but never written to disk',
  { skip: !hasFfmpeg && 'no ffmpeg on this machine (CI)' },
  async () => {
    const { stub, hits } = startStub();
    await new Promise((r) => stub.listen(4396, '127.0.0.1', r));
    try {
      const text = `${'this is a long brief sentence that exceeds eighty characters on purpose '.repeat(1)} ${Date.now()}`;
      assert.ok(text.length > 80, 'fixture really is long');
      const mp3 = await synthesizeLocal(text, 'nova');
      assert.ok(mp3.length > 100);
      await new Promise((r) => setTimeout(r, 200));
      assert.equal(await diskCacheHas(text, 'nova'), false, 'too long for the disk cache');

      // but the memory cache still has it — repeating it does not re-hit the sidecar
      await synthesizeLocal(text, 'nova');
      assert.equal(hits(), 1, 'memory cache still works for long lines');
    } finally {
      stub.close();
    }
  },
);

test('prune keeps the newest N files when the directory is over the bound', async () => {
  const hadMax = process.env.NOVA_TTS_DISK_CACHE_MAX;
  process.env.NOVA_TTS_DISK_CACHE_MAX = '3';
  try {
    const keys = ['a', 'b', 'c', 'd', 'e'];
    for (const k of keys) {
      // eslint-disable-next-line no-await-in-loop
      await _writeDiskCacheForTest(`prune-test|${k}`, Buffer.from(`audio-${k}`));
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 8)); // distinct mtimes, oldest first
    }
    await _pruneNow();
    const stats = await diskCacheStats();
    assert.equal(stats.files, 3, 'pruned down to the configured bound');
  } finally {
    if (hadMax !== undefined) process.env.NOVA_TTS_DISK_CACHE_MAX = hadMax;
    else delete process.env.NOVA_TTS_DISK_CACHE_MAX;
  }
});

test(
  'a disk write failure never fails the request',
  { skip: !hasFfmpeg && 'no ffmpeg on this machine (CI)' },
  async () => {
    const hadRoot = process.env.NOVA_DATA_DIR;
    const blockerFile = path.join(os.tmpdir(), `nova-tts-blocker-${Date.now()}`);
    writeFileSync(blockerFile, 'x'); // a FILE, not a directory — mkdir() under it must fail
    const { stub, hits } = startStub();
    await new Promise((r) => stub.listen(4396, '127.0.0.1', r));
    try {
      process.env.NOVA_DATA_DIR = blockerFile; // dataRoot() now points at a non-directory
      const text = `write failure path ${Date.now()}`;
      const mp3 = await synthesizeLocal(text, 'nova');
      assert.ok(mp3.length > 100, 'the request still succeeds despite the disk write being impossible');
      assert.equal(hits(), 1);
    } finally {
      stub.close();
      process.env.NOVA_DATA_DIR = hadRoot;
      try { unlinkSync(blockerFile); } catch { /* best effort cleanup */ }
    }
  },
);
