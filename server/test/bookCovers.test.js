// 18 Oct 2026 ledger: "The Next Conversation" (Jefferson Fisher) 404'd 381
// times in 14 days — Open Library hit on every single shelf render for a
// book it never has a jacket for. This pins the fix: a miss is remembered
// in one small bounded JSON file for 7 days and answered without a second
// network call, and the cache never grows past MAX_MISSES entries.
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-covers-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { getBookCoverResult, getBookCover, coverKey, MAX_MISSES, _resetCoversForTest } = await import('../lib/bookCovers.js');

const JPEG = Buffer.alloc(9000, 7);
let calls = [];
const realFetch = globalThis.fetch;
function stub(handler) {
  globalThis.fetch = async (url) => { calls.push(String(url)); return handler(String(url)); };
}
const foundThenCover = () => (calls.length % 2 === 1
  ? { ok: true, json: async () => ({ docs: [{ cover_i: 42 }] }) }
  : { ok: true, arrayBuffer: async () => JPEG.buffer.slice(0, JPEG.length) });
const noJacketInCatalogue = () => ({ ok: true, json: async () => ({ docs: [] }) });

test.beforeEach(() => { calls = []; _resetCoversForTest(); });
test.after(async () => {
  globalThis.fetch = realFetch;
  await rm(dataDir, { recursive: true, force: true });
});

test('a jacket is fetched once, then served from disk forever', async () => {
  stub(foundThenCover);
  const { buf: first, cachedMiss: m1 } = await getBookCoverResult('Real Book', 'Real Author');
  assert.ok(Buffer.isBuffer(first));
  assert.equal(m1, false);
  const n = calls.length;
  _resetCoversForTest();
  const { buf: second } = await getBookCoverResult('Real Book', 'Real Author');
  assert.ok(Buffer.isBuffer(second));
  assert.equal(calls.length, n, 'a cold process still never re-asks the network for a known jacket');
});

test('a fresh miss is NOT answered from cache, but the next ask for the same book is', async () => {
  stub(noJacketInCatalogue);
  const r1 = await getBookCoverResult('The Next Conversation', 'Jefferson Fisher');
  assert.equal(r1.buf, null);
  assert.equal(r1.cachedMiss, false, 'the first time, the provider really was asked');
  const hitsAfterFirst = calls.length;
  assert.ok(hitsAfterFirst > 0);

  _resetCoversForTest(); // simulate a cold process — the memo is gone, the disk cache is not
  const r2 = await getBookCoverResult('The Next Conversation', 'Jefferson Fisher');
  assert.equal(r2.buf, null);
  assert.equal(r2.cachedMiss, true, 'answered from the negative cache');
  assert.equal(calls.length, hitsAfterFirst, 'the provider was never asked a second time');
});

test('getBookCover (back-compat) still returns a plain Buffer or null', async () => {
  stub(noJacketInCatalogue);
  assert.equal(await getBookCover('Nothing Found', 'Nobody'), null);
});

test('the negative cache file is bounded and keeps the newest misses', async () => {
  stub(noJacketInCatalogue);
  for (let i = 0; i < MAX_MISSES + 20; i++) {
    _resetCoversForTest();
    // eslint-disable-next-line no-await-in-loop
    await getBookCoverResult(`Book Number ${i}`, 'Author');
  }
  const raw = JSON.parse(await readFile(path.join(dataDir, 'covers', 'misses.json'), 'utf8'));
  assert.ok(Object.keys(raw).length <= MAX_MISSES, 'the file never grows past the cap');
  // the earliest books fell out; a recent one is still remembered
  const recentKey = coverKey(`Book Number ${MAX_MISSES + 19}`, 'Author');
  assert.ok(recentKey in raw, 'the most recent miss survived the eviction');
});
