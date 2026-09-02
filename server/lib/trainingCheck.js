import { randomUUID } from 'node:crypto';
import { fetchEventsForDay, WORKOUT_RE } from './calendar.js';
import { loadExerciseLibrary } from './exercises.js';
import { loadRoutines, WEEKDAYS, ACTIVE_REST } from './workouts.js';
import { loadSessions } from './workoutSessions.js';
import { listCarryovers } from './workoutCarryover.js';
import { createRecord, listRecords } from './inboxStore.js';
import { note } from './heartbeat.js';

// "Did today's training happen?" Each evening Nova cross-checks the Train
// schedule AND the calendar against what's actually logged, and — when a
// workout was planned but nothing's logged — asks, so a session that happened
// off-app (or a swap to a walk) gets reconciled instead of silently lost.
// Approve notes it as done (a journal line, undoable); dismiss = didn't happen /
// swapped for active rest. One check per day.

// THREE REALITIES BEHIND A DISMISS, EACH WITH A CONSUMER. The card's why-chips
// (src/vals/valsInbox.js keeps the same four strings — a shared format) land
// here as the discard reason, and each one changes something:
//   didn't happen      → the miss memory below counts it (Coach + Week Plan read it)
//   swapped for active rest → a journal line, undoable, as its own filed receipt
//   doing it tonight   → tomorrow's check carries the promise and asks again
//   logged elsewhere   → the day is reconciled as trained (filed, streak counts it)
// A free-text reason stays on the record as before.
export const TRAINING_CHECK_REASONS = {
  didnt: "Didn't happen",
  swapped: 'Swapped for active rest',
  tonight: 'Doing it tonight',
  elsewhere: 'Logged elsewhere',
};
export function classifyReason(reason) {
  const r = String(reason || '').toLowerCase();
  if (!r) return null;
  if (/active rest|swapp?ed|walk|stretch/.test(r)) return 'swapped';
  if (/tonight|later today|this evening/.test(r)) return 'tonight';
  if (/logged elsewhere|elsewhere|other app|another app/.test(r)) return 'elsewhere';
  if (/didn.?t happen|did not happen|skipped|missed/.test(r)) return 'didnt';
  return null;
}

// What the check asked about — on the payload since 2 Sep; older records
// parse it back out of their own title.
export function plannedNameOf(record) {
  const p = record?.decision?.payload || {};
  if (p.plannedName) return p.plannedName;
  const m = /^Did (yesterday's )?(.+?) happen/.exec(record?.text || record?.decision?.title || '');
  return m ? m[2] : 'your workout';
}
export function checkDateOf(record) {
  const p = record?.decision?.payload || {};
  if (p.date) return p.date;
  return record?.createdAt ? todayISO(new Date(record.createdAt)) : null;
}

// The dismiss-with-reason, consumed. Returns the record as it now stands.
// Called by inbox.discardRecord for this kind; the plain discard (reason
// on record, nothing else) is the fallback for free text.
export async function resolveTrainingCheck(vaultPath, record, reason) {
  const { fileDecision } = await import('./inbox.js');
  const { updateRecord, createRecord: create } = await import('./inboxStore.js');
  const kind = classifyReason(reason);
  const name = plannedNameOf(record);
  const date = checkDateOf(record) || todayISO();
  const now = new Date().toISOString();
  if (kind === 'elsewhere' && vaultPath) {
    // reconciled as trained — the same filing as approve, with the truth in the line
    const decision = { ...record.decision, payload: { ...record.decision.payload, text: `Training reconciled ${date}: completed ${name} (logged elsewhere).` } };
    const { destination, undo } = await fileDecision(vaultPath, decision);
    return updateRecord(record.id, { status: 'filed', destination, undoData: undo, filedAt: now, auto: false, error: null, outcome: 'logged-elsewhere', decision });
  }
  if (kind === 'swapped' && vaultPath) {
    // the swap is a fact worth a line of its own — filed as its own receipt
    // (kind journal, undoable), while the check itself stays declined so
    // the streak does not count a walk as a session
    const decision = {
      route: 'journal', confidence: 'high', title: `Active rest ${date} — swapped ${name}`,
      reason: 'From the training check: he swapped the session for a walk or stretch.',
      payload: { text: `Training reconciled ${date}: swapped ${name} for active rest (a walk or stretch).`, category: 'training', label: 'Active rest' },
    };
    const { destination, undo } = await fileDecision(vaultPath, decision);
    await create({
      id: randomUUID().slice(0, 8), kind: 'journal', text: decision.title, source: 'nova', mode: 'draft',
      status: 'filed', createdAt: now, filedAt: now, auto: false, decision, destination, undoData: undo, parentId: record.id,
    });
  }
  const declineReason = String(reason).trim().slice(0, 300);
  return updateRecord(record.id, { status: 'discarded', discardedAt: now, error: null, declineReason, outcome: kind || 'other' });
}

// "Doing it tonight" yesterday, nothing logged since: the promise carries
// into today. Pure — records + dates in, the carry (or null) out.
export function carryFromYesterday(records, { yesterday, sessionDates }) {
  const promised = records.find((r) => r.kind === 'training-check' && r.status === 'discarded'
    && classifyReason(r.declineReason) === 'tonight' && checkDateOf(r) === yesterday);
  if (!promised) return null;
  const reconciled = records.some((r) => r.kind === 'training-check' && r.status === 'filed' && checkDateOf(r) === yesterday);
  if (reconciled || sessionDates.has(yesterday)) return null;
  return { name: plannedNameOf(promised), date: yesterday };
}

// MISS MEMORY — the skipped-days detector ([07] plan 3, the "didn't happen"
// consumer). Deterministic: over the last `weeks` weeks, each scheduled
// training weekday is done if a session was logged or a check was filed for
// that date, missed otherwise (a dismissed check and a silent day both count
// — the session did not happen). Two or more misses on the same weekday is
// the pattern worth a question. The same shape as detectSkippedExercises.
export function missMemory({ schedule = {}, sessionDates = new Set(), records = [], today = todayISO(), weeks = 4 } = {}) {
  const filed = new Set(records.filter((r) => r.kind === 'training-check' && r.status === 'filed').map(checkDateOf).filter(Boolean));
  const done = (d) => sessionDates.has(d) || filed.has(d);
  const out = [];
  const [y, m, dd] = today.split('-').map(Number);
  for (let i = 0; i < 7; i++) {
    const key = WEEKDAYS[i];
    const val = schedule[key];
    if (!val || val === ACTIVE_REST || val === 'rest') continue;
    let missed = 0, of = 0;
    for (let back = 1; back <= weeks * 7; back++) {
      const d = new Date(y, m - 1, dd - back);
      if ((d.getDay() + 6) % 7 !== i) continue;
      of++;
      if (!done(todayISO(d))) missed++;
    }
    if (of >= 2 && missed >= 2) out.push({ weekday: key[0].toUpperCase() + key.slice(1), routineId: val, missed, of });
  }
  return out.sort((a, b) => b.missed - a.missed || a.weekday.localeCompare(b.weekday));
}
export function missMemoryContext(items, routineNames = {}) {
  if (!items?.length) return '';
  const line = (it) => `- ${it.weekday} (${routineNames[it.routineId] || it.routineId}) — missed ${it.missed} of the last ${it.of}`;
  return `TRAINING DAYS THAT KEEP NOT HAPPENING (schedule vs what was logged or reconciled, last 4 weeks — ask whether it is the schedule or life; do not just prescribe more):\n${items.map(line).join('\n')}`;
}

// Pure: true while the calendar workout has not ended yet and it is before
// the 21:30 cap. An event without an end is given 90 minutes.
export function shouldWaitForWorkout(calWorkout, now = new Date()) {
  if (!calWorkout?.time) return false;
  const mins = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
  const start = mins(calWorkout.time);
  if (start == null) return false;
  const end = mins(calWorkout.end) ?? start + 90;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin >= 21 * 60 + 30) return false;
  return nowMin < end;
}

function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function runTrainingCheck(vaultPath) {
  const now = new Date();
  const t = todayISO(now);

  const records = await listRecords();
  if (records.some((r) => r.kind === 'training-check' && r.createdAt && todayISO(new Date(r.createdAt)) === t)) {
    return { skipped: 'already asked today' };
  }

  // what Train has scheduled today
  let scheduledRoutine = null;
  let isActiveRest = false;
  let loggedToday = false;
  let sessions = [];
  try {
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines, schedule } = await loadRoutines(vaultPath, exercises);
    const dayKey = WEEKDAYS[(now.getDay() + 6) % 7];
    const val = schedule?.[dayKey];
    isActiveRest = val === ACTIVE_REST;
    scheduledRoutine = val && !isActiveRest ? routines.find((r) => r.id === val) || null : null;
    sessions = await loadSessions(vaultPath, { limit: 40 });
    loggedToday = sessions.some((s) => s.date === t);
  } catch (e) {
    // couldn't look is not "nothing to do": a dead vault read used to produce
    // the same silence as a clean rest day. Say why, and leave the word where
    // Ops shows it, until a run that could look clears it.
    const why = `couldn't run — workout data unreadable (${e.message})`;
    console.error(`training check: ${why}`);
    await note('training-check', why);
    return { skipped: why, couldntLook: true };
  }
  await note('training-check', null);

  // a workout on the calendar today?
  let calWorkout = null;
  try {
    const evs = await fetchEventsForDay(now);
    calWorkout = evs.find((e) => WORKOUT_RE.test(e.label || '')) || null;
  } catch { /* calendar optional */ }
  // Don't ask a question the day hasn't answered: a calendar workout still
  // ahead (or under way) waits for the next hourly tick — capped at 21:30
  // so a late session is still asked about before the record goes stale.
  // Fifteen dismissals in a row on record, every one before he had trained.
  if (shouldWaitForWorkout(calWorkout, now)) return { skipped: `the calendar workout is at ${calWorkout.time} — asking after it` };

  // yesterday's "doing it tonight", still unlogged — the promise carries
  const sessionDates = new Set(sessions.map((s) => s.date));
  const yesterday = todayISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const carry = carryFromYesterday(records, { yesterday, sessionDates });

  // Nothing to reconcile if it's already logged, or nothing was planned (plain
  // rest / active rest with no session expected) — unless a promise carries.
  const planned = scheduledRoutine || calWorkout;
  if (loggedToday || (!planned && !carry)) return { skipped: 'nothing to reconcile' };
  if (!planned && carry) {
    // nothing planned today, but yesterday's promised session is unaccounted for
    const title = `Did yesterday's ${carry.name} happen in the end?`;
    const record = {
      id: randomUUID().slice(0, 8), kind: 'training-check', text: title, source: 'nova', mode: 'draft', status: 'pending', createdAt: now.toISOString(),
      decision: {
        route: 'journal', confidence: 'high', title,
        reason: `Yesterday you said you'd do ${carry.name} that night, and nothing was logged for it. Approve to note it as done; otherwise say what happened.`,
        payload: { text: `Training reconciled ${carry.date}: completed ${carry.name} (confirmed the day after).`, category: 'training', label: 'Training check', plannedName: carry.name, date: carry.date },
      },
    };
    await createRecord(record);
    return { proposed: true, record, carried: true };
  }

  const plannedName = scheduledRoutine ? scheduledRoutine.name : (calWorkout ? calWorkout.label : 'a workout');
  const trainBit = scheduledRoutine
    ? `${scheduledRoutine.name} is on your Train schedule`
    : isActiveRest ? 'Train has today as active rest' : 'Train has no routine set for today';
  const calBit = calWorkout ? ` and your calendar has "${calWorkout.label}"${calWorkout.time ? ` at ${calWorkout.time}` : ''}` : '';
  const mismatch = calWorkout && !scheduledRoutine
    ? " (it's on your calendar but not your Train schedule)"
    : (!calWorkout && scheduledRoutine ? " (it's on your Train schedule but not your calendar)" : '');

  // the check knows about recorded training debt — a miss can be pushed
  // forward from Train instead of silently vanishing
  let carryBit = '';
  try {
    const due = (await listCarryovers()).filter((c) => c.forDate <= t);
    if (due.length) carryBit = ` You also have ${due.length} carry-over${due.length === 1 ? '' : 's'} waiting on Train.`;
    else carryBit = " If you ran out of time mid-session, Train's finish flow can push the missed exercises to another day.";
  } catch { /* optional */ }

  const title = `Did ${plannedName} happen today?`;
  const record = {
    id: randomUUID().slice(0, 8),
    kind: 'training-check',
    text: title,
    source: 'nova',
    mode: 'draft',
    status: 'pending',
    createdAt: now.toISOString(),
    decision: {
      route: 'journal',
      confidence: 'high',
      title,
      reason: `${trainBit}${calBit}${mismatch}, but nothing's logged in Train yet. Approve to note it as done; otherwise dismiss and say what happened — swapped for a walk, doing it tonight, logged elsewhere, or didn't happen.${carryBit}${carry ? ` (Yesterday you said you'd do ${carry.name} that night — nothing was logged for it either.)` : ''}`,
      payload: { text: `Training reconciled ${t}: completed ${plannedName} (confirmed from the schedule).`, category: 'training', label: 'Training check', plannedName, date: t },
    },
  };
  await createRecord(record);
  return { proposed: true, record };
}

// Evenings — one nudge a day. `>= 19`, not `=== 19`: exact-hour equality on an
// hourly interval silently skips the day on tick drift or a restart. The
// store-based per-day guard in runTrainingCheck makes extra ticks harmless.
export function startTrainingCheckScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('training-check');
    try {
      if (new Date().getHours() >= 19) await runTrainingCheck(vaultPath);
    } catch (err) {
      console.error('training check failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 3600_000);
}
