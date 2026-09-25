// THE PLANNED WEEK, SET BY SET (25 Sep 2026). His ask: through "Hard sets
// this week", a breakdown of each exercise for each muscle group his program
// plans across the week. The bars say how many sets a muscle has had; this
// says where they are meant to come from (every exercise the schedule puts
// in the week, on its day, with its sets) and which of them are done.
//
// Pure and deterministic. The schedule and routines are the plan; this
// week's filed sessions, plus the ticked sets of the one in progress, are
// what happened. Every logged working set lands in exactly one place: the
// planned slot it fulfils, or its muscle's "not in the plan" list. So a
// muscle's done count here always equals its bar on the card (the test pins
// it), including the swaps real weeks are full of: pull-ups in place of
// weighted pull-ups, a V-bar pushdown for the straight bar, a lift pulled
// forward from Friday into Wednesday.

import { mondayIso } from './cadence.js';
import { MUSCLE_GROUPS } from './exercises.js';
import { todayIso } from './makeupDay.js';
import { isWorkingSet } from './trainingAnalytics.js';

export const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return todayIso(d);
};
const weekdayOf = (iso) => WEEK_DAYS[(new Date(`${iso}T12:00:00`).getDay() + 6) % 7];

/**
 * @param routines  loadRoutines(...).routines (exercises resolved: name, muscleGroup, targetSets…)
 * @param schedule  weekday → routine id ('active-rest' or absent = rest)
 * @param sessions  filed sessions (any span; only this week's are read)
 * @param live      the in-progress workoutSession from the draft, or null
 * @param exercises the exercise library (muscle group of anything logged)
 * @param targetOf  muscle → { target, goalMuscle }, the SAME rule the bars use
 * @param now       the clock, for "this week" and "today"
 */
export function plannedWeek({ routines = [], schedule = {}, sessions = [], live = null, exercises = [], targetOf, now = new Date() }) {
  const today = todayIso(now);
  const start = mondayIso(now);
  const groupOf = new Map(exercises.map((e) => [e.id, e.muscleGroup || 'Other']));
  const nameOf = new Map(exercises.map((e) => [e.id, e.name]));
  const routineById = new Map(routines.map((r) => [r.id, r]));

  const days = WEEK_DAYS.map((day, i) => {
    const date = addDays(start, i);
    const r = routineById.get(schedule?.[day]) || null;
    return { day, date, routineId: r?.id || null, routineName: r?.name || null, rest: !r, isToday: date === today, isPast: date < today };
  });

  // one slot per scheduled exercise per day, in routine order
  const slots = [];
  for (const d of days) {
    for (const ex of routineById.get(d.routineId)?.exercises || []) {
      const muscle = ex.muscleGroup || groupOf.get(ex.exerciseId) || 'Other';
      if (muscle === 'Mobility') continue; // adherence, never hypertrophy volume
      slots.push({
        exerciseId: ex.exerciseId, name: ex.name, muscle, day: d.day, routineName: d.routineName,
        planned: Number(ex.targetSets) || 0,
        reps: { low: ex.targetRepsLow ?? null, high: ex.targetRepsHigh ?? null },
        trackingType: ex.trackingType || 'weight_reps',
        done: 0, live: 0, doneOn: [],
        _routineId: d.routineId,
      });
    }
  }

  // what happened: this week's filed sessions, then the one in progress
  // (ticked sets only, dated today, exactly as the bars fold it in)
  const logged = sessions.filter((s) => s?.date && mondayIso(s.date) === start);
  if (live?.exercises?.length) logged.push({ ...live, date: today, _live: true });

  // A logged exercise goes to the slot it most plausibly fulfils: the same
  // routine on the same day, then the same routine, then the same day; among
  // equals the one with room left, then the earliest. It is never split
  // across slots: six sets of one lift in one session were six sets there.
  const score = (sl, s, weekday) => (sl._routineId && sl._routineId === s.routineId ? 2 : 0) + (sl.day === weekday ? 1 : 0);
  const extras = new Map(); // `${muscle}|${exerciseId}` → row
  for (const s of logged) {
    const weekday = weekdayOf(s.date);
    for (const ex of s.exercises || []) {
      const muscle = groupOf.get(ex.exerciseId) || 'Other';
      if (muscle === 'Mobility') continue;
      const n = (ex.sets || []).filter((x) => (!s._live || x.done) && isWorkingSet(x)).length;
      if (!n) continue;
      const liveN = s._live ? n : 0;
      const fits = slots.filter((sl) => sl.exerciseId === ex.exerciseId);
      if (fits.length) {
        fits.sort((a, b) => score(b, s, weekday) - score(a, s, weekday)
          || Number(a.done >= a.planned) - Number(b.done >= b.planned)
          || WEEK_DAYS.indexOf(a.day) - WEEK_DAYS.indexOf(b.day));
        const sl = fits[0];
        sl.done += n; sl.live += liveN;
        if (!sl.doneOn.includes(weekday)) sl.doneOn.push(weekday);
        continue;
      }
      const key = `${muscle}|${ex.exerciseId}`;
      const row = extras.get(key) || { exerciseId: ex.exerciseId, name: nameOf.get(ex.exerciseId) || ex.name || ex.exerciseId, muscle, done: 0, live: 0, doneOn: [], byDay: {} };
      row.done += n; row.live += liveN;
      row.byDay[weekday] = (row.byDay[weekday] || 0) + n; // the week grid places them on the day they happened
      if (!row.doneOn.includes(weekday)) row.doneOn.push(weekday);
      extras.set(key, row);
    }
  }

  const muscles = new Map();
  const rowFor = (m) => {
    if (!muscles.has(m)) muscles.set(m, { muscle: m, ...targetOf(m), planned: 0, done: 0, live: 0, exercises: [], extras: [] });
    return muscles.get(m);
  };
  for (const { _routineId, ...sl } of slots) {
    const r = rowFor(sl.muscle);
    r.planned += sl.planned; r.done += sl.done; r.live += sl.live;
    r.exercises.push(sl);
  }
  for (const e of extras.values()) {
    const r = rowFor(e.muscle);
    r.done += e.done; r.live += e.live;
    r.extras.push(e);
  }
  // a goal muscle the plan never trains must still appear: absence is the finding
  for (const m of MUSCLE_GROUPS) if (targetOf(m).goalMuscle) rowFor(m);

  // the body's order (the library's), top to bottom, so the list reads the
  // same every week however the numbers move
  const order = (m) => { const i = MUSCLE_GROUPS.indexOf(m); return i < 0 ? 99 : i; };
  return {
    start,
    days,
    muscles: [...muscles.values()].sort((a, b) => order(a.muscle) - order(b.muscle)),
  };
}
