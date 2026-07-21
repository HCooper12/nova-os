// Cross-day food history + recurring detection — temp data dir BEFORE imports.
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-foodhist-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { computeFoodHistory, recurringFoods, normalizeName } = await import('../lib/foodHistory.js');

const logDir = path.join(dataDir, 'food-log');
await mkdir(logDir, { recursive: true });
const writeDay = (date, entries) => writeFile(path.join(logDir, `${date}.json`), JSON.stringify({ date, entries }, null, 2));

test.before(async () => {
  await writeDay('2026-07-10', [
    { id: 'a1', time: '10:00', name: 'Protein Pretzels', macros: { p: 10, c: 20, f: 2, kcal: 140 }, source: 'scan' },
  ]);
  await writeDay('2026-07-14', [
    { id: 'b1', time: '11:00', name: 'protein pretzels!', macros: { p: 11, c: 21, f: 2, kcal: 150 } },
    { id: 'b2', time: '19:00', name: 'Crumpets with Duo Penotti', macros: { p: 6, c: 40, f: 8, kcal: 260 } },
  ]);
  await writeDay('2026-07-18', [
    { id: 'c1', time: '10:30', name: 'Protein Pretzels', macros: { p: 10, c: 20, f: 2, kcal: 145 } },
    { id: 'c2', time: '15:00', name: 'Banana', macros: { p: 1, c: 27, f: 0, kcal: 105 } },
  ]);
});

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

test('normalizeName groups by casing/punctuation but keeps distinct foods apart', () => {
  assert.equal(normalizeName('Crumpets with Duo Penotti!'), 'crumpets with duo penotti');
  assert.equal(normalizeName('protein pretzels!'), normalizeName('Protein Pretzels'));
  assert.notEqual(normalizeName('8 pretzels'), normalizeName('12 pretzels')); // portions stay distinct
});

test('aggregates across days: count, newest name+macros, first/last dates', async () => {
  const hist = await computeFoodHistory({ days: 45 });
  assert.equal(hist.length, 3, 'three distinct items');

  const pretzels = hist.find((i) => i.key === 'protein pretzels');
  assert.equal(pretzels.count, 3, 'eaten three times across days');
  assert.equal(pretzels.name, 'Protein Pretzels', 'display name from the newest logging');
  assert.equal(pretzels.macros.kcal, 145, 'macros from the newest portion');
  assert.equal(pretzels.lastDate, '2026-07-18');
  assert.equal(pretzels.firstDate, '2026-07-10');

  // newest-eaten first (pretzels & banana on the 18th, then crumpets on the 14th)
  assert.equal(hist[hist.length - 1].key, 'crumpets with duo penotti');
});

test('recurringFoods flags only items over the threshold, respecting excludeKeys', async () => {
  const recurring = await recurringFoods({ days: 45, minCount: 3 });
  assert.deepEqual(recurring.map((i) => i.key), ['protein pretzels']);

  const excluded = await recurringFoods({ days: 45, minCount: 3, excludeKeys: new Set(['protein pretzels']) });
  assert.equal(excluded.length, 0, 'already-known items are not re-proposed');

  const lower = await recurringFoods({ days: 45, minCount: 1 });
  assert.equal(lower.length, 3, 'a lower threshold surfaces everything');
});
