// The wrist's usuals: the phone's own folding, run on the Mac. Temp data dir
// BEFORE imports; every test clears the food-log fixture folder first (a past
// bug: a "today" entry leaked between tests the next day).
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-wrist-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { restoreEntryOn, loadRecentDays } = await import('../lib/foodLog.js');
const { usualsFor, buildWristToday, logUsual, undoUsual } = await import('../lib/wristToday.js');

const pad = (n) => String(n).padStart(2, '0');
const isoAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
let seq = 0;
// written through the food log lib (restoreEntryOn keeps the entry's own time,
// which retro addEntry would drop), so the on-disk format is the real one
const put = (ago, time, name, macros) => restoreEntryOn(isoAgo(ago), { id: `w${String(++seq).padStart(6, '0')}`, time, name, macros });
const M = { p: 20, c: 30, f: 5, kcal: 250 };

async function reset() {
  await rm(path.join(dataDir, 'food-log'), { recursive: true, force: true });
}
test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

// 08:10 today, local
const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
const daysOf = async () => (await loadRecentDays(90)).map((d) => ({ date: d.date, entries: d.entries }));

test('the breakfast food is a usual at breakfast time, the dinner food is not', async () => {
  await reset();
  for (const ago of [1, 2, 3, 4]) {
    await put(ago, '08:00', 'Greek yoghurt', M);
    await put(ago, '19:00', 'Pasta bowl', M);
  }
  const u = usualsFor({ days: await daysOf(), now: at(8, 10) });
  assert.deepEqual(u.map((x) => x.name), ['Greek yoghurt']);
  assert.equal(u[0].count, 4);
  assert.equal(u[0].lastDate, isoAgo(1));
  assert.deepEqual(u[0].macros, M);
  const dinner = usualsFor({ days: await daysOf(), now: at(19, 20) });
  assert.deepEqual(dinner.map((x) => x.name), ['Pasta bowl']);
});

test('keys are stable across calls, and the result is deterministic for a fixed now', async () => {
  await reset();
  for (const ago of [1, 2, 3]) await put(ago, '08:05', 'Oats', M);
  const days = await daysOf();
  const a = usualsFor({ days, now: at(8, 30) });
  const b = usualsFor({ days: await daysOf(), now: at(8, 30) });
  assert.deepEqual(a, b);
  assert.ok(a[0].key && typeof a[0].key === 'string');
});

test('at most six usuals', async () => {
  await reset();
  for (let i = 0; i < 9; i += 1) for (const ago of [1, 2, 3]) await put(ago, '08:00', `Breakfast food ${i}`, M);
  const u = usualsFor({ days: await daysOf(), now: at(8, 0) });
  assert.equal(u.length, 6);
  assert.equal(new Set(u.map((x) => x.key)).size, 6);
});

test('one day is a morning, not a habit: needs two different days', async () => {
  await reset();
  await put(1, '08:00', 'One-off toast', M);
  await put(1, '08:10', 'One-off toast', M);
  assert.deepEqual(usualsFor({ days: await daysOf(), now: at(8, 0) }), []);
});

test('a food already logged today stays on the list, as on the phone', async () => {
  await reset();
  for (const ago of [0, 1, 2]) await put(ago, '08:00', 'Eggs', M);
  const u = usualsFor({ days: await daysOf(), now: at(8, 30) });
  assert.deepEqual(u.map((x) => x.name), ['Eggs']);
  assert.equal(u[0].lastDate, isoAgo(0));
});

test('logUsual and undoUsual round-trip against the lib; an unknown key throws unknown_usual', async () => {
  await reset();
  const now = new Date();
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  for (const ago of [1, 2, 3]) await put(ago, hhmm, 'Protein shake', M);
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-wrist-vault-'));
  try {
    const t = await buildWristToday(vault, { now });
    assert.equal(t.usuals[0].name, 'Protein shake');
    assert.equal(t.usualsError, undefined);
    const logged = await logUsual(vault, t.usuals[0].key, { now });
    assert.equal(logged.entry.name, 'Protein shake');
    assert.equal(logged.protein.value, M.p);
    const gone = await undoUsual(vault, logged.entry.id, { date: logged.date });
    assert.equal(gone.removed, true);
    assert.equal(gone.protein.value, 0);
    await assert.rejects(undoUsual(vault, logged.entry.id), { code: 'not_found' });
    await assert.rejects(logUsual(vault, 'nope|serving', { now }), { code: 'unknown_usual' });
  } finally { await rm(vault, { recursive: true, force: true }); }
});
