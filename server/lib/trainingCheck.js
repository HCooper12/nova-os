import { randomUUID } from 'node:crypto';
import { fetchEventsForDay } from './calendar.js';
import { loadExerciseLibrary } from './exercises.js';
import { loadRoutines, WEEKDAYS, ACTIVE_REST } from './workouts.js';
import { loadSessions } from './workoutSessions.js';
import { listCarryovers } from './workoutCarryover.js';
import { createRecord, listRecords } from './inboxStore.js';

// "Did today's training happen?" Each evening Nova cross-checks the Train
// schedule AND the calendar against what's actually logged, and — when a
// workout was planned but nothing's logged — asks, so a session that happened
// off-app (or a swap to a walk) gets reconciled instead of silently lost.
// Approve notes it as done (a journal line, undoable); dismiss = didn't happen /
// swapped for active rest. One check per day.
const WORKOUT_RE = /\b(gym|workout|training|lift|session|push|pull|legs?|upper|lower|chest|back|shoulders?|cardio)\b/i;

function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function runTrainingCheck(vaultPath) {
  const now = new Date();
  const t = todayISO(now);

  const records = await listRecords();
  if (records.some((r) => r.kind === 'training-check' && r.createdAt && todayISO(new Date(r.createdAt)) === t)) {
    return { skipped: 'already asked today' };
  }

  // what Train has scheduled today
  let scheduledRoutine = null;
  let isActiveRest = false;
  let loggedToday = false;
  try {
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines, schedule } = await loadRoutines(vaultPath, exercises);
    const dayKey = WEEKDAYS[(now.getDay() + 6) % 7];
    const val = schedule?.[dayKey];
    isActiveRest = val === ACTIVE_REST;
    scheduledRoutine = val && !isActiveRest ? routines.find((r) => r.id === val) || null : null;
    const sessions = await loadSessions(vaultPath, { limit: 6 });
    loggedToday = sessions.some((s) => s.date === t);
  } catch {
    return { skipped: 'no workout data' };
  }

  // a workout on the calendar today?
  let calWorkout = null;
  try {
    const evs = await fetchEventsForDay(now);
    calWorkout = evs.find((e) => WORKOUT_RE.test(e.label || '')) || null;
  } catch { /* calendar optional */ }

  // Nothing to reconcile if it's already logged, or nothing was planned (plain
  // rest / active rest with no session expected).
  const planned = scheduledRoutine || calWorkout;
  if (loggedToday || !planned) return { skipped: 'nothing to reconcile' };

  const plannedName = scheduledRoutine ? scheduledRoutine.name : (calWorkout ? calWorkout.label : 'a workout');
  const trainBit = scheduledRoutine
    ? `${scheduledRoutine.name} is on your Train schedule`
    : isActiveRest ? 'Train has today as active rest' : 'Train has no routine set for today';
  const calBit = calWorkout ? ` and your calendar has "${calWorkout.label}"${calWorkout.time ? ` at ${calWorkout.time}` : ''}` : '';
  const mismatch = calWorkout && !scheduledRoutine
    ? " (it's on your calendar but not your Train schedule)"
    : (!calWorkout && scheduledRoutine ? " (it's on your Train schedule but not your calendar)" : '');

  // the check knows about recorded training debt — a miss can be pushed
  // forward from Train instead of silently vanishing
  let carryBit = '';
  try {
    const due = (await listCarryovers()).filter((c) => c.forDate <= t);
    if (due.length) carryBit = ` You also have ${due.length} carry-over${due.length === 1 ? '' : 's'} waiting on Train.`;
    else carryBit = " If you ran out of time mid-session, Train's finish flow can push the missed exercises to another day.";
  } catch { /* optional */ }

  const title = `Did ${plannedName} happen today?`;
  const record = {
    id: randomUUID().slice(0, 8),
    kind: 'training-check',
    text: title,
    source: 'nova',
    mode: 'draft',
    status: 'pending',
    createdAt: now.toISOString(),
    decision: {
      route: 'journal',
      confidence: 'high',
      title,
      reason: `${trainBit}${calBit}${mismatch}, but nothing's logged in Train yet. Approve to note it as done; if you swapped it for a walk or stretch, dismiss this — that counts as active rest.${carryBit}`,
      payload: { text: `Training reconciled ${t}: completed ${plannedName} (confirmed from the schedule).`, category: 'training', label: 'Training check' },
    },
  };
  await createRecord(record);
  return { proposed: true, record };
}

// Evenings — one nudge a day. `>= 19`, not `=== 19`: exact-hour equality on an
// hourly interval silently skips the day on tick drift or a restart. The
// store-based per-day guard in runTrainingCheck makes extra ticks harmless.
export function startTrainingCheckScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('training-check');
    try {
      if (new Date().getHours() >= 19) await runTrainingCheck(vaultPath);
    } catch (err) {
      console.error('training check failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 3600_000);
}
