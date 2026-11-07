// FOOD IN THE BRIEFS. One line each, written by code from the real log:
// the morning brief looks back at yesterday, the evening brief reports
// today's calories beside its protein. Neither is a new notification; they
// are lines inside briefs that already go out.
//
// Honest by construction: a day with nothing logged says so, a day with only
// a little logged says the log is probably incomplete instead of presenting a
// small number as if he had eaten that little, and every figure is measured
// against the target IN FORCE ON THAT DAY (targetHistory), never today's.
import { runningTotal, runningTotalLine } from './runningTotal.js';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-AU');

// "complete enough to judge" matches the weekly energy review (fuelReview.js):
// at least half the day's target, and never under 1,000 kcal.
export function isThinLog(totals, targets) {
  const kcal = Number(totals?.kcal) || 0;
  return kcal < Math.max(1000, 0.5 * (Number(targets?.kcal) || 0));
}

/** Pure: yesterday's totals and targets to the brief line. */
export function yesterdayFoodText({ entryCount = 0, totals, targets } = {}) {
  if (!entryCount) return "**Yesterday's food.** Nothing was logged.";
  const line = runningTotalLine({ totals, targets });
  if (isThinLog(totals, targets)) {
    return `**Yesterday's food.** Only ${line} was logged, so the log is probably incomplete.`;
  }
  return `**Yesterday's food.** ${line}.`;
}

export function isoDaysBefore(now, days) {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Morning: yesterday's food in one line, or null when it cannot be read. */
export async function yesterdayFoodLine(vaultPath, now = new Date(), deps = {}) {
  const date = isoDaysBefore(now, 1);
  const r = await runningTotal(vaultPath, date, deps);
  if (!r) return null;
  const { getDay } = await import('./foodLog.js');
  const entries = deps.entries || (await getDay(date)).entries || [];
  return yesterdayFoodText({ entryCount: entries.length, totals: r.totals, targets: r.targets });
}

/** Pure: the evening Fuel sentence, protein as it always was, calories beside it. */
export function eveningFuelText({ totals, targets }) {
  const eaten = Math.round(Number(totals?.p) || 0);
  const floor = Number(targets?.protein) > 0 ? Math.round(Number(targets.protein)) : null;
  const kcal = Math.round(Number(totals?.kcal) || 0);
  const kt = Number(targets?.kcal) > 0 ? Math.round(Number(targets.kcal)) : null;
  const protein = floor
    ? (eaten >= floor ? `Protein floor hit, ${eaten}g against ${floor}g.` : `${eaten}g protein against the ${floor}g floor, ${floor - eaten}g short.`)
    : `${eaten}g protein logged today.`;
  const calories = kt ? `Calories ${fmt(kcal)} of ${fmt(kt)}.` : `Calories ${fmt(kcal)} logged.`;
  return `**Fuel.** ${protein} ${calories}`;
}

/** Evening: today's fuel line from the real log. */
export async function eveningFuelLine(vaultPath, now = new Date(), deps = {}) {
  const date = isoDaysBefore(now, 0);
  const r = await runningTotal(vaultPath, date, deps);
  return r ? eveningFuelText({ totals: r.totals, targets: r.targets }) : null;
}

/** Morning: the one top fuel check as a line, or null when nothing true needs saying. */
export async function fuelCheckLine(vaultPath, now = new Date(), deps = {}) {
  const { loadFuelChecks } = await import('./fuelChecks.js');
  const { findings } = await loadFuelChecks(vaultPath, { now, deps });
  return findings.length ? `**Fuel check.** ${findings[0].line}` : null;
}
