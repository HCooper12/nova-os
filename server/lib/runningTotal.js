// THE RUNNING TOTAL. Every time a food log is confirmed in words, the day's
// tally goes with it: "Calories: 1,240 / 2,138 · Protein: 96 / 167 g".
//
// The sum is CODE's (foodLog.totalsOf over the real entries), never a model's.
// The target is the one in force ON THAT DAY (targetHistory: a goal applies
// from its day forward and never re-judges a past day). When a target is not
// known the figure stands alone rather than being compared to a made-up one.
import { totalsOf, getDay } from './foodLog.js';
import { targetsOn } from '../../src/targetHistory.js';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-AU');

/** Pure: totals + targets in, the sentence out. */
export function runningTotalLine({ totals, targets } = {}) {
  const kcal = Math.round(Number(totals?.kcal) || 0);
  const protein = Math.round(Number(totals?.p) || 0);
  const kt = Number(targets?.kcal) > 0 ? Math.round(Number(targets.kcal)) : null;
  const pt = Number(targets?.protein) > 0 ? Math.round(Number(targets.protein)) : null;
  return `Calories: ${fmt(kcal)}${kt ? ` / ${fmt(kt)}` : ''} · Protein: ${fmt(protein)}${pt ? ` / ${fmt(pt)}` : ''} g`;
}

/**
 * The targets in force on `date`: his goals page, else his intake profile,
 * dated through the target history. Optional pieces may be injected (tests).
 */
export async function targetsForDay(vaultPath, date, deps = {}) {
  let goals = deps.goals;
  let profile = deps.profile;
  if (goals === undefined) {
    try { goals = await (await import('./fitnessGoals.js')).getFitnessGoals(vaultPath); } catch { goals = null; }
  }
  if (profile === undefined) {
    try { ({ profile } = await (await import('./recipes.js')).loadRecipeData(vaultPath)); } catch { profile = null; }
  }
  const { resolveTargets } = await import('./goalBoard.js');
  const t = resolveTargets(goals, profile);
  const day = targetsOn(goals?.targetHistory || [], date, { kcal: t.kcal.value, protein: t.protein.value });
  // today's earned room counts; a past day keeps the target it had
  const earned = deps.earned !== undefined ? deps.earned : await (await import('./earnedCalories.js')).earnedToday();
  if (earned?.date === date && earned.kcal > 0 && day?.kcal) return { ...day, kcal: day.kcal + earned.kcal };
  return day;
}

/**
 * The line for one day, read from the real log. Never throws: a confirmation
 * must not fail because the tally could not be built; it just goes without.
 * @returns {Promise<{line:string, totals, targets}|null>}
 */
export async function runningTotal(vaultPath, date, deps = {}) {
  try {
    const day = deps.entries ? { date, entries: deps.entries } : await getDay(date);
    const totals = totalsOf(day.entries || []);
    const targets = await targetsForDay(vaultPath, day.date || date, deps);
    return { line: runningTotalLine({ totals, targets }), totals, targets, date: day.date || date };
  } catch {
    return null;
  }
}

/**
 * `text` with the day's tally appended, or `text` unchanged if there is none.
 * A sentence the app SAYS ends in a full stop; a record's `destination` label
 * (which the Inbox and Telegram wrap in their own punctuation) does not.
 */
export async function withRunningTotal(vaultPath, date, text, { label = false, ...deps } = {}) {
  const r = await runningTotal(vaultPath, date, deps);
  if (!r) return text;
  const base = text.replace(/\s+$/, '');
  const tally = label ? `${base}. Today: ${r.line}` : `${base} Today so far, ${r.line}.`;
  // a hard day with the food far behind is the one check said right here, where
  // he is already looking at the numbers (lib/fuelChecks.js); no other check is.
  // Spoken sentences only: a record's label stays a label.
  const warn = label ? null : await hardDayWarning(vaultPath, r, deps);
  return warn ? `${tally} ${warn}` : tally;
}

// finding 9 only, and only for today: a past day's log is not the moment to warn
async function hardDayWarning(vaultPath, r, { fuelChecks: use = true, now = new Date(), entries, fuelDeps = {} } = {}) {
  if (use === false) return null;
  try {
    const { localDateISO } = await import('./localDate.js');
    if (r.date !== localDateISO(now)) return null;
    const { loadFuelChecks } = await import('./fuelChecks.js');
    const deps = { targets: async () => r.targets, ...(entries ? { day: async () => ({ entries }) } : {}), ...fuelDeps };
    const { findings } = await loadFuelChecks(vaultPath, { now, deps });
    return findings.find((f) => f.key === 'hard-day-underfuelled')?.line || null;
  } catch { return null; }
}
