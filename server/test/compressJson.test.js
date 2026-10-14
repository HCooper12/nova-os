import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { pickEncoding, sendJson } from '../lib/compressJson.js';

function fakeRes() {
  const headers = {};
  return { headers, body: null, setHeader(k, v) { headers[k.toLowerCase()] = v; }, end(b) { this.body = b; } };
}
const big = { rows: Array.from({ length: 2000 }, (_, i) => ({ i, text: 'the same words again and again' })) };

test('picks brotli, then gzip, else nothing', () => {
  assert.equal(pickEncoding('gzip, deflate, br'), 'br');
  assert.equal(pickEncoding('gzip, deflate'), 'gzip');
  assert.equal(pickEncoding(''), null);
});

test('a big answer goes out compressed and decodes to the same JSON', async () => {
  const res = fakeRes();
  await sendJson({ headers: { 'accept-encoding': 'gzip, br' } }, res, big);
  assert.equal(res.headers['content-encoding'], 'br');
  assert.ok(res.body.length < JSON.stringify(big).length / 5);
  assert.deepEqual(JSON.parse(zlib.brotliDecompressSync(res.body)), big);
});

test('a small answer, or a client that cannot decode, gets plain JSON', async () => {
  const a = fakeRes();
  await sendJson({ headers: { 'accept-encoding': 'br' } }, a, { ok: true });
  assert.equal(a.headers['content-encoding'], undefined);
  const b = fakeRes();
  await sendJson({ headers: {} }, b, big);
  assert.equal(b.headers['content-encoding'], undefined);
  assert.deepEqual(JSON.parse(b.body), big);
});
