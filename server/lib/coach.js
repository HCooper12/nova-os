import { loadSessions } from './workoutSessions.js';

// Coach's progression engine — pure deterministic rules over logged history,
// per the agents plan: it only ever changes SUGGESTED numbers (session
// prefill + a visible chip); the human logs what actually happened, and
// nothing here writes a file.
//
// Rule: an exercise earns a progression when its last two logged sessions
// both "topped out" — at least the routine's target set count, with every
// set at or above the target-high reps. Weighted movements progress by
// +2.5kg; bodyweight movements progress by +1 rep. Time-based tracking types
// are left alone (no honest deterministic rule for them yet).

export const WEIGHT_STEP_KG = 2.5;
const WEIGHTED_TYPES = new Set(['weight_reps', 'weighted_bodyweight_reps']);
const BODYWEIGHT_TYPES = new Set(['bodyweight_reps']);

function toppedOut(sessionExercise, entry) {
  const sets = sessionExercise.sets || [];
  if (sets.length < entry.targetSets) return false;
  return sets.every((s) => (Number(s.reps) || 0) >= entry.targetRepsHigh);
}

// routines: the resolved routines from loadRoutines (entries carry
// exerciseId/trackingType/targetSets/targetRepsHigh). Returns a map keyed
// `${routineId}:${exerciseId}` → { kind, delta, evidence }.
export async function computeProgressions(vaultPath, routines) {
  const sessions = await loadSessions(vaultPath); // newest first
  const out = {};

  for (const routine of routines) {
    for (const entry of routine.exercises) {
      if (!WEIGHTED_TYPES.has(entry.trackingType) && !BODYWEIGHT_TYPES.has(entry.trackingType)) continue;

      const recent = [];
      for (const s of sessions) {
        const ex = s.exercises.find((e) => e.exerciseId === entry.exerciseId);
        if (ex && ex.sets?.length) recent.push(ex);
        if (recent.length === 2) break;
      }
      if (recent.length < 2) continue;
      if (!recent.every((ex) => toppedOut(ex, entry))) continue;

      const lastWeight = Math.max(...recent[0].sets.map((s) => Number(s.weight) || 0));
      if (WEIGHTED_TYPES.has(entry.trackingType)) {
        out[`${routine.id}:${entry.exerciseId}`] = {
          kind: 'weight',
          delta: WEIGHT_STEP_KG,
          evidence: `hit ${entry.targetRepsHigh}+ reps across all sets twice running${lastWeight ? ` at ${lastWeight}kg` : ''}`,
        };
      } else {
        out[`${routine.id}:${entry.exerciseId}`] = {
          kind: 'reps',
          delta: 1,
          evidence: `topped ${entry.targetRepsHigh} reps on every set twice running`,
        };
      }
    }
  }
  return out;
}
