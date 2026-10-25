// HealthKit workouts (NovaHealthPlugin.swift) and the active-rest rule:
// cardio of 15+ minutes ticks off an active-rest day (his call).
process.env.TZ = 'Australia/Sydney';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-cardio-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';
const { normalizeWorkout, mergeWorkouts, ingestWorkouts, workoutsForRange, cardioKind, countsForActiveRest } = await import('../lib/healthWorkouts.js');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

// his real Indoor Walk, 25 Oct 2026, as the Swift reader sends it
const REAL = {
  uuid: '6f1c2a9e-0b3d-4e5f-8a7b-1c2d3e4f5a6b', type: 'Indoor Walk',
  startISO: '2026-10-25T16:05:00+11:00', endISO: '2026-10-25T16:46:59+11:00',
  minutes: 42, kcal: 270, distanceKm: 3.87, avgHr: 97, source: 'iPhone',
};

test('the real Indoor Walk normalises with every HealthKit field', () => {
  const w = normalizeWorkout(REAL, null);
  assert.equal(w.type, 'Indoor Walk');
  assert.equal(w.date, '2026-10-25');
  assert.equal(w.minutes, 42);
  assert.equal(w.minutesExact, 41.98);
  assert.equal(w.kcal, 270);
  assert.equal(w.distanceKm, 3.87);
  assert.equal(w.avgHr, 97);
  assert.equal(w.source, 'iPhone');
  assert.equal(w.uuid, REAL.uuid.toUpperCase());
  assert.equal(cardioKind(w.type), 'walk');
  assert.equal(countsForActiveRest(w), true);
});

test('missing extras stay absent, never zero', () => {
  const w = normalizeWorkout({ type: 'Outdoor Run', minutes: 20, distanceKm: 0, avgHr: 'x' }, '2026-10-20');
  assert.equal('distanceKm' in w, false);
  assert.equal('avgHr' in w, false);
  assert.equal('uuid' in w, false);
});

test('mergeWorkouts keys on uuid, and stays idempotent with old keys', () => {
  const a = normalizeWorkout(REAL, null);
  const edited = normalizeWorkout({ ...REAL, endISO: '2026-10-25T16:50:00+11:00', startISO: '2026-10-25T16:06:00+11:00' }, null);
  const merged = mergeWorkouts([a], [edited]);
  assert.equal(merged.length, 1, 'same uuid, moved start: replaced not duplicated');
  assert.equal(merged[0].minutes, 44);
  const legacy = normalizeWorkout({ type: 'Indoor Walk', startISO: REAL.startISO, minutes: 42 }, null);
  assert.equal(mergeWorkouts([legacy], [a]).length, 1, 'uuid-less Shortcut copy of the same walk is replaced');
  assert.equal(mergeWorkouts([a], [a]).length, 1, 're-push is idempotent');
  const other = normalizeWorkout({ ...REAL, uuid: 'aaaaaaaa-0000-0000-0000-000000000000', startISO: '2026-10-25T18:00:00+11:00', endISO: '2026-10-25T18:30:00+11:00' }, null);
  assert.equal(mergeWorkouts([a], [other]).length, 2);
});

test('threshold edge: 14.9 min does not count, 15 does', () => {
  assert.equal(countsForActiveRest({ type: 'Outdoor Walk', minutes: 15, minutesExact: 14.9 }), false);
  assert.equal(countsForActiveRest({ type: 'Outdoor Walk', minutes: 14.9 }), false);
  assert.equal(countsForActiveRest({ type: 'Outdoor Walk', minutes: 15 }), true);
  const short = normalizeWorkout({ type: 'Outdoor Walk', startISO: '2026-10-25T08:00:00+11:00', endISO: '2026-10-25T08:14:54+11:00' }, null);
  assert.equal(short.minutes, 15, 'display rounds');
  assert.equal(countsForActiveRest(short), false, 'but the rule reads the exact length');
});

test('cardioKind: cardio kinds, strength and the rest are null', () => {
  const cases = { 'Outdoor Run': 'run', Treadmill: 'run', 'Indoor Cycle': 'cycle', 'Pool Swim': 'swim', 'Indoor Row': 'row', Hike: 'hike', Elliptical: 'other-cardio', HIIT: 'other-cardio',
    'Traditional Strength Training': null, 'Functional Strength Training': null, 'Core Training': null, Yoga: null, Workout: null, '': null };
  for (const [t, k] of Object.entries(cases)) assert.equal(cardioKind(t), k, t);
  assert.equal(countsForActiveRest({ type: 'Traditional Strength Training', minutes: 60 }), false);
});

test('workoutsForRange reads the per-day files; no file is []', async () => {
  assert.deepEqual(await workoutsForRange('2026-10-01', '2026-10-31'), []);
  const r = await ingestWorkouts({ workouts: [REAL, { ...REAL, uuid: 'bbbbbbbb-0000-0000-0000-000000000000', startISO: '2026-10-22T07:00:00+11:00', endISO: '2026-10-22T07:30:00+11:00' }] });
  assert.equal(r.ok, true);
  const all = await workoutsForRange('2026-10-20', '2026-10-26');
  assert.equal(all.length, 2);
  assert.equal((await workoutsForRange('2026-10-23', '2026-10-26')).length, 1);
  assert.deepEqual(await workoutsForRange('bad', '2026-10-26'), []);
});
