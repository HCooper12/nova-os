// CHECK <THING> — pure code, no model. Peter's line in the E.V. study
// (design/EVIE-STUDY.md §4C): "Evie, can you check the calibration of my
// targeting matrix? That doesn't feel zeroed in to me." Nova's answer to the
// same shape of ask — "check my bench", "check sleep", "check the plan" —
// is a deterministic lookup: read the record, compare to a baseline or a
// target, speak ONE sentence with the number and the delta. Never a model.
//
// Same discipline as reflex.js, for the same reason, applied to a different
// question shape: reflex.js answers "what IS X" (a direct read of the
// record); this answers "IS X on track" (the record held against a
// baseline/target). Both: STRICT matching (a shared word is not a fit —
// "check the eggs off the list" is shopping.done, not a check), NEVER guess
// (missing data says so and stops there), rotate frames rather than
// randomise them.
//
// `runCheck(thing, { reason, now, deps })` → `{ text, card? } | null`.
// null means "thing" matched no known category and no lift in his history —
// the caller (verbs.js) is the one that turns that into "I don't have a
// check for X", because only it knows whether a model should get a crack at
// it instead.

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (mins) => `${Math.floor(mins / 60)}h ${pad(Math.round(mins % 60))}m`;
const round1 = (n) => Math.round(n * 10) / 10;
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
// a delta's sign is said out loud — a negative number already carries its
// own '-', so only the positive case needs a literal '+'
const signed = (n, dp = 1) => {
  const r = Math.round(n * 10 ** dp) / 10 ** dp;
  return `${r > 0 ? '+' : ''}${r}`;
};

let rot = 0;
const pick = (arr) => arr[rot++ % arr.length];

// The lead clause when he named a reason ("that didn't feel right"). Every
// shape of his words collapses to the same generic lead — the exact
// adjective he used ("zeroed", "weird", "off") is not quoted back, because
// the number that follows is the real answer either way.
const leadFor = (label, reason) => (reason ? `${label} felt off: ` : '');

export const defaultDeps = {
  recentDays: (n = 14) => import('./healthData.js').then((m) => m.loadRecentDays(n)),
  foodToday: () => import('./foodLog.js').then((m) => m.getToday()),
  fuelProfile: () => import('./recipes.js').then((m) => m.loadRecipeData(process.env.VAULT_PATH)),
  sessions: () => import('./workoutSessions.js').then((m) => m.loadSessions(process.env.VAULT_PATH, { limit: 60 })),
  plan: () => import('./planToday.js').then((m) => m.getPlanTodayStatus()),
  inbox: () => import('./inboxStore.js').then((m) => m.listRecords()),
  roster: () => import('./roster.js').then((m) => m.checkAll()),
};

function ago(iso, now) {
  const ms = now.getTime() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return `${Math.round(h / 24)} days ago`;
}

/* ---------------------------- health metrics ----------------------------- */

async function checkSleep(deps, now, reason) {
  const days = await deps.recentDays(14).catch(() => []);
  const nights = days.filter((d) => d.sleepAsleepMinutes != null);
  if (!nights.length) return { text: 'No sleep reading on record for last night.' };
  const latest = nights[nights.length - 1];
  const baseline = nights.slice(0, -1);
  const lead = leadFor('Sleep', reason);
  if (!baseline.length) {
    return { text: `${lead}${hm(latest.sleepAsleepMinutes)} last night, only one night on record, no 14-day mean yet.` };
  }
  const meanMin = avg(baseline.map((d) => d.sleepAsleepMinutes));
  const deltaH = (latest.sleepAsleepMinutes - meanMin) / 60;
  const text = pick([
    `${lead}${hm(latest.sleepAsleepMinutes)} last night, ${signed(deltaH)}h vs your 14-day mean of ${hm(meanMin)}.`,
    `${lead}You slept ${hm(latest.sleepAsleepMinutes)} last night, ${signed(deltaH)}h against the 14-day average of ${hm(meanMin)}.`,
  ]);
  return { text };
}

async function checkHrv(deps, now, reason) {
  const days = await deps.recentDays(14).catch(() => []);
  const withHrv = days.filter((d) => d.hrv != null);
  if (!withHrv.length) return { text: 'No HRV reading on record for the last 14 days.' };
  const latest = withHrv[withHrv.length - 1];
  const baseline = withHrv.slice(0, -1);
  const lead = leadFor('HRV', reason);
  if (!baseline.length) {
    return { text: `${lead}HRV is ${Math.round(latest.hrv)}ms, only one reading on record, no 14-day baseline yet.` };
  }
  const meanMs = avg(baseline.map((d) => d.hrv));
  const pct = Math.round(((latest.hrv - meanMs) / meanMs) * 100);
  const text = pick([
    `${lead}HRV is ${Math.round(latest.hrv)}ms today, ${signed(pct, 0)}% vs your 14-day baseline of ${Math.round(meanMs)}ms.`,
    `${lead}HRV reads ${Math.round(latest.hrv)}ms, ${signed(pct, 0)}% against the 14-day baseline (${Math.round(meanMs)}ms).`,
  ]);
  return { text };
}

// No hourly step store exists in this codebase (healthData.js carries one
// cumulative steps figure per day, stamped with when it was captured) — so
// the "same hour on his 7-day mean" branch has nothing to read, and the
// honest fallback is the one the spec names for when hourly data does not
// exist: the daily mean, said as "so far" because today's figure is still
// running.
async function checkSteps(deps, now, reason) {
  const days = await deps.recentDays(7).catch(() => []);
  const today = localDate(now);
  const todayRow = days.find((d) => d.date === today);
  const lead = leadFor('Steps', reason);
  if (todayRow?.steps == null) return { text: 'No step count on record for today so far.' };
  const baseline = days.filter((d) => d.date !== today && d.steps != null);
  if (!baseline.length) return { text: `${lead}${todayRow.steps.toLocaleString()} steps so far today, no 7-day mean yet.` };
  const mean = Math.round(avg(baseline.map((d) => d.steps)));
  const deltaPct = Math.round(((todayRow.steps - mean) / mean) * 100);
  return { text: `${lead}${todayRow.steps.toLocaleString()} steps so far today, ${signed(deltaPct, 0)}% vs your 7-day daily mean of ${mean.toLocaleString()}.` };
}

async function checkWeight(deps, now, reason) {
  const days = await deps.recentDays(14).catch(() => []);
  const withW = days.filter((d) => d.weightKg != null);
  if (!withW.length) return { text: 'No weight reading on record for the last 14 days.' };
  // one entry per weigh-in (a carried-forward reading is the same event, not
  // a fresh data point — the rounded-comparisons/weight-trend rule)
  const weighIns = [];
  for (const d of withW) {
    const on = d.weightMeasuredOn || d.date;
    const last = weighIns[weighIns.length - 1];
    if (last && last.on === on) { last.kg = d.weightKg; continue; }
    weighIns.push({ on, kg: d.weightKg });
  }
  const latest = weighIns[weighIns.length - 1];
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const withinWeek = weighIns.filter((w) => new Date(`${w.on}T12:00:00`) >= sevenDaysAgo);
  const lead = leadFor('Weight', reason);
  if (withinWeek.length < 2) {
    return { text: `${lead}${round1(latest.kg)}kg, last weighed ${latest.on === localDate(now) ? 'today' : latest.on}, not enough weigh-ins this week for a 7-day mean.` };
  }
  const mean = avg(withinWeek.map((w) => w.kg));
  const delta = round1(latest.kg - mean);
  return { text: `${lead}${round1(latest.kg)}kg, ${signed(delta)}kg vs your 7-day mean of ${round1(mean)}kg.` };
}

/* --------------------------------- fuel ----------------------------------- */

async function checkFuel(kind, deps, now, reason) {
  const log = await deps.foodToday().catch(() => null);
  const { profile } = await deps.fuelProfile().catch(() => ({ profile: null }));
  const entries = log?.entries || [];
  const soFar = now.getHours() < 20 ? ' so far today' : ' today';
  if (kind === 'protein') {
    const p = Math.round(entries.reduce((s, e) => s + (e.macros?.p || 0), 0));
    const lead = leadFor('Protein', reason);
    if (!profile?.proteinFloorG) return { text: `${lead}${p}g logged${soFar}, no protein floor set to check against.` };
    const delta = p - profile.proteinFloorG;
    return { text: `${lead}${p}g logged${soFar}, ${signed(delta, 0)}g vs your ${profile.proteinFloorG}g floor.` };
  }
  const kcal = Math.round(entries.reduce((s, e) => s + (e.macros?.kcal || 0), 0));
  const lead = leadFor('Calories', reason);
  if (!profile?.targetKcal) return { text: `${lead}${kcal.toLocaleString()} kcal logged${soFar}, no calorie target set to check against.` };
  const delta = kcal - profile.targetKcal;
  return { text: `${lead}${kcal.toLocaleString()} kcal logged${soFar}, ${signed(delta, 0)} kcal vs your ${profile.targetKcal.toLocaleString()} kcal target.` };
}

/* -------------------------------- the lift -------------------------------- */

const isWorkingSetLocal = (x) => !!x && x.setType !== 'warmup' && (Number(x.weight) > 0 || Number(x.reps) > 0);

function topSetOf(session, exerciseId) {
  const ex = (session.exercises || []).find((e) => e.exerciseId === exerciseId);
  if (!ex) return null;
  const sets = (ex.sets || []).filter(isWorkingSetLocal);
  if (!sets.length) return null;
  return sets.reduce((best, s) => (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best), null);
}
function volumeOf(session, exerciseId) {
  const ex = (session.exercises || []).find((e) => e.exerciseId === exerciseId);
  if (!ex) return 0;
  return (ex.sets || []).filter(isWorkingSetLocal).reduce((v, s) => v + s.weight * s.reps, 0);
}

async function checkLift(name, deps, now, reason) {
  const sessions = await deps.sessions().catch(() => []);
  if (!sessions.length) return null; // no training history at all, not this layer's to answer
  const { matchLift } = await import('./reflex.js');
  const pool = [...new Map(sessions.flatMap((s) => s.exercises || []).map((e) => [e.exerciseId, { exerciseId: e.exerciseId, name: e.name }])).values()];
  const found = matchLift(pool, name);
  if (found.kind === 'none') return null; // not a recognised lift, let the model have a go
  if (found.kind === 'which') {
    const names = found.choices.map((c) => c.name);
    const last = names.pop();
    return { text: `Which ${name}, ${names.join(', ')} or ${last}?` };
  }
  const id = found.lift.exerciseId;
  const withLift = sessions.filter((s) => (s.exercises || []).some((e) => e.exerciseId === id));
  if (!withLift.length) return { text: `No ${found.lift.name} sessions on record.` };
  const [last, ...prior] = withLift;
  const prev3 = prior.slice(0, 3);
  const lastTop = topSetOf(last, id);
  const lastVolume = round1(volumeOf(last, id));
  const lead = leadFor(found.lift.name, reason);
  if (!prev3.length) {
    return { text: `${lead}${found.lift.name}: top set ${round1(lastTop.weight)}kg × ${lastTop.reps}, no prior sessions logged yet to compare.` };
  }
  const prevTops = prev3.map((s) => topSetOf(s, id)).filter(Boolean);
  const bestPrevWeight = prevTops.length ? Math.max(...prevTops.map((s) => round1(s.weight))) : null;
  const prevVolumes = prev3.map((s) => round1(volumeOf(s, id)));
  const avgPrevVolume = round1(avg(prevVolumes));
  const sameLoad = bestPrevWeight != null && round1(lastTop.weight) === bestPrevWeight;
  const loadLine = bestPrevWeight == null
    ? 'no load in the previous three'
    : sameLoad ? `same as your last three` : `${signed(round1(lastTop.weight - bestPrevWeight))}kg vs your last three`;
  const volPct = avgPrevVolume > 0 ? Math.round(((lastVolume - avgPrevVolume) / avgPrevVolume) * 100) : null;
  const volLine = volPct == null ? 'no volume in the previous three' : `volume ${signed(volPct, 0)}% ${volPct < 0 ? 'under' : volPct > 0 ? 'over' : 'flat vs'} your last three`;
  return { text: `${lead}${found.lift.name}: top set ${round1(lastTop.weight)}kg × ${lastTop.reps}, ${loadLine}; ${volLine}.` };
}

/* --------------------------------- plan ----------------------------------- */

async function checkPlan(deps, now, reason) {
  const status = await deps.plan().catch(() => null);
  const lead = leadFor('The plan', reason);
  if (!status?.today) return { text: 'No plan filed for today yet.' };
  const { status: recStatus, priorities } = status.today;
  if (recStatus === 'pending') return { text: "Today's plan is in your Inbox, waiting on your word." };
  if (recStatus === 'classifying' || recStatus === 'running') return { text: "Today's plan is still being composed." };
  if (recStatus === 'error') return { text: "Today's plan failed to compose, nothing filed yet." };
  if (!Array.isArray(priorities) || !priorities.length) return { text: 'No priorities on record for today.' };
  const done = priorities.filter((p) => p.outcome === 'done').length;
  const skipped = priorities.filter((p) => p.outcome === 'skipped').length;
  return { text: `${lead}${done} of ${priorities.length} of today's priorities done${skipped ? `, ${skipped} skipped` : ''}.` };
}

/* --------------------------------- inbox ----------------------------------- */

async function checkInbox(deps, now, reason) {
  const records = await deps.inbox().catch(() => null);
  if (!records) return { text: 'No inbox on record.' };
  const pending = records.filter((r) => r.status === 'pending');
  const lead = leadFor('The inbox', reason);
  if (!pending.length) return { text: `${lead}Inbox is clear, nothing pending.` };
  const oldest = [...pending].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))[0];
  return { text: `${lead}${pending.length} pending, oldest waiting ${ago(oldest.createdAt, now)}.` };
}

/* ------------------------------- readiness --------------------------------- */

async function checkReadiness(deps, now, reason) {
  const days = await deps.recentDays(14).catch(() => []);
  const { computeReadiness } = await import('./trainOverview.js');
  const r = computeReadiness(days);
  const lead = leadFor('Readiness', reason);
  if (r.score == null) return { text: 'No readiness inputs on record, nothing recent for HRV or sleep.' };
  return { text: `${lead}Readiness is ${r.score}, ${r.basis}.` };
}

/* -------------------------------- systems ---------------------------------- */

async function checkSystems(deps, now) {
  const all = await deps.roster().catch(() => null);
  if (!all) return { text: 'Could not run a systems check just now.' };
  const by = (s) => all.filter((x) => x.state === s);
  const off = by('off');
  const partial = by('partial');
  const setup = by('set-up');
  const working = by('working');
  if (off.length) {
    return { text: `Faults: ${off.map((x) => x.label).join(', ')} off${partial.length ? `, ${partial.map((x) => x.label).join(', ')} partial` : ''}. ${working.length} working, ${setup.length} set up.` };
  }
  if (partial.length) {
    return { text: `Partial: ${partial.map((x) => x.label).join(', ')}. ${working.length} working, ${setup.length} set up, none off.` };
  }
  return { text: `${working.length} systems working, ${setup.length} set up but unproven today, none off.` };
}

/* ---------------------------------------------------------------- dispatch */

// ONE alias map, read by both this file (what to compute) and verbs.js
// (whether "check X" is a SURE command — these words are always a check,
// present data or not — or a PROBE candidate that only counts as a command
// if his training history actually has a lift by that name). Two copies of
// this list would drift the moment one of them learned a new synonym.
export const CHECK_ALIASES = {
  sleep: 'sleep', 'my sleep': 'sleep',
  hrv: 'hrv', 'my hrv': 'hrv',
  steps: 'steps', 'my steps': 'steps', 'step count': 'steps', 'my step count': 'steps',
  weight: 'weight', 'my weight': 'weight', bodyweight: 'weight', 'body weight': 'weight', 'my bodyweight': 'weight',
  protein: 'protein', 'my protein': 'protein',
  calories: 'calories', 'my calories': 'calories', kcal: 'calories', 'my kcal': 'calories', 'calorie intake': 'calories',
  plan: 'plan', 'the plan': 'plan', "today's plan": 'plan', 'todays plan': 'plan', 'my plan': 'plan',
  inbox: 'inbox', 'the inbox': 'inbox', 'my inbox': 'inbox',
  readiness: 'readiness', 'my readiness': 'readiness', 'the readiness score': 'readiness', 'readiness score': 'readiness',
};

const CHECKERS = {
  sleep: checkSleep, hrv: checkHrv, steps: checkSteps, weight: checkWeight,
  plan: checkPlan, inbox: checkInbox, readiness: checkReadiness,
  protein: (deps, now, reason) => checkFuel('protein', deps, now, reason),
  calories: (deps, now, reason) => checkFuel('calories', deps, now, reason),
};

export async function runCheck(thing, { reason = null, now = new Date(), deps = defaultDeps } = {}) {
  const t = String(thing || '').trim().toLowerCase();
  if (!t) return null;
  if (t === 'systems' || t === 'everything' || t === 'all systems') return checkSystems(deps, now);
  const category = CHECK_ALIASES[t];
  if (category) return CHECKERS[category](deps, now, reason);
  // not one of the fixed things — try it as a lift name, his training
  // history is the only place a word like "bench" or "incline press" means
  // anything. A shared word is not a fit: matchLift requires every real word
  // he said to appear in the exercise's name, so "sleep" never matches
  // "Seated Leg Press" just because they share letters.
  return checkLift(t, deps, now, reason);
}
