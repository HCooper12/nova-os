// Portion, estimate-by-words/voice and log-an-estimate over the real door.
// Temp data dir BEFORE any server import; the describe job and the
// transcriber are injected, so no model or network is called.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-wristfood-'));
process.env.NOVA_DATA_DIR = dataDir;
const vault = await mkdtemp(path.join(tmpdir(), 'nova-wristfood-vault-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { restoreEntryOn, getToday } = await import('../lib/foodLog.js');
const doorLib = await import('../lib/wristDoor.js');
const est = await import('../lib/wristEstimate.js');
const { default: wristRouter } = await import('../routes/wrist.js');
const { wristFoodRouter } = await import('../routes/wristFood.js');

const pad = (n) => String(n).padStart(2, '0');
const isoAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const M = { p: 30, c: 4, f: 2, kcal: 160 };

const jobs = new Map();
let started = [];
let nextResult = null;
const fakeDescribe = {
  start: (t) => { started.push(t); const id = `j${started.length}`; jobs.set(id, nextResult(t)); return id; },
  getJob: (id) => jobs.get(id) || null,
  pollMs: 1,
  sleep: () => new Promise((r) => setTimeout(r, 1)),
};
const eggs = () => ({
  status: 'ready',
  result: {
    name: 'Two eggs on toast and a long black',
    macros: { p: 20, c: 25, f: 18, kcal: 340 },
    components: [
      { name: 'egg, whole, cooked', grams: 100, macros: { p: 12, c: 1, f: 10, kcal: 150 } },
      { name: 'bread, toast', grams: 60, macros: { p: 6, c: 24, f: 3, kcal: 130 } },
      { name: 'long black', grams: 200, macros: { p: 2, c: 0, f: 5, kcal: 60 } },
    ],
  },
});

let door; let base; let token; let transcribed;
test.before(async () => {
  doorLib._resetWristDoorForTests();
  const n = new Date();
  const hhmm = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  for (const ago of [1, 2, 3]) await restoreEntryOn(isoAgo(ago), { id: `r000000${ago}`, time: hhmm, name: 'Protein shake', macros: M });
  const app = doorLib.createWristDoorApp({
    routers: [wristRouter(vault), wristFoodRouter(vault, {
      transcribe: async (audio) => { transcribed = audio; return { text: 'two eggs on toast and a long black' }; },
      estimateDeps: fakeDescribe,
    })],
  });
  door = app.listen(0, '127.0.0.1');
  await new Promise((r) => door.once('listening', r));
  base = `http://127.0.0.1:${door.address().port}`;
  const p = doorLib.startPairing({ name: 'Series 7' });
  doorLib.approvePairing(p.code);
  token = (await doorLib.claimPairing({ pairingId: p.pairingId, secret: p.secret })).token;
});
test.after(async () => {
  door?.close();
  await doorLib._flushForTests?.();
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});
test.beforeEach(() => { est._resetEstimatesForTests(); jobs.clear(); started = []; nextResult = eggs; });

const post = (p, body, type = 'application/json') => fetch(`${base}${p}`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': type }, body: type === 'application/json' ? JSON.stringify(body ?? {}) : body,
});
const today = async () => (await (await fetch(`${base}/wrist/today`, { headers: { Authorization: `Bearer ${token}` } })).json());

test('times: default is byte-identical to one tap, 1.5 scales, bad values are 400', async () => {
  const key = (await today()).usuals[0].key;
  const a = await (await post('/wrist/food', { key })).json();
  assert.deepEqual(a.entry.macros, M);
  await post(`/wrist/food/${a.entry.id}/undo`, { date: a.date });
  const b = await (await post('/wrist/food', { key, times: 1 })).json();
  assert.deepEqual(b.entry.macros, M);
  await post(`/wrist/food/${b.entry.id}/undo`, { date: b.date });

  const c = await post('/wrist/food', { key, times: 1.5 });
  assert.equal(c.status, 200);
  const logged = await c.json();
  assert.equal(logged.entry.macros.kcal, 240);
  assert.equal(logged.entry.macros.p, 45);
  await post(`/wrist/food/${logged.entry.id}/undo`, { date: logged.date });

  for (const bad of [0, 0.2, 4.25, 5, 1.3, '2', -1, false]) {
    const r = await post('/wrist/food', { key, times: bad });
    assert.equal(r.status, 400, `times ${String(bad)}`);
    assert.equal((await r.json()).error, 'times must be between 0.25 and 4 in quarter steps');
  }
  for (const ok of [0.25, 4]) {
    const r = await post('/wrist/food', { key, times: ok });
    assert.equal(r.status, 200, `times ${ok}`);
    const j = await r.json();
    await post(`/wrist/food/${j.entry.id}/undo`, { date: j.date });
  }
});

test('estimate by text answers lines and macros and writes nothing', async () => {
  const before = (await getToday()).entries.length;
  const r = await post('/wrist/food/estimate', { text: '  two eggs on toast and a long black ' });
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.heard, 'two eggs on toast and a long black');
  assert.equal(b.name, 'Two eggs on toast and a long black');
  assert.deepEqual(b.lines, [{ name: 'egg, whole, cooked', kcal: 150 }, { name: 'bread, toast', kcal: 130 }, { name: 'long black', kcal: 60 }]);
  assert.deepEqual(b.macros, { p: 20, c: 25, f: 18, kcal: 340 });
  assert.ok(b.estimateId);
  assert.equal((await getToday()).entries.length, before);
});

test('estimate by audio is transcribed then estimated', async () => {
  const r = await post('/wrist/food/estimate', Buffer.alloc(3000, 1), 'audio/mp4');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).heard, 'two eggs on toast and a long black');
  assert.equal(transcribed.buf.length, 3000);
  assert.deepEqual(started, ['two eggs on toast and a long black']);
});

test('nothing heard, describe error, no macros, bad body: honest refusals', async () => {
  let r = await post('/wrist/food/estimate', Buffer.alloc(10, 1), 'audio/mp4');
  // the stub transcriber always hears something; an empty text is the nothing-heard case
  assert.equal(r.status, 200);
  r = await post('/wrist/food/estimate', { text: '   ' });
  assert.equal(r.status, 422);
  assert.match((await r.json()).error, /did not hear/);

  nextResult = () => ({ status: 'error', error: 'claude exited with code 1; the offline matcher failed too: boom' });
  r = await post('/wrist/food/estimate', { text: 'a mystery plate' });
  assert.equal(r.status, 422);
  assert.match((await r.json()).error, /offline matcher failed too: boom/);

  nextResult = () => ({ status: 'ready', result: { name: 'air', macros: { p: 0, c: 0, f: 0, kcal: 0 } } });
  r = await post('/wrist/food/estimate', { text: 'a glass of air' });
  assert.equal(r.status, 422);
  assert.match((await r.json()).error, /could not work out calories/);

  r = await post('/wrist/food/estimate', { nope: 1 });
  assert.equal(r.status, 400);
});

test('a job that never finishes is 504 in plain words', async () => {
  const slow = await estimateFailing();
  assert.equal(slow.status, 504);
  assert.equal(slow.message, 'The estimate took too long. Try again.');
});
async function estimateFailing() {
  try {
    await est.estimateFromText('slow thing', { start: () => 'x', getJob: () => ({ status: 'running' }), waitMs: 20, pollMs: 1, sleep: () => new Promise((r) => setTimeout(r, 1)) });
  } catch (e) { return e; }
  return null;
}

test('log an estimate: source watch, itemised, one line dropped sums the rest, undo removes it', async () => {
  const b = await (await post('/wrist/food/estimate', { text: 'eggs toast long black' })).json();
  const before = await today();
  const r = await post(`/wrist/food/estimate/${b.estimateId}/log`, { drop: [2] });
  assert.equal(r.status, 200);
  const logged = await r.json();
  assert.deepEqual(logged.entry.macros, { p: 18, c: 25, f: 13, kcal: 280 });
  assert.equal(logged.protein.value, before.protein.value + 18);
  const entry = (await getToday()).entries.find((e) => e.id === logged.entry.id);
  assert.equal(entry.source, 'watch');
  assert.equal(entry.items.length, 2);
  assert.equal(entry.words, 'eggs toast long black');
  // spent: a second log of the same id is refused rather than filed twice
  assert.equal((await post(`/wrist/food/estimate/${b.estimateId}/log`, {})).status, 404);

  const u = await post(`/wrist/food/${logged.entry.id}/undo`, { date: logged.date });
  assert.equal((await u.json()).removed, true);
  assert.equal((await getToday()).entries.find((e) => e.id === logged.entry.id), undefined);
});

test('log with nothing dropped keeps all lines; dropping all or a bad index is 400; unknown id is 404', async () => {
  const b = await (await post('/wrist/food/estimate', { text: 'eggs toast long black' })).json();
  let r = await post(`/wrist/food/estimate/${b.estimateId}/log`, { drop: [0, 1, 2] });
  assert.equal(r.status, 400);
  r = await post(`/wrist/food/estimate/${b.estimateId}/log`, { drop: [7] });
  assert.equal(r.status, 400);
  r = await post(`/wrist/food/estimate/${b.estimateId}/log`, { drop: ['0'] });
  assert.equal(r.status, 400);
  r = await post(`/wrist/food/estimate/${b.estimateId}/log`, {});
  assert.equal(r.status, 200);
  const logged = await r.json();
  assert.equal(logged.entry.macros.kcal, 340);
  await post(`/wrist/food/${logged.entry.id}/undo`, { date: logged.date });

  r = await post('/wrist/food/estimate/nope/log', {});
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error, 'That estimate has expired. Say it again.');
});

test('a single-line estimate logs whole and cannot drop its only line', async () => {
  nextResult = () => ({ status: 'ready', result: { name: 'Banana', macros: { p: 1, c: 27, f: 0, kcal: 105 } } });
  const b = await (await post('/wrist/food/estimate', { text: 'a banana' })).json();
  assert.deepEqual(b.lines, [{ name: 'Banana', kcal: 105 }]);
  assert.equal((await post(`/wrist/food/estimate/${b.estimateId}/log`, { drop: [0] })).status, 400);
  const r = await post(`/wrist/food/estimate/${b.estimateId}/log`, {});
  const logged = await r.json();
  assert.equal(logged.entry.macros.kcal, 105);
  await post(`/wrist/food/${logged.entry.id}/undo`, { date: logged.date });
});

test('an estimate expires after 15 minutes and the held map is bounded', async () => {
  let t = 1_000_000;
  est.setEstimateClock(() => t);
  const b = await (await post('/wrist/food/estimate', { text: 'eggs toast long black' })).json();
  t += est.ESTIMATE_TTL_MS - 1;
  assert.equal((await post(`/wrist/food/estimate/${b.estimateId}/log`, { drop: [0, 1, 2] })).status, 400); // still held
  t += 2;
  assert.equal((await post(`/wrist/food/estimate/${b.estimateId}/log`, {})).status, 404);
  // direct, not over HTTP: the door's own 60-a-minute limiter would stop the loop
  for (let i = 0; i < est.ESTIMATE_MAX + 5; i += 1) await est.estimateFromText(`meal number ${i}`, fakeDescribe);
  assert.equal(est._heldCount(), est.ESTIMATE_MAX);
  est.setEstimateClock(null);
});

test('kept lines that add up to no calories are refused rather than filed as zero', async () => {
  nextResult = () => ({ status: 'ready', result: { name: 'Eggs and coffee', macros: { p: 12, c: 1, f: 10, kcal: 150 }, components: [
    { name: 'eggs', macros: { p: 12, c: 1, f: 10, kcal: 150 } }, { name: 'long black', macros: { p: 0, c: 0, f: 0, kcal: 0 } }] } });
  const b = await (await post('/wrist/food/estimate', { text: 'eggs and a long black' })).json();
  const r = await post(`/wrist/food/estimate/${b.estimateId}/log`, { drop: [0] });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /no calories/);
});
