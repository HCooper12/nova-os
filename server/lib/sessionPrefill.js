// THE EXTRA LIFT STARTS WHERE HE LEFT IT (25 Sep 2026).
//
// His report, mid-session: he added Face Pull as an extra and it arrived as
// 0 kg × 8, three times, when he had done 29.5 kg × 11, 10, 10 on the 16th
// and Coach had a view on what comes next. An extra exercise is still his
// exercise: it gets the same start a planned one does in startWorkoutSession
// (App.jsx): last time's sets, nudged by the progression Coach has earned
// for it, the prescription and focus it carries in his program, and a start
// weight Coach set when it put the lift there. Only a lift he has never done
// and no routine holds starts from the house default, honestly empty.
//
// Last time's sets come from the exercise state, which is kept per exercise
// and so is true whichever routine or day the lift appears on.

import { loadExerciseLibrary } from './exercises.js';
import { loadRoutines } from './workouts.js';
import { loadExerciseState } from './exerciseState.js';

const DEFAULT = { targetSets: 3, targetRepsLow: 8, targetRepsHigh: 12 };

// Pure. `progression` is computeProgressions' entry for this lift in the
// routine that holds it; a 'weight' or 'reps' step nudges the prefill, a
// 'quality' or 'outgrown' one changes no number (the point is the same load
// done better), exactly as a planned exercise is treated.
export function prefillFor({ last = null, prescription = null, progression = null, tune = null, marker = null } = {}) {
  const targetSets = Number(prescription?.targetSets) || DEFAULT.targetSets;
  const targetRepsLow = Number(prescription?.targetRepsLow) || DEFAULT.targetRepsLow;
  const targetRepsHigh = Number(prescription?.targetRepsHigh) || Math.max(targetRepsLow, DEFAULT.targetRepsHigh);
  const lastSets = Array.isArray(last?.lastSets) ? last.lastSets.filter((s) => s && (Number(s.weight) > 0 || Number(s.reps) > 0)) : [];
  let sets = lastSets.length
    ? lastSets.map((s) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0, done: false }))
    : Array.from({ length: targetSets }, () => ({ weight: Number(marker?.startWeightKg) || 0, reps: targetRepsLow, done: false }));
  const step = Number(progression?.delta);
  const nudges = lastSets.length && Number.isFinite(step) && step !== 0 && (progression?.kind === 'weight' || progression?.kind === 'reps');
  if (nudges) {
    sets = sets.map((s) => (progression.kind === 'weight'
      ? { ...s, weight: Math.round((s.weight + step) * 10) / 10 }
      : { ...s, reps: s.reps + step }));
  }
  const from = [];
  if (lastSets.length) from.push(`last time (${last.lastDate || 'date unknown'})`);
  if (nudges) from.push(`Coach's ${progression.kind === 'weight' ? `+${step}kg` : `+${step} rep`}`);
  if (!lastSets.length && Number(marker?.startWeightKg) > 0) from.push(`Coach's start weight`);
  return {
    targetSets, targetRepsLow, targetRepsHigh, sets,
    coach: progression || null,
    last: lastSets.length ? { date: last.lastDate || null, sets: lastSets.map((s) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 })) } : null,
    focusNote: tune?.focus || progression?.focus || null,
    from,
  };
}

// The routine that holds this lift, for its prescription and progression:
// one with an earned progression first, then any.
export function routineFor(routines, exerciseId, progressions = {}) {
  const holding = (routines || []).filter((r) => (r.exercises || []).some((e) => e.exerciseId === exerciseId));
  return holding.find((r) => progressions[`${r.id}:${exerciseId}`]) || holding[0] || null;
}

export async function buildPrefill(vaultPath, exerciseId) {
  const { exercises } = await loadExerciseLibrary(vaultPath);
  const exercise = exercises.find((e) => e.id === exerciseId);
  if (!exercise) throw new Error('no such exercise');
  const [{ routines }, state] = await Promise.all([loadRoutines(vaultPath, exercises), loadExerciseState(vaultPath)]);
  const { computeProgressions } = await import('./coach.js');
  const progressions = await computeProgressions(vaultPath, routines).catch(() => ({}));
  const routine = routineFor(routines, exerciseId, progressions);
  const entry = routine?.exercises.find((e) => e.exerciseId === exerciseId) || null;
  const { getTunes } = await import('./progressionTunes.js');
  const tune = (await getTunes(vaultPath).catch(() => [])).find((t) => t.exerciseId === exerciseId) || null;
  const { readMarkers } = await import('./coachPlan.js');
  const marker = routine ? ((await readMarkers().catch(() => ({})))[`${routine.id}:${exerciseId}`] || null) : null;
  return {
    exerciseId,
    routine: routine ? { id: routine.id, name: routine.name } : null,
    // no routine holds it: the rep range Coach's research found for the lift
    ...prefillFor({ last: state[exerciseId] || null,
      prescription: entry || (exercise.research?.repRange ? { targetSets: 3, targetRepsLow: exercise.research.repRange.low, targetRepsHigh: exercise.research.repRange.high } : null),
      progression: routine ? progressions[`${routine.id}:${exerciseId}`] || null : null, tune, marker }),
  };
}
