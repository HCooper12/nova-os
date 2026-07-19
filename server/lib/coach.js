import { randomUUID } from 'node:crypto';
import { loadSessions } from './workoutSessions.js';
import { createRecord } from './inboxStore.js';

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

/* --------------------------- session summary ----------------------------- */

const volumeOf = (session) => Math.round(session.exercises.reduce((v, e) => v + e.sets.reduce((s, x) => s + x.weight * x.reps, 0), 0));

// One deterministic line the moment a workout is logged — the receipt a
// good coach hands you on the way out. Drafted to the journal via the rails.
export async function draftSessionSummary(vaultPath, session) {
  const previous = (await loadSessions(vaultPath, { routineId: session.routineId, limit: 3 }))
    .filter((s) => s.id !== session.id)[0] || null;

  const sets = session.exercises.reduce((n, e) => n + e.sets.length, 0);
  const volume = volumeOf(session);
  const bits = [`${session.routineName} logged — ${session.exercises.length} exercise${session.exercises.length === 1 ? '' : 's'}, ${sets} sets, ${volume.toLocaleString()}kg volume`];

  if (previous) {
    const prevVol = volumeOf(previous);
    if (prevVol > 0) {
      const delta = Math.round(((volume - prevVol) / prevVol) * 100);
      bits[0] += ` (${delta >= 0 ? '+' : ''}${delta}% on ${previous.date})`;
    }
    const prevTop = new Map(previous.exercises.map((e) => [e.exerciseId, Math.max(...e.sets.map((s) => s.weight))]));
    const ups = session.exercises
      .filter((e) => prevTop.has(e.exerciseId) && Math.max(...e.sets.map((s) => s.weight)) > prevTop.get(e.exerciseId))
      .map((e) => `${e.name} ${prevTop.get(e.exerciseId)}→${Math.max(...e.sets.map((s) => s.weight))}kg`);
    if (ups.length) bits.push(`Loads up: ${ups.join(', ')}.`);
  } else {
    bits.push('First logged session for this routine — the baseline is set.');
  }

  const title = `Session — ${session.routineName} ${session.date}`;
  const record = {
    id: randomUUID().slice(0, 8),
    kind: 'coach',
    text: title,
    source: 'coach',
    mode: 'draft',
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision: {
      route: 'journal',
      confidence: 'high',
      title,
      reason: 'Coach’s deterministic session receipt — approve to journal it.',
      payload: { text: bits.join(' ') + (bits.length === 1 ? '.' : '') },
    },
  };
  await createRecord(record);
  return record;
}
