// The lock-screen Live Activity's data (src/liveActivityModel.js) and its
// contract with the Swift that draws it (ios/App/App/NovaActivityAttributes.swift).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workoutLive, jobLive } from '../../src/liveActivityModel.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const T0 = Date.UTC(2026, 9, 12, 8, 0, 0);
const progress = (ws) => {
  let done = 0; let total = 0; let next = null;
  for (const e of ws.exercises) for (const s of e.sets) { total += 1; if (s.done) done += 1; else next ??= e; }
  return { done, total, next };
};
const ws = {
  routineId: 'push', routineName: 'Push A', startedAt: T0,
  exercises: [
    { name: 'Bench press', muscleGroup: 'chest', sets: [{ done: true }, { done: false }] },
    { name: 'Dips', muscleGroup: 'triceps', sets: [{ done: false }] },
  ],
};
const base = { ws, editing: false, view: 'session', rest: null, now: T0 + 10 * 60_000, progress, hueOf: (g) => (g === 'chest' ? '#ff8a7a' : null) };

test('a workout he is doing becomes a card with sets, next lift and clock', () => {
  const live = workoutLive(base);
  assert.equal(live.key, `push:${T0}`);
  assert.deepEqual(live.state, {
    title: 'Push A', detail: 'Next: Bench press', done: 1, total: 3, hue: '#ff8a7a',
    startedAt: T0, restEndsAt: null, restTotal: null, finished: false,
  });
});

test('no card for a parked draft, an edit, or a session older than six hours', () => {
  assert.equal(workoutLive({ ...base, view: 'list' }), null);
  assert.equal(workoutLive({ ...base, editing: true }), null);
  assert.equal(workoutLive({ ...base, now: T0 + 6 * 3600_000 }), null);
  assert.equal(workoutLive({ ...base, ws: null }), null);
});

test('a running rest goes on the card; a finished one does not', () => {
  const rest = { startedAt: base.now, endsAt: base.now + 90_000, total: 90 };
  const resting = workoutLive({ ...base, rest });
  assert.equal(resting.state.restEndsAt, rest.endsAt);
  assert.equal(resting.state.restTotal, 90);
  const over = workoutLive({ ...base, rest, now: rest.endsAt + 1 });
  assert.equal(over.state.restEndsAt, null);
});

test('the signature moves with what the card shows, never with the clock', () => {
  const a = workoutLive(base);
  const b = workoutLive({ ...base, now: base.now + 30_000 });
  assert.equal(a.sig, b.sig, 'time passing alone must not send an update');
  const ticked = structuredClone(ws); ticked.exercises[0].sets[1].done = true;
  assert.notEqual(workoutLive({ ...base, ws: ticked }).sig, a.sig);
});

test('jobs: running wins, then ready, failures stay off the lock screen', () => {
  assert.equal(jobLive([]), null);
  assert.equal(jobLive([{ label: 'Ingest failed', failed: true }]), null);
  const run = jobLive([{ label: 'Reading your copy', startedAt: T0 }, { label: 'Research', startedAt: T0 }, { label: 'Ready', done: true }]);
  assert.equal(run.state.title, 'Reading your copy');
  assert.equal(run.state.detail, 'and 1 more running');
  assert.equal(run.state.finished, false);
  const ready = jobLive([{ label: 'Ready for your review — 15 pages', done: true }]);
  assert.equal(ready.state.finished, true);
  assert.equal(ready.state.title, 'Ready for your review — 15 pages');
});

test('every field JS sends is a field the Swift ContentState declares', async () => {
  const swift = await readFile(path.join(root, 'ios/App/App/NovaActivityAttributes.swift'), 'utf8');
  const block = swift.slice(swift.indexOf('struct ContentState'), swift.indexOf('public var kind'));
  const declared = new Set([...block.matchAll(/public var (\w+):/g)].map((m) => m[1]));
  const sent = new Set([
    ...Object.keys(workoutLive({ ...base, rest: { endsAt: base.now + 1000, total: 60 } }).state),
    ...Object.keys(jobLive([{ label: 'x', startedAt: T0 }]).state),
  ]);
  for (const k of sent) assert.ok(declared.has(k), `JS sends "${k}" but Swift has no such field`);
  // the two non-optional Swift fields must always be sent
  for (const k of ['title', 'detail']) assert.ok(sent.has(k));
});

// The Breaker's review of this file, 13 Oct.
test('glancing at a routine mid-workout keeps the card; a days-old draft still gets none', () => {
  assert.ok(workoutLive({ ...base, view: 'routine', savedAt: base.now - 5 * 60_000 }), 'touched five minutes ago');
  assert.equal(workoutLive({ ...base, view: 'routines', savedAt: base.now - 3 * 3600_000 }), null);
  assert.equal(workoutLive({ ...base, view: 'routine' }), null, 'no touch time at all');
});

test('only work this phone watched running may say ready on the lock screen', () => {
  const stale = [{ id: 'ing-old', label: 'Ready for review — Pasted content (15 pages)', done: true }];
  assert.equal(jobLive(stale, new Set()), null, 'a fortnight-old staged job');
  assert.equal(jobLive(stale, new Set(['ing-old'])).state.finished, true);
  assert.equal(jobLive([{ id: 'x', done: true }], new Set(['x'])).state.title, 'Ready for you', 'never a null title');
});
