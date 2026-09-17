// The poster cache exists so the shelf can show the frame a video actually
// opens on. What matters is the same thing that matters in bookCovers: one
// fetch per video ever, a miss cached as hard as a hit, and identity by
// VIDEO ID so the same video under three URLs is one poster.
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-posters-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { getSourcePoster, posterKey, _resetPosters } = await import('../lib/sourcePosters.js');

const JPEG = Buffer.alloc(9000, 7);
let calls = [];
const realFetch = globalThis.fetch;
function stub(handler) {
  globalThis.fetch = async (url) => { calls.push(String(url)); return handler(String(url)); };
}
const ok = () => ({ ok: true, arrayBuffer: async () => JPEG.buffer.slice(0, JPEG.length) });
const notFound = () => ({ ok: false });

test.beforeEach(() => { calls = []; _resetPosters(); });
test.after(async () => {
  globalThis.fetch = realFetch;
  await rm(dataDir, { recursive: true, force: true });
});

test('the same video under three URL shapes is one poster', () => {
  const a = posterKey('https://youtu.be/dQw4w9WgXcQ');
  const b = posterKey('https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc');
  const c = posterKey('https://www.youtube.com/embed/dQw4w9WgXcQ');
  assert.equal(a, b);
  assert.equal(b, c);
});

test('a URL with no video in it is not a poster question', async () => {
  stub(ok);
  assert.equal(posterKey('https://example.com/an-article'), null);
  assert.equal(await getSourcePoster('https://example.com/an-article'), null);
  assert.deepEqual(calls, [], 'and it never reaches the network');
});

test('a poster is fetched once, then served from disk forever', async () => {
  stub(ok);
  const first = await getSourcePoster('https://youtu.be/AAAAAAAAAAA');
  assert.ok(Buffer.isBuffer(first));
  const n = calls.length;
  _resetPosters();                                  // a cold process
  const second = await getSourcePoster('https://www.youtube.com/watch?v=AAAAAAAAAAA');
  assert.ok(Buffer.isBuffer(second));
  assert.equal(calls.length, n, 'the second ask never touched the network');
});

test('a video with no poster caches the MISS, so it is asked once and not forever', async () => {
  stub(notFound);
  assert.equal(await getSourcePoster('https://youtu.be/BBBBBBBBBBB'), null);
  const n = calls.length;
  assert.ok(n > 0);
  _resetPosters();
  assert.equal(await getSourcePoster('https://youtu.be/BBBBBBBBBBB'), null);
  assert.equal(calls.length, n, 'the miss is cached as hard as a hit');
  const files = await readdir(path.join(dataDir, 'posters'));
  assert.ok(files.some((f) => f.endsWith('.miss')));
});

test("YouTube's grey placeholder is a miss wearing a 200", async () => {
  const tiny = Buffer.alloc(900, 1);
  stub((url) => (url.includes('maxres')
    ? { ok: true, arrayBuffer: async () => tiny.buffer.slice(0, tiny.length) }
    : ok()));
  const buf = await getSourcePoster('https://youtu.be/CCCCCCCCCCC');
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 3000, 'it fell through to the size every video has');
});

// ---- 17 Sep 2026: three of his Library sources are Instagram reels, and all
// three answered 404 on every shelf render. videoIdOf is YouTube-only and has
// to stay that way (the ingest pipeline scans vault files for it), so this
// module got its own broader identity. These pin the two things that matter:
// the same reel is never fetched twice under two names, and a URL that merely
// LOOKS like one never reaches the shell.

test('a reel is one poster however it was shared', async () => {
  const { posterIdentity, posterKey } = await import('../lib/sourcePosters.js');
  // his actual three, as they arrive: a private share token one day, an
  // igsi tail the next, a bare link from a browser after that
  const same = [
    'https://www.instagram.com/reel/Dc3fEDJRM5n/?stkn=N3VtNWR1dnZlNGRn',
    'https://www.instagram.com/reel/Dc3fEDJRM5n/?igsi=MWtlcHU1b3NieWhpdQ==',
    'https://instagram.com/reel/Dc3fEDJRM5n/',
    'https://www.instagram.com/reel/Dc3fEDJRM5n',
  ];
  const keys = new Set(same.map(posterKey));
  assert.equal(keys.size, 1, `one reel, ${keys.size} cache keys — it will be fetched that many times`);
  assert.deepEqual(posterIdentity(same[0]), { kind: 'ig', id: 'Dc3fEDJRM5n' });
});

test('YouTube keeps its own identity and never collides with a reel', async () => {
  const { posterIdentity, posterKey } = await import('../lib/sourcePosters.js');
  assert.deepEqual(posterIdentity('https://youtu.be/dQw4w9WgXcQ'), { kind: 'yt', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(posterIdentity('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), { kind: 'yt', id: 'dQw4w9WgXcQ' });
  // a shortcode and a video id could theoretically be the same string; the
  // key is namespaced by kind so they can never share a cache entry
  assert.notEqual(posterKey('https://youtu.be/Dc3fEDJRM5n'), posterKey('https://www.instagram.com/reel/Dc3fEDJRM5n/'));
});

test('THE ALLOWLIST IS THE BOUNDARY — a lookalike host never reaches the shell', async () => {
  const { posterIdentity } = await import('../lib/sourcePosters.js');
  // getSourcePoster shells out to yt-dlp, and it is reachable from an HTTP
  // query parameter. Anything that resolves to null stops before the spawn.
  for (const u of [
    'https://evil.example.com/reel/abcdef/',
    'https://instagram.com.evil.test/reel/abcdef/',
    'https://notinstagram.com/reel/abcdef/',
    'file:///etc/passwd',
    'http://169.254.169.254/latest/meta-data/',
    '',
    null,
  ]) {
    assert.equal(posterIdentity(u), null, `${u} would have been handed to yt-dlp`);
  }
  // and the real host still resolves, so the guard is not simply "no"
  assert.ok(posterIdentity('https://www.instagram.com/reel/Dc3fEDJRM5n/'));
});

test('a source with no poster we can name is still a clean null', async () => {
  const { posterIdentity, posterKey, getSourcePoster } = await import('../lib/sourcePosters.js');
  assert.equal(posterIdentity('https://example.com/some-article'), null);
  assert.equal(posterKey('https://example.com/some-article'), null);
  // never throws, never shells — the client keeps its generated cover
  assert.equal(await getSourcePoster('https://example.com/some-article'), null);
});
