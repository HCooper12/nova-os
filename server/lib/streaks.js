import { loadSessions } from './workoutSessions.js';
import { loadRecentDays } from './healthData.js';
import { listRecords } from './inboxStore.js';
import { loadExerciseLibrary } from './exercises.js';
import { loadRoutines, WEEKDAYS, ACTIVE_REST } from './workouts.js';

const STEP_GOAL = 10000;
const SLEEP_GOAL_MIN = 480; // 8h

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Consecutive days ending today (or yesterday, if today doesn't qualify yet —
// so an ongoing streak doesn't read as broken before the day is even over).
function currentStreak(qualifyingDates) {
  const today = todayStr();
  let cursor = qualifyingDates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (qualifyingDates.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// THE WORKOUT STREAK COUNTS SESSIONS AGAINST THE PROGRAM, NOT CALENDAR DAYS.
// "Consecutive days" read Push / rest / Pull as a streak of one, so every
// program with a rest day could never show momentum — and a training check he
// APPROVED ("yes, I trained off-app") still left the streak broken, because
// only logged sessions counted: the platform disagreed with its own
// reconciliation. Now: a day is trained if a session was logged OR he
// confirmed it through the training check; and when the Train schedule has
// training days, the streak walks back over SCHEDULED days only — a rest day
// neither counts nor breaks. With no schedule, consecutive days, as before.
const MAX_WALK_DAYS = 120;
export function scheduledStreak(trainedDates, schedule, today = todayStr()) {
  const trainingDay = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const v = schedule?.[WEEKDAYS[(d.getDay() + 6) % 7]];
    return !!v && v !== ACTIVE_REST;
  };
  const hasTrainingDays = WEEKDAYS.some((k) => schedule?.[k] && schedule[k] !== ACTIVE_REST);
  if (!hasTrainingDays) return { streak: currentStreak(trainedDates), basis: 'daily' };
  // an untrained scheduled TODAY is not yet a miss — the day is not over
  let cursor = trainedDates.has(today) || !trainingDay(today) ? today : addDays(today, -1);
  if (cursor === today && !trainedDates.has(today) && !trainingDay(today)) { /* rest day today: start walking from it */ }
  let streak = 0;
  for (let i = 0; i < MAX_WALK_DAYS; i++) {
    if (trainingDay(cursor)) {
      if (!trainedDates.has(cursor)) break;
      streak++;
    }
    cursor = addDays(cursor, -1);
  }
  return { streak, basis: 'scheduled' };
}

export async function computeStreaks(vaultPath) {
  const [sessions, healthDays, records, schedule] = await Promise.all([
    loadSessions(vaultPath, { limit: 60 }).catch(() => []),
    loadRecentDays(60).catch(() => []),
    listRecords().catch(() => []),
    (async () => {
      const { exercises } = await loadExerciseLibrary(vaultPath);
      return (await loadRoutines(vaultPath, exercises)).schedule || {};
    })().catch(() => ({})),
  ]);

  const workoutDates = new Set(sessions.map((s) => s.date));
  // a training check he approved is a trained day — the reconciliation reconciles
  const localDate = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  for (const r of records) if (r.kind === 'training-check' && r.status === 'filed' && r.createdAt) workoutDates.add(localDate(r.createdAt));
  const workout = scheduledStreak(workoutDates, schedule);
  const stepDates = new Set(healthDays.filter((d) => d.steps != null && d.steps >= STEP_GOAL).map((d) => d.date));
  const sleepDates = new Set(healthDays.filter((d) => d.sleepAsleepMinutes != null && d.sleepAsleepMinutes >= SLEEP_GOAL_MIN).map((d) => d.date));

  return {
    workoutStreak: workout.streak,
    // 'sessions' when the streak walks the program's scheduled days, 'days'
    // when there is no schedule — every reader labels it from this
    workoutStreakUnit: workout.basis === 'scheduled' ? 'sessions' : 'days',
    stepGoalStreak: currentStreak(stepDates),
    sleepGoalStreak: currentStreak(sleepDates),
    // when the last session happened — lets the client notice a LAPSED
    // streak (momentum that stopped) without inventing history
    lastWorkoutDate: workoutDates.size ? [...workoutDates].sort().pop() : null,
  };
}
