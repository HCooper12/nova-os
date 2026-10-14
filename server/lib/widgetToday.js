import { resolveTargets } from './goalBoard.js';
import { buildVitals, scheduledRoutineFor } from './instruments.js';
import { localDateISO } from './localDate.js';

// THE HOME SCREEN WIDGETS' DAY (his ask, 14 Oct 2026): protein, calories,
// steps and HRV against his own goals, in one small payload the iPhone
// widget extension fetches on its own every 15 to 60 minutes
// (ios/App/NovaLiveActivity/NovaWidgets.swift). Read-only and model-free:
// every number is one the app already shows, from the same sources.
//
// Honest by shape: a number that never arrived is null, never 0; a goal he
// has not set is null and the widget draws no ring for it; HRV carries the
// date it was measured so yesterday's reading cannot pose as today's.

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function composeWidgetToday({ now = new Date(), targets = {}, food = null, healthDays = [], session = null } = {}) {
  const date = localDateISO(now);
  const today = healthDays.find((d) => d?.date === date) || null;
  const vitals = buildVitals(healthDays, now);
  return {
    at: now.toISOString(),
    date,
    protein: { value: food ? Math.round(num(food.p) ?? 0) : null, goal: targets.protein?.value ?? null },
    kcal: { value: food ? Math.round(num(food.kcal) ?? 0) : null, goal: targets.kcal?.value ?? null },
    steps: { value: num(today?.steps), goal: targets.steps?.value ?? null },
    hrv: vitals.ok
      ? { value: vitals.hrv, date: vitals.date, lo: vitals.band?.lo ?? null, hi: vitals.band?.hi ?? null, verdict: vitals.verdict }
      : null,
    session,
  };
}

export async function buildWidgetToday(vaultPath, { now = new Date() } = {}) {
  let targets = {};
  try {
    const { getFitnessGoals } = await import('./fitnessGoals.js');
    const { loadRecipeData } = await import('./recipes.js');
    const goals = await getFitnessGoals(vaultPath).catch(() => null);
    let profile = null;
    try { ({ profile } = await loadRecipeData(vaultPath)); } catch { /* no collection yet */ }
    targets = resolveTargets(goals, profile);
  } catch { /* targets stay null: no rings, said honestly */ }

  // today's food log is the whole day: rotation meals write into it when ticked
  let food = null;
  try {
    const { getToday, totalsOf } = await import('./foodLog.js');
    const day = await getToday();
    food = totalsOf(day.entries || []);
  } catch { /* null: the Mac could not read it */ }

  let healthDays = [];
  try { healthDays = await (await import('./healthData.js')).loadRecentDays(10); } catch { /* null below */ }

  let session = null;
  try {
    const { loadExerciseLibrary } = await import('./exercises.js');
    const { loadRoutines } = await import('./workouts.js');
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines, schedule } = await loadRoutines(vaultPath, exercises);
    session = scheduledRoutineFor(routines, schedule, now)?.name || null;
  } catch { /* no session named */ }

  return composeWidgetToday({ now, targets, food, healthDays, session });
}
