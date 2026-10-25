// THE WEEKLY NUMBERS REVIEW — his ask, 26 Oct 2026: "it should intelligently
// make suggestions each week to alter my calorie and protein intake based on
// what it notices: my training, my weight, my activity from Apple Health."
//
// Code, no model. Once a week (Monday from 07:00, caught up later in the week
// if the Mac slept) it reads four records he already keeps — weigh-ins, the
// food log, Apple Health's active energy, and finished training sessions —
// and asks one question: do the numbers from his Intake still fit what his
// body is actually doing? If they do, nothing is filed; the Settings page says
// what was checked. If they don't, ONE pending card proposes new facts (a new
// weight, body fat, activity level, or a calibration of his daily burn), and
// the Intake's own compute() turns those into the numbers — so the arithmetic
// he approves is the same arithmetic as ever, every line printed, undoable.
//
// The guards are the point. A food log with missing meals makes the energy
// balance say he burns less than his resting rate; that is a gap in the log,
// not a metabolism, and the review says so instead of cutting his calories.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIVITY, PACE, compute, mergeFacts, bodyFat } from './intake.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE = () => path.join(process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data'), 'fuel-review.json');

export const KCAL_PER_KG = 7700; // the energy in a kilogram of body mass, the textbook figure
export const WINDOW_DAYS = 28;
const MIN_WEIGHINS = 4, MIN_SPAN_DAYS = 14, MIN_LOGGED_DAYS = 10;
const STEP_KCAL = 150; // the most one week's review moves the calibration
const DEAD_BAND_KCAL = 100; // closer than this to the current calibration is noise
// sessions a week each activity level describes (the labels in intake.js)
const SESSION_BAND = { sedentary: [0, 0.5], light: [1, 3], moderate: [3, 5], very: [6, 7], athlete: [7, 14] };

const round25 = (n) => Math.round(n / 25) * 25;
const dayNum = (iso) => Math.round(new Date(`${iso}T12:00:00Z`).getTime() / 86400000);
const fmt = (n) => Number(n).toLocaleString('en-AU');

// Least-squares slope of weight against time, in kg a day. A line through
// every weigh-in, so one heavy morning does not decide the week.
export function weightSlope(weighIns) {
  if (weighIns.length < 2) return null;
  const xs = weighIns.map((w) => dayNum(w.on)), ys = weighIns.map((w) => w.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den ? num / den : null;
}

// THE REVIEW. Pure: everything it needs is handed in, so the test can hand in
// his exact situation. Returns what it saw (lines), and a proposal or null.
//   intake:   { on, facts, plan } as stored on Profile.md
//   weighIns: [{ on, kg }] oldest first, one per real weigh-in
//   logs:     [{ date, kcal, targetKcal }] the food log, a day per entry
//   health:   [{ date, activeEnergyKcal, bodyFatPct }] Apple Health days
//   sessions: number of finished training sessions in the window
export function reviewNumbers({ intake, weighIns = [], logs = [], health = [], sessions = null, today }) {
  const facts = intake?.facts;
  if (!facts || !intake.plan) return { verdict: 'no-intake', lines: ['No Intake yet, so there are no numbers to review.'], proposal: null };
  const lines = [];
  const change = {};
  const weeks = WINDOW_DAYS / 7;

  // 1. weight: the newest weigh-in is the weight the plan should use
  const latest = weighIns[weighIns.length - 1];
  if (latest && Math.abs(latest.kg - Number(facts.weightKg)) >= 1) {
    change.weightKg = latest.kg;
    lines.push(`Weight: ${latest.kg} kg on ${latest.on}, against the ${facts.weightKg} kg your numbers use.`);
  }

  // 2. body fat from Apple Health, when a reading is recent and different
  const bfDay = [...health].reverse().find((d) => bodyFat(d.bodyFatPct) != null);
  if (bfDay && (bodyFat(facts.bodyFatPct) == null || Math.abs(bodyFat(bfDay.bodyFatPct) - bodyFat(facts.bodyFatPct)) >= 1)) {
    change.bodyFatPct = bodyFat(bfDay.bodyFatPct);
    lines.push(`Body fat: ${change.bodyFatPct}% in Apple Health on ${bfDay.date}${bodyFat(facts.bodyFatPct) == null ? ', so the resting burn can use Katch-McArdle' : `, against the ${facts.bodyFatPct}% your numbers use`}.`);
  } else if (bodyFat(facts.bodyFatPct) == null) {
    lines.push('Body fat: none in Apple Health, so the resting burn stays on Mifflin-St Jeor. Katch-McArdle starts the week a reading arrives.');
  }

  // 3. activity: Apple Health's active energy and his training, side by side.
  // The level only changes when BOTH say so; one disagreeing is a line, not a card.
  const base = compute(mergeFacts(facts, { ...change, tdeeAdjust: null }));
  const active = health.map((d) => Number(d.activeEnergyKcal)).filter((n) => Number.isFinite(n) && n > 50);
  const perWeek = sessions == null ? null : Math.round((sessions / weeks) * 10) / 10;
  if (active.length >= 10) {
    const avgActive = Math.round(active.reduce((a, b) => a + b, 0) / active.length);
    // daily burn ≈ resting + movement + ~10% to digest food; as a multiple of resting
    const implied = (base.bmr + avgActive) * 1.1 / base.bmr;
    const byEnergy = Object.entries(ACTIVITY).sort((a, b) => Math.abs(a[1].factor - implied) - Math.abs(b[1].factor - implied))[0][0];
    const band = SESSION_BAND[facts.activity];
    const sessionsDisagree = perWeek != null && band && (perWeek < band[0] || perWeek > band[1]);
    const bySessions = perWeek == null ? null : Object.entries(SESSION_BAND).find(([, [lo, hi]]) => perWeek >= lo && perWeek <= hi)?.[0];
    const energyLine = `Activity: ${fmt(avgActive)} kcal a day of active energy in Apple Health reads as ${byEnergy} (×${implied.toFixed(2)})`;
    const sessionLine = perWeek == null ? '' : `; ${perWeek} training sessions a week${bySessions ? ` fits ${bySessions}` : ''}`;
    if (byEnergy !== facts.activity && sessionsDisagree && bySessions === byEnergy) {
      change.activity = byEnergy;
      lines.push(`${energyLine}${sessionLine}. Both say ${byEnergy}, not ${facts.activity}.`);
    } else {
      lines.push(`${energyLine}${sessionLine}. Kept ${facts.activity}${byEnergy !== facts.activity ? ' because the two do not agree' : ''}.`);
    }
  } else {
    lines.push(`Activity: only ${active.length} days of active energy in the last ${WINDOW_DAYS}, too few to judge. Kept ${facts.activity}.`);
  }

  // 4. the energy balance: what he ate, what the scale did, so what he burns
  const goalKcal = Number(intake.plan.targetKcal) || 2000;
  const complete = logs.filter((d) => Number.isFinite(d.kcal) && d.kcal >= Math.max(1000, 0.5 * (d.targetKcal || goalKcal)));
  const spanDays = weighIns.length >= 2 ? dayNum(latest.on) - dayNum(weighIns[0].on) : 0;
  const slope = weightSlope(weighIns);
  let verdict = 'checked';
  const curAdj = Number(facts.tdeeAdjust) || 0;
  if (weighIns.length < MIN_WEIGHINS || spanDays < MIN_SPAN_DAYS || complete.length < MIN_LOGGED_DAYS) {
    verdict = 'not-enough';
    lines.push(`Energy balance: needs ${MIN_WEIGHINS} weigh-ins across ${MIN_SPAN_DAYS} days and ${MIN_LOGGED_DAYS} fully logged days; the last ${WINDOW_DAYS} days have ${weighIns.length} weigh-in${weighIns.length === 1 ? '' : 's'} across ${spanDays} days and ${complete.length} logged days. No calibration this week.`);
  } else {
    const avgIn = Math.round(complete.reduce((a, d) => a + d.kcal, 0) / complete.length);
    const perWeekKg = Math.round(slope * 7 * 100) / 100;
    const observed = Math.round(avgIn - slope * KCAL_PER_KG);
    const pace = facts.goal === 'maintain' ? null : PACE[facts.pace || 'steady'];
    const aimKg = pace ? Math.round((pace.kcal * 7 / KCAL_PER_KG) * 100) / 100 * (facts.goal === 'lose' ? -1 : 1) : 0;
    lines.push(`Scale: ${perWeekKg > 0 ? '+' : ''}${perWeekKg} kg a week across ${weighIns.length} weigh-ins; ${facts.goal === 'maintain' ? 'maintain aims for 0' : `${facts.pace || 'steady'} aims for ${aimKg > 0 ? '+' : ''}${aimKg}`}.`);
    // against each day's OWN target (targetHistory: a goal applies from its day on)
    const over = Math.round(complete.reduce((a, d) => a + d.kcal - (d.targetKcal || goalKcal), 0) / complete.length);
    lines.push(`Food log: ${fmt(avgIn)} kcal a day across ${complete.length} fully logged days, ${Math.abs(over) < 50 ? 'on target' : `${fmt(Math.abs(over))} ${over > 0 ? 'above' : 'below'} the day's target on average`}.`);
    // a burn below sedentary or above athlete is not a body, it is a gap in the record
    if (observed < base.bmr * 1.2 || observed > base.bmr * 2.2) {
      verdict = 'implausible';
      const low = observed < base.bmr * 1.2;
      lines.push(low
        ? `Energy balance: that works out to ${fmt(observed)} kcal a day burned, below the ${fmt(Math.round(base.bmr * 1.2))} even a desk-bound day burns. Part of the change is water, or meals missing from the log, so the target is not changed on it. A week with every meal logged lets the next review tell.`
        : `Energy balance: that works out to ${fmt(observed)} kcal a day burned, more than an athlete's ${fmt(Math.round(base.bmr * 2.2))}. A drop that fast is mostly water, so the target is not changed on it. A week with every meal logged lets the next review tell.`);
    } else {
      const raw = observed - base.formulaTdee;
      lines.push(`Energy balance: ${fmt(avgIn)} − (${perWeekKg} kg a week × ${KCAL_PER_KG} ÷ 7) = ${fmt(observed)} kcal a day really burned; the formula says ${fmt(base.formulaTdee)}.`);
      if (Math.abs(Math.max(-500, Math.min(500, raw)) - curAdj) >= DEAD_BAND_KCAL) {
        const step = Math.max(-STEP_KCAL, Math.min(STEP_KCAL, raw - curAdj));
        change.tdeeAdjust = round25(Math.max(-500, Math.min(500, curAdj + step)));
        change.tdeeAdjustOn = today;
        lines.push(`Calibration: ${curAdj ? `${curAdj > 0 ? '+' : ''}${curAdj} → ` : ''}${change.tdeeAdjust > 0 ? '+' : ''}${change.tdeeAdjust} kcal${Math.abs(raw - curAdj) > STEP_KCAL ? `, moved at most ${STEP_KCAL} a week so one odd month cannot swing it` : ''}.`);
      } else {
        lines.push(`Calibration: within ${DEAD_BAND_KCAL} kcal of what your numbers already assume. No change.`);
      }
    }
  }

  // 5. the proposal: only if the new facts move a number he would notice
  if (!Object.keys(change).length) return { verdict, lines, proposal: null };
  const facts2 = mergeFacts(facts, change);
  const plan2 = compute(facts2);
  const dK = plan2.targetKcal - goalKcal, dP = plan2.proteinG - Number(intake.plan.proteinG);
  if (Math.abs(dK) < 75 && Math.abs(dP) < 5 && !change.activity && !('bodyFatPct' in change)) {
    lines.push(`New figures would be ${fmt(plan2.targetKcal)} kcal and ${plan2.proteinG} g, too close to change your numbers for.`);
    return { verdict, lines, proposal: null };
  }
  return { verdict: 'propose', lines, proposal: { facts: facts2, plan: plan2, change, deltaKcal: dK, deltaProtein: dP } };
}

// ------------------------------------------------------------ the runner --

// the ISO week a date falls in, so the review runs once per week
export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

export async function readReviewState() {
  try { return JSON.parse(await readFile(STATE(), 'utf8')); } catch { return {}; }
}
async function writeReviewState(s) {
  await mkdir(path.dirname(STATE()), { recursive: true });
  await writeFile(STATE(), JSON.stringify(s, null, 2), 'utf8');
}

// Gather the four records and review. `force` runs it outside the weekly slot.
export async function runFuelReview(vaultPath, { now = new Date(), force = false } = {}) {
  const { localDateISO } = await import('./localDate.js');
  const today = localDateISO(now);
  const week = isoWeek(now);
  const state = await readReviewState();
  if (!force && state.week === week) return state.last || null;
  const { getProfile } = await import('./profile.js');
  const { loadRecentDays, weighInsOf } = await import('./healthData.js');
  const { loadCalendarDays } = await import('./nutritionLog.js');
  const { loadSessions } = await import('./workoutSessions.js');
  const profile = await getProfile(vaultPath).catch(() => null);
  const days = await loadRecentDays(WINDOW_DAYS);
  const logs = (await loadCalendarDays(WINDOW_DAYS)).filter((d) => d.date < today); // today is not over
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400000).toISOString();
  const sessions = (await loadSessions(vaultPath).catch(() => [])).filter((s) => s.finishedAt && s.finishedAt >= since).length;
  const r = reviewNumbers({ intake: profile?.intake, weighIns: weighInsOf(days), logs, health: days, sessions, today });

  const last = { on: today, week, verdict: r.verdict, lines: r.lines, recordId: null };
  if (r.proposal) {
    const { listRecords, createRecord } = await import('./inboxStore.js');
    const waiting = (await listRecords()).find((x) => x.source === 'fuel-review' && x.status === 'pending');
    if (waiting) {
      last.lines = [...r.lines, 'Last week\'s suggestion is still waiting in the Inbox, so no second card.'];
      last.recordId = waiting.id;
    } else {
      const { describe } = await import('./intake.js');
      const { randomUUID } = await import('node:crypto');
      const p = r.proposal;
      const d = describe(p.facts, p.plan);
      const sign = (n, u) => (n ? ` (${n > 0 ? '+' : '−'}${Math.abs(n)}${u})` : '');
      const title = `Weekly review: ${fmt(p.plan.targetKcal)} kcal${sign(p.deltaKcal, '')} · ${p.plan.proteinG} g protein${sign(p.deltaProtein, ' g')}`;
      const body = ['**What the week showed**', '', ...r.lines.map((l) => `- ${l}`), '', '**The numbers it leads to**', '', d.body].join('\n');
      const record = await createRecord({
        id: randomUUID().slice(0, 8),
        kind: 'intake',
        text: title,
        source: 'fuel-review',
        mode: 'review-all',
        status: 'pending',
        decision: { route: 'intake', title, payload: { facts: p.facts, plan: p.plan, body } },
        createdAt: now.toISOString(),
      });
      last.recordId = record.id;
      last.title = title;
    }
  }
  await writeReviewState({ week, last });
  return { ...last, fresh: true };
}

// Monday from 07:00 local, once per ISO week; a later tick that week catches
// up a Monday the Mac slept through.
export function startFuelReviewScheduler(vaultPath) {
  const tick = async () => {
    try {
      const { beat } = await import('./heartbeat.js');
      beat('fuel-review');
      const now = new Date();
      const dow = now.getDay() || 7;
      if (dow === 1 && now.getHours() < 7) return;
      const r = await runFuelReview(vaultPath, { now });
      if (r?.fresh && r.recordId && r.title) {
        const { sendPush } = await import('./push.js');
        sendPush({ title: 'Your numbers, reviewed', body: r.title, tag: 'fuel-review', url: '/#inbox' }).catch(() => {});
      }
    } catch (e) {
      console.error('fuel review failed:', e.message);
    }
  };
  setTimeout(tick, 90_000); // after boot settles
  setInterval(tick, 30 * 60 * 1000);
}
