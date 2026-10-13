// The watch pipeline's honesty contract: Shortcut-shaped tolerance, own-date
// grouping, idempotent merges — a re-fired Shortcut never duplicates.
//
// TZ pinned BEFORE any Date use: workout dates resolve in the SERVER'S
// local zone (his Mac, Australia) — on a UTC CI runner the same +10:00
// instants land on different calendar days and the assertions lie.
process.env.TZ = 'Australia/Sydney';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-watch-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';
const { normalizeWorkout, mergeWorkouts, ingestWorkouts, workoutsForDay } = await import('../lib/healthWorkouts.js');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

test('normalizeWorkout: Shortcut field aliases, own-date wins, junk refused', () => {
  const w = normalizeWorkout({ workoutType: 'Walking', startDate: '2026-08-19T07:30:00+10:00', duration: '34.6', energy: 211.4 }, '2026-08-18');
  assert.equal(w.type, 'Walking');
  assert.equal(w.date, '2026-08-19', "the workout's own start date beats the payload date");
  assert.equal(w.minutes, 35);
  assert.equal(w.kcal, 211);
  const noStart = normalizeWorkout({ type: 'Traditional Strength Training', minutes: 52 }, '2026-08-18');
  assert.equal(noStart.date, '2026-08-18', 'payload date is the fallback');
  assert.equal(noStart.kcal, null, 'missing energy is null, never zero');
  assert.equal(normalizeWorkout({ type: 'Walking' }, '2026-08-18'), null, 'no duration → refused');
  assert.equal(normalizeWorkout({ minutes: 30 }, '2026-08-18'), null, 'no type → refused');
  assert.equal(normalizeWorkout({ type: 'Walking', minutes: 30 }, 'garbage'), null, 'no usable date → refused');
});

test('mergeWorkouts: a re-push replaces, never duplicates', () => {
  const a = { type: 'Walking', date: '2026-08-19', startISO: '2026-08-18T21:30:00.000Z', minutes: 34, kcal: 210 };
  const merged = mergeWorkouts([a], [{ ...a, minutes: 36, kcal: 215 }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].minutes, 36, 'the later push wins');
  const other = { type: 'Cycling', date: '2026-08-19', startISO: '2026-08-19T01:00:00.000Z', minutes: 20, kcal: 150 };
  assert.equal(mergeWorkouts([a], [other]).length, 2, 'a different workout adds');
});

test('ingestWorkouts: groups by own dates, persists idempotently, honest on junk', async () => {
  const r = await ingestWorkouts({ date: '2026-08-19', workouts: [
    { type: 'Walking', startISO: '2026-08-19T07:30:00+10:00', minutes: 34, kcal: 210 },
    { type: 'Traditional Strength Training', startISO: '2026-08-18T17:05:00+10:00', minutes: 52, kcal: 380 },
    { nonsense: true },
  ] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.saved, { '2026-08-19': 1, '2026-08-18': 1 });
  await ingestWorkouts({ date: '2026-08-19', workouts: [{ type: 'Walking', startISO: '2026-08-19T07:30:00+10:00', minutes: 34, kcal: 210 }] });
  assert.equal((await workoutsForDay('2026-08-19')).length, 1, 'the re-fired Shortcut did not duplicate');
  const junk = await ingestWorkouts({ date: '2026-08-19', workouts: [{}] });
  assert.equal(junk.ok, false);
});

test('duration tolerance: minutes, seconds, and clock strings all resolve', () => {
  const base = { type: 'Walking', startISO: '2026-08-19T07:30:00+10:00' };
  assert.equal(normalizeWorkout({ ...base, duration: 34 }, null).minutes, 34, 'plain minutes');
  assert.equal(normalizeWorkout({ ...base, duration: 3130 }, null).minutes, 52, "Apple's seconds become minutes");
  assert.equal(normalizeWorkout({ ...base, duration: '52:10' }, null).minutes, 52, 'MM:SS clock string');
  assert.equal(normalizeWorkout({ ...base, duration: '1:02:45' }, null).minutes, 63, 'H:MM:SS clock string');
  assert.equal(normalizeWorkout({ ...base, duration: 90000 }, null), null, 'beyond 24h even as seconds → refused');
});

test('a short workout in seconds is never read as minutes when its unit is known', () => {
  const base = { type: 'Walking', startISO: '2026-10-14T07:30:00+11:00' };
  assert.equal(normalizeWorkout({ ...base, endISO: '2026-10-14T07:50:00+11:00', duration: 1200 }, null).minutes, 20, 'start and end beat a bare number');
  assert.equal(normalizeWorkout({ ...base, seconds: 1200 }, null).minutes, 20, 'named seconds');
  assert.equal(normalizeWorkout({ ...base, durationSeconds: '1200' }, null).minutes, 20, 'named seconds as text');
  assert.equal(normalizeWorkout({ ...base, duration: '20 min' }, null).minutes, 20, 'text with a unit');
  assert.equal(normalizeWorkout({ ...base, duration: '1 hr 5 min' }, null).minutes, 65, 'hours and minutes');
  assert.equal(normalizeWorkout({ ...base, duration: '1200 s' }, null).minutes, 20, 'text in seconds');
  assert.equal(normalizeWorkout({ ...base, minutes: 20, kcal: '211.4 kcal' }, null).kcal, 211, 'kcal with its unit');
  assert.equal(normalizeWorkout({ ...base, minutes: 3130 }, null), null, 'named minutes are never reinterpreted as seconds');
});

test('the route takes one flat workout as well as a list', async () => {
  const express = (await import('express')).default;
  const { healthDataRouter } = await import('../routes/healthData.js');
  const app = express();
  app.use(express.json());
  app.use('/api', healthDataRouter(dataDir));
  const server = app.listen(0);
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/health-data/workouts`;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'Outdoor Walk', startISO: '2026-10-14T07:30:00+11:00', minutes: '20', kcal: '96' }) });
    assert.equal(r.status, 200);
    const day = await workoutsForDay('2026-10-14');
    assert.ok(day.some((w) => w.type === 'Outdoor Walk' && w.minutes === 20 && w.kcal === 96));
  } finally { server.close(); }
});
