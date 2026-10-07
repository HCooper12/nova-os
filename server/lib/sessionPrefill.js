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

// A LIFT HE HAS ONLY DONE UNDER ANOTHER NAME (7 Oct 2026). He added Lat
// Pulldown to a pull session and it came in at 0 kg × 8: every set he had
// done was logged as Wide-Grip Lat Pulldown (73 kg). A width variant (wide,
// close, narrow, neutral) moves about the same load; a reverse or underhand
// grip does not (EZ-Bar Reverse Curl is no start for an EZ-Bar Curl), so
// those words keep the lifts apart, so with no history of its own the lift starts from
// its most recent variant, and says which. Only grip and width words are
// stripped: a machine, a cable or a barbell moves different loads, and a
// one-arm version is never filled from a two-arm one (or the reverse).
const GRIP_WORDS = /\b(wide|close|narrow|neutral)(-| )?(grip|stance)?\b/g;
const ONE_SIDE = /\b(single|one)[- ](arm|leg)\b|\bunilateral\b/;
export const movementOf = (name) => String(name || '').toLowerCase().replace(GRIP_WORDS, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const hasSets = (st) => Array.isArray(st?.lastSets) && st.lastSets.some((x) => x && (Number(x.weight) > 0 || Number(x.reps) > 0));

export function variantFor(exercises, state, exerciseId) {
  const me = (exercises || []).find((e) => e.id === exerciseId);
  if (!me) return null;
  const move = movementOf(me.name);
  const oneSide = ONE_SIDE.test(String(me.name).toLowerCase());
  const candidates = (exercises || []).filter((e) => e.id !== exerciseId
    && movementOf(e.name) === move
    && ONE_SIDE.test(String(e.name).toLowerCase()) === oneSide
    && hasSets(state?.[e.id]));
  candidates.sort((a, b) => String(state[b.id].lastDate || '').localeCompare(String(state[a.id].lastDate || '')));
  return candidates[0] || null;
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
  const own = state[exerciseId] || null;
  const variant = hasSets(own) ? null : variantFor(exercises, state, exerciseId);
  const filled = prefillFor({ last: hasSets(own) ? own : (variant ? state[variant.id] : own),
    prescription: entry || (exercise.research?.repRange ? { targetSets: 3, targetRepsLow: exercise.research.repRange.low, targetRepsHigh: exercise.research.repRange.high } : null),
    progression: routine ? progressions[`${routine.id}:${exerciseId}`] || null : null, tune, marker });
  if (variant && filled.last) {
    // the sets are the variant's, said so; `last` stays this lift's own (none)
    filled.from = [`${variant.name}, last time (${state[variant.id].lastDate || 'date unknown'})`, ...filled.from.slice(1)];
    filled.last = null;
    filled.variantOf = { id: variant.id, name: variant.name };
  }
  return {
    exerciseId,
    routine: routine ? { id: routine.id, name: routine.name } : null,
    ...filled,
  };
}
