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

test('concurrent logs all survive — the read-modify-write race that dropped entries', async () => {
  const { addEntry, getToday, removeEntry } = await import('../lib/foodLog.js');
  const before = (await getToday()).entries.length;

  // fire together, exactly as a double-tap / outbox drain / re-log would
  const names = ['Race A', 'Race B', 'Race C', 'Race D', 'Race E'];
  await Promise.all(names.map((name) => addEntry({ name, macros: { p: 1, c: 1, f: 1, kcal: 17 }, source: 'history' })));

  const day = await getToday();
  assert.equal(day.entries.length, before + 5, 'every concurrent entry landed');
  for (const name of names) assert.ok(day.entries.some((e) => e.name === name), `${name} survived`);

  // concurrent removals are serialized too
  const ids = day.entries.filter((e) => names.includes(e.name)).map((e) => e.id);
  await Promise.all(ids.map((id) => removeEntry(id)));
  const after = await getToday();
  assert.equal(after.entries.length, before, 'every concurrent removal applied');
});

// ---- [13] plan 2: a saved recipe confesses when the portions disagreed ----
test('portionVariance: >30% spread between the smallest and largest logged portion is varied; two alike or one alone is not', async () => {
  const { portionVariance, PORTION_VARIANCE } = await import('../lib/foodHistory.js');
  assert.equal(PORTION_VARIANCE, 0.3);
  assert.deepEqual(portionVariance([400, 610, 540]), { varied: true, min: 400, max: 610 });
  assert.deepEqual(portionVariance([430, 450]), { varied: false, min: 430, max: 450 });
  assert.deepEqual(portionVariance([430]), { varied: false, min: null, max: null });
  assert.deepEqual(portionVariance([]), { varied: false, min: null, max: null });
  assert.deepEqual(portionVariance([0, 500, 520]).varied, false, 'a zero-kcal entry is not a portion');
});

// WHAT HE JUST ADDED COMES FIRST (22 Sep 2026).
//
// "have recently logged or added foods added to the top so I don't need to
// keep scrolling to search for something I just added". The sort used to be
// by DATE, tie-broken by count — so everything logged today tied, and the
// tie-break then handed first place to whatever he eats most often. A food
// added a minute ago lost to a breakfast he has had forty times.
test('within one day, the food logged LAST is first — not the one logged most often', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-foodrecency-'));
  const logs = path.join(dir, 'food-log');
  await mkdir(logs, { recursive: true });
  const day = (date, entries) => writeFile(path.join(logs, `${date}.json`), JSON.stringify({ date, entries }, null, 2));

  // Oats is the habit: eaten every one of the four days, four times over.
  // Lamington was typed in this evening, once, and is the thing he is looking
  // for — under the old sort it came second to Oats and sat below the fold.
  await day('2026-09-19', [{ id: 'o1', time: '07:00', name: 'Oats', macros: { p: 12, c: 55, f: 6, kcal: 330 } }]);
  await day('2026-09-20', [{ id: 'o2', time: '07:05', name: 'Oats', macros: { p: 12, c: 55, f: 6, kcal: 330 } }]);
  await day('2026-09-21', [{ id: 'o3', time: '07:02', name: 'Oats', macros: { p: 12, c: 55, f: 6, kcal: 330 } }]);
  await day('2026-09-22', [
    { id: 'o4', time: '07:01', name: 'Oats', macros: { p: 12, c: 55, f: 6, kcal: 330 } },
    { id: 'l1', time: '21:16', name: 'Pink Lamington', macros: { p: 1, c: 10, f: 2, kcal: 65 } },
  ]);

  const prev = process.env.NOVA_DATA_DIR;
  process.env.NOVA_DATA_DIR = dir;
  try {
    // a fresh module graph, or foodLog.js keeps the old data dir it resolved at import
    const { computeFoodHistory: compute } = await import(`../lib/foodHistory.js?recency=${Date.now()}`);
    const hist = await compute({ days: 45 });
    assert.equal(hist[0].name, 'Pink Lamington', 'the one he just added leads, over the one he eats daily');
    assert.equal(hist[1].name, 'Oats');
    assert.equal(hist[1].count, 4, 'and the habit is still counted, just not ranked by it');
  } finally {
    process.env.NOVA_DATA_DIR = prev;
    await rm(dir, { recursive: true, force: true });
  }
});

// A day whose entries carry no clock time at all — every retro log, because
// foodLog.js stamps a time only when the target date is today. Order inside
// that day is the order they were appended, which is the order he added them.
test('a day with no clock times still orders by when the rows were appended', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-foodretro-'));
  const logs = path.join(dir, 'food-log');
  await mkdir(logs, { recursive: true });
  await writeFile(path.join(logs, '2026-09-20.json'), JSON.stringify({
    date: '2026-09-20',
    entries: [
      { id: 'r1', name: 'First added', macros: { p: 1, c: 1, f: 1, kcal: 10 } },
      { id: 'r2', name: 'Second added', macros: { p: 1, c: 1, f: 1, kcal: 10 } },
      { id: 'r3', name: 'Third added', macros: { p: 1, c: 1, f: 1, kcal: 10 } },
    ],
  }, null, 2));

  const prev = process.env.NOVA_DATA_DIR;
  process.env.NOVA_DATA_DIR = dir;
  try {
    const { computeFoodHistory: compute } = await import(`../lib/foodHistory.js?retro=${Date.now()}`);
    const hist = await compute({ days: 45 });
    assert.deepEqual(hist.map((h) => h.name), ['Third added', 'Second added', 'First added']);
  } finally {
    process.env.NOVA_DATA_DIR = prev;
    await rm(dir, { recursive: true, force: true });
  }
});
