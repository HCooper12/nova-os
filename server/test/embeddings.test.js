// LOCAL MEANING — everything about the embedder that can be checked without
// one running. The network half is verified against the real vault instead;
// what is pinned here is the arithmetic and the bookkeeping, because those are
// what silently return the WRONG page rather than no page.
//
// The failure that matters most: a page scoring by the average of its chunks
// instead of its best one. A 40-minute transcript has one paragraph that
// answers the question and nineteen that do not, and averaging buries it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  chunksFor, hashPage, packVec, unpackVec, cosine, stalePages, scoreAgainstIndex,
  loadIndex, saveIndex, refreshIndex, pickSemantic,
  CHUNK_TARGET, MAX_CHUNKS_PER_PAGE, INDEX_VERSION, EMBED_MODEL, SEMANTIC_ONLY_FLOOR,
} from '../lib/embeddings.js';

const page = (id, title, paragraphs) => ({ id, title, paragraphs });

// ---- chunking ----

test('a paragraph is never split across chunks', () => {
  const long = 'x'.repeat(CHUNK_TARGET - 50);
  const out = chunksFor(page('p', 'T', [long, long, long]));
  assert.equal(out.length, 3);
  for (const c of out) assert.ok(c.includes(long), 'each chunk holds a whole paragraph');
});

test('short paragraphs are packed together rather than one chunk each', () => {
  const out = chunksFor(page('p', 'T', ['a', 'b', 'c', 'd']));
  assert.equal(out.length, 1, 'four short paragraphs fit one chunk');
});

test('the title rides every chunk — it is the strongest signal a page has', () => {
  const long = 'y'.repeat(CHUNK_TARGET);
  const out = chunksFor(page('p', 'Bench Press', [long, long]));
  assert.equal(out.length, 2);
  for (const c of out) assert.ok(c.startsWith('Bench Press\n'));
});

test('one huge transcript cannot own the index', () => {
  const paras = Array.from({ length: 200 }, () => 'z'.repeat(CHUNK_TARGET));
  const out = chunksFor(page('raw', 'Original - 0974b9aa', paras));
  assert.equal(out.length, MAX_CHUNKS_PER_PAGE);
});

test('a page with no body still indexes by its title, and an empty page yields nothing', () => {
  assert.deepEqual(chunksFor(page('p', 'Just A Title', [])), ['Just A Title']);
  assert.deepEqual(chunksFor(page('p', '', [])), []);
  assert.deepEqual(chunksFor(null), []);
});

// ---- content identity ----

test('the hash follows the content, not the object', () => {
  const a = page('p', 'T', ['one', 'two']);
  const b = page('DIFFERENT-ID', 'T', ['one', 'two']);
  assert.equal(hashPage(a), hashPage(b), 'same content, same hash');
  assert.notEqual(hashPage(a), hashPage(page('p', 'T', ['one', 'three'])));
  assert.notEqual(hashPage(a), hashPage(page('p', 'CHANGED', ['one', 'two'])));
});

test('stalePages names exactly what must be re-embedded', () => {
  const unchanged = page('a', 'A', ['body']);
  const edited = page('b', 'B', ['edited body']);
  const added = page('c', 'C', ['new']);
  const index = {
    pages: {
      a: { hash: hashPage(unchanged), chunks: [] },
      b: { hash: hashPage(page('b', 'B', ['old body'])), chunks: [] },
    },
  };
  const stale = stalePages(index, [unchanged, edited, added]).map((p) => p.id);
  assert.deepEqual(stale, ['b', 'c']);
});

// ---- vectors ----

test('packing a vector round-trips exactly', () => {
  const v = [0.5, -0.25, 1, 0, -1];
  assert.deepEqual(Array.from(unpackVec(packVec(v))), v);
});

test('cosine behaves, including on the inputs that would throw', () => {
  const a = Float32Array.from([1, 0, 0]);
  assert.ok(Math.abs(cosine(a, Float32Array.from([2, 0, 0])) - 1) < 1e-6, 'same direction, any scale');
  assert.equal(cosine(a, Float32Array.from([0, 1, 0])), 0, 'orthogonal');
  assert.ok(cosine(a, Float32Array.from([-1, 0, 0])) < -0.99, 'opposed');
  assert.equal(cosine(a, Float32Array.from([0, 0])), 0, 'length mismatch is 0, not a throw');
  assert.equal(cosine(a, Float32Array.from([0, 0, 0])), 0, 'a zero vector is 0, not NaN');
  assert.equal(cosine(null, a), 0);
});

// ---- scoring ----

test('a page scores by its BEST chunk, never its average', () => {
  const q = Float32Array.from([1, 0, 0]);
  const index = {
    pages: {
      // one chunk is a bullseye, nineteen are unrelated — the shape of a
      // transcript that genuinely answers the question.
      transcript: {
        hash: 'h',
        chunks: [packVec([1, 0, 0]), ...Array.from({ length: 19 }, () => packVec([0, 1, 0]))],
      },
    },
  };
  const scores = scoreAgainstIndex(index, q, { min: 0 });
  assert.ok(Math.abs(scores.get('transcript') - 1) < 1e-6, 'max-pooled, so the bullseye survives');
});

test('the floor trims the tail, because everything is a little similar to everything', () => {
  const q = Float32Array.from([1, 0, 0]);
  const index = {
    pages: {
      near: { hash: 'h', chunks: [packVec([1, 0.1, 0])] },
      far: { hash: 'h', chunks: [packVec([0, 1, 0])] },
    },
  };
  const scores = scoreAgainstIndex(index, q, { min: 0.5 });
  assert.ok(scores.has('near'));
  assert.equal(scores.has('far'), false);
});

// ---- which matches are real ----

test('the adaptive floor keeps the head and drops the flat middle', () => {
  // The measured shape: one clear winner, a long undifferentiated tail.
  const scores = new Map([
    ['best', 0.70], ['good', 0.66], ['mid', 0.55],
    ['tail1', 0.52], ['tail2', 0.51], ['tail3', 0.50], ['tail4', 0.49],
  ]);
  const picked = pickSemantic(scores).map(([id]) => id);
  // median 0.51, max 0.70 → floor 0.605
  assert.deepEqual(picked, ['best', 'good']);
});

test('a query nothing stands out for returns a short list, not the vault', () => {
  const flat = new Map(Array.from({ length: 40 }, (_, i) => [`p${i}`, 0.5 + i * 0.0005]));
  assert.ok(pickSemantic(flat).length <= 8, 'top-k caps it regardless');
});

test('top-k is a ceiling even when many pages clear the floor', () => {
  const scores = new Map(Array.from({ length: 30 }, (_, i) => [`p${i}`, i < 15 ? 0.9 : 0.1]));
  assert.equal(pickSemantic(scores).length, 8);
});

test('a handful of candidates is returned as-is — a median means nothing there', () => {
  const scores = new Map([['a', 0.9], ['b', 0.2]]);
  assert.deepEqual(pickSemantic(scores).map(([id]) => id), ['a', 'b']);
  assert.deepEqual(pickSemantic(new Map()), []);
});

test('the semantic-only floor sits in the measured gap, not near it', () => {
  // Measured on his real vault, 9 Sep 2026. TRUE positives — paraphrases of
  // pages that certainly exist, sharing no words with them — landed at
  // 0.687 / 0.705 / 0.722 / 0.773. Everything the vault cannot answer, plus
  // outright nonsense, topped out at 0.67.
  assert.ok(SEMANTIC_ONLY_FLOOR > 0.67, 'nothing the vault cannot answer may enter');
  assert.ok(SEMANTIC_ONLY_FLOOR <= 0.687, 'every real answer measured must still clear it');
});

// ---- the guard that prevents data loss ----

test('an index belongs to a vault, and will not be handed to another one', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-emb-'));
  await saveIndex(dir, { version: INDEX_VERSION, model: EMBED_MODEL, vault: '/vault/A', pages: { a: { hash: 'h', chunks: [] } } });

  assert.ok(await loadIndex(dir, '/vault/A'), 'its own vault loads it');
  assert.equal(await loadIndex(dir, '/vault/B'), null, 'another vault gets nothing, not the wrong ids');
  assert.ok(await loadIndex(dir), 'an unnamed read still works, for tools that only inspect');
  await rm(dir, { recursive: true, force: true });
});

test('a refresh with no vault named is refused rather than writing an unowned index', async () => {
  // Without this, a run against a test fixture would drop every real page
  // from the index as "no longer present".
  const r = await refreshIndex('/tmp/nova-should-not-exist', null, [page('a', 'A', ['x'])]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /vault/i);
  assert.equal(r.embedded, 0);
});

test('no index and no query are answered with nothing, not a throw', () => {
  assert.equal(scoreAgainstIndex(null, Float32Array.from([1])).size, 0);
  assert.equal(scoreAgainstIndex({ pages: {} }, null).size, 0);
  assert.equal(scoreAgainstIndex({ pages: { a: { chunks: [] } } }, Float32Array.from([1]), { min: 0 }).size, 0);
});
