import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
import { computeStreaks } from './streaks.js';
import { Vault } from './vault.js';
import { createRecord, listRecords, updateRecord } from './inboxStore.js';
import { fileDecision } from './inbox.js';

// The Morning Dispatch — the reel's "7am weekly update," made personal: a
// daily brief composed ENTIRELY from real data (no model call; a data brief
// doesn't need generated prose). It rides the inbox rails on its own trust
// ladder: draft → lands in the pending queue for approval; auto → files
// itself into the journal (still on the record, still undoable); off.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const CONFIG_PATH = () => path.join(dataRoot(), 'dispatch.json');

export const DISPATCH_MODES = ['off', 'draft', 'auto'];
const DEFAULTS = { mode: 'draft', hour: 7 };

function pad(n) {
  return String(n).padStart(2, '0');
}
function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export async function getDispatchConfig() {
  if (!existsSync(CONFIG_PATH())) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH(), 'utf8'));
    return {
      mode: DISPATCH_MODES.includes(raw.mode) ? raw.mode : DEFAULTS.mode,
      hour: Number.isInteger(raw.hour) && raw.hour >= 0 && raw.hour <= 23 ? raw.hour : DEFAULTS.hour,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function setDispatchConfig(patch) {
  const current = await getDispatchConfig();
  const next = {
    mode: DISPATCH_MODES.includes(patch.mode) ? patch.mode : current.mode,
    hour: Number.isInteger(patch.hour) && patch.hour >= 0 && patch.hour <= 23 ? patch.hour : current.hour,
  };
  await mkdir(dataRoot(), { recursive: true });
  await writeFile(CONFIG_PATH(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

/* ------------------------------ composition ------------------------------ */

// Deterministic daily-review pick — same date-hash the client uses, so the
// dispatch names the same concept Mission Control shows.
function reviewPick(pages) {
  // Sorted by title so the pick matches the client's Mission Control pool
  // regardless of directory-walk vs fetch ordering.
  const pool = pages
    .filter((p) => p.type === 'concept' || p.type === 'topic')
    .sort((a, b) => a.title.localeCompare(b.title));
  if (!pool.length) return null;
  const dateStr = todayISO();
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) h = (h * 31 + dateStr.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}

// Every section degrades honestly when its source is missing — the dispatch
// says what it can't see instead of inventing.
export async function composeDispatch(vaultPath, now = new Date()) {
  const lines = [];
  const dateLong = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' });

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

  // fuel
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

  // training
  try {
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines, schedule } = await loadRoutines(vaultPath, exercises);
    const dayKey = WEEKDAYS[(now.getDay() + 6) % 7]; // JS Sunday=0 → weekdays array starts Monday
    const routineId = schedule?.[dayKey];
    const routine = routines.find((r) => r.id === routineId);
    lines.push(routine
      ? `**Training.** ${routine.name} is scheduled — ${routine.exercises.length} exercise${routine.exercises.length === 1 ? '' : 's'}.`
      : '**Training.** Rest day.');
  } catch {
    lines.push('**Training.** Schedule unavailable.');
  }

  // streaks
  try {
    const s = await computeStreaks(vaultPath);
    const bits = [
      s.workoutStreak >= 2 ? `${s.workoutStreak}-day workout streak` : null,
      s.stepGoalStreak >= 2 ? `${s.stepGoalStreak}-day step-goal streak` : null,
      s.sleepGoalStreak >= 2 ? `${s.sleepGoalStreak}-day sleep-goal streak` : null,
    ].filter(Boolean);
    if (bits.length) lines.push(`**Streaks.** ${bits.join(' · ')}.`);
  } catch {
    /* streaks are optional garnish */
  }

  // daily review concept
  try {
    const vault = new Vault(vaultPath);
    const pages = await vault.listPages();
    const pick = reviewPick(pages);
    if (pick) lines.push(`**Review.** Today's concept: ${pick.title}.`);
  } catch {
    /* optional */
  }

  return {
    title: `Morning Dispatch — ${dateLong}`,
    text: `Morning Dispatch — ${dateLong}\n\n${lines.join('\n')}`,
  };
}

/* ------------------------------ orchestration ----------------------------- */

async function dispatchRecordForToday() {
  const items = await listRecords();
  const t = todayISO();
  return items.find((r) => r.kind === 'dispatch' && (r.createdAt || '').slice(0, 10) === t) || null;
}

// Compose today's dispatch and put it on the inbox rails. Draft mode → a
// pending record awaiting approval; auto mode → filed immediately (undoable).
// Never runs twice for the same day unless forced — a forced re-run
// supersedes an unactioned draft by discarding it first.
export async function runDispatch(vaultPath, { force = false } = {}) {
  const config = await getDispatchConfig();
  const existing = await dispatchRecordForToday();
  if (existing && !force) return { skipped: true, record: existing };
  if (existing && force && existing.status === 'pending') {
    await updateRecord(existing.id, { status: 'discarded', discardedAt: new Date().toISOString(), error: 'superseded by a re-run' });
  }

  const { title, text } = await composeDispatch(vaultPath);
  const decision = {
    route: 'journal',
    confidence: 'high',
    title,
    reason: 'Scheduled morning dispatch composed from live data.',
    payload: { text },
  };
  const record = {
    id: randomUUID().slice(0, 8),
    kind: 'dispatch',
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
  const todayRecord = await dispatchRecordForToday();
  return {
    config,
    today: todayRecord
      ? { id: todayRecord.id, status: todayRecord.status, destination: todayRecord.destination || null }
      : null,
  };
}

// Hourly check: when the configured hour arrives and today's dispatch hasn't
// been composed yet, run it. Off mode stays silent.
async function checkAndRun(vaultPath) {
  try {
    const config = await getDispatchConfig();
    if (config.mode === 'off') return;
    if (new Date().getHours() < config.hour) return;
    if (await dispatchRecordForToday()) return;
    await runDispatch(vaultPath);
  } catch (err) {
    console.error('Morning dispatch failed:', err.message);
  }
}

export function startDispatchScheduler(vaultPath) {
  checkAndRun(vaultPath);
  setInterval(() => checkAndRun(vaultPath), 15 * 60 * 1000);
}
