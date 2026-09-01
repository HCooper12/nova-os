// The fuel cross-reference agent — spec #11, his NON-NEGOTIABLE.
//
// Training program, goals, rotation and the food log each tell the truth
// about one thing; the gaps live in the JOINS. This lane cross-checks them
// deterministically — no model, every number recomputable from the vault —
// and surfaces what nobody asked about: "your rotation undershoots the
// protein floor", "training days are eating like rest days". Findings feed
// three places: the Coach's context (one-liners he can act on), the morning
// cadence (the single most important line), and the Inbox (a structural
// finding lands as a pending record at most once a week per finding key —
// informational, approving simply files it).
//
// Honesty rules: fewer than MIN_LOGGED_DAYS logged days on a side of a
// comparison and that finding stays silent — a claim built on two days of
// data is noise wearing a number. Missing profile targets silence the
// findings that need them. No finding is ever padded in to look busy.

import { loadSessions } from './workoutSessions.js';
import { loadRecentDays, totalsOf } from './foodLog.js';
import { loadRotation } from './rotation.js';
import { loadRecipeData } from './recipes.js';
import { getFitnessGoals } from './fitnessGoals.js';
import { loadSources, unreadable } from './sources.js';

export const SOURCE_LABEL = { sessions: 'session history', foodLog: 'food log', recipes: 'recipe bank', goals: 'fitness goals', rotation: 'rotation' };

const MIN_LOGGED_DAYS = 3; // per side (trained/rest) before day-type comparisons speak
const LOOKBACK_DAYS = 14;
const LOGGED_FLOOR_KCAL = 800; // below this a day is a partial log, not a small day — excluded

const r0 = (n) => Math.round(n);

function goalWantsGain(goal) {
  return /muscle|gain|bulk|mass|strength|size|hypertroph/i.test(goal || '');
}

// Split the last LOOKBACK_DAYS of genuinely-logged days into trained vs
// rest using the session history's dates (local YYYY-MM-DD on both sides).
function splitDays(days, sessionDates) {
  const trained = [];
  const rest = [];
  for (const d of days) {
    const t = totalsOf(d.entries || []);
    if (t.kcal < LOGGED_FLOOR_KCAL) continue; // partial log — not evidence
    (sessionDates.has(d.date) ? trained : rest).push({ date: d.date, ...t });
  }
  return { trained, rest };
}

const avg = (arr, key) => arr.reduce((s, x) => s + x[key], 0) / arr.length;

// `deps` lets a test swap a loader for one that throws; production uses the
// real ones.
export async function crossCheck(vaultPath, deps = {}) {
  // A SOURCE THAT COULD NOT BE READ IS NOT AN EMPTY SOURCE. These used to be
  // `.catch(() => [])` — so "couldn't check" rendered exactly like "checked,
  // all clear": the Recipes card hid, the morning line went quiet, and the
  // weekly raise concluded cleanliness. The findings are still computed from
  // what did load, but every consumer reads `couldntLook` first and the raise
  // refuses to conclude (lib/sources.js).
  const first = await loadSources({
    sessions: { load: () => (deps.loadSessions || loadSessions)(vaultPath, { limit: 60 }), fallback: [] },
    foodLog: { load: () => (deps.loadRecentDays || loadRecentDays)(LOOKBACK_DAYS), fallback: [] },
    recipes: { load: () => (deps.loadRecipeData || loadRecipeData)(vaultPath), fallback: null },
    goals: { load: () => (deps.getFitnessGoals || getFitnessGoals)(vaultPath), fallback: null },
  });
  const { sessions, foodLog: days, recipes: recipeData, goals } = first.values;
  const failed = [...first.failed];
  const profile = recipeData?.profile || null;
  let rotation = null;
  if (recipeData) {
    const r = await loadSources({ rotation: { load: () => (deps.loadRotation || loadRotation)(vaultPath, recipeData.recipes), fallback: null } });
    rotation = r.values.rotation;
    failed.push(...r.failed);
  }
  return {
    findings: analyze({ sessions, days, profile, rotationTotals: rotation?.totals || null, goal: goals?.goal || '' }),
    sources: { ok: !failed.length, failed },
    couldntLook: failed.length ? `couldn't check fuel × training — ${unreadable(failed, SOURCE_LABEL)}` : null,
    computedAt: new Date().toISOString(),
  };
}

// The pure decision core — every threshold lives here, testable without a
// vault. Inputs are plain data; output is the findings array.
export function analyze({ sessions = [], days = [], profile = null, rotationTotals = null, goal = '' }) {
  const floor = profile?.proteinFloorG || null;
  const targetKcal = profile?.targetKcal || null;
  const wantsGain = goalWantsGain(goal);
  const findings = [];

  // 1 — structural: does the rotation, eaten in full, even reach the floor?
  if (rotationTotals && floor) {
    const gap = floor - rotationTotals.p;
    if (gap >= 10) {
      findings.push({
        key: 'rotation-protein-floor',
        severity: 'high',
        data: { kind: 'protein-floor', have: r0(rotationTotals.p), floor },
        line: `The rotation itself undershoots the protein floor: all four slots eaten in full give ${r0(rotationTotals.p)}g against the ${floor}g floor — ${r0(gap)}g must come from off-rotation food every single day.`,
      });
    }
  }

  // 2 — behavioural: are training days actually fuelled like training days?
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const sessionDates = new Set(sessions.map((s) => s.date).filter((d) => d >= cutoff));
  const { trained, rest } = splitDays(days, sessionDates);
  if (trained.length >= MIN_LOGGED_DAYS && rest.length >= MIN_LOGGED_DAYS) {
    const tp = avg(trained, 'p');
    const rp = avg(rest, 'p');
    if (floor && tp < floor - 15 && tp <= rp + 5) {
      findings.push({
        key: 'training-day-protein',
        severity: 'high',
        data: { kind: 'protein-split', trained: r0(tp), rest: r0(rp), floor },
        line: `Training days average ${r0(tp)}g protein over the last ${LOOKBACK_DAYS} days (${trained.length} logged) — under the ${floor}g floor and no better than rest days at ${r0(rp)}g. The days that need protein most are getting the same as the days that need it least.`,
      });
    }
    if (targetKcal && wantsGain) {
      const tk = avg(trained, 'kcal');
      if (tk < targetKcal - 250) {
        findings.push({
          key: 'training-day-kcal',
          severity: 'medium',
          data: { kind: 'kcal-split', trained: r0(tk), target: targetKcal },
          line: `For a ${goal || 'gain'} goal, training days average ${r0(tk)} kcal against the ${targetKcal} target (${trained.length} logged days) — the surplus that pays for the sessions isn't there on the days he trains.`,
        });
      }
    }
  }

  // 3 — floor pace across ALL logged days: a floor missed most days is a
  // pattern, not a bad day. (Counts full logs only — same honesty bar.)
  if (floor) {
    const full = [...trained, ...rest];
    if (full.length >= 5) {
      const under = full.filter((d) => d.p < floor - 5);
      if (under.length / full.length >= 0.6) {
        findings.push({
          key: 'floor-most-days',
          severity: 'medium',
          line: `The ${floor}g protein floor was missed on ${under.length} of the last ${full.length} fully-logged days — the floor is currently a ceiling.`,
        });
      }
    }
  }

  return findings;
}

// The one-liners the Coach's prompt gets — empty string when there is
// nothing true to say (never a placeholder).
export function crossContext(result) {
  // the model must never reason from a partial picture as if it were whole
  const warn = result?.couldntLook ? `NOTE: ${result.couldntLook} — the fuel picture is NOT checked today; say so if asked, never assume it is fine.` : '';
  if (!result?.findings?.length) return warn;
  const body = `FUEL × TRAINING CROSS-CHECK (deterministic, from his real logs — raise what matters, don't recite):\n${result.findings.map((f) => `- [${f.severity}] ${f.line}`).join('\n')}`;
  return warn ? `${warn}\n${body}` : body;
}
