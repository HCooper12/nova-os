import { loadRecipeData } from './recipes.js';
import { getDay, totalsOf, resolveLogDate } from './foodLog.js';
import { saveDay } from './nutritionLog.js';

// Called after any mutation that changes what's marked consumed on a day
// (a rotation slot toggled eaten, or a food log entry added/removed) so the
// nutrition-log archive always reflects that day's current actual total,
// not just a snapshot from whenever the day happened to end.
//
// Rotation meals now live IN the food log (see foodLog.setRotationEntry), so
// this is one read and one sum — no join. It also takes a DATE: a retro edit
// used to be skipped entirely, leaving the archive (and every weekly/monthly
// scorecard built on it) permanently wrong for that day.
export async function recordDaySnapshot(vaultPath, date) {
  const target = resolveLogDate(date);
  const { profile } = await loadRecipeData(vaultPath);
  const day = await getDay(target);
  return saveDay(target, totalsOf(day.entries), profile?.proteinFloorG || null);
}

// Back-compat name — today's snapshot is just the common case.
export async function recordTodaySnapshot(vaultPath) {
  return recordDaySnapshot(vaultPath, undefined);
}
