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

import { listCarryovers, addCarryover, removeCarryover, rescheduleCarryover } from './workoutCarryover.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const PLANNED_AS_DAY = 'day';

// Same rule workoutCarryover.sameRoutine uses: id when both sides have one,
// name otherwise. A carry-over written without an id still has to be found.
export function sameRoutineAs(carryover, routine) {
  if (!carryover || !routine) return false;
  if (carryover.sourceRoutineId && routine.id) return carryover.sourceRoutineId === routine.id;
  return String(carryover.sourceRoutineName || '') === String(routine.name || '');
}

// A LOGGED SESSION THAT FINISHED PART OF `routine` AS A MAKE-UP (26 Sep 2026).
//
// His report: "I completed the upper body makeup session but now the
// calendar has defaulted back to leg day. Every time I choose upper body
// makeup it creates the makeup session again." The make-up row is removed
// when the session is filed, and the filed session was named "Upper Body —
// makeup" under routineId 'carryover' with no link back to Upper Body. So
// nothing remembered the day was made up, and re-choosing the make-up
// derived leftovers from Friday's Upper Body again — the four exercises he
// had just done. A finished make-up now carries sourceRoutineId/Name; before
// that, its display name is the only link, so that is matched too.
export function isMakeupOf(session, routine) {
  if (!session || !routine) return false;
  if (session.sourceRoutineId && routine.id) return session.sourceRoutineId === routine.id;
  if (session.sourceRoutineName) return session.sourceRoutineName === routine.name;
  return session.routineId === 'carryover' && session.routineName === `${routine.name} — makeup`;
}

// The make-ups FINISHED on a date: [{ routineId, routineName, sessionId,
// exerciseCount, setCount }]. The session is the record; nothing else needed.
export function madeUpOn(date, sessions = [], routines = []) {
  const out = [];
  for (const s of sessions) {
    if (s.date !== date) continue;
    const r = routines.find((x) => isMakeupOf(s, x));
    if (!r) continue;
    out.push({
      routineId: r.id, routineName: r.name, sessionId: s.id || null,
      exerciseCount: (s.exercises || []).length,
      setCount: (s.exercises || []).reduce((n, e) => n + (Array.isArray(e.sets) ? e.sets.length : 0), 0),
    });
  }
  return out;
}

// EVERYTHING FILED ON A DATE, in the order he did it (3 Oct 2026).
//
// His report: "technically I finished the full arms and delts session, make
// up pull and the make up upper body (just chose to not complete the final
// two makeup exercises). So this screen should be reflecting that and not
// only partial data." The Done Today card led with ONE make-up and hid the
// rest behind "+ 2 more", and the week row read "Made up Upper Body · 1
// done", which says partial when the make-up was finished by his choice.
//
// So each session filed that day comes back with what it was: a make-up
// names the routine it finished, and what that routine still had undone
// after it (`leftOff`) is reported as HIS CHOICE, never as owed work. The
// carry-over row is removed when a make-up is filed (App.finishWorkoutSession),
// so nothing re-offers those exercises; the one exception is work he pushed
// on again from the finish screen, which sits in a carry-over row and is
// named as `carried` with its date, because then it IS still planned.
//
// Pure: the caller hands in the sessions (any order), the routines, the
// routine scheduled for that date and the carry-over rows.
export function doneOn(date, sessions = [], routines = [], { scheduledRoutine = null, carryovers = [] } = {}) {
  const filed = sessions
    .filter((s) => s && s.date === date)
    .sort((a, b) => String(a.finishedAt || '').localeCompare(String(b.finishedAt || '')));
  return filed.map((s) => {
    const r = routines.find((x) => isMakeupOf(s, x)) || null;
    const exercises = s.exercises || [];
    const entry = {
      id: s.id || null,
      name: s.routineName,
      routineId: s.routineId || null,
      finishedAt: s.finishedAt || null,
      exerciseCount: exercises.length,
      setCount: exercises.reduce((n, e) => n + (Array.isArray(e.sets) ? e.sets.length : 0), 0),
      scheduled: !!scheduledRoutine && s.routineId === scheduledRoutine.id,
      madeUp: null,
      leftOff: [],
      carried: [],
    };
    if (!r) return entry;
    entry.madeUp = { routineId: r.id, routineName: r.name };
    // what the routine still had undone once THIS make-up was in: judged
    // from the sessions up to its date, so a later day cannot rewrite it
    const upTo = sessions.filter((x) => x && String(x.date || '') <= date);
    const rest = leftoversOf(r, upTo).exercises;
    for (const e of rest) {
      const row = (carryovers || []).find((c) => sameRoutineAs(c, r) && (c.exercises || []).some((x) => x.exerciseId === e.exerciseId));
      if (row) entry.carried.push({ name: e.name, forDate: row.forDate });
      else entry.leftOff.push(e.name);
    }
    return entry;
  });
}

// overview.doneToday: the day's sessions (doneOn), the make-ups by routine
// (madeUpOn, unchanged for its readers), the totals counted once, and
// whether the scheduled routine is among them. Null when nothing was filed.
export function doneTodayOf(date, sessions = [], routines = [], { scheduledRoutine = null, carryovers = [] } = {}) {
  const filed = doneOn(date, sessions, routines, { scheduledRoutine, carryovers });
  if (!filed.length) return null;
  return {
    sessions: filed,
    madeUp: madeUpOn(date, sessions, routines),
    totals: { exercises: filed.reduce((n, s) => n + s.exerciseCount, 0), sets: filed.reduce((n, s) => n + s.setCount, 0) },
    scheduledDone: filed.some((s) => s.scheduled),
  };
}

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
  const note = (session) => {
    for (const e of session.exercises || []) {
      const count = Array.isArray(e.sets) ? e.sets.filter((s) => s.done !== false).length : Number(e.sets) || 0;
      if (count > 0 && !e.skipped) logged.add(e.exerciseId || e.name);
    }
  };
  note(done);
  // what a make-up SINCE that session finished is finished too — otherwise
  // re-choosing the make-up hands back exactly the work he just did
  const madeUp = sessions
    .filter((s) => s !== done && isMakeupOf(s, routine) && String(s.date || '') >= String(done.date || ''))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  madeUp.forEach(note);
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
    reason: exercises.length ? null : madeUp.length
      ? `your make-up on ${madeUp[0].date} finished ${routine.name} — there is nothing left to make up`
      : `you finished every exercise in that ${routine.name} session — there is nothing left to make up`,
  };
}

// Mark a date as a make-up day. Replaces any make-up already on that date, so
// changing his mind is one call and never leaves two plans for one day.
export async function setMakeupDay({ date, routine, sessions, note = '' }, deps = {}) {
  if (!DATE_RE.test(date || '')) throw new Error('date must be YYYY-MM-DD');
  const add = deps.addCarryover || addCarryover;
  const list = deps.listCarryovers || listCarryovers;
  const remove = deps.removeCarryover || removeCarryover;
  const move = deps.rescheduleCarryover || rescheduleCarryover;
  const existing = await list();

  // AN OUTSTANDING CARRY-OVER IS THE ANSWER. Do not re-derive over the top of
  // it (his report, 22 Sep 2026).
  //
  // He marked a day as a Push make-up and Nova "added exercises that wasn't
  // originally in my makeup session pushed forward from yesterday". The cause
  // was here: setMakeupDay always called leftoversOf(), which recomputes the
  // remainder from the LAST logged session of that routine — a second,
  // independent calculation that can disagree with the carry-over already
  // sitting in the store. That carry-over was written when the session
  // actually ended, from that actual session; it is the record of what he did
  // not do. Recomputing can pick a different (older) session, or a routine
  // whose exercise list has changed since, and hand him back work he has
  // already done.
  //
  // WHY THAT MATTERS MORE THAN A WRONG LIST. His words: "I don't want nova to
  // then log I skipped any exercises if I had left it but chose not to redo
  // the ones I already did yesterday." A make-up carrying exercises he
  // completed is not just noise — left in place it becomes a record that he
  // skipped them.
  //
  // So: if this routine already has debt outstanding, the make-up MOVES it.
  // One row, the real list, and the date is the only thing that changes.
  const outstanding = existing
    .filter((c) => c.plannedAs !== PLANNED_AS_DAY && sameRoutineAs(c, routine))
    .sort((a, b) => String(b.sourceDate || b.forDate || '').localeCompare(String(a.sourceDate || a.forDate || '')))[0];

  for (const c of existing) {
    if (c.forDate === date && c.plannedAs === PLANNED_AS_DAY) await remove(c.id);
  }

  if (outstanding) {
    await move(outstanding.id, date);
    // promote it to the day's plan; addCarryover merges onto the row already
    // there rather than pushing a twin (see workoutCarryover.sameRoutine)
    return add({
      forDate: date,
      sourceRoutineName: outstanding.sourceRoutineName || routine.name,
      exercises: outstanding.exercises || [],
      plannedAs: PLANNED_AS_DAY,
      sourceRoutineId: outstanding.sourceRoutineId || routine.id,
      sourceDate: outstanding.sourceDate || null,
      note: String(note || '').slice(0, 200),
    });
  }

  const { exercises, reason, sourceDate } = leftoversOf(routine, sessions);
  if (!exercises.length) throw new Error(reason || 'nothing to make up');
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
