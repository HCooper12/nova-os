// Server-side workout draft — the second line of defense after logged
// progress was lost repeatedly on-device. Temp data dir BEFORE imports.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-draft-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { saveSessionDraft, getSessionDraft, clearSessionDraft } = await import('../lib/sessionDraft.js');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

test('draft round-trips, updates in place, and clears cleanly', async () => {
  assert.equal(await getSessionDraft(), null, 'no draft yet');

  const session = { routineName: 'Pull', routineId: 'pull', exercises: [{ exerciseId: 'row', name: 'Row', sets: [{ weight: 60, reps: 8, done: true }] }] };
  const saved = await saveSessionDraft({ workoutSession: session });
  assert.ok(saved.saved && saved.savedAt, 'save is stamped');

  const draft = await getSessionDraft();
  assert.equal(draft.workoutSession.routineName, 'Pull');
  assert.equal(draft.workoutSession.exercises[0].sets[0].weight, 60, 'the actual logged numbers survive');

  // an edit overwrites in place
  session.exercises[0].sets.push({ weight: 60, reps: 7, done: true });
  await saveSessionDraft({ workoutSession: session, editingSessionId: null });
  assert.equal((await getSessionDraft()).workoutSession.exercises[0].sets.length, 2);

  await clearSessionDraft();
  assert.equal(await getSessionDraft(), null, 'cleared on finish/discard');
  await clearSessionDraft(); // idempotent
});

test('rejects a shapeless draft and expires an ancient one', async () => {
  await assert.rejects(() => saveSessionDraft({ workoutSession: { nope: true } }), /exercises/);

  // hand-write an expired draft (8 days old) — reader must refuse it
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(dataDir, 'session-draft.json'), JSON.stringify({
    workoutSession: { exercises: [] }, savedAt: Date.now() - 8 * 24 * 3600_000,
  }), 'utf8');
  assert.equal(await getSessionDraft(), null, 'stale drafts do not resurrect');
});


test('a finish is not a discard: only a discarded draft is offered back, and a legacy tombstone is recognised by its saved session', async () => {
  const { getDiscardedDraft } = await import('../lib/sessionDraft.js');
  const session = { routineName: 'Push — makeup', routineId: 'push', exercises: [{ exerciseId: 'bench', name: 'Bench', sets: [{ weight: 60, reps: 8, done: true }] }] };
  // finished → not offered
  await saveSessionDraft({ workoutSession: session });
  const fin = await clearSessionDraft({ reason: 'finished' });
  assert.equal(fin.recoverable, false, 'a saved workout is not "recoverable" — it is in the vault');
  assert.equal(await getDiscardedDraft(), null, 'no false alarm after a finish');
  // discarded → offered
  await saveSessionDraft({ workoutSession: session });
  const dis = await clearSessionDraft({ reason: 'discarded' });
  assert.equal(dis.recoverable, true);
  assert.equal((await getDiscardedDraft()).tickedSets, 1);
  // a tombstone from before the reason existed: the saved session says it was a finish
  const { writeFile: wf } = await import('node:fs/promises');
  const clearedAt = Date.now() - 60_000;
  await wf(path.join(dataDir, 'session-draft.discarded.json'), JSON.stringify({ workoutSession: session, clearedAt }), 'utf8');
  assert.ok(await getDiscardedDraft(), 'with no sessions to check, the safe side is to offer');
  const saved = [{ routineId: 'push', routineName: 'Push — makeup', finishedAt: new Date(clearedAt - 45_000).toISOString() }];
  assert.equal(await getDiscardedDraft({ sessions: saved }), null, 'the same routine saved 45s before the clear IS that workout');
  const other = [{ routineId: 'pull', routineName: 'Pull', finishedAt: new Date(clearedAt).toISOString() }];
  assert.ok(await getDiscardedDraft({ sessions: other }), 'a different routine saved then is not this one');
});

// 26 Sep 2026: a Begin tap after a reload built a fresh make-up session over a
// recovered one, the next upload replaced the server copy, and ten minutes of
// ticked sets existed nowhere. A different session must archive logged work.
test('a different session never writes over logged sets unarchived; restore swaps them back', async () => {
  const { getDiscardedDraft, restoreDiscardedDraft } = await import('../lib/sessionDraft.js');
  await clearSessionDraft({ reason: 'finished' });
  const worked = { routineId: 'carryover', carryoverId: 'c1', routineName: 'Upper Body — makeup', startedAt: 1000,
    exercises: [{ exerciseId: 'bench', name: 'Bench', sets: [{ weight: 75, reps: 7, done: true }, { weight: 75, reps: 6, done: true }] }] };
  await saveSessionDraft({ workoutSession: worked, capturedAt: Date.now() });
  const fresh = { ...worked, startedAt: 2000, exercises: [{ exerciseId: 'bench', name: 'Bench', sets: [{ weight: 75, reps: 7, done: false }] }] };
  const r = await saveSessionDraft({ workoutSession: fresh, capturedAt: Date.now() });
  assert.equal(r.saved, true, 'the new session still saves');
  const offered = await getDiscardedDraft();
  assert.ok(offered, 'the logged session is offered back');
  assert.equal(offered.reason, 'replaced');
  assert.equal(offered.tickedSets, 2);
  assert.equal(offered.workoutSession.startedAt, 1000);

  // the next save of the new session is not mistaken for a stale echo
  const again = await saveSessionDraft({ workoutSession: fresh, capturedAt: Date.now() - 60_000 });
  assert.equal(again.saved, true, "a 'replaced' archive is not a deliberate clear");

  // restoring brings the logged one back; the untouched one is not worth keeping
  const back = await restoreDiscardedDraft();
  assert.equal(back.workoutSession.startedAt, 1000);
  assert.equal((await getSessionDraft()).workoutSession.exercises[0].sets.filter((s) => s.done).length, 2);
  assert.equal(await getDiscardedDraft(), null, 'nothing left to offer after restoring over an untouched session');
});

test('an untouched session is replaced without an archive; the same session updates in place', async () => {
  const { getDiscardedDraft } = await import('../lib/sessionDraft.js');
  await clearSessionDraft({ reason: 'finished' });
  const a = { routineId: 'r1', routineName: 'Push', startedAt: 10, exercises: [{ exerciseId: 'x', name: 'X', sets: [{ weight: 1, reps: 1, done: false }] }] };
  await saveSessionDraft({ workoutSession: a, capturedAt: Date.now() });
  await saveSessionDraft({ workoutSession: { ...a, startedAt: 20 }, capturedAt: Date.now() });
  assert.equal(await getDiscardedDraft(), null, 'nothing logged, nothing to offer');
  const b = { ...a, startedAt: 30, exercises: [{ exerciseId: 'x', name: 'X', sets: [{ weight: 1, reps: 1, done: true }] }] };
  await saveSessionDraft({ workoutSession: b, capturedAt: Date.now() });
  b.exercises[0].sets.push({ weight: 1, reps: 2, done: true });
  await saveSessionDraft({ workoutSession: b, capturedAt: Date.now() });
  assert.equal(await getDiscardedDraft(), null, 'ticking more sets in the same session archives nothing');
});
