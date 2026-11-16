// A pain note holds a lift's load for two weeks, says the day it was logged,
// and stops holding once he says it was a one-off (13 Nov 2026, his "old
// data" complaint). Temp data and vaults, set before any import.
// the clock is pinned and the zone is his, before anything reads a date
process.env.TZ = 'Australia/Brisbane';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';

const root = await mkdtemp(path.join(tmpdir(), 'nova-painhold-'));
process.env.NOVA_DATA_DIR = path.join(root, 'data');
process.env.NOVA_VAULT_GRACE_MS = '0';
await mkdir(process.env.NOVA_DATA_DIR, { recursive: true });

const { computeProgressions } = await import('../lib/coach.js');
const { createRecord } = await import('../lib/inboxStore.js');
const { datedLabel } = await import('../lib/freshness.js');

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// pinned: 12:00 Brisbane on Thu 12 Nov 2026; computeProgressions takes `now`
const NOW = new Date('2026-11-12T02:00:00Z');
const daysAgo = (n) => local(new Date(NOW.getTime() - n * 86_400_000));
const routines = [{ id: 'push', exercises: [{ exerciseId: 'bench', trackingType: 'weight_reps', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 10 }] }];
const sets = Array.from({ length: 3 }, () => ({ weight: 80, reps: 10, rpe: 8 }));

// two topped-out sessions: without the pain note this earns +2.5kg
async function vaultWith(olderAgo, painAgo) {
  const vault = await mkdtemp(path.join(root, 'vault-'));
  const dir = path.join(vault, 'Wiki/Health/Workouts');
  await mkdir(dir, { recursive: true });
  const write = (date, ex) => writeFile(path.join(dir, `${date} push.md`), matter.stringify('# Push\n', {
    type: 'workout-session', id: `s-${date}`, date, routineId: 'push', routineName: 'Push', finishedAt: `${date}T10:00:00.000Z`, exercises: [ex],
  }), 'utf8');
  await write(daysAgo(olderAgo), { exerciseId: 'bench', name: 'Bench Press', sets });
  await write(daysAgo(painAgo), { exerciseId: 'bench', name: 'Bench Press', sets, pain: 'Shoulder (left), at the bottom' });
  return vault;
}

test('pain 20 days ago no longer holds the weight', async () => {
  const prog = await computeProgressions(await vaultWith(27, 20), routines, { now: NOW, settledPainKeys: [] });
  assert.equal(prog['push:bench'].kind, 'weight');
});

test('pain 3 days ago holds it, and the reason carries the day', async () => {
  const prog = await computeProgressions(await vaultWith(10, 3), routines, { now: NOW, settledPainKeys: [] });
  assert.equal(prog['push:bench'].kind, 'quality');
  assert.equal(prog['push:bench'].delta, 0);
  assert.ok(prog['push:bench'].evidence.includes(`because you reported pain ${datedLabel(daysAgo(3), NOW)}: "Shoulder (left), at the bottom"`));
});

test('pain 3 days ago that he answered "no, not still going on" does not hold it', async () => {
  const vault = await vaultWith(10, 3);
  const key = `pain:bench:${daysAgo(3)}`;
  assert.equal((await computeProgressions(vault, routines, { now: NOW, settledPainKeys: [key] }))['push:bench'].kind, 'weight');
  // and read from the inbox when the caller passes nothing; an expired question is not his answer
  await createRecord({ id: 'exp', kind: 'pain-check', painKey: key, status: 'discarded', expired: true, createdAt: NOW.toISOString() });
  assert.equal((await computeProgressions(vault, routines, { now: NOW }))['push:bench'].kind, 'quality');
  await createRecord({ id: 'no', kind: 'pain-check', painKey: key, status: 'discarded', discardedAt: NOW.toISOString(), createdAt: NOW.toISOString() });
  assert.equal((await computeProgressions(vault, routines, { now: NOW }))['push:bench'].kind, 'weight');
});
