// "N OF M DONE", COUNTED PER WORKOUT (mockup 104, his answers 26 Oct 2026).
//
//   - Each planned workout counts once. A date holding two (a day plan,
//     lib/extraWorkouts.js) counts as two.
//   - An ACTIVE-REST day is planned too, and an Apple Health cardio workout
//     of at least 15 minutes that date ticks it (lib/healthWorkouts.js
//     countsForActiveRest). On a training day the walk is shown beside the
//     session and never stands in for it.
//   - A filed session fulfils the slot it names (its routine id, a make-up's
//     source, then its name). One that names no slot of the day fills the
//     next open one, because a swap on the floor is still the day's work.
//
// Pure and deterministic: the caller hands in the clock and every record,
// so the counting is tested in server/test/weekCount.test.js and read the
// same way by every surface.

import { ACTIVE_REST } from './workouts.js';

export const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };

const minutesOf = (w) => Number(w?.minutesExact ?? w?.minutes) || 0;

/**
 * @param start        the Monday of the week, YYYY-MM-DD
 * @param today        YYYY-MM-DD
 * @param schedule     weekday → routine id | 'active-rest' | absent
 * @param routines     [{ id, name }] (live routines)
 * @param dayPlans     [{ date, routineIds }] (lib/extraWorkouts.js)
 * @param makeups      carry-overs with plannedAs 'day' [{ forDate, sourceRoutineId, sourceRoutineName }]
 * @param sessions     filed sessions [{ date, routineId, routineName, sourceRoutineId?, sourceRoutineName? }]
 * @param cardio       Apple Health workouts [{ date, type, minutes, minutesExact?, ... }]
 * @param counts       w → bool, the active-rest rule (countsForActiveRest)
 * @param isCardio     w → bool, any cardio at all (shown even when short)
 */
export function weekCount({ start, today, schedule = {}, routines = [], dayPlans = [], makeups = [], sessions = [], cardio = [], counts = () => false, isCardio = () => false }) {
  const byId = new Map(routines.map((r) => [r.id, r]));
  const days = WEEK_DAYS.map((day, i) => {
    const date = addDays(start, i);
    const isPast = date < today;
    const isToday = date === today;
    const plan = dayPlans.find((p) => p.date === date && (p.routineIds || []).length >= 2);
    const makeup = makeups.find((m) => m.forDate === date);
    let slots = [];
    if (plan) {
      slots = plan.routineIds.map((id) => byId.get(id)).filter(Boolean).map((r) => ({ kind: 'routine', routineId: r.id, name: r.name }));
    } else if (makeup) {
      slots = [{ kind: 'routine', routineId: makeup.sourceRoutineId || null, name: `${makeup.sourceRoutineName} make-up`, makeup: true, sourceName: makeup.sourceRoutineName }];
    } else if (schedule[day] === ACTIVE_REST) {
      slots = [{ kind: 'active-rest', routineId: null, name: 'Active rest' }];
    } else if (schedule[day] && byId.has(schedule[day])) {
      const r = byId.get(schedule[day]);
      slots = [{ kind: 'routine', routineId: r.id, name: r.name }];
    }
    slots = slots.map((s) => ({ ...s, done: false }));

    // what happened: nothing on a day still ahead counts, whatever the input says
    const filed = date <= today ? sessions.filter((s) => s?.date === date) : [];
    const ws = date <= today ? cardio.filter((w) => w?.date === date && isCardio(w)) : [];
    const used = new Set();
    const fits = (s, slot) => slot.kind === 'routine' && (
      (slot.routineId && (s.routineId === slot.routineId || s.sourceRoutineId === slot.routineId))
      || (slot.makeup && (s.sourceRoutineName === slot.sourceName || s.routineName === `${slot.sourceName} — makeup`))
      || (!slot.makeup && s.routineName && s.routineName === slot.name));
    for (const slot of slots) {
      const k = filed.findIndex((s, j) => !used.has(j) && fits(s, slot));
      if (k >= 0) { used.add(k); slot.done = true; }
    }
    // a session that named no slot fills the next open one (a swap is still the day's work)
    filed.forEach((s, j) => {
      if (used.has(j)) return;
      const open = slots.find((x) => !x.done);
      if (open) { open.done = true; used.add(j); }
    });
    // the walk: the longest cardio of the day; it ticks only an active-rest slot
    const walk = [...ws].sort((a, b) => minutesOf(b) - minutesOf(a))[0] || null;
    const qualifies = !!walk && counts(walk);
    const ar = slots.find((x) => x.kind === 'active-rest' && !x.done);
    if (ar && qualifies) { ar.done = true; ar.byWalk = true; }

    const plannedCount = slots.length;
    const doneCount = slots.filter((x) => x.done).length;
    const extraSessions = filed.length - used.size;
    let state;
    if (plannedCount && doneCount === plannedCount) state = 'done';
    else if (!plannedCount && extraSessions > 0) state = 'done';
    else if (doneCount > 0) state = 'partial';
    else if (!plannedCount) state = 'rest';
    else if (isToday) state = 'today';
    else if (isPast) state = 'missed';
    else state = 'planned';
    return {
      day, date, isToday, isPast, slots, plannedCount, doneCount, state,
      walk: walk ? walkOf(walk, { qualifies, counted: !!slots.find((x) => x.byWalk), dayKind: slots.some((x) => x.kind === 'active-rest') ? 'active-rest' : plannedCount ? 'training' : 'rest' }) : null,
    };
  });
  return {
    start,
    days,
    planned: days.reduce((n, d) => n + d.plannedCount, 0),
    done: days.reduce((n, d) => n + d.doneCount, 0),
  };
}

// The walk as the card draws it: only fields Health actually sent.
export function walkOf(w, { qualifies = false, counted = false, dayKind = 'rest' } = {}) {
  const out = { type: w.type, date: w.date, minutes: Math.round(minutesOf(w) * 100) / 100, qualifies, counted, dayKind };
  for (const k of ['distanceKm', 'kcal', 'avgHr', 'startISO', 'endISO', 'source']) if (w[k] != null && w[k] !== '') out[k] = w[k];
  return out;
}
