// A stalled or long-running lift, handled the way he asked (25 Sep): Coach
// has the capacity to suggest a change "but not a must as I don't want it to
// over indulge or over decide if unnecessary". So: four flat weeks on a lift
// he has done for six, still in his program; the same lift with a new tempo
// before a swap; a swap only to a lift that trains the same muscle AND moves
// the same way, not already in his plan, not one he turned down; months on
// one lift only when it has slowed; and one such card a week at most.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-stall-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-stall-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const R = await import('../lib/coachProgramReview.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const EX = [
  { id: 'fly', name: 'Cable Fly', muscleGroup: 'Chest' },
  { id: 'deck', name: 'Pec Deck', muscleGroup: 'Chest' },
  { id: 'incline', name: 'Incline Bench Press', muscleGroup: 'Chest' },
  { id: 'dbfly', name: 'Dumbbell Flyes', muscleGroup: 'Chest' },
];
const weekly = (from, n, weight = () => 20) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${from}T12:00:00`);
  d.setDate(d.getDate() + i * 7);
  return { date: d.toISOString().slice(0, 10), exercises: [{ exerciseId: 'fly', name: 'Cable Fly', sets: [{ weight: weight(i), reps: 10 }] }] };
});
const NOW = new Date('2026-09-20T12:00:00');
const SIX_FLAT_WEEKS = weekly('2026-08-02', 7); // six weeks flat, six weeks of history

test('four flat weeks on an established lift: the same lift with a new tempo, first', () => {
  const [f] = R.findStaleLifts(SIX_FLAT_WEEKS, EX, { now: NOW });
  assert.equal(f.fix.action, 'tune');
  assert.equal(f.fix.exerciseId, 'fly');
  assert.match(f.fix.focus, /3s lowering/);
  assert.match(f.line, /Before swapping it out, change the stimulus on the same lift/);
});

test("the variation is his research's tempo or pause one when there is one", () => {
  const withResearch = EX.map((e) => (e.id === 'fly' ? { ...e, research: { variations: [
    { name: 'Single-arm', how: 'one side at a time, brace the other hand', why: 'x' },
    { name: 'Pause in the stretch', how: 'hold one second with the arms wide before each rep', why: 'loads the stretch' },
  ] } } : e));
  const [f] = R.findStaleLifts(SIX_FLAT_WEEKS, withResearch, { now: NOW });
  assert.equal(f.variation.name, 'Pause in the stretch', 'tempo and pauses lead');
});

test('a tempo tried for four weeks, or turned down: a swap that trains the same muscle AND moves the same way', () => {
  const tunes = new Map([['fly', { exerciseId: 'fly', focus: '3s lowering, same weight', updated: '2026-08-20' }]]);
  const [f] = R.findStaleLifts(SIX_FLAT_WEEKS, EX, { now: NOW, tunes });
  assert.equal(f.fix.action, 'swap');
  assert.ok(['deck', 'dbfly'].includes(f.fix.replaceWith), 'a fly for a fly');
  assert.ok(!f.alternatives.some((a) => a.id === 'incline'), 'never a press for a fly');
  assert.match(f.line, /3s lowering has been your focus on it since 2026-08-20/);

  const [g] = R.findStaleLifts(SIX_FLAT_WEEKS, EX, { now: NOW, declinedVariation: new Set(['fly']) });
  assert.equal(g.fix.action, 'swap');
  assert.match(g.line, /You passed on changing the tempo/);
});

test('never a replacement he turned down, never one already in his plan; none honest, nothing said', () => {
  const tunes = new Map([['fly', { exerciseId: 'fly', focus: 'x', updated: '2026-08-01' }]]);
  const [f] = R.findStaleLifts(SIX_FLAT_WEEKS, EX, { now: NOW, tunes, declined: new Set(['deck']), inProgram: new Set(['fly', 'dbfly']) });
  assert.equal(f, undefined, 'deck declined, dumbbell flyes already in the plan: no honest swap, so no card');
});

test('a lift the session engine is already giving a new stimulus is left to work, until eight flat weeks', () => {
  const focus = new Set(['fly']);
  assert.deepEqual(R.findStaleLifts(SIX_FLAT_WEEKS, EX, { now: NOW, inSessionFocus: focus }), []);
  const long = weekly('2026-07-12', 10); // nine flat weeks
  const [f] = R.findStaleLifts(long, EX, { now: NOW, inSessionFocus: focus });
  assert.equal(f.fix.action, 'swap');
  assert.match(f.line, /Tempo and control work in your sessions has not moved it either/);
});

test('a lift he no longer does is history, not a finding', () => {
  assert.deepEqual(R.findStaleLifts(SIX_FLAT_WEEKS, EX, { now: NOW, inProgram: new Set(['deck']) }), []);
});

test('months on one lift: raised only once it has slowed, and only with an honest rotation', () => {
  const fortnightly = (weight) => Array.from({ length: 12 }, (_, i) => {
    const d = new Date('2026-04-01T12:00:00');
    d.setDate(d.getDate() + i * 14);
    return { date: d.toISOString().slice(0, 10), exercises: [{ exerciseId: 'fly', name: 'Cable Fly', sets: [{ weight: weight(i), reps: 10 }] }] };
  });
  const now = new Date('2026-09-15T12:00:00');
  assert.deepEqual(R.findLongTenure(fortnightly((i) => 20 + i * 2.5), EX, { now }), [], 'still climbing: left alone');
  const [f] = R.findLongTenure(fortnightly(() => 20), EX, { now });
  assert.equal(f.kind, 'tenure');
  assert.match(f.line, /it has slowed: \+0% across your last eight/);
  assert.ok(['deck', 'dbfly'].includes(f.fix.replaceWith));
  assert.deepEqual(R.findLongTenure(fortnightly(() => 20), EX, { now, declined: new Set(['deck', 'dbfly']) }), [], 'nothing honest to rotate to');
});

test('one exercise-change card a week, at most', async () => {
  const rows = [];
  const store = {
    listRecords: async () => rows,
    createRecord: async (r) => { rows.push(r); return r; },
    updateRecord: async (id, patch) => { Object.assign(rows.find((r) => r.id === id), patch); },
  };
  const review = async () => ({ findings: [
    { kind: 'stale', key: 'stale:a:1', line: 'a', fix: { action: 'tune', exerciseId: 'a', focus: 'x' } },
    { kind: 'tenure', key: 'tenure:b:1', line: 'b', fix: { action: 'swap' } },
  ] });
  const now = Date.now();
  const first = await R.raiseProgramFindings('/tmp/v', { store, review, now });
  assert.deepEqual(first.raised.map((r) => r.findingKey), ['stale:a:1'], 'room for two asks, but one exercise change');
  rows[0].status = 'filed';
  const again = await R.raiseProgramFindings('/tmp/v', { store, review, now: now + 2 * 86_400_000 });
  assert.equal(again.raised.length, 0, 'the week is not up');
  const later = await R.raiseProgramFindings('/tmp/v', { store, review, now: now + 8 * 86_400_000 });
  assert.deepEqual(later.raised.map((r) => r.findingKey), ['tenure:b:1']);
});

test('yes on a tempo card makes it his standing focus, and Undo takes it back', async () => {
  const { createRecord } = await import('../lib/inboxStore.js');
  const { approveRecord, undoRecord } = await import('../lib/inbox.js');
  const { getTunes } = await import('../lib/progressionTunes.js');
  await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
  await createRecord({ id: 'tune0001', kind: 'coach-program', status: 'pending', createdAt: new Date().toISOString(),
    text: 'Coach: Cable Fly has been flat…', fix: { action: 'tune', exerciseId: 'fly', exerciseName: 'Cable Fly', focus: 'Pause in the stretch: hold one second' } });
  const filed = await approveRecord(vault, 'tune0001');
  assert.equal(filed.status, 'filed');
  assert.equal((await getTunes(vault)).find((t) => t.exerciseId === 'fly')?.focus, 'Pause in the stretch: hold one second');
  await undoRecord(vault, 'tune0001');
  assert.equal((await getTunes(vault)).find((t) => t.exerciseId === 'fly'), undefined, 'undo clears the focus it set');
});
