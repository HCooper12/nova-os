// The long-text routing decision. His Atomic Habits upload (495,673 chars)
// took the $3 single-pass cap meant for a short transcript and died at
// $3.13 having written nothing, because the "too long for one pass" branch
// lived inside the VIDEO fetch and a book could never reach it.
import test from 'node:test';
import assert from 'node:assert/strict';

const { needsDigest, digestCacheKey } = await import('../lib/ingest.js');

test('a book-sized text is routed to the digest path; a short one is not', () => {
  const ATOMIC_HABITS_CHARS = 495_673; // measured from his real PDF
  assert.equal(needsDigest('x'.repeat(ATOMIC_HABITS_CHARS)), true, 'his book must digest — this is the regression');
  assert.equal(needsDigest('x'.repeat(150_001)), true, 'just over the threshold');
  assert.equal(needsDigest('x'.repeat(150_000)), false, 'exactly at it still fits one pass');
  assert.equal(needsDigest('a short pasted note'), false);
  assert.equal(needsDigest(''), false);
  assert.equal(needsDigest(null), false);
});

test('a book digest caches under a stable key, so a retry never re-pays', () => {
  const book = { title: 'Atomic Habits', author: 'James Clear' };
  const a = digestCacheKey(book, 'first upload text');
  const b = digestCacheKey({ ...book }, 'a DIFFERENT extraction of the same book');
  assert.equal(a, b, 'same book, same key — the expensive digest is reused');
  assert.equal(a, 'book-atomic-habits-james-clear');
  assert.ok(!/[^a-z0-9-]/.test(a), 'safe as a filename');
});

test('a different book gets a different key, and pasted text keys by content', () => {
  const k1 = digestCacheKey({ title: 'Atomic Habits', author: 'James Clear' }, 't');
  const k2 = digestCacheKey({ title: 'Deep Work', author: 'Cal Newport' }, 't');
  assert.notEqual(k1, k2);
  const t1 = digestCacheKey(null, 'some very long pasted transcript');
  const t2 = digestCacheKey(null, 'some very long pasted transcript');
  const t3 = digestCacheKey(null, 'a different transcript entirely');
  assert.equal(t1, t2, 'same text, same key');
  assert.notEqual(t1, t3);
  assert.ok(t1.startsWith('text-'));
});
