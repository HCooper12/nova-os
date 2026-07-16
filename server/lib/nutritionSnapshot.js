import { loadRecipeData } from './recipes.js';
import { loadRotation } from './rotation.js';
import { getToday as getFoodLogToday } from './foodLog.js';
import { saveDay } from './nutritionLog.js';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Called after any mutation that changes what's marked consumed today
// (a rotation slot toggled eaten, or a food log entry added/removed) so the
// nutrition-log archive always reflects the day's current actual total,
// not just a snapshot from whenever the day happened to end.
export async function recordTodaySnapshot(vaultPath) {
  const { recipes, profile } = await loadRecipeData(vaultPath);
  const rotation = await loadRotation(vaultPath, recipes);
  const foodDay = await getFoodLogToday();
  const foodTotals = foodDay.entries.reduce((a, e) => ({
    p: a.p + e.macros.p, c: a.c + e.macros.c, f: a.f + e.macros.f, kcal: a.kcal + e.macros.kcal,
  }), { p: 0, c: 0, f: 0, kcal: 0 });

  const combined = {
    p: rotation.consumedTotals.p + foodTotals.p,
    c: rotation.consumedTotals.c + foodTotals.c,
    f: rotation.consumedTotals.f + foodTotals.f,
    kcal: rotation.consumedTotals.kcal + foodTotals.kcal,
  };
  return saveDay(today(), combined, profile?.proteinFloorG || null);
}
