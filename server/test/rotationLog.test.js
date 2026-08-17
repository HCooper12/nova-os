// Rotation meals belong in the food log. His report: viewing a past day
// showed only off-plan extras (54.6g protein against a real 149g on
// 2026-08-17) because ticking a main meal wrote a boolean into vault
// frontmatter that only ever remembers ONE day.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = await mkdtemp(path.join(tmpdir(), 'nova-rotlog-'));
process.env.NOVA_DATA_DIR = dir;
const { setRotationEntry, getDay, totalsOf, addEntry } = await import('../lib/foodLog.js');

test.after(() => rm(dir, { recursive: true, force: true }));

test('a ticked rotation meal lands in the day it was eaten, and unticking removes it', async () => {
  const date = '2026-08-17';
  await setRotationEntry({ date, slot: 'lunch', name: 'Works Burger', recipeId: 'works-burger', macros: { p: 52, c: 42, f: 17.5, kcal: 540 }, consumed: true });
  await setRotationEntry({ date, slot: 'dinner', name: 'Animal Style Potato Bowl', macros: { p: 44, c: 60, f: 20, kcal: 620 }, consumed: true });
  await addEntry({ name: 'Maltesers', macros: { p: 1.6, c: 20, f: 8, kcal: 160 }, date });

  const day = await getDay(date);
  assert.equal(day.entries.length, 3, 'main meals and the extra share one store');
  const totals = totalsOf(day.entries);
  assert.equal(Math.round(totals.p), 98, 'the true protein, not just the extras');
  const lunch = day.entries.find((e) => e.slot === 'lunch');
  assert.equal(lunch.source, 'rotation');
  assert.equal(lunch.recipeId, 'works-burger', 'traceable back to the recipe');
  assert.equal(lunch.time, undefined, 'a retro entry carries no invented clock time');

  // idempotent: re-ticking the same slot replaces rather than duplicates
  await setRotationEntry({ date, slot: 'lunch', name: 'Works Burger', macros: { p: 52, c: 42, f: 17.5, kcal: 540 }, consumed: true });
  assert.equal((await getDay(date)).entries.filter((e) => e.slot === 'lunch').length, 1);

  // unticking takes it back out, leaving the extras alone
  await setRotationEntry({ date, slot: 'lunch', consumed: false });
  const after = await getDay(date);
  assert.equal(after.entries.length, 2);
  assert.ok(after.entries.some((e) => e.name === 'Maltesers'), 'off-plan entries survive');
  assert.equal(Math.round(totalsOf(after.entries).p), 46);
});

test('totalsOf is the one join — tolerant of missing/partial macros', () => {
  assert.deepEqual(totalsOf([]), { p: 0, c: 0, f: 0, kcal: 0 });
  const t = totalsOf([{ macros: { p: 10 } }, { macros: { p: 5, kcal: 100 } }, {}]);
  assert.equal(t.p, 15);
  assert.equal(t.kcal, 100);
  assert.ok(!Number.isNaN(t.c));
});
