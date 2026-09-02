import { randomUUID } from 'node:crypto';
import { fetchEventsForRange, WORKOUT_RE } from './calendar.js';
import { loadSources } from './sources.js';
import { loadExerciseLibrary } from './exercises.js';
import { loadRoutines, WEEKDAYS, ACTIVE_REST } from './workouts.js';
import { listCarryovers } from './workoutCarryover.js';
import { loadRecipeData } from './recipes.js';
import { createRecord, listRecords } from './inboxStore.js';

// The Commander's Sunday routine: a deterministic draft of the week ahead —
// training days from the schedule, calendar anchors and load per day,
// carry-overs due, training-vs-calendar conflicts — filed as a draft-gated
// vault note (Wiki/Plans/Week of <Monday>.md). Deterministic first: every
// line comes from structured data; no model involved.


function pad(n) { return String(n).padStart(2, '0'); }
function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
// The week being planned. From Sunday (or any other day) that is the NEXT
// Monday; on a Monday morning — the catch-up window for a Sunday the Mac
// slept through — it is TODAY, not the week after. Pure, exported for tests.
export function planTargetMonday(from = new Date()) {
  const d = new Date(from);
  if (d.getDay() !== 1) d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  d.setHours(0, 0, 0, 0);
  return d;
}
const nextMonday = planTargetMonday;
// Sunday from 16:00, and still Monday before noon if Sunday was missed —
// the per-week guard (planExistsForWeek) keeps it to one draft.
export function weekPlanWindowOpen(now = new Date()) {
  const day = now.getDay(), h = now.getHours();
  return (day === 0 && h >= 16) || (day === 1 && h < 12);
}
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// Overlaps between a workout-looking event and any other timed event that day.
export function dayConflicts(events) {
  const workout = events.find((e) => WORKOUT_RE.test(e.label || '') && e.time && e.end);
  if (!workout) return [];
  const ws = toMin(workout.time);
  const we = toMin(workout.end);
  return events
    .filter((e) => e !== workout && e.time && e.end)
    .filter((e) => toMin(e.time) < we && toMin(e.end) > ws)
    .map((e) => `${e.label} (${e.time}–${e.end}) overlaps ${workout.label} (${workout.time}–${workout.end})`);
}

// `deps.fetchEvents` lets a test hand in a calendar that fails.
export async function composeWeekPlan(vaultPath, now = new Date(), deps = {}) {
  const monday = nextMonday(now);
  const mondayIso = iso(monday);

  const { exercises } = await loadExerciseLibrary(vaultPath);
  const { routines, schedule } = await loadRoutines(vaultPath, exercises);
  // A CalDAV outage used to render as a beautifully clear week (`.catch(() =>
  // [])`), painting seven days of "Calendar: clear" he might plan around. The
  // failure is kept and said — once at the top, and on every day it blinds.
  const cal = await loadSources({ calendar: { load: () => (deps.fetchEvents || fetchEventsForRange)(7, monday), fallback: [] } });
  const events = cal.values.calendar;
  const calendarUnreadable = cal.failed[0]?.reason || null;
  const carryovers = await listCarryovers().catch(() => []);
  let floor = null;
  try { floor = (await loadRecipeData(vaultPath)).profile?.proteinFloorG || null; } catch { /* optional */ }

  const byDate = new Map();
  for (const e of events) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }

  const lines = [`# Week of ${monday.toLocaleDateString('en-GB', { day: '2-digit', month: 'long' })}`, '', 'Drafted by Nova from the training schedule, the calendar, and recorded carry-overs.', ''];
  if (calendarUnreadable) {
    lines.push(`> **Calendar: couldn't be read when this was drafted** (${calendarUnreadable}) — the days below show the training schedule only; the day-of briefs will carry the truth.`, '');
  }
  const allConflicts = [];
  let trainingDays = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const dIso = iso(d);
    const dayKey = WEEKDAYS[(d.getDay() + 6) % 7];
    const val = schedule?.[dayKey];
    const routine = val && val !== ACTIVE_REST ? routines.find((r) => r.id === val) : null;
    const training = routine ? `${routine.name} (${routine.exercises.length} exercises)` : val === ACTIVE_REST ? 'Active rest — walk / stretch' : 'Rest';
    if (routine) trainingDays++;

    const dayEvents = byDate.get(dIso) || [];
    const conflicts = dayConflicts(dayEvents);
    allConflicts.push(...conflicts.map((c) => `${d.toLocaleDateString('en-GB', { weekday: 'long' })}: ${c}`));

    const due = carryovers.filter((c) => c.forDate === dIso);
    const overdueInto = i === 0 ? carryovers.filter((c) => c.forDate < dIso) : [];

    lines.push(`## ${d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' })}`, '');
    lines.push(`- **Training:** ${training}`);
    if (due.length || overdueInto.length) {
      const bits = [...overdueInto.map((c) => `${c.exercises.map((e) => e.name).join(', ')} (OVERDUE)`), ...due.map((c) => c.exercises.map((e) => e.name).join(', '))];
      lines.push(`- **Carry-overs:** ${bits.join(' · ')}`);
    }
    if (dayEvents.length) {
      const first = dayEvents[0];
      const last = dayEvents[dayEvents.length - 1];
      lines.push(`- **Calendar:** ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'} (${first.time} ${first.label} → ${last.time} ${last.label})${dayEvents.length >= 5 ? ' — heavy day' : ''}`);
    } else {
      lines.push(calendarUnreadable ? "- **Calendar:** unknown — couldn't be read" : '- **Calendar:** clear');
    }
    if (conflicts.length) lines.push(`- ⚠ **Conflict:** ${conflicts.join('; ')}`);
    lines.push('');
  }

  // the training check's miss memory — a weekday that keeps not happening is
  // a planning fact, not a coaching one, so the week plan says it plainly
  try {
    const { missMemory } = await import('./trainingCheck.js');
    const { listRecords } = await import('./inboxStore.js');
    const { loadSessions } = await import('./workoutSessions.js');
    const sess = await loadSessions(vaultPath, { limit: 60 });
    const items = missMemory({ schedule, sessionDates: new Set(sess.map((s) => s.date)), records: await listRecords() });
    if (items.length) {
      const names = Object.fromEntries(routines.map((r) => [r.id, r.name]));
      lines.push(`> **Pattern:** ${items.map((it) => `${it.weekday} ${names[it.routineId] || it.routineId} missed ${it.missed} of the last ${it.of}`).join(' · ')} — schedule or life?`, '');
    }
  } catch { /* the plan stands without it */ }
  lines.push('---', '');
  lines.push(`**Week shape:** ${trainingDays} training day${trainingDays === 1 ? '' : 's'} scheduled${floor ? ` · protein floor ${floor}g/day` : ''}${carryovers.length ? ` · ${carryovers.length} carry-over${carryovers.length === 1 ? '' : 's'} outstanding` : ''}.`);
  if (allConflicts.length) lines.push('', `**Conflicts to resolve:** ${allConflicts.join(' · ')} — a move can be asked of Nova on Home ("move gym to …").`);

  return {
    mondayIso,
    title: `Week plan — ${monday.toLocaleDateString('en-GB', { day: '2-digit', month: 'long' })}`,
    relPath: `Wiki/Plans/Week of ${mondayIso}.md`,
    text: lines.join('\n'),
    conflicts: allConflicts,
    trainingDays,
    calendarUnreadable,
  };
}

async function planExistsForWeek(mondayIso) {
  const records = await listRecords();
  // a discarded draft must not block a re-run — a rejected plan is not a plan
  return records.some((r) => r.kind === 'week-plan' && r.status !== 'discarded' && r.decision?.payload?.relPath?.includes(mondayIso));
}

export async function runWeekPlan(vaultPath, { force = false } = {}) {
  const plan = await composeWeekPlan(vaultPath);
  if (!force && (await planExistsForWeek(plan.mondayIso))) return { skipped: 'already drafted' };
  const record = {
    id: randomUUID().slice(0, 8),
    kind: 'week-plan',
    text: plan.title,
    source: 'nova',
    mode: 'draft',
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision: {
      route: 'plan-note',
      confidence: 'high',
      title: plan.title,
      reason: `The week ahead, drafted: ${plan.trainingDays} training days${plan.calendarUnreadable ? ' — THE CALENDAR COULD NOT BE READ, so this is the training schedule only' : plan.conflicts.length ? `, ${plan.conflicts.length} conflict${plan.conflicts.length === 1 ? '' : 's'} flagged` : ', no conflicts'}. Approve to save it into Wiki/Plans/ — editable in Obsidian like everything else.`,
      payload: { relPath: plan.relPath, title: plan.title, text: plan.text },
    },
  };
  await createRecord(record);
  return { record };
}

// Sundays from 16:00 — before the 17:00 weekly review, so the review can be
// read against a drafted plan. >= hour + per-week guard (never exact-hour).
export function startWeekPlanScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('week-plan');
    try {
      const now = new Date();
      if (weekPlanWindowOpen(now)) await runWeekPlan(vaultPath);
    } catch (err) {
      console.error('week plan failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 3600_000);
}
