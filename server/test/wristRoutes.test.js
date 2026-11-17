// The Watch's two calls over HTTP: GET /wrist/today, POST /wrist/food and its
// undo. Temp data dir and temp vault; nothing touches the live server.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-wristr-'));
process.env.NOVA_DATA_DIR = dataDir;
const vault = await mkdtemp(path.join(tmpdir(), 'nova-wristr-vault-'));

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { restoreEntryOn, getToday } = await import('../lib/foodLog.js');
const { default: wristRouter } = await import('../routes/wrist.js');

const pad = (n) => String(n).padStart(2, '0');
const isoAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const M = { p: 31, c: 4, f: 2, kcal: 160 };

let server; let base;
test.before(async () => {
  await rm(path.join(dataDir, 'food-log'), { recursive: true, force: true });
  // "usual now" means around the clock time it is now, on two or more days
  const n = new Date();
  const hhmm = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  for (const ago of [1, 2, 3]) await restoreEntryOn(isoAgo(ago), { id: `r000000${ago}`, time: hhmm, name: 'Protein shake', macros: M });
  const app = express();
  app.use(express.json());
  app.use('/api', wristRouter(vault));
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => {
  server?.close();
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const post = (url, body) => fetch(`${base}${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });

test('GET /wrist/today has the widget fields and a usuals array', async () => {
  const r = await fetch(`${base}/wrist/today`);
  assert.equal(r.status, 200);
  const b = await r.json();
  for (const k of ['at', 'date', 'protein', 'kcal', 'steps', 'stepsAt', 'hrv', 'session', 'usuals']) assert.ok(k in b, k);
  assert.ok(Array.isArray(b.usuals));
  assert.equal(b.usuals[0].name, 'Protein shake');
});

test('POST /wrist/food adds one watch entry; undo removes exactly it and totals return', async () => {
  const before = await (await fetch(`${base}/wrist/today`)).json();
  const key = before.usuals[0].key;
  const entriesBefore = (await getToday()).entries.length;

  const r = await post('/wrist/food', { key });
  assert.equal(r.status, 200);
  const logged = await r.json();
  const day = await getToday();
  assert.equal(day.entries.length, entriesBefore + 1);
  const entry = day.entries.at(-1);
  assert.equal(entry.id, logged.entry.id);
  assert.equal(entry.source, 'watch');
  assert.equal(logged.protein.value, before.protein.value + M.p);
  assert.equal(logged.kcal.value, before.kcal.value + M.kcal);

  const u = await post(`/wrist/food/${logged.entry.id}/undo`, { date: logged.date });
  assert.equal(u.status, 200);
  const undone = await u.json();
  assert.equal(undone.removed, true);
  assert.equal((await getToday()).entries.length, entriesBefore);
  assert.equal(undone.protein.value, before.protein.value);
  assert.equal(undone.kcal.value, before.kcal.value);

  assert.equal((await post(`/wrist/food/${logged.entry.id}/undo`, {})).status, 404);
});

test('unknown key is 404, missing or non-string key is 400', async () => {
  const r = await post('/wrist/food', { key: 'nothing|serving' });
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error, 'That food is no longer in your recent log.');
  assert.equal((await post('/wrist/food', {})).status, 400);
  assert.equal((await post('/wrist/food', { key: 5 })).status, 400);
});
