import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

// Its own data dir BEFORE the import (nova-test-data-isolation): this suite
// must never write into his live server/data.
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'nova-idem-'));
const { idempotency, prune, _resetForTests, TTL_MS } = await import('../lib/idempotency.js');

// The Outbox replays a write that may already have landed (offline mode,
// 2 Nov 2026): a repeat of a key is answered with the first answer, and the
// handler runs once.
function server() {
  let runs = 0;
  const app = express();
  app.use(express.json());
  app.use('/api', idempotency());
  app.post('/api/food-log', (req, res) => { runs++; res.json({ n: runs, name: req.body.name }); });
  app.post('/api/slow', async (req, res) => { runs++; await new Promise((r) => setTimeout(r, 150)); res.json({ n: runs }); });
  app.post('/api/no', (req, res) => { runs++; res.status(400).json({ error: 'no' }); });
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${s.address().port}`, close: () => s.close(), runs: () => runs }));
  });
}
const post = (url, route, body, key) => fetch(url + route, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, replay: r.headers.get('idempotent-replay'), body: await r.json() }));

test('a repeated key gets the first answer and the handler runs once', async () => {
  _resetForTests();
  const s = await server();
  const a = await post(s.url, '/api/food-log', { name: 'apple' }, 'nova-food-aaaa1111');
  const b = await post(s.url, '/api/food-log', { name: 'apple' }, 'nova-food-aaaa1111');
  assert.deepEqual(a.body, { n: 1, name: 'apple' });
  assert.deepEqual(b.body, a.body);
  assert.equal(b.replay, 'true');
  assert.equal(s.runs(), 1);
  s.close();
});

test('no key, or a different key, runs every time', async () => {
  _resetForTests();
  const s = await server();
  await post(s.url, '/api/food-log', { name: 'x' });
  await post(s.url, '/api/food-log', { name: 'x' });
  await post(s.url, '/api/food-log', { name: 'x' }, 'nova-food-bbbb2222');
  await post(s.url, '/api/food-log', { name: 'x' }, 'nova-food-cccc3333');
  assert.equal(s.runs(), 4);
  s.close();
});

test('a rejection is not remembered, so a retry runs again', async () => {
  _resetForTests();
  const s = await server();
  await post(s.url, '/api/no', {}, 'nova-x-dddd4444');
  const again = await post(s.url, '/api/no', {}, 'nova-x-dddd4444');
  assert.equal(again.status, 400);
  assert.equal(s.runs(), 2);
  s.close();
});

test('a repeat that arrives while the first runs waits for it', async () => {
  _resetForTests();
  const s = await server();
  const [a, b] = await Promise.all([
    post(s.url, '/api/slow', {}, 'nova-x-eeee5555'),
    new Promise((r) => setTimeout(r, 20)).then(() => post(s.url, '/api/slow', {}, 'nova-x-eeee5555')),
  ]);
  assert.deepEqual(a.body, b.body);
  assert.equal(s.runs(), 1);
  s.close();
});

test('a malformed key is ignored, never a refusal of his write', async () => {
  _resetForTests();
  const s = await server();
  const r = await post(s.url, '/api/food-log', { name: 'y' }, 'bad key!');
  assert.equal(r.status, 200);
  s.close();
});

test('the key is scoped to its route, kept on disk, and survives a restart', async () => {
  _resetForTests();
  const s = await server();
  await post(s.url, '/api/food-log', { name: 'z' }, 'nova-x-ffff6666');
  await new Promise((r) => setTimeout(r, 50));
  const disk = JSON.parse(await readFile(path.join(process.env.NOVA_DATA_DIR, 'idempotency.json'), 'utf8'));
  assert.ok(disk.entries.some((e) => e.scope === 'POST /api/food-log nova-x-ffff6666'));
  _resetForTests(); // a fresh process reads the file
  const again = await post(s.url, '/api/food-log', { name: 'z' }, 'nova-x-ffff6666');
  assert.equal(again.replay, 'true');
  assert.equal(s.runs(), 1);
  s.close();
});

test('old keys expire and the store is capped', () => {
  const now = Date.now();
  const kept = prune([{ scope: 'a', at: now - TTL_MS - 1 }, { scope: 'b', at: now }], now);
  assert.deepEqual(kept.map((e) => e.scope), ['b']);
  const many = Array.from({ length: 2100 }, (_, i) => ({ scope: String(i), at: now - i }));
  assert.equal(prune(many, now).length, 2000);
});
