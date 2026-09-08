// MAKE-UP DAY — "today is not a Pull day; today is finishing Monday's Pull."
//
// His report, 8 Sep 2026: he moved a Pull day forward to finish a few
// exercises he did not get to, and every surface — Today's card, the morning
// brief, the training check, the Coach — recommended a STANDARD Pull session,
// because the schedule is a weekday template and nothing could say "this
// particular date is a make-up". Carry-overs already existed, but only ever as
// an ADDITION ("+ Pull round-up · 3"), never as the day's actual plan.
//
// A make-up is therefore a carry-over with `plannedAs: 'day'` — one store, one
// concept, and every existing reader of carry-overs keeps working. What is new
// is that the marked date's plan IS the make-up: the readers below lead with
// it and say plainly that the standard session is not what today is for.
//
// The leftovers are DERIVED, not typed: the routine's exercise list minus what
// the last session of that routine actually logged. If Nova cannot find that
// session it says so and carries nothing rather than inventing a list.

import { listCarryovers, addCarryover, removeCarryover } from './workoutCarryover.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const PLANNED_AS_DAY = 'day';

export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// What is left of the last session of this routine: every programmed exercise
// with no logged sets, plus anything he explicitly skipped. Pure — the caller
// hands in the routine and the sessions.
export function leftoversOf(routine, sessions = []) {
  if (!routine) return { exercises: [], reason: 'that routine is not in your plan' };
  const done = [...sessions]
    .filter((s) => s.routineId === routine.id || (s.routineName && s.routineName === routine.name))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
  if (!done) return { exercises: [], reason: `no logged ${routine.name} session to finish — nothing to carry` };
  const logged = new Set();
  for (const e of done.exercises || []) {
    const count = Array.isArray(e.sets) ? e.sets.filter((s) => s.done !== false).length : Number(e.sets) || 0;
    if (count > 0 && !e.skipped) logged.add(e.exerciseId || e.name);
  }
  const exercises = (routine.exercises || [])
    .filter((e) => !logged.has(e.exerciseId))
    .map((e) => ({
      exerciseId: e.exerciseId,
      name: e.name || e.exerciseId,
      targetSets: e.targetSets ?? 3,
      targetRepsLow: e.targetRepsLow ?? 8,
      targetRepsHigh: e.targetRepsHigh ?? 12,
    }));
  return {
    exercises,
    sourceDate: done.date || null,
    reason: exercises.length ? null : `you finished every exercise in that ${routine.name} session — there is nothing left to make up`,
  };
}

// Mark a date as a make-up day. Replaces any make-up already on that date, so
// changing his mind is one call and never leaves two plans for one day.
export async function setMakeupDay({ date, routine, sessions, note = '' }, deps = {}) {
  if (!DATE_RE.test(date || '')) throw new Error('date must be YYYY-MM-DD');
  const add = deps.addCarryover || addCarryover;
  const list = deps.listCarryovers || listCarryovers;
  const remove = deps.removeCarryover || removeCarryover;
  const { exercises, reason, sourceDate } = leftoversOf(routine, sessions);
  if (!exercises.length) throw new Error(reason || 'nothing to make up');
  for (const c of await list()) {
    if (c.forDate === date && c.plannedAs === PLANNED_AS_DAY) await remove(c.id);
  }
  const record = await add({
    forDate: date,
    sourceRoutineName: routine.name,
    exercises,
    plannedAs: PLANNED_AS_DAY,
    sourceRoutineId: routine.id,
    sourceDate: sourceDate || null,
    note: String(note || '').slice(0, 200),
  });
  return record;
}

export async function clearMakeupDay(date, deps = {}) {
  const list = deps.listCarryovers || listCarryovers;
  const remove = deps.removeCarryover || removeCarryover;
  let removed = 0;
  for (const c of await list()) {
    if (c.forDate === date && c.plannedAs === PLANNED_AS_DAY) { await remove(c.id); removed++; }
  }
  return { removed };
}

// The make-up planned FOR this date, if any. Only 'day' carry-overs count —
// ordinary debt waiting on that date is still just debt.
export async function makeupFor(date, deps = {}) {
  const list = deps.listCarryovers || listCarryovers;
  return (await list()).find((c) => c.forDate === date && c.plannedAs === PLANNED_AS_DAY) || null;
}

// One sentence every surface uses, so Today's card, the brief, the training
// check and the Coach cannot tell him different stories about the same day.
export function makeupLine(makeup, { scheduledName = null } = {}) {
  if (!makeup) return null;
  const names = (makeup.exercises || []).map((e) => e.name);
  const list = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
  const from = makeup.sourceDate ? ` from ${makeup.sourceDate}` : '';
  const instead = scheduledName && scheduledName !== makeup.sourceRoutineName
    ? ` (not the scheduled ${scheduledName})`
    : scheduledName ? ' — not a full session' : '';
  return `MAKE-UP DAY${instead}: finishing ${makeup.sourceRoutineName}${from} — ${names.length} exercise${names.length === 1 ? '' : 's'} left: ${list}.`;
}

// The block agents get. Says what today is FOR and, just as importantly, what
// it is not — the whole point of his report.
export async function makeupContext(now = new Date(), deps = {}) {
  const m = await makeupFor(todayIso(now), deps).catch(() => null);
  if (!m) return null;
  return `TODAY IS A MAKE-UP DAY, by his own plan. ${makeupLine(m)} Do NOT program or recommend a full session today, and do not treat the day's scheduled routine as the plan — the work is finishing the exercises listed above. Volume, recovery and progression advice should reflect that shorter session.`;
}
