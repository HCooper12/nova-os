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
