import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadRecentDays } from './healthData.js';
import { fetchEventsForDay } from './calendar.js';
import { loadRecipeData } from './recipes.js';
import { loadRotation } from './rotation.js';
import { getToday as getFoodLogToday } from './foodLog.js';
import { loadExerciseLibrary } from './exercises.js';
import { loadRoutines, WEEKDAYS } from './workouts.js';
import { loadSessions } from './workoutSessions.js';
import { computeStreaks } from './streaks.js';
import { Vault } from './vault.js';
import { createRecord, listRecords, updateRecord } from './inboxStore.js';
import { fileDecision } from './inbox.js';

// The daily briefs — Morning Dispatch (the day ahead) and Evening Debrief
// (how the day actually went, and tomorrow's first block). Both are composed
// ENTIRELY from real data (no model call) and ride the inbox rails on their
// own trust ladders: draft → pending queue for approval; auto → filed into
// the journal (still on the record, still undoable); off → silent.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const CONFIG_PATH = () => path.join(dataRoot(), 'dispatch.json');

export const DISPATCH_MODES = ['off', 'draft', 'auto'];
export const DISPATCH_SLOTS = ['morning', 'evening'];
const DEFAULTS = {
  morning: { mode: 'draft', hour: 7 },
  evening: { mode: 'draft', hour: 21 },
};

function pad(n) {
  return String(n).padStart(2, '0');
}
function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function normalizeSlotConfig(raw, fallback) {
  return {
    mode: DISPATCH_MODES.includes(raw?.mode) ? raw.mode : fallback.mode,
    hour: Number.isInteger(raw?.hour) && raw.hour >= 0 && raw.hour <= 23 ? raw.hour : fallback.hour,
  };
}

export async function getDispatchConfig() {
  if (!existsSync(CONFIG_PATH())) return { morning: { ...DEFAULTS.morning }, evening: { ...DEFAULTS.evening } };
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH(), 'utf8'));
    // migrate the original single-slot shape ({mode, hour} = the morning)
    if (raw.mode !== undefined && raw.morning === undefined) {
      return { morning: normalizeSlotConfig(raw, DEFAULTS.morning), evening: { ...DEFAULTS.evening } };
    }
    return {
      morning: normalizeSlotConfig(raw.morning, DEFAULTS.morning),
      evening: normalizeSlotConfig(raw.evening, DEFAULTS.evening),
    };
  } catch {
    return { morning: { ...DEFAULTS.morning }, evening: { ...DEFAULTS.evening } };
  }
}

export async function setDispatchConfig(slot, patch) {
  if (!DISPATCH_SLOTS.includes(slot)) throw new Error('slot must be morning or evening');
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
      if (latest.steps != null) bits.push(`${latest.steps.toLocaleString()} steps yesterday`);
      lines.push(`**Recovery.** ${bits.join(', ')}.`);
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

  // training (the plan)
  try {
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines, schedule } = await loadRoutines(vaultPath, exercises);
    const routine = scheduledRoutineFor(routines, schedule, now);
    lines.push(routine
      ? `**Training.** ${routine.name} is scheduled — ${routine.exercises.length} exercise${routine.exercises.length === 1 ? '' : 's'}.`
      : '**Training.** Rest day.');
  } catch {
    lines.push('**Training.** Schedule unavailable.');
  }

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
    } catch { /* optional */ }
    if (bits.length) lines.push(`**Tomorrow.** ${bits.join(' · ')}.`);
  } catch { /* optional */ }

  try {
    const streaks = await streakLine(vaultPath);
    if (streaks) lines.push(streaks);
  } catch { /* optional */ }

  return lines;
}

export async function composeDispatch(vaultPath, slot = 'morning', now = new Date()) {
  const dateLong = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' });
  const title = slot === 'evening' ? `Evening Debrief — ${dateLong}` : `Morning Dispatch — ${dateLong}`;
  const lines = slot === 'evening' ? await composeEvening(vaultPath, now) : await composeMorning(vaultPath, now);
  return { title, text: `${title}\n\n${lines.join('\n')}` };
}

/* ------------------------------ orchestration ----------------------------- */

async function slotRecordForToday(slot) {
  const items = await listRecords();
  const t = todayISO();
  // legacy records (pre-slots) carry no slot field and were morning dispatches
  return items.find((r) => r.kind === 'dispatch' && (r.slot || 'morning') === slot && (r.createdAt || '').slice(0, 10) === t) || null;
}

// Compose the slot's brief and put it on the inbox rails. Draft mode → a
// pending record awaiting approval; auto mode → filed immediately (undoable).
// Never runs twice for the same slot+day unless forced — a forced re-run
// supersedes an unactioned draft by discarding it first.
export async function runDispatch(vaultPath, { slot = 'morning', force = false } = {}) {
  if (!DISPATCH_SLOTS.includes(slot)) throw new Error('slot must be morning or evening');
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
    reason: `Scheduled ${slot} brief composed from live data.`,
    payload: { text },
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

export async function getDispatchStatus() {
  const config = await getDispatchConfig();
  const today = {};
  for (const slot of DISPATCH_SLOTS) {
    const rec = await slotRecordForToday(slot);
    today[slot] = rec
      ? { id: rec.id, status: rec.status, destination: rec.destination || null, text: rec.decision?.payload?.text || null }
      : null;
  }
  return { config, today };
}

// Every 15 minutes: for each slot, when its hour has arrived and today's
// brief hasn't been composed yet, run it. Off mode stays silent.
async function checkAndRun(vaultPath) {
  for (const slot of DISPATCH_SLOTS) {
    try {
      const config = (await getDispatchConfig())[slot];
      if (config.mode === 'off') continue;
      if (new Date().getHours() < config.hour) continue;
      if (await slotRecordForToday(slot)) continue;
      await runDispatch(vaultPath, { slot });
    } catch (err) {
      console.error(`${slot} brief failed:`, err.message);
    }
  }
}

export function startDispatchScheduler(vaultPath) {
  checkAndRun(vaultPath);
  setInterval(() => checkAndRun(vaultPath), 15 * 60 * 1000);
}
