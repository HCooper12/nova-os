// TODAY ONLY, on the floor (15 Oct 2026). server/lib/trainToday.js keeps one
// day's changes to one routine, set by his yes on a Coach card. Starting that
// routine today runs its session entries through here: a skip arrives
// skipped (one tap puts it back), a swap arrives as the other lift with its
// own last sets, an add arrives as an extra, a new dose arrives as the
// prefill. Every touched entry carries `todayOnly` so the session says so.
// The routine itself is never touched, so tomorrow there is nothing to undo.

const pad = (n) => String(n).padStart(2, '0');
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The plan, if it is for this routine and for today; otherwise null.
export function todayPlanFor(plan, routineId, now = new Date()) {
  if (!plan || plan.cleared || plan.date !== localDay(now)) return null;
  return plan.routineId === routineId ? plan : null;
}

function dosed(sets, c, fallbackReps) {
  const n = c.targetSets || sets.length || 3;
  const reps = c.targetRepsLow || null;
  const base = sets.length ? sets : [{ weight: 0, reps: fallbackReps || reps || 8 }];
  return Array.from({ length: n }, (_, i) => {
    const s = base[Math.min(i, base.length - 1)];
    return { weight: c.weightKg ?? s.weight ?? 0, reps: reps ?? s.reps, done: false };
  });
}

const label = (c) => {
  const reps = c.targetRepsLow && c.targetRepsHigh && c.targetRepsLow !== c.targetRepsHigh ? `${c.targetRepsLow}–${c.targetRepsHigh}` : c.targetRepsLow || null;
  return [c.weightKg ? `${c.weightKg} kg` : null, c.targetSets && reps ? `${c.targetSets} × ${reps}` : null, c.note].filter(Boolean).join(', ') || null;
};

// entries: the session exercises startWorkoutSession built from the routine.
export function applyTrainToday(entries, plan) {
  if (!plan) return entries;
  const byId = new Map((plan.changes || []).filter((c) => c.exerciseId).map((c) => [c.exerciseId, c]));
  const out = entries.map((e) => {
    const c = byId.get(e.exerciseId);
    if (!c) return e;
    if (c.op === 'skip') return { ...e, skipped: true, todayOnly: 'Skipped today' };
    if (c.op === 'swap') {
      const sets = c.prefill?.sets?.length ? c.prefill.sets : [];
      return {
        exerciseId: c.toExerciseId, name: c.toName, muscleGroup: c.muscleGroup || e.muscleGroup, trackingType: c.trackingType || e.trackingType,
        targetSets: c.targetSets || e.targetSets, targetRepsLow: c.targetRepsLow || e.targetRepsLow, targetRepsHigh: c.targetRepsHigh || e.targetRepsHigh,
        coach: null, last: c.prefill?.last || null, focusNote: c.note || null, startFrom: null,
        sets: dosed(sets, c, e.targetRepsLow),
        todayOnly: `Instead of ${c.name} today`,
      };
    }
    return {
      ...e,
      targetSets: c.targetSets || e.targetSets, targetRepsLow: c.targetRepsLow || e.targetRepsLow, targetRepsHigh: c.targetRepsHigh || e.targetRepsHigh,
      coach: null, // today's dose replaces the progression nudge, said on the tag
      focusNote: c.note || e.focusNote,
      sets: dosed(e.sets.map((s) => ({ weight: s.weight, reps: s.reps })), c, e.targetRepsLow),
      todayOnly: `Today: ${label(c) || 'adjusted'}`,
    };
  });
  for (const c of plan.changes || []) {
    if (c.op !== 'add') continue;
    out.push({
      exerciseId: c.toExerciseId, name: c.toName, muscleGroup: c.muscleGroup, trackingType: c.trackingType,
      targetSets: c.targetSets || 3, targetRepsLow: c.targetRepsLow || 8, targetRepsHigh: c.targetRepsHigh || c.targetRepsLow || 12,
      coach: null, last: c.prefill?.last || null, focusNote: c.note || null,
      adhoc: true, sets: dosed(c.prefill?.sets || [], c, 8), todayOnly: 'Added for today',
    });
  }
  return out;
}

// One line per change, for Train and Home: what today's session will be.
export function todayLines(plan) {
  return (plan?.changes || []).map((c) => (
    c.op === 'skip' ? `Skip ${c.name}`
      : c.op === 'swap' ? `${c.toName} instead of ${c.name}${label(c) ? `, ${label(c)}` : ''}`
        : c.op === 'add' ? `Add ${c.toName}${label(c) ? `, ${label(c)}` : ''}`
          : `${c.name}: ${label(c) || 'adjusted'}`));
}
