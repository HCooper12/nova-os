import { loadRecentDays } from './healthData.js';
import { fetchEventsForDay } from './calendar.js';
import { loadRecipeData } from './recipes.js';
import { loadRotation } from './rotation.js';
import { getToday as getFoodLogToday } from './foodLog.js';
import { loadExerciseLibrary } from './exercises.js';
import { loadRoutines, WEEKDAYS, ACTIVE_REST } from './workouts.js';
import { computeStreaks, STEP_GOAL } from './streaks.js';
import { atlasFor } from './data/exerciseAtlas.js';
import { MUSCLE_IDS } from './muscles.js';

// THE INSTRUMENTS — the morning brief as five purpose-built readouts
// instead of five paragraphs. Each one is a typed payload built from the
// SAME real data the dispatch already speaks from; no model is involved at
// any point, because a model that could draw would be a model that could
// lie about his heart rate.
//
// The house rule these were designed around: an instrument may be empty,
// stale or partial, and it says so in its own payload. A missing day is a
// `null` in the series and never a zero; a two-day-old reading carries
// `staleDays` so the surface can hedge the verdict it draws. Nothing here
// invents a value to make a picture look finished.

const DAY_MS = 86_400_000;
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const round1 = (n) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------- vitals ---- */

// HRV means nothing between people and everything against yourself, so the
// payload carries his own band rather than a number on its own.
export function buildVitals(days, now = new Date()) {
  const withHrv = days.filter((d) => d && d.hrv != null && d.date);
  if (!withHrv.length) {
    return { ok: false, reason: 'no HRV has ever been recorded', hrv: null, band: null };
  }
  const latest = [...withHrv].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const others = withHrv.filter((d) => d.date !== latest.date).slice(0, 7);
  const vals = others.map((d) => d.hrv);
  const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  const delta = avg ? Math.round(((latest.hrv - avg) / avg) * 100) : null;
  const staleDays = Math.max(0, Math.round((new Date(iso(now)) - new Date(latest.date)) / DAY_MS));

  // the verdict is about his own spread, and is only ever a readiness cue
  let verdict = 'steady';
  if (delta != null && delta >= 5) verdict = 'recovered';
  else if (delta != null && delta <= -5) verdict = 'strained';

  return {
    ok: true,
    hrv: round1(latest.hrv),
    restingHr: latest.restingHeartRate != null ? Math.round(latest.restingHeartRate) : null,
    delta,
    verdict,
    // the band is what "usual" means for him — drawn, not described
    band: vals.length >= 3
      ? { lo: round1(Math.min(...vals)), hi: round1(Math.max(...vals)), avg: round1(avg), n: vals.length }
      : null,
    date: latest.date,
    staleDays,
    stale: staleDays >= 1,
  };
}

/* ---------------------------------------------------------------- day ---- */

export function buildDay(events, now = new Date()) {
  const blocks = (events || [])
    .filter((e) => e && e.time)
    .map((e) => {
      const [h, m] = String(e.time).split(':').map(Number);
      const t = h + (m || 0) / 60;
      let len = 1;
      if (e.end) {
        const [eh, em] = String(e.end).split(':').map(Number);
        const end = eh + (em || 0) / 60;
        if (end > t) len = round1(end - t);
      }
      return { t: round1(t), len, label: e.label || 'Block' };
    })
    .sort((a, b) => a.t - b.t);

  const nowT = now.getHours() + now.getMinutes() / 60;
  // "the one that matters" is the longest block still ahead — not a guess
  // about importance, a statement about where the day's mass sits
  const ahead = blocks.filter((b) => b.t + b.len > nowT);
  const anchor = ahead.length ? ahead.reduce((a, b) => (b.len > a.len ? b : a)) : null;

  return { ok: blocks.length > 0, blocks, now: round1(nowT), anchor, reason: blocks.length ? null : 'no timed events today' };
}

/* --------------------------------------------------------------- week ---- */

// Seven days ending today. A day Nova never received is null and stays
// null; the whole point of drawing this is that the hole is visible.
export function buildWeek(days, now = new Date(), { floor = null } = {}) {
  const byDate = new Map((days || []).filter((d) => d && d.date).map((d) => [d.date, d]));
  const series = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const key = iso(d);
    const rec = byDate.get(key);
    series.push({
      date: key,
      label: d.toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase(),
      steps: rec && rec.steps != null ? Math.round(rec.steps) : null,
      today: i === 0,
      future: false,
    });
  }
  const known = series.filter((s) => s.steps != null);
  const total = known.reduce((s, d) => s + d.steps, 0);
  const missing = series.filter((s) => s.steps == null && !s.today).map((s) => s.date);
  return {
    ok: known.length > 0,
    series,
    total,
    floor,
    weekTarget: floor ? floor * 7 : null,
    short: floor ? Math.max(0, floor * 7 - total) : null,
    missing,
    reason: known.length ? null : 'no step data in the last seven days',
  };
}

/* --------------------------------------------------------------- body ---- */

// The muscles a session actually works, unioned from the atlas across its
// exercises. Unknown exercises contribute nothing rather than a guess.
export function musclesForRoutine(routine) {
  const primary = new Set(), secondary = new Set();
  let unknown = 0;
  for (const ex of routine?.exercises || []) {
    const a = atlasFor(ex.exerciseId || ex.id);
    if (!a) { unknown++; continue; }
    (a.primary || []).forEach((m) => { if (MUSCLE_IDS.includes(m)) primary.add(m); });
    (a.secondary || []).forEach((m) => { if (MUSCLE_IDS.includes(m)) secondary.add(m); });
  }
  // a muscle worked directly is never also listed as support
  for (const m of primary) secondary.delete(m);
  return { primary: [...primary], secondary: [...secondary], unknown };
}

/* --------------------------------------------------------------- build --- */

function scheduledRoutineFor(routines, schedule, date) {
  const key = WEEKDAYS[(date.getDay() + 6) % 7];   // JS Sunday=0, WEEKDAYS starts Monday
  const id = schedule?.[key];
  if (!id || id === ACTIVE_REST) return null;
  return (routines || []).find((r) => r.id === id) || null;
}

function activeRestToday(schedule, date) {
  return schedule?.[WEEKDAYS[(date.getDay() + 6) % 7]] === ACTIVE_REST;
}

export async function buildInstruments(vaultPath, { now = new Date() } = {}) {
  const out = { at: now.toISOString(), vitals: null, day: null, week: null, body: null, fuel: null };

  // every section is independently guarded: one unavailable source must not
  // take the whole console down with it
  let health = [];
  try { health = await loadRecentDays(10); } catch { /* honest below */ }
  out.vitals = buildVitals(health, now);

  try {
    out.day = buildDay(await fetchEventsForDay(now), now);
  } catch (err) {
    out.day = { ok: false, blocks: [], reason: `calendar unavailable (${err.message})` };
  }

  // ONE step goal in the codebase: the streak counter's. A floor drawn at a
  // different number than the streak is scored against is a lie by omission.
  out.week = buildWeek(health, now, { floor: STEP_GOAL });

  let muscles = { primary: [], secondary: [], unknown: 0 };
  try {
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines, schedule } = await loadRoutines(vaultPath, exercises);
    const routine = scheduledRoutineFor(routines, schedule, now);
    muscles = routine ? musclesForRoutine(routine) : muscles;

    let carryovers = [];
    try {
      const { listCarryovers } = await import('./workoutCarryover.js');
      const t = iso(now);
      carryovers = (await listCarryovers())
        .filter((c) => c.forDate <= t)
        .flatMap((c) => (c.exercises || []).map((e) => e.name))
        .filter(Boolean);
    } catch { /* carry-overs are additive */ }

    let streak = null;
    try { streak = (await computeStreaks(vaultPath)).workoutStreak ?? null; } catch { /* optional */ }

    out.body = {
      ok: !!routine,
      session: routine?.name || null,
      exercises: routine?.exercises?.length || 0,
      muscles,
      carryovers,
      streak,
      activeRest: !routine && activeRestToday(schedule, now),
      reason: routine ? null : (activeRestToday(schedule, now) ? 'active rest — a walk or a stretch, no weights' : 'nothing scheduled today'),
    };
  } catch (err) {
    out.body = { ok: false, session: null, exercises: 0, muscles, carryovers: [], streak: null,
      reason: `training schedule unavailable (${err.message})` };
  }

  try {
    const { recipes, profile } = await loadRecipeData(vaultPath);
    const rotation = await loadRotation(vaultPath, recipes);
    const foodLog = await getFoodLogToday();
    const extraP = (foodLog?.entries || []).reduce((s, e) => s + (e.macros?.p || 0), 0);
    const eaten = Math.round((rotation?.consumedTotals?.p || 0) + extraP);
    const planned = Math.round(rotation?.totals?.p || 0);
    const floor = profile?.proteinFloorG || null;
    // the pace is the straight line from waking to the evening — the number
    // that makes "behind" mean something at eleven in the morning
    const WAKE = 6, LAST = 22;
    const nowT = now.getHours() + now.getMinutes() / 60;
    const frac = Math.min(1, Math.max(0, (nowT - WAKE) / (LAST - WAKE)));
    const pace = floor ? Math.round(floor * frac) : null;
    out.fuel = {
      ok: planned > 0,
      planned, eaten, floor,
      pace,
      behind: pace != null ? Math.max(0, pace - eaten) : null,
      // the repair view lights the same muscles the session worked
      muscles,
      reason: planned > 0 ? null : 'no rotation planned',
    };
  } catch (err) {
    out.fuel = { ok: false, planned: 0, eaten: 0, floor: null, pace: null, behind: null,
      muscles, reason: `rotation unavailable (${err.message})` };
  }

  return out;
}
