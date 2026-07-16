import { loadSessions } from './workoutSessions.js';
import { loadRecentDays } from './healthData.js';

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

export async function computeStreaks(vaultPath) {
  const [sessions, healthDays] = await Promise.all([
    loadSessions(vaultPath, { limit: 60 }).catch(() => []),
    loadRecentDays(60).catch(() => []),
  ]);

  const workoutDates = new Set(sessions.map((s) => s.date));
  const stepDates = new Set(healthDays.filter((d) => d.steps != null && d.steps >= STEP_GOAL).map((d) => d.date));
  const sleepDates = new Set(healthDays.filter((d) => d.sleepAsleepMinutes != null && d.sleepAsleepMinutes >= SLEEP_GOAL_MIN).map((d) => d.date));

  return {
    workoutStreak: currentStreak(workoutDates),
    stepGoalStreak: currentStreak(stepDates),
    sleepGoalStreak: currentStreak(sleepDates),
  };
}
