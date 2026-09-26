// THE WHOLE-MEAL UNDO (the Fuel audit, 27 Sep 2026, finding 7). The × on one
// line of a plate had a 30-second Undo; the × on the whole meal removed it
// with no way back. "Everything writeable is undoable": the entry now goes
// back verbatim (id, clock time, lines, provenance) and to the place it held
// in the day, through POST /food-log/:id/restore beside the line restore.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// his live server/data must never see these rows: set before any import
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'nova-entry-undo-'));
const vaultDir = await mkdtemp(path.join(os.tmpdir(), 'nova-entry-undo-vault-'));
process.env.NOVA_DATA_DIR = dataDir;

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const express = (await import('express')).default;
const { addEntry, getDay, removeEntryOn, restoreEntryOn, sanitizeRestoredEntry, macrosOfItems, resolveLogDate } = await import('../lib/foodLog.js');
const { foodLogRouter } = await import('../routes/foodLog.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vaultDir, { recursive: true, force: true });
});

const PLATE = [
  { name: '3 eggs', grams: 150, macros: { p: 19, c: 1, f: 15, kcal: 210 }, source: 'USDA — egg, whole, raw', sourced: true },
  { name: 'sourdough', grams: 54, macros: { p: 4.6, c: 26, f: 0.8, kcal: 140 } },
];

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return resolveLogDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); };

test('a removed entry goes back to the place it held, and the day reads exactly as before', async () => {
  const date = daysAgo(2);
  await addEntry({ name: 'Oats', macros: { p: 10, c: 50, f: 5, kcal: 290 }, source: 'manual', date });
  await addEntry({ name: 'Eggs on sourdough', macros: { p: 0, c: 0, f: 0, kcal: 0 }, source: 'described', date, items: PLATE });
  const before = await addEntry({ name: 'Flat white', macros: { p: 8, c: 12, f: 7, kcal: 140 }, date });
  const index = 1;
  const middle = before.entries[index];
  await removeEntryOn(date, middle.id);
  assert.equal((await getDay(date)).entries.length, 2);
  const back = await restoreEntryOn(date, middle, index);
  assert.deepEqual(back.entries, before.entries, 'same entries, same order, same fields');
  // a second tap on Undo is harmless: it is already back
  const again = await restoreEntryOn(date, middle, index);
  assert.equal(again.entries.length, 3);
});

test('restoreEntryOn without an index still appends, the shape the Nova verb undo relies on', async () => {
  const date = daysAgo(3);
  const day = await addEntry({ name: 'Apple', macros: { p: 0, c: 25, f: 0, kcal: 95 }, date });
  const apple = day.entries[0];
  await addEntry({ name: 'Yoghurt', macros: { p: 15, c: 8, f: 3, kcal: 120 }, date });
  await removeEntryOn(date, apple.id);
  const back = await restoreEntryOn(date, apple);
  assert.deepEqual(back.entries.map((e) => e.name), ['Yoghurt', 'Apple']);
});

test('a client-held entry is rebuilt, not trusted: only real fields, and the plate total is the sum of its lines again', () => {
  const lines = PLATE.map((it, i) => ({ ...it, id: `ln${i}` }));
  const raw = {
    id: 'abc12345', time: '07:42', name: '  Eggs on sourdough  ', source: 'described', edited: true,
    macros: { p: 999, c: 999, f: 999, kcal: 9999 }, // the client's number is ignored when lines come back
    items: lines, pending: true, hacked: '<script>',
  };
  const e = sanitizeRestoredEntry(raw, 'abc12345');
  assert.equal(e.name, 'Eggs on sourdough');
  assert.equal(e.time, '07:42');
  assert.equal(e.source, 'described');
  assert.equal(e.edited, true);
  assert.equal(e.pending, undefined);
  assert.equal(e.hacked, undefined);
  assert.deepEqual(e.items.map((it) => it.id), ['ln0', 'ln1'], 'line ids survive, so a later line undo still addresses them');
  assert.deepEqual(e.macros, macrosOfItems(e.items));
  // a rotation tick keeps what ties it to the plan
  const rot = sanitizeRestoredEntry({ id: 'r1', name: 'Chicken rice', macros: { p: 45, c: 60, f: 12, kcal: 520 }, source: 'rotation', slot: 'lunch', recipeId: 'chicken-rice' }, 'r1');
  assert.equal(rot.slot, 'lunch');
  assert.equal(rot.recipeId, 'chicken-rice');
  assert.equal(rot.time, undefined, 'no clock time is invented for an entry that had none');
});

test('restore refuses what is not the entry it names, never reached the log, or carries bad numbers', () => {
  const ok = { id: 'e1', name: 'Toast', macros: { p: 4, c: 20, f: 2, kcal: 115 } };
  assert.throws(() => sanitizeRestoredEntry(ok, 'e2'), /not the entry/);
  assert.throws(() => sanitizeRestoredEntry({ ...ok, id: 'pending-123' }, 'pending-123'), /never reached/);
  assert.throws(() => sanitizeRestoredEntry({ ...ok, name: '  ' }, 'e1'), /needs a name/);
  assert.throws(() => sanitizeRestoredEntry({ ...ok, macros: { p: -1, c: 0, f: 0, kcal: 0 } }, 'e1'), /non-negative/);
  assert.throws(() => sanitizeRestoredEntry({ ...ok, macros: { p: '4', c: 20, f: 2, kcal: 115 } }, 'e1'), /non-negative/);
  assert.throws(() => sanitizeRestoredEntry(null, 'e1'), /nothing to put back/);
});

function startServer() {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    app.use('/api', foodLogRouter(vaultDir));
    const srv = app.listen(0, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}/api` }));
  });
}
const json = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('over the wire: delete a meal, restore it, and the day is the day it was', async (t) => {
  const { srv, base } = await startServer();
  t.after(() => srv.close());
  const date = daysAgo(1);
  await (await fetch(`${base}/food-log`, json('POST', { name: 'Porridge', macros: { p: 12, c: 55, f: 6, kcal: 320 }, date }))).json();
  const full = await (await fetch(`${base}/food-log`, json('POST', { name: 'Eggs on sourdough', macros: { p: 0, c: 0, f: 0, kcal: 0 }, source: 'described', date, items: PLATE }))).json();
  await (await fetch(`${base}/food-log`, json('POST', { name: 'Banana', macros: { p: 1, c: 27, f: 0, kcal: 105 }, date }))).json();
  const before = await (await fetch(`${base}/food-log?date=${date}`)).json();
  const target = full.entries[1];

  const after = await (await fetch(`${base}/food-log/${target.id}?date=${date}`, { method: 'DELETE' })).json();
  assert.equal(after.entries.some((e) => e.id === target.id), false);

  const r = await fetch(`${base}/food-log/${target.id}/restore`, json('POST', { date, entry: target, index: 1 }));
  assert.equal(r.status, 200);
  const restored = await r.json();
  assert.deepEqual(restored.entries, before.entries);
  assert.deepEqual(await (await fetch(`${base}/food-log?date=${date}`)).json(), before, 'persisted, not just echoed');

  // the route refuses an entry that does not match the id in the path
  const bad = await fetch(`${base}/food-log/someone-else/restore`, json('POST', { date, entry: target, index: 1 }));
  assert.equal(bad.status, 400);
  // and a future day, the same date gate every other write has
  const future = await fetch(`${base}/food-log/${target.id}/restore`, json('POST', { date: '2999-01-01', entry: target }));
  assert.equal(future.status, 400);
});

// the client half, read as source (it writes, so it is not exercised live
// here): the × arms a 30-second Undo on the same rails as the line ×, the
// Undo calls the restore route, and a "Log it again" receipt carries an Undo
test('the client wires the meal ×, its Undo and the re-log receipt', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  const APP = read('src/App.jsx');
  const method = (name) => { const at = APP.indexOf(`\n  ${name}(`); assert.ok(at > 0, `${name} exists`); return APP.slice(at, APP.indexOf('\n  }\n', at)); };
  const del = method('deleteFoodLogEntry');
  assert.ok(del.includes('const undo = { date: day.date || date, entry: removed, index'), 'the removed entry and its place are held');
  assert.ok(del.includes('this.setState({ foodEntryUndo: undo })'));
  assert.ok(del.includes('setTimeout(() => this.setState({ foodEntryUndo: null }), 30000)'), 'for the same 30 seconds as the line undo');
  assert.ok(del.includes("action: { label: 'Undo', run: () => this.undoFoodLogEntry(undo) }"), 'and the toast offers it too, bound to this meal');
  assert.ok(method('undoFoodLogEntry').includes('api.restoreFoodLogEntry(conn, u.entry.id, { date: u.date, entry: u.entry, index: u.index })'));
  const relog = method('relogFoodItem');
  assert.ok(relog.includes("action: { label: 'Undo', run: () => this.undoRelogFoodItem(mine, day.date) }"), 'Log it again has a way back');
  assert.ok(method('undoRelogFoodItem').includes('api.deleteFoodLogEntry(conn, entry.id, date)'));
  assert.ok(read('src/api.js').includes('restoreFoodLogEntry: (conn, id, body) => post(conn, `/api/food-log/${encodeURIComponent(id)}/restore`, body)'));
  const screen = read('src/screens/Recipes.jsx');
  assert.ok(screen.includes('v.foodLogUndos.map((u) =>'), 'every pending undo is drawn, the line one and the meal one');
});
