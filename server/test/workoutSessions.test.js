// Session completion honesty + history editing — temp vault BEFORE imports.
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-sessions-vault-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { completeSession, updateSession, deleteSession, loadSessions } = await import('../lib/workoutSessions.js');
const { loadExerciseState } = await import('../lib/exerciseState.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
});

test('unticked sets and skipped exercises leave NO trace in the saved record', async () => {
  const session = await completeSession(vault, {
    routineId: 'push', routineName: 'Push',
    exercises: [
      { exerciseId: 'bench', name: 'Bench Press', sets: [
        { weight: 80, reps: 8, done: true },
        { weight: 80, reps: 8, done: true },
        { weight: 80, reps: 8, done: false }, // prefilled, never attempted
      ] },
      { exerciseId: 'ohp', name: 'Overhead Press', sets: [ // skipped for time
        { weight: 50, reps: 8, done: false },
        { weight: 50, reps: 8, done: false },
      ] },
      { exerciseId: 'dips', name: 'Dips', sets: [{ weight: 0, reps: 12, rpe: 8.5, done: true }] },
    ],
  });
  assert.deepEqual(session.exercises.map((e) => e.exerciseId), ['bench', 'dips'], 'skipped exercise absent');
  assert.equal(session.exercises[0].sets.length, 2, 'unticked set absent');
  assert.equal(session.exercises[1].sets[0].rpe, 8.5, 'optional RPE survives the save');
  assert.equal(session.exercises[0].sets[0].rpe, undefined, 'absent RPE stays absent, never invented');

  // exercise-state prefill only knows about what actually happened
  const state = await loadExerciseState(vault);
  assert.ok(state.bench);
  assert.equal(state.ohp, undefined);

  // an all-unticked session refuses to save at all
  await assert.rejects(() => completeSession(vault, {
    routineId: 'push', routineName: 'Push',
    exercises: [{ exerciseId: 'bench', name: 'Bench Press', sets: [{ weight: 80, reps: 8, done: false }] }],
  }), /no logged sets/);
});

test('editing a session rewrites the record and rebuilds last-performed prefills', async () => {
  const [saved] = await loadSessions(vault);
  const updated = await updateSession(vault, saved.id, {
    exercises: [
      { exerciseId: 'bench', name: 'Bench Press', sets: [{ weight: 80, reps: 8, done: true }] }, // dropped a set
      // dips removed entirely — it turns out it never happened
    ],
  });
  assert.equal(updated.exercises.length, 1);
  assert.equal(updated.exercises[0].sets.length, 1);
  assert.equal(updated.id, saved.id, 'identity preserved');
  assert.equal(updated.date, saved.date, 'date preserved');

  const [reloaded] = await loadSessions(vault);
  assert.equal(reloaded.exercises.length, 1);

  const state = await loadExerciseState(vault);
  assert.equal(state.dips, undefined, 'prefill rebuilt from the edited history');
  assert.equal(state.bench.lastSets.length, 1);

  await assert.rejects(() => updateSession(vault, saved.id, { exercises: [] }), /at least one exercise|no sets left/);
  await assert.rejects(() => updateSession(vault, 'nope', { exercises: [{ exerciseId: 'x', name: 'X', sets: [{ weight: 1, reps: 1 }] }] }), /session not found/);
});

test('deleting a session removes the file and recomputes state from what remains', async () => {
  const second = await completeSession(vault, {
    routineId: 'push', routineName: 'Push',
    exercises: [{ exerciseId: 'bench', name: 'Bench Press', sets: [{ weight: 82.5, reps: 8, done: true }] }],
  });
  assert.equal((await loadExerciseState(vault)).bench.lastSets[0].weight, 82.5);

  await deleteSession(vault, second.id);
  assert.equal((await loadSessions(vault)).length, 1);
  // prefill falls back to the older session's numbers
  assert.equal((await loadExerciseState(vault)).bench.lastSets[0].weight, 80);

  const files = await readdir(path.join(vault, 'Wiki/Health/Workouts'));
  assert.equal(files.filter((f) => f.endsWith('.md')).length, 1);
});

test('a discarded session cannot be resurrected by an in-flight draft echo', async () => {
  // drafts live in NOVA_DATA_DIR — point it at scratch so the test never
  // touches the real server/data (dataRoot() reads env at call time)
  const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-draft-data-'));
  const priorDataDir = process.env.NOVA_DATA_DIR;
  process.env.NOVA_DATA_DIR = dataDir;
  try {
  const { saveSessionDraft, getSessionDraft, clearSessionDraft } = await import('../lib/sessionDraft.js');
  const ws = { routineId: 'push', routineName: 'Push', exercises: [{ exerciseId: 'bench', sets: [] }] };
  const before = Date.now() - 5000;
  await saveSessionDraft({ workoutSession: ws, capturedAt: before });
  assert.ok(await getSessionDraft(), 'draft saved');
  await clearSessionDraft(); // he discarded — deliberate
  // the stale echo: an upload captured BEFORE the discard lands late
  const echo = await saveSessionDraft({ workoutSession: ws, capturedAt: before });
  assert.equal(echo.saved, false, 'stale echo dropped');
  assert.equal(await getSessionDraft(), null, 'no ghost session');
  // a genuinely NEW session after the clear still saves
  const fresh = await saveSessionDraft({ workoutSession: ws, capturedAt: Date.now() + 1 });
  assert.equal(fresh.saved, true);
  await clearSessionDraft();
  } finally {
    if (priorDataDir === undefined) delete process.env.NOVA_DATA_DIR; else process.env.NOVA_DATA_DIR = priorDataDir;
    await rm(dataDir, { recursive: true, force: true });
  }
});
