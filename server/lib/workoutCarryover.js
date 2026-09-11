import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// Carry-overs — exercises Hayden didn't get to in a session, pushed forward
// to another day so the week's work still lands. Deliberately operational
// (data/, not the vault): a carry-over is transient scheduling state that's
// created, done, and gone — the completed makeup session itself becomes a
// normal dated vault session like any other. He can re-push a carry-over as
// often as he needs until he actually does it.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STORE = () => path.join(dataRoot(), 'workout-carryovers.json');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function load() {
  if (!existsSync(STORE())) return [];
  try {
    const raw = JSON.parse(await readFile(STORE(), 'utf8'));
    return Array.isArray(raw.carryovers) ? raw.carryovers : [];
  } catch {
    return [];
  }
}

async function save(carryovers) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = STORE() + '.tmp';
  await writeFile(tmp, JSON.stringify({ carryovers }, null, 2), 'utf8');
  await rename(tmp, STORE());
}

function normalizeExercises(input) {
  const out = (Array.isArray(input) ? input : []).map((e) => ({
    exerciseId: String(e?.exerciseId || '').trim(),
    name: String(e?.name || '').trim().slice(0, 120),
    muscleGroup: String(e?.muscleGroup || '').trim(),
    trackingType: String(e?.trackingType || 'weight_reps'),
    targetSets: Math.min(12, Math.max(1, Number(e?.targetSets) || 3)),
    targetRepsLow: Math.max(0, Number(e?.targetRepsLow) || 0),
    targetRepsHigh: Math.max(0, Number(e?.targetRepsHigh) || 0),
  })).filter((e) => e.exerciseId && e.name);
  return out;
}

export async function listCarryovers() {
  return (await load()).sort((a, b) => (a.forDate < b.forDate ? -1 : a.forDate > b.forDate ? 1 : 0));
}

// One formatted line of recorded training debt for agent contexts — the sweep
// found every reasoning surface blind to carry-overs while the store sat here.
// Null when there's none (callers skip the section honestly).
export async function carryoverContext() {
  const list = await listCarryovers();
  if (!list.length) return null;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const bits = list.map((c) => {
    const status = c.forDate < today ? 'OVERDUE since ' + c.forDate : c.forDate === today ? 'due TODAY' : 'due ' + c.forDate;
    return `${c.exercises.map((e) => e.name).join(', ')} (from ${c.sourceRoutineName}, ${status})`;
  });
  return `Carried-over exercises (missed work pushed forward — real training debt): ${bits.join('; ')}.`;
}

// ONE DATE + ONE SOURCE ROUTINE = ONE ROW.
//
// His report, 12 Sep 2026: two identical "Upper Body — makeup" sessions on
// the 12th, written thirteen seconds apart. He had finished Monday's Upper
// Body with five exercises untouched and pushed them forward (the finish
// flow's "push them to a day"), then marked the same date a make-up day for
// the same routine — and `leftoversOf` derived the same five exercises,
// because none of them had been logged. Two writers, one statement, two rows.
//
// So a second write for the same date and routine is a RESTATEMENT of debt
// already recorded, not new debt: it merges into the row that is there. A
// write carrying `plannedAs` promotes that row (the day IS the make-up), so
// the order he happens to take the two actions in cannot change the result.

// Same routine? Ids decide when both rows have one — an ordinary carry-over
// never does (the UI posts only a name), so a name match has to count.
function sameRoutine(a, b) {
  if (a.sourceRoutineId && b.sourceRoutineId) return a.sourceRoutineId === b.sourceRoutineId;
  const na = String(a.sourceRoutineName || '').trim().toLowerCase();
  const nb = String(b.sourceRoutineName || '').trim().toLowerCase();
  return !!na && na === nb;
}

// Union by exerciseId. The incoming write is the fresher statement of intent,
// so it wins on targets for an exercise both name; anything only the existing
// row knows about is kept, never silently dropped.
function mergeExercises(existing, incoming) {
  const out = [...(existing || [])];
  for (const e of incoming) {
    const at = out.findIndex((x) => x.exerciseId === e.exerciseId);
    if (at >= 0) out[at] = e; else out.push(e);
  }
  return out;
}

export async function addCarryover({ forDate, sourceRoutineName, exercises, plannedAs = null, sourceRoutineId = null, sourceDate = null, note = '' }) {
  if (!DATE_RE.test(forDate || '')) throw new Error('forDate must be YYYY-MM-DD');
  const ex = normalizeExercises(exercises);
  if (!ex.length) throw new Error('no exercises to carry over');
  const carryovers = await load();
  const name = String(sourceRoutineName || '').trim().slice(0, 80) || 'Workout';

  const twin = carryovers.find((c) => c.forDate === forDate && sameRoutine(c, { sourceRoutineId, sourceRoutineName: name }));
  if (twin) {
    twin.exercises = mergeExercises(twin.exercises, ex);
    twin.sourceRoutineName = name;
    if (plannedAs) {
      // MAKE-UP DAY (lib/makeupDay.js): 'day' means this IS the plan for that
      // date, and it subsumes ordinary debt for the same session.
      twin.plannedAs = plannedAs;
      twin.sourceRoutineId = sourceRoutineId || twin.sourceRoutineId || null;
      twin.sourceDate = sourceDate || twin.sourceDate || null;
      if (note) twin.note = String(note).slice(0, 200);
    }
    twin.mergedAt = new Date().toISOString();
    await save(carryovers);
    return twin;
  }

  const record = {
    id: randomUUID().slice(0, 8),
    forDate,
    sourceRoutineName: name,
    exercises: ex,
    createdAt: new Date().toISOString(),
    // Absent on every ordinary carry-over — see the note above.
    ...(plannedAs ? { plannedAs, sourceRoutineId, sourceDate, ...(note ? { note } : {}) } : {}),
  };
  carryovers.push(record);
  await save(carryovers);
  return record;
}

export async function rescheduleCarryover(id, forDate) {
  if (!DATE_RE.test(forDate || '')) throw new Error('forDate must be YYYY-MM-DD');
  const carryovers = await load();
  const c = carryovers.find((x) => x.id === id);
  if (!c) throw new Error('carry-over not found');
  c.forDate = forDate;
  c.rescheduledAt = new Date().toISOString();

  // moving it onto a day that already holds this routine's debt is the same
  // restatement as adding it there would be — one row, not two
  const twin = carryovers.find((x) => x.id !== c.id && x.forDate === forDate && sameRoutine(x, c));
  if (twin) {
    twin.exercises = mergeExercises(twin.exercises, c.exercises || []);
    if (c.plannedAs && !twin.plannedAs) {
      twin.plannedAs = c.plannedAs;
      twin.sourceRoutineId = c.sourceRoutineId || twin.sourceRoutineId || null;
      twin.sourceDate = c.sourceDate || twin.sourceDate || null;
    }
    twin.rescheduledAt = c.rescheduledAt;
    twin.mergedAt = new Date().toISOString();
    await save(carryovers.filter((x) => x.id !== c.id));
    return twin;
  }

  await save(carryovers);
  return c;
}

export async function removeCarryover(id) {
  const carryovers = await load();
  const next = carryovers.filter((x) => x.id !== id);
  if (next.length === carryovers.length) return { removed: 0 };
  await save(next);
  return { removed: 1 };
}
