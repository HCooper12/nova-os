// Retro food logging: entries can target a past day (bounded, never the
// future), land in THAT day's file, and honestly omit the clock time — a
// retro entry stamped with typing-time would be fiction about when he ate.
// Temp data dir BEFORE imports.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-foodretro-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { addEntry, getDay, getToday, removeEntryOn, resolveLogDate } = await import('../lib/foodLog.js');

test.after(async () => { await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true }); });

const iso = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('resolveLogDate: today by default; future, malformed, and deep past rejected', () => {
  assert.equal(resolveLogDate(), iso(0));
  assert.equal(resolveLogDate(iso(1)), iso(1));
  assert.throws(() => resolveLogDate(iso(-1)), /future/);
  assert.throws(() => resolveLogDate('last tuesday'), /YYYY-MM-DD/);
  assert.throws(() => resolveLogDate(iso(31)), /30 days/);
  assert.equal(resolveLogDate(iso(30)), iso(30), 'the 30-day edge is inclusive');
});

test('a retro entry lands in its day file, without a clock time; today keeps its time', async () => {
  const yday = iso(1);
  const retroDay = await addEntry({ name: 'Grilled chicken wrap', macros: { p: 42, c: 38, f: 12, kcal: 430 }, source: 'manual', date: yday });
  assert.equal(retroDay.date, yday, 'the RETURNED day is the retro day, not today');
  assert.equal(retroDay.entries.length, 1);
  assert.equal(retroDay.entries[0].time, undefined, 'no invented clock time on a retro entry');

  const todayDay = await addEntry({ name: 'Protein shake', macros: { p: 30, c: 5, f: 3, kcal: 170 }, source: 'manual' });
  assert.equal(todayDay.date, iso(0));
  assert.match(todayDay.entries[0].time, /^\d{2}:\d{2}$/, 'same-day entries keep the real time');

  // the two days never bleed into each other
  assert.equal((await getDay(yday)).entries.length, 1);
  assert.equal((await getToday()).entries.length, 1);

  // date-addressed removal cleans the retro day
  const removed = await removeEntryOn(yday, retroDay.entries[0].id);
  assert.equal(removed, 1);
  assert.equal((await getDay(yday)).entries.length, 0);
});
