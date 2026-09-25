// RE-FILE AN EXERCISE UNDER ANOTHER MUSCLE, ON HIS WORD (25 Sep 2026).
//
// "The reverse EZ bar curl keeps coming up as biceps where it should be
// forearms." It kept coming up because the only way to re-file an exercise
// was a Coach card he approved, so a lift filed wrong once stayed wrong, and
// every surface that reads the library reasoned from it: the bars counted
// its sets as biceps, and on 15 Sep Coach proposed swapping it for a barbell
// curl "to let biceps see a different stimulus".
//
// Every past set moves with the exercise (volume reads the library at query
// time), so this is a write worth being able to take back. It files through
// the inbox's own 'exercise-remap' route as a filed record whose undo puts
// the exercise back where it was: one tap in the Inbox.

import { randomUUID } from 'node:crypto';
import { loadExerciseLibrary, MUSCLE_GROUPS } from './exercises.js';
import { fileDecision } from './inbox.js';
import { createRecord, updateRecord } from './inboxStore.js';

export async function refileExercise(vaultPath, id, muscleGroup, { source = 'train' } = {}) {
  const group = String(muscleGroup || '').trim();
  if (!MUSCLE_GROUPS.includes(group)) throw new Error(`muscleGroup must be one of: ${MUSCLE_GROUPS.join(', ')}`);
  const { exercises } = await loadExerciseLibrary(vaultPath);
  const exercise = exercises.find((e) => e.id === id);
  if (!exercise) throw new Error('no such exercise');
  const before = exercise.muscleGroup || 'Other';
  if (before === group) return { unchanged: true, exercise, before, record: null };

  const decision = {
    route: 'exercise-remap',
    confidence: 'high',
    title: `Re-file ${exercise.name} under ${group} (was ${before})`,
    reason: 'his correction',
    payload: { exerciseId: id, muscleGroup: group, before },
  };
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    text: decision.title,
    source,
    mode: 'auto',
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision,
  });
  try {
    const { destination, undo } = await fileDecision(vaultPath, decision);
    const filed = await updateRecord(record.id, { status: 'filed', destination, undoData: undo, filedAt: new Date().toISOString(), auto: true, error: null });
    return { unchanged: false, exercise: { ...exercise, muscleGroup: group }, before, record: filed };
  } catch (e) {
    // a failed write says so on its record, never a silent pending card
    await updateRecord(record.id, { status: 'error', error: e.message }).catch(() => {});
    throw e;
  }
}
