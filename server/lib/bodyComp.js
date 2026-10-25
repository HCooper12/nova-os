// WHERE HE STANDS (26 Oct 2026, his ask): "Nova and Coach should be actively
// making suggestions and reflections on my current activity level, lifestyle
// etc. from what it notices in my Apple Health data ... such as focusing
// first on reducing body fat before a lean bulk."
//
// Code, no model. One pure function reads the records he already keeps (the
// Intake on Profile.md, his goals page, 28 days of Apple Health, his finished
// sessions) and says where he stands: body composition and the phase verdict,
// activity, recovery and weight. Every number is computed here; a missing one
// says "unknown" and never borrows a default. The agents reason from this
// block (Coach, Ask Nova, the Sunday debrief); none of them computes it.
//
// The phase bands are the published coaching consensus for men: a lean bulk
// is usually started at or below about 12-15% body fat, and above that the
// usual advice for a physique goal is to cut to about 12-14% first. Women sit
// about 8 points higher. These are guides from the literature, printed as
// guides, never as a diagnosis.

import { PACE, bodyFat } from './intake.js';
import { weighInsOf, computeWeightTrend } from './healthData.js';
import { weightSlope } from './fuelReview.js';

export const WINDOW_DAYS = 28;
// men; women add WOMEN_OFFSET
export const LEAN_BULK_TOP = 15; // a lean bulk is usually started at or below 12-15%
export const BAND_TARGET = 14; // the cut aims for the top of the lean-bulk band
export const CUT_FLOOR = 12; // below this a physique cut has done its job
export const WOMEN_OFFSET = 8;
const HRV_DROP = 0.10; // the last 7 days at least 10% under the prior 21

const r1 = (n) => Math.round(n * 10) / 10;
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt = (n) => Number(n).toLocaleString('en-AU');
const dayNum = (iso) => Math.round(new Date(`${iso}T12:00:00Z`).getTime() / 86400000);
const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

const METHOD_WORDS = { visual: 'visual guide', navy: 'Navy tape', rfm: 'relative fat mass', health: 'Apple Health' };
export function methodWords(m) {
  if (!m) return null;
  return String(m).split('+').map((x) => METHOD_WORDS[x] || x).join(' + ');
}

const PHASE_OF = { lose: 'cut', maintain: 'maintain', gain: 'gain' };
const PHASE_WORDS = { cut: 'cutting', maintain: 'maintaining', gain: 'gaining' };

// THE PHASE VERDICT. bf is a number or null; returns the `phase` object.
export function phaseVerdict({ bf, sex, goal, pace, weightKg, goalFor }) {
  const current = PHASE_OF[goal] || null;
  const off = sex === 'female' ? WOMEN_OFFSET : 0;
  const top = LEAN_BULK_TOP + off, target = BAND_TARGET + off, floor = CUT_FLOOR + off;
  const bandWords = `${CUT_FLOOR + off}-${LEAN_BULK_TOP + off}%`;
  if (!current) {
    return { current: null, fits: null, advice: 'No goal is set in the Intake, so the phase is unknown. Set one in Settings › You.', weeksToBand: null, band: [floor, top] };
  }
  if (bf == null) {
    return {
      current, fits: null, weeksToBand: null, band: [floor, top],
      advice: `He is ${PHASE_WORDS[current]}, but no body fat is known, so the phase cannot be judged. A body-fat estimate is needed: Settings › You › Change more › Estimate it.`,
    };
  }
  // weeks to the top of the band at his pace, lean mass held constant
  const paceKg = (PACE[pace] || PACE.steady).kcal / 1000;
  let weeksToBand = 0;
  if (bf > target && Number.isFinite(weightKg) && weightKg > 0) {
    const lean = weightKg * (1 - bf / 100);
    const toLose = weightKg - lean / (1 - target / 100);
    weeksToBand = Math.max(1, Math.ceil(toLose / paceKg));
  } else if (bf > target) {
    weeksToBand = null; // no weight to compute from
  }
  const paceWords = PACE[pace] ? `his ${pace} pace` : 'a steady pace';
  const weeksWords = weeksToBand ? `about ${weeksToBand} week${weeksToBand === 1 ? '' : 's'} to ${target}% at ${paceWords}` : `the weeks to ${target}% are unknown without a weight`;
  const then = `Then a lean bulk${goalFor ? ` for ${goalFor}` : ''}.`;
  const lead = `A lean bulk usually starts at or below ${bandWords}`;
  let fits, advice;
  if (bf > top) {
    if (current === 'cut') {
      fits = true;
      advice = `${lead}, so the cut comes first: ${weeksWords}. ${then}`;
    } else {
      fits = false;
      advice = `${lead}. At ${bf}% the usual advice is to cut first: ${weeksWords}. ${then}`;
    }
  } else if (current === 'cut') {
    fits = bf > floor;
    advice = fits
      ? `He is near the lean-bulk band: ${weeksToBand ? weeksWords : `already at or under ${target}%`}. ${then}`
      : `At ${bf}% he is already inside the lean-bulk band, so a further cut is not needed for a physique goal. A lean bulk can start now.`;
  } else if (current === 'gain') {
    fits = true;
    advice = `At ${bf}% he is inside the lean-bulk band (${bandWords}), so a lean bulk fits. Hold the gain slow so fat stays under ${top}%.`;
  } else {
    fits = true;
    advice = `At ${bf}% he is inside the lean-bulk band (${bandWords}). A lean bulk is open to him whenever he chooses.`;
  }
  return { current, fits, advice, weeksToBand, band: [floor, top] };
}

// THE STANDING. Pure: everything is handed in.
//   intake:   Profile.md's intake block, or null
//   goals:    getFitnessGoals(), or null
//   health:   Apple Health days, oldest first (any window; trimmed to 28 days before `today`)
//   sessions: loadSessions() result, or null when unreadable
//   today:    'YYYY-MM-DD'
export function computeStanding({ intake = null, goals = null, health = [], sessions = null, today }) {
  const t = dayNum(today);
  const days = (health || []).filter((d) => d?.date && dayNum(d.date) <= t && dayNum(d.date) > t - WINDOW_DAYS);
  const facts = intake?.facts || {};
  const lines = [];

  // ---- weight
  const weighIns = weighInsOf(days);
  const trend = computeWeightTrend(days, today);
  const spanDays = weighIns.length >= 2 ? dayNum(weighIns[weighIns.length - 1].on) - dayNum(weighIns[0].on) : 0;
  const slope = weighIns.length >= 3 && spanDays >= 7 ? weightSlope(weighIns) : null;
  const weight = {
    latestKg: trend?.latestKg ?? null,
    latestDate: trend?.latestDate ?? null,
    deltaKg: trend?.deltaKg ?? null,
    spanDays: trend?.spanDays ?? null,
    weighIns: weighIns.length,
    perWeekKg: slope == null ? null : Math.round(slope * 7 * 100) / 100,
  };
  const weightKg = weight.latestKg ?? num(facts.weightKg);

  // ---- body composition: a recent Apple Health reading beats an estimate
  const hDay = [...days].reverse().find((d) => bodyFat(d.bodyFatPct) != null);
  let bf = null, range = null, method = null, source = null;
  if (hDay && (!intake?.on || hDay.date >= intake.on || bodyFat(facts.bodyFatPct) == null)) {
    bf = bodyFat(hDay.bodyFatPct); method = 'health'; source = `Apple Health, ${hDay.date}`;
  } else if (bodyFat(facts.bodyFatPct) != null) {
    bf = bodyFat(facts.bodyFatPct);
    range = Array.isArray(facts.bodyFatRange) && facts.bodyFatRange.length === 2 && facts.bodyFatRange.every((x) => Number.isFinite(Number(x)))
      ? facts.bodyFatRange.map(Number) : null;
    method = facts.bodyFatMethod || null;
    source = `the Intake${intake?.on ? `, ${intake.on}` : ''}`;
  }
  const leanKg = bf != null && Number.isFinite(weightKg) ? r1(weightKg * (1 - bf / 100)) : null;
  const goalFor = Array.isArray(goals?.goalMuscles) && goals.goalMuscles.length
    ? `his goal muscles (${goals.goalMuscles.slice(0, 4).join(', ')}${goals.goalMuscles.length > 4 ? ', and more' : ''})`
    : null;
  const phase = phaseVerdict({ bf, sex: facts.sex, goal: facts.goal, pace: facts.pace, weightKg, goalFor });
  const bodyComp = { pct: bf, range, method, methodWords: methodWords(method), source, leanKg, weightKg: Number.isFinite(weightKg) ? weightKg : null };

  if (bf == null) {
    lines.push('Body fat: unknown. No Apple Health reading and no estimate in the Intake.');
  } else {
    const how = [range ? `estimate ${range[0]}-${range[1]}%` : null, methodWords(method)].filter(Boolean).join(', ');
    lines.push(`Body fat: ~${bf}%${how ? ` (${how})` : ''}, from ${source}.${leanKg != null ? ` Lean mass about ${leanKg} kg.` : ' Lean mass unknown without a weight.'}`);
  }
  lines.push(phase.current
    ? `Phase: ${phase.current}${facts.pace && phase.current !== 'maintain' ? `, ${facts.pace} pace` : ''}. Fits his goal: ${phase.fits == null ? 'unknown' : phase.fits ? 'yes' : 'no'}.`
    : 'Phase: unknown. No goal in the Intake.');

  // ---- activity
  const stepDays = days.filter((d) => num(d.steps) != null && num(d.steps) > 0);
  const stepsAvg = stepDays.length ? Math.round(avg(stepDays.map((d) => num(d.steps)))) : null;
  const stepsTarget = num(goals?.stepsTarget);
  const stepsMet = stepsTarget ? stepDays.filter((d) => num(d.steps) >= stepsTarget).length : null;
  const activeDays = days.map((d) => num(d.activeEnergyKcal)).filter((n) => n != null && n > 50);
  const activeAvg = activeDays.length ? Math.round(avg(activeDays)) : null;
  const since = t - WINDOW_DAYS;
  const done = Array.isArray(sessions)
    ? sessions.filter((s) => s?.finishedAt && (s.date ? dayNum(s.date) : dayNum(String(s.finishedAt).slice(0, 10))) > since && (s.date ? dayNum(s.date) : dayNum(String(s.finishedAt).slice(0, 10))) <= t).length
    : null;
  const perWeek = done == null ? null : r1(done / (WINDOW_DAYS / 7));
  const daysPerWeek = num(goals?.daysPerWeek);
  const activity = { stepsAvg, stepsLogged: stepDays.length, stepsTarget, stepsMet, activeAvg, activeDays: activeDays.length, sessions: done, sessionsPerWeek: perWeek, daysPerWeek };

  if (stepsAvg == null) lines.push(`Steps: unknown. No step counts in the last ${WINDOW_DAYS} days.`);
  else lines.push(`Steps: ${fmt(stepsAvg)} a day across ${stepDays.length} logged days. ${stepsTarget ? `${stepsMet} of ${stepDays.length} days met his ${fmt(stepsTarget)} target.` : 'No step target set, so days met is unknown.'}`);
  lines.push(activeAvg == null
    ? `Active energy: unknown. No readings in the last ${WINDOW_DAYS} days.`
    : `Active energy: ${fmt(activeAvg)} kcal a day across ${activeDays.length} days.`);
  if (perWeek == null) lines.push('Training: unknown. The session log could not be read.');
  else lines.push(`Training: ${done} sessions in 4 weeks, ${perWeek} a week${daysPerWeek ? ` against his plan of ${daysPerWeek}` : ', no weekly plan set'}.`);

  // ---- recovery: the last 7 days against the 21 before them
  const split = (key) => {
    const vals = days.map((d) => ({ n: dayNum(d.date), v: num(d[key]) })).filter((x) => x.v != null && x.v > 0);
    const recent = vals.filter((x) => x.n > t - 7).map((x) => x.v);
    const prior = vals.filter((x) => x.n <= t - 7).map((x) => x.v);
    return { all: vals.map((x) => x.v), recent, prior };
  };
  const sleep = split('sleepAsleepMinutes');
  const sleepAvgH = sleep.all.length ? r1(avg(sleep.all) / 60) : null;
  const hrv = split('hrv');
  const hrvAvg = hrv.all.length ? Math.round(avg(hrv.all)) : null;
  let hrvChangePct = null, hrvDown = null;
  if (hrv.recent.length >= 3 && hrv.prior.length >= 3) {
    hrvChangePct = Math.round(((avg(hrv.recent) - avg(hrv.prior)) / avg(hrv.prior)) * 100);
    hrvDown = avg(hrv.recent) <= avg(hrv.prior) * (1 - HRV_DROP);
  }
  const rhr = split('restingHeartRate');
  const rhrAvg = rhr.all.length ? Math.round(avg(rhr.all)) : null;
  const rhrChange = rhr.recent.length >= 3 && rhr.prior.length >= 3 ? r1(avg(rhr.recent) - avg(rhr.prior)) : null;
  const recovery = { sleepAvgH, sleepNights: sleep.all.length, hrvAvg, hrvChangePct, hrvDown, rhrAvg, rhrChange };

  lines.push(sleepAvgH == null
    ? `Sleep: unknown. No nights recorded in the last ${WINDOW_DAYS} days.`
    : `Sleep: ${sleepAvgH} h a night across ${sleep.all.length} recorded nights of ${WINDOW_DAYS}.`);
  if (hrvAvg == null) lines.push(`HRV: unknown. No readings in the last ${WINDOW_DAYS} days.`);
  else if (hrvChangePct == null) lines.push(`HRV: ${hrvAvg} ms average. Too few readings to judge a trend.`);
  else lines.push(`HRV: ${hrvAvg} ms average; last 7 days ${hrvChangePct > 0 ? '+' : ''}${hrvChangePct}% against the prior 21.${hrvDown ? ' That is a down-trend.' : ''}`);
  if (rhrAvg == null) lines.push(`Resting heart rate: unknown. No readings in the last ${WINDOW_DAYS} days.`);
  else lines.push(`Resting heart rate: ${rhrAvg} bpm average${rhrChange == null ? '; too few readings to judge a trend' : `; last 7 days ${rhrChange > 0 ? '+' : ''}${rhrChange} bpm against the prior 21`}.`);

  if (weight.latestKg == null) lines.push(`Weight: unknown. No weigh-ins in the last ${WINDOW_DAYS} days.`);
  else {
    const change = weight.deltaKg == null ? 'one weigh-in, no trend yet' : `${weight.deltaKg > 0 ? '+' : ''}${weight.deltaKg} kg over ${weight.spanDays} days`;
    const rate = weight.perWeekKg == null ? (weight.deltaKg == null ? '' : '; too few weigh-ins for a weekly rate') : `; ${weight.perWeekKg > 0 ? '+' : ''}${weight.perWeekKg} kg a week across ${weight.weighIns} weigh-ins`;
    lines.push(`Weight: ${weight.latestKg} kg on ${weight.latestDate}; ${change}${rate}.`);
  }

  // ---- the strategy line, in plain words
  let strategy;
  if (!phase.current) strategy = phase.advice;
  else if (bf == null) strategy = phase.advice;
  else {
    const est = [range ? `estimate ${range[0]}-${range[1]}%` : null, methodWords(method)].filter(Boolean).join(', ');
    strategy = `He is ${PHASE_WORDS[phase.current]} at ~${bf}%${est ? ` (${est})` : ''}. ${phase.advice}`;
  }

  return { bodyComp, phase, activity, recovery, weight, lines, strategy };
}

export const STANDING_HEAD = 'WHERE HE STANDS (code-computed from the last 28 days; every number is real; a missing one says so):';

export function formatStanding(s, reviewLines = null) {
  const out = [STANDING_HEAD, ...s.lines.map((l) => `- ${l}`), `- STRATEGY: ${s.strategy}`];
  if (Array.isArray(reviewLines) && reviewLines.length) {
    out.push('', "THIS WEEK'S NUMBERS REVIEW (code):", ...reviewLines.map((l) => `- ${l}`));
  }
  return out.join('\n');
}

// Loads every record and formats the block. Each source fails on its own: a
// record that cannot be read becomes an "unknown" line, never an invention.
export async function standingContext(vaultPath) {
  const { localDateISO } = await import('./localDate.js');
  const today = localDateISO();
  const [{ getProfile }, { getFitnessGoals }, { loadRecentDays }, { loadSessions }, { readReviewState }] = await Promise.all([
    import('./profile.js'), import('./fitnessGoals.js'), import('./healthData.js'), import('./workoutSessions.js'), import('./fuelReview.js'),
  ]);
  const [profile, goals, health, sessions, review] = await Promise.all([
    getProfile(vaultPath).catch(() => null),
    getFitnessGoals(vaultPath).catch(() => null),
    loadRecentDays(WINDOW_DAYS).catch(() => []),
    loadSessions(vaultPath).catch(() => null),
    readReviewState().catch(() => ({})),
  ]);
  const s = computeStanding({ intake: profile?.intake || null, goals, health, sessions, today });
  return formatStanding(s, review?.last?.lines);
}
