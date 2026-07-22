import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadRecentDays } from './healthData.js';
import { loadRecentDays as loadNutritionDays } from './nutritionLog.js';
import { fetchEventsForDay } from './calendar.js';
import { loadRecipeData } from './recipes.js';
import { loadRotation } from './rotation.js';
import { getToday as getFoodLogToday } from './foodLog.js';
import { loadExerciseLibrary } from './exercises.js';
import { loadRoutines, WEEKDAYS, ACTIVE_REST } from './workouts.js';
import { loadSessions } from './workoutSessions.js';
import { computeStreaks } from './streaks.js';
import { Vault } from './vault.js';
import { createRecord, listRecords, updateRecord } from './inboxStore.js';
import { fileDecision } from './inbox.js';

// The briefs — Morning Dispatch (the day ahead), Evening Debrief (how the
// day actually went, and tomorrow's first block), and the Weekly Review
// (Sundays: this week against last). All are composed ENTIRELY from real
// data (no model call) and ride the inbox rails on their own trust ladders:
// draft → pending queue for approval; auto → filed into the journal (still
// on the record, still undoable); off → silent.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const CONFIG_PATH = () => path.join(dataRoot(), 'dispatch.json');

export const DISPATCH_MODES = ['off', 'draft', 'auto'];
export const DISPATCH_SLOTS = ['morning', 'evening', 'weekly'];
const DEFAULTS = {
  morning: { mode: 'draft', hour: 7 },
  evening: { mode: 'draft', hour: 21 },
  weekly: { mode: 'draft', hour: 17 },
};

function pad(n) {
  return String(n).padStart(2, '0');
}
function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
// Monday 00:00 of the week containing `now`, offset by whole weeks.
function mondayOf(now, weeksBack = 0) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - weeksBack * 7);
  return d;
}

function normalizeSlotConfig(raw, fallback) {
  return {
    mode: DISPATCH_MODES.includes(raw?.mode) ? raw.mode : fallback.mode,
    hour: Number.isInteger(raw?.hour) && raw.hour >= 0 && raw.hour <= 23 ? raw.hour : fallback.hour,
  };
}

function defaultConfig() {
  return Object.fromEntries(DISPATCH_SLOTS.map((s) => [s, { ...DEFAULTS[s] }]));
}

export async function getDispatchConfig() {
  if (!existsSync(CONFIG_PATH())) return defaultConfig();
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH(), 'utf8'));
    // migrate the original single-slot shape ({mode, hour} = the morning)
    if (raw.mode !== undefined && raw.morning === undefined) {
      return { ...defaultConfig(), morning: normalizeSlotConfig(raw, DEFAULTS.morning) };
    }
    return Object.fromEntries(DISPATCH_SLOTS.map((s) => [s, normalizeSlotConfig(raw[s], DEFAULTS[s])]));
  } catch {
    return defaultConfig();
  }
}

export async function setDispatchConfig(slot, patch) {
  if (!DISPATCH_SLOTS.includes(slot)) throw new Error(`slot must be one of: ${DISPATCH_SLOTS.join(', ')}`);
  const current = await getDispatchConfig();
  current[slot] = normalizeSlotConfig({ ...current[slot], ...patch }, current[slot]);
  await mkdir(dataRoot(), { recursive: true });
  const tmp = CONFIG_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(current, null, 2), 'utf8');
  await rename(tmp, CONFIG_PATH());
  return current;
}

/* ------------------------------ composition ------------------------------ */

// Deterministic daily-review pick — same date-hash + title sort the client
// uses, so the dispatch names the same concept Mission Control shows.
function reviewPick(pages) {
  const pool = pages
    .filter((p) => p.type === 'concept' || p.type === 'topic')
    .sort((a, b) => a.title.localeCompare(b.title));
  if (!pool.length) return null;
  const dateStr = todayISO();
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) h = (h * 31 + dateStr.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}

async function streakLine(vaultPath) {
  const s = await computeStreaks(vaultPath);
  const bits = [
    s.workoutStreak >= 2 ? `${s.workoutStreak}-day workout streak` : null,
    s.stepGoalStreak >= 2 ? `${s.stepGoalStreak}-day step-goal streak` : null,
    s.sleepGoalStreak >= 2 ? `${s.sleepGoalStreak}-day sleep-goal streak` : null,
  ].filter(Boolean);
  return bits.length ? `**Streaks.** ${bits.join(' · ')}.` : null;
}

function scheduledRoutineFor(routines, schedule, date) {
  const dayKey = WEEKDAYS[(date.getDay() + 6) % 7]; // JS Sunday=0 → weekdays array starts Monday
  const routineId = schedule?.[dayKey];
  return routines.find((r) => r.id === routineId) || null;
}

// Active rest (a walk/stretch day, no weights) is a schedule value, not a
// routine — resolving it through scheduledRoutineFor yields null, which used
// to make the briefs call it a plain "Rest day". Two readers of one schedule
// value must tell the same story (see trainingCheck.js).
function isActiveRestDay(schedule, date) {
  const dayKey = WEEKDAYS[(date.getDay() + 6) % 7];
  return schedule?.[dayKey] === ACTIVE_REST;
}

// Every section degrades honestly when its source is missing — the brief
// says what it can't see instead of inventing.
async function composeMorning(vaultPath, now) {
  const lines = [];

  // recovery
  try {
    const days = await loadRecentDays(7);
    const latest = [...days].reverse().find((d) => d.hrv != null || d.sleepAsleepMinutes != null || d.restingHeartRate != null);
    if (latest) {
      const bits = [];
      if (latest.hrv != null) {
        const others = days.filter((d) => d !== latest && d.hrv != null);
        const base = others.length ? others.reduce((s, d) => s + d.hrv, 0) / others.length : null;
        const delta = base ? Math.round(((latest.hrv - base) / base) * 100) : null;
        bits.push(`HRV ${Math.round(latest.hrv * 10) / 10} ms${delta != null ? ` (${delta >= 0 ? '+' : ''}${delta}% vs 7-day avg)` : ''}`);
      }
      if (latest.restingHeartRate != null) bits.push(`resting ${Math.round(latest.restingHeartRate)} bpm`);
      if (latest.sleepAsleepMinutes != null) bits.push(`${Math.floor(latest.sleepAsleepMinutes / 60)}h ${pad(latest.sleepAsleepMinutes % 60)}m asleep`);
      if (latest.steps != null) bits.push(`${latest.steps.toLocaleString()} steps`);
      // stale data must SAY it's stale — a three-day-old number quietly
      // presented as "yesterday" is a lie by omission
      const ageDays = Math.round((new Date(todayISO(now)) - new Date(latest.date)) / 86400000);
      const staleTag = ageDays > 1 ? ` (last data ${ageDays} days old — the health push isn't running)` : '';
      lines.push(`**Recovery.** ${bits.join(', ')}.${staleTag}`);
    } else {
      lines.push('**Recovery.** No health data yet.');
    }
  } catch {
    lines.push('**Recovery.** Unavailable.');
  }

  // calendar
  try {
    const events = await fetchEventsForDay(now);
    lines.push(events.length
      ? `**Today.** ${events.map((e) => `${e.time || '—'} ${e.label}`).join(' · ')}.`
      : '**Today.** Clear calendar.');
  } catch {
    lines.push('**Today.** Calendar unavailable.');
  }

  // fuel (the plan)
  try {
    const { recipes, profile } = await loadRecipeData(vaultPath);
    const rotation = await loadRotation(vaultPath, recipes);
    const foodLog = await getFoodLogToday();
    const extraP = foodLog.entries.reduce((s, e) => s + e.macros.p, 0);
    const eaten = Math.round(rotation.consumedTotals.p + extraP);
    const planned = Math.round(rotation.totals.p);
    const floor = profile?.proteinFloorG || null;
    lines.push(`**Fuel.** Rotation plans ${planned}g protein${floor ? ` against your ${floor}g floor` : ''}; ${eaten > 0 ? `${eaten}g already down` : 'nothing marked eaten yet'}.`);
  } catch {
    lines.push('**Fuel.** Rotation unavailable.');
  }

  // training (the plan) + the Coach's deload advisory when recovery says so
  try {
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines, schedule } = await loadRoutines(vaultPath, exercises);
    const routine = scheduledRoutineFor(routines, schedule, now);
    let line = routine
      ? `**Training.** ${routine.name} is scheduled — ${routine.exercises.length} exercise${routine.exercises.length === 1 ? '' : 's'}.`
      : isActiveRestDay(schedule, now)
        ? '**Training.** Active rest — a walk for your steps or a stretch; no weights today.'
        : '**Training.** Rest day.';
    try {
      const { computeDeloadSignal } = await import('./coach.js');
      const signal = computeDeloadSignal(await loadRecentDays(7));
      if (signal.advise && routine) line += ` Coach's advisory: ${signal.reason}.`;
    } catch { /* advisory is garnish */ }
    lines.push(line);
  } catch {
    lines.push('**Training.** Schedule unavailable.');
  }

  // money (only when something needs eyes — silence is the CFO's success state)
  try {
    const { detectSubscriptions, listTransactions } = await import('./money.js');
    const subs = detectSubscriptions(await listTransactions({ sinceMonths: 13 }));
    const soon = subs.filter((s) => {
      const days = Math.round((new Date(s.nextExpected) - now) / 86400000);
      return days >= 0 && days <= 3;
    });
    if (soon.length) {
      lines.push(`**Money.** ${soon.map((s) => `${s.merchant} ~$${s.amount.toFixed(0)} expected ${s.nextExpected === todayISO(now) ? 'today' : s.nextExpected}`).join(' · ')}.`);
    }
  } catch { /* optional */ }

  try {
    const streaks = await streakLine(vaultPath);
    if (streaks) lines.push(streaks);
  } catch { /* optional garnish */ }

  // daily review concept
  try {
    const vault = new Vault(vaultPath);
    const pick = reviewPick(await vault.listPages());
    if (pick) lines.push(`**Review.** Today's concept: ${pick.title}.`);
  } catch { /* optional */ }

  return lines;
}

// The debrief looks backwards (what actually happened) and one step forward.
async function composeEvening(vaultPath, now) {
  const lines = [];
  const t = todayISO(now);

  // fuel (the reality)
  try {
    const { recipes, profile } = await loadRecipeData(vaultPath);
    const rotation = await loadRotation(vaultPath, recipes);
    const foodLog = await getFoodLogToday();
    const extraP = foodLog.entries.reduce((s, e) => s + e.macros.p, 0);
    const eaten = Math.round(rotation.consumedTotals.p + extraP);
    const floor = profile?.proteinFloorG || null;
    if (floor) {
      lines.push(eaten >= floor
        ? `**Fuel.** Protein floor hit — ${eaten}g against ${floor}g.`
        : `**Fuel.** ${eaten}g protein against the ${floor}g floor — ${floor - eaten}g short.`);
    } else {
      lines.push(`**Fuel.** ${eaten}g protein logged today.`);
    }
  } catch {
    lines.push('**Fuel.** Rotation unavailable.');
  }

  // training (the reality)
  try {
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines, schedule } = await loadRoutines(vaultPath, exercises);
    const scheduled = scheduledRoutineFor(routines, schedule, now);
    const sessions = await loadSessions(vaultPath, { limit: 3 });
    const todaySession = sessions.find((s) => s.date === t);
    if (todaySession) {
      const sets = todaySession.exercises.reduce((n, e) => n + e.sets.length, 0);
      lines.push(`**Training.** ${todaySession.routineName} logged — ${todaySession.exercises.length} exercises, ${sets} sets.`);
    } else if (scheduled) {
      lines.push(`**Training.** ${scheduled.name} was scheduled — nothing logged yet.`);
    } else if (isActiveRestDay(schedule, now)) {
      lines.push('**Training.** Active rest today — a walk or stretch counts, nothing to log.');
    } else {
      lines.push('**Training.** Rest day, as planned.');
    }
  } catch {
    lines.push('**Training.** Unavailable.');
  }

  // movement (today's steps, if the phone has sent them)
  try {
    const days = await loadRecentDays(2);
    const todayData = days.find((d) => d.date === t);
    if (todayData?.steps != null) lines.push(`**Movement.** ${todayData.steps.toLocaleString()} steps today.`);
  } catch { /* optional */ }

  // tomorrow (first blocks + training)
  try {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const bits = [];
    try {
      const events = await fetchEventsForDay(tomorrow);
      if (events.length) bits.push(events.slice(0, 3).map((e) => `${e.time || '—'} ${e.label}`).join(' · '));
    } catch { /* calendar optional here */ }
    try {
      const { exercises } = await loadExerciseLibrary(vaultPath);
      const { routines, schedule } = await loadRoutines(vaultPath, exercises);
      const routine = scheduledRoutineFor(routines, schedule, tomorrow);
      if (routine) bits.push(`training: ${routine.name}`);
      else if (isActiveRestDay(schedule, tomorrow)) bits.push('training: active rest (walk / stretch)');
    } catch { /* optional */ }
    if (bits.length) lines.push(`**Tomorrow.** ${bits.join(' · ')}.`);
  } catch { /* optional */ }

  try {
    const streaks = await streakLine(vaultPath);
    if (streaks) lines.push(streaks);
  } catch { /* optional */ }

  return lines;
}

// The Weekly Review compares this week (Monday → now) against last week,
// section by section, from the same sources the daily briefs read.
async function composeWeekly(vaultPath, now) {
  const lines = [];
  const thisMon = todayISO(mondayOf(now));
  const lastMon = todayISO(mondayOf(now, 1));
  const inWeek = (dateStr, from, to) => dateStr && dateStr >= from && (!to || dateStr < to);

  // training volume
  try {
    const sessions = await loadSessions(vaultPath);
    const week = sessions.filter((s) => inWeek(s.date, thisMon));
    const prev = sessions.filter((s) => inWeek(s.date, lastMon, thisMon));
    const setCount = (list) => list.reduce((n, s) => n + s.exercises.reduce((m, e) => m + e.sets.length, 0), 0);
    if (week.length || prev.length) {
      const delta = week.length - prev.length;
      lines.push(`**Training.** ${week.length} session${week.length === 1 ? '' : 's'}, ${setCount(week)} sets this week (last week: ${prev.length} session${prev.length === 1 ? '' : 's'}, ${setCount(prev)} sets)${delta > 0 ? ' — up.' : delta < 0 ? ' — down.' : '.'}`);
    } else {
      lines.push('**Training.** Nothing logged either week.');
    }
  } catch {
    lines.push('**Training.** Unavailable.');
  }

  // protein-floor adherence from the nutrition archive
  try {
    const days = await loadNutritionDays(14);
    const score = (from, to) => {
      const tracked = days.filter((d) => inWeek(d.date, from, to) && d.floorMet != null);
      return { hit: tracked.filter((d) => d.floorMet).length, of: tracked.length };
    };
    const week = score(thisMon);
    const prev = score(lastMon, thisMon);
    if (week.of || prev.of) {
      lines.push(`**Fuel.** Protein floor hit ${week.hit}/${week.of} tracked day${week.of === 1 ? '' : 's'}${prev.of ? ` (last week ${prev.hit}/${prev.of})` : ''}.`);
    } else {
      lines.push('**Fuel.** No tracked nutrition days yet this week.');
    }
  } catch {
    lines.push('**Fuel.** Nutrition archive unavailable.');
  }

  // movement
  try {
    const days = await loadRecentDays(14);
    const avg = (from, to) => {
      const withSteps = days.filter((d) => inWeek(d.date, from, to) && d.steps != null);
      return withSteps.length ? Math.round(withSteps.reduce((s, d) => s + d.steps, 0) / withSteps.length) : null;
    };
    const week = avg(thisMon);
    const prev = avg(lastMon, thisMon);
    if (week != null) {
      lines.push(`**Movement.** Averaging ${week.toLocaleString()} steps/day${prev != null ? ` (last week ${prev.toLocaleString()})` : ''}.`);
    }
  } catch { /* optional */ }

  // vault activity (pages touched, via updated/created frontmatter)
  try {
    const vault = new Vault(vaultPath);
    const pages = (await vault.listPages()).filter((p) => inWeek(p.date, thisMon));
    if (pages.length) {
      const names = pages.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map((p) => p.title);
      lines.push(`**Vault.** ${pages.length} page${pages.length === 1 ? '' : 's'} touched this week — latest: ${names.join(', ')}.`);
    }
  } catch { /* optional */ }

  // money: spend this week vs last (only once the ledger has data)
  try {
    const { listTransactions } = await import('./money.js');
    const txns = await listTransactions({ sinceMonths: 2 });
    const spend = (from, to) => Math.round(txns.filter((t) => t.amount < 0 && inWeek(t.date, from, to)).reduce((s, t) => s - t.amount, 0));
    const week = spend(thisMon);
    const prev = spend(lastMon, thisMon);
    if (week || prev) lines.push(`**Money.** $${week} spent this week (last week $${prev}).`);
  } catch { /* optional */ }

  // inbox throughput
  try {
    const records = await listRecords();
    const week = records.filter((r) => r.kind !== 'dispatch' && r.createdAt && inWeek(todayISO(new Date(r.createdAt)), thisMon));
    if (week.length) {
      const filed = week.filter((r) => r.status === 'filed').length;
      const pending = week.filter((r) => r.status === 'pending').length;
      lines.push(`**Inbox.** ${week.length} capture${week.length === 1 ? '' : 's'} this week — ${filed} filed${pending ? `, ${pending} still waiting` : ''}.`);
    }
  } catch { /* optional */ }

  try {
    const streaks = await streakLine(vaultPath);
    if (streaks) lines.push(streaks);
  } catch { /* optional */ }

  return lines;
}

export async function composeDispatch(vaultPath, slot = 'morning', now = new Date()) {
  const dateLong = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' });
  if (slot === 'weekly') {
    const weekLong = mondayOf(now).toLocaleDateString('en-GB', { day: '2-digit', month: 'long' });
    const title = `Weekly Review — Week of ${weekLong}`;
    const lines = await composeWeekly(vaultPath, now);
    return { title, text: `${title}\n\n${lines.join('\n')}` };
  }
  const title = slot === 'evening' ? `Evening Debrief — ${dateLong}` : `Morning Dispatch — ${dateLong}`;
  const lines = slot === 'evening' ? await composeEvening(vaultPath, now) : await composeMorning(vaultPath, now);
  return { title, text: `${title}\n\n${lines.join('\n')}` };
}

/* ------------------------------ orchestration ----------------------------- */

// Daily slots are guarded per-day; the weekly slot per-week (since Monday),
// so a Sunday review can be run early by hand without a second composing.
// createdAt is a UTC instant — guard on its LOCAL calendar date, because a
// 7am AEST record is still "yesterday" in UTC and a UTC compare would keep
// re-running the brief every scheduler tick until the dates realign.
function localDateOf(record) {
  return record.createdAt ? todayISO(new Date(record.createdAt)) : '';
}
async function slotRecordForToday(slot) {
  const items = await listRecords();
  const since = slot === 'weekly' ? todayISO(mondayOf(new Date())) : todayISO();
  // legacy records (pre-slots) carry no slot field and were morning dispatches
  const slots = items.filter((r) => r.kind === 'dispatch' && (r.slot || 'morning') === slot && localDateOf(r) >= since);
  // errored records don't block the slot (same rationale + retry cap as the
  // daily review) — an orphaned compose used to silence the brief all day
  const live = slots.find((r) => r.status !== 'error');
  if (live) return live;
  return slots.length >= 3 ? slots[0] : null;
}

// Compose the slot's brief and put it on the inbox rails. Draft mode → a
// pending record awaiting approval; auto mode → filed immediately (undoable).
// Never runs twice for the same slot+day unless forced — a forced re-run
// supersedes an unactioned draft by discarding it first.
export async function runDispatch(vaultPath, { slot = 'morning', force = false } = {}) {
  if (!DISPATCH_SLOTS.includes(slot)) throw new Error(`slot must be one of: ${DISPATCH_SLOTS.join(', ')}`);
  const config = (await getDispatchConfig())[slot];
  const existing = await slotRecordForToday(slot);
  if (existing && !force) return { skipped: true, record: existing };
  if (existing && force && existing.status === 'pending') {
    await updateRecord(existing.id, { status: 'discarded', discardedAt: new Date().toISOString(), error: 'superseded by a re-run' });
  }

  const { title, text } = await composeDispatch(vaultPath, slot);
  const decision = {
    route: 'journal',
    confidence: 'high',
    title,
    reason: slot === 'weekly' ? 'Weekly review composed from the week\'s real data.' : `Scheduled ${slot} brief composed from live data.`,
    // system category — operational briefs never mix into personal reflections
    payload: {
      text,
      category: 'system',
      label: slot === 'weekly' ? 'Weekly review' : slot === 'morning' ? 'Morning dispatch' : 'Evening debrief',
    },
  };
  const record = {
    id: randomUUID().slice(0, 8),
    kind: 'dispatch',
    slot,
    text: title,
    source: 'dispatch',
    mode: config.mode,
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision,
  };
  await createRecord(record);

  if (config.mode === 'auto') {
    try {
      const { destination, undo } = await fileDecision(vaultPath, decision);
      return { record: await updateRecord(record.id, { status: 'filed', destination, undoData: undo, filedAt: new Date().toISOString(), auto: true }) };
    } catch (e) {
      return { record: await updateRecord(record.id, { status: 'pending', error: 'auto-filing failed: ' + e.message }) };
    }
  }
  return { record };
}

export async function getDispatchStatus(vaultPath) {
  const config = await getDispatchConfig();
  const today = {};
  for (const slot of DISPATCH_SLOTS) {
    const rec = await slotRecordForToday(slot);
    today[slot] = rec
      ? { id: rec.id, status: rec.status, destination: rec.destination || null, text: rec.decision?.payload?.text || null }
      : null;
  }
  // Training context for the Coach's missed-session rescue nudge: what's
  // scheduled today and whether anything got logged. Read-only, best-effort.
  let training = null;
  if (vaultPath) {
    try {
      const { exercises } = await loadExerciseLibrary(vaultPath);
      const { routines, schedule } = await loadRoutines(vaultPath, exercises);
      const scheduled = scheduledRoutineFor(routines, schedule, new Date());
      const sessions = await loadSessions(vaultPath, { limit: 3 });
      training = {
        scheduledName: scheduled ? scheduled.name : null,
        scheduledRoutineId: scheduled ? scheduled.id : null,
        loggedToday: sessions.some((s) => s.date === todayISO()),
      };
    } catch { /* context is garnish — never fail the status call over it */ }
  }
  return { config, today, training };
}

// Every 15 minutes: for each slot, when its hour has arrived and today's
// brief hasn't been composed yet, run it. The weekly slot only fires on
// Sundays (manual runs work any day). Off mode stays silent.
async function checkAndRun(vaultPath) {
  for (const slot of DISPATCH_SLOTS) {
    try {
      const config = (await getDispatchConfig())[slot];
      if (config.mode === 'off') continue;
      if (slot === 'weekly' && new Date().getDay() !== 0) continue;
      if (new Date().getHours() < config.hour) continue;
      if (await slotRecordForToday(slot)) continue;
      await runDispatch(vaultPath, { slot });
    } catch (err) {
      console.error(`${slot} brief failed:`, err.message);
    }
  }
}

export function startDispatchScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('dispatch');
    return checkAndRun(vaultPath);
  };
  tick();
  setInterval(tick, 15 * 60 * 1000);
}
