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

/* ---------------------------- deload advisory ---------------------------- */

// Recovery-aware deload signal — pure arithmetic over recent health days,
// honest about thin data, and ADVISORY only (a line in the brief and the
// Coach's context; nothing changes any plan by itself).
export function computeDeloadSignal(healthDays) {
  const withHrv = (healthDays || []).filter((d) => d.hrv != null);
  if (withHrv.length < 5) {
    return { advise: false, reason: `not enough recovery data (${withHrv.length}/7 days with HRV)` };
  }
  const recent = withHrv.slice(-3);
  const baseline = withHrv.slice(0, -3);
  const avg = (list, key) => list.reduce((s, d) => s + d[key], 0) / list.length;
  const hrvDrop = baseline.length ? (avg(baseline, 'hrv') - avg(recent, 'hrv')) / avg(baseline, 'hrv') : 0;

  const withSleep = (healthDays || []).filter((d) => d.sleepAsleepMinutes != null);
  const recentSleep = withSleep.slice(-3);
  const sleepShort = recentSleep.length >= 3 && avg(recentSleep, 'sleepAsleepMinutes') < 360;

  if (hrvDrop >= 0.1) {
    return { advise: true, reason: `HRV is down ${Math.round(hrvDrop * 100)}% on your baseline over the last 3 days — a lighter session (−15% loads, stop 2-3 reps short) protects the trend` };
  }
  if (sleepShort) {
    return { advise: true, reason: 'under 6h sleep three nights running — cap intensity today and bank an early night' };
  }
  return { advise: false, reason: 'recovery trend looks steady' };
}

/* --------------------------- quick sessions ------------------------------ */

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Turn the Coach's JSON plan into session-editor exercises: map names onto
// the real library (so history and prefills attach), fall back to ad-hoc
// entries for genuinely new movements. Pure and exported for tests.
export function normalizeQuickPlan(plan, libraryExercises, exerciseState = {}) {
  const name = String(plan?.name || '').trim().slice(0, 60);
  const rationale = String(plan?.rationale || '').trim().slice(0, 300);
  const raw = Array.isArray(plan?.exercises) ? plan.exercises : [];
  if (!name || !raw.length) throw new Error('the plan came back incomplete — try again');

  const byName = new Map(libraryExercises.map((e) => [e.name.toLowerCase(), e]));
  const exercises = raw.slice(0, 10).map((x) => {
    const xName = String(x?.name || '').trim().slice(0, 80);
    if (!xName) return null;
    const sets = Math.min(8, Math.max(1, Number(x.sets) || 3));
    const reps = Math.min(50, Math.max(1, Number(x.reps) || 10));
    const tokens = (s) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const want = tokens(xName);
    const lib = byName.get(xName.toLowerCase())
      || libraryExercises.find((e) => e.name.toLowerCase().includes(xName.toLowerCase()) || xName.toLowerCase().includes(e.name.toLowerCase()))
      // token subset: "chest supported row" matches "Chest-Supported Dumbbell Row"
      || libraryExercises.find((e) => {
        const have = tokens(e.name);
        return want.size >= 2 && [...want].every((t) => have.has(t));
      });
    const state = lib ? exerciseState[lib.id] : null;
    const lastWeight = state?.lastSets?.length ? Math.max(...state.lastSets.map((s) => Number(s.weight) || 0)) : 0;
    return {
      exerciseId: lib ? lib.id : `adhoc-${slug(xName)}`,
      name: lib ? lib.name : xName,
      muscleGroup: lib?.muscleGroup || '',
      trackingType: lib?.trackingType || 'weight_reps',
      targetSets: sets,
      targetRepsLow: reps,
      targetRepsHigh: reps,
      coach: null,
      weightHint: String(x.weightHint || '').slice(0, 40) || null,
      adhoc: !lib,
      sets: Array.from({ length: sets }, () => ({ weight: lastWeight, reps, done: false })),
    };
  }).filter(Boolean);
  if (!exercises.length) throw new Error('the plan had no usable exercises');
  return { name, rationale, exercises };
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
