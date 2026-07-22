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

export async function addCarryover({ forDate, sourceRoutineName, exercises }) {
  if (!DATE_RE.test(forDate || '')) throw new Error('forDate must be YYYY-MM-DD');
  const ex = normalizeExercises(exercises);
  if (!ex.length) throw new Error('no exercises to carry over');
  const carryovers = await load();
  const record = {
    id: randomUUID().slice(0, 8),
    forDate,
    sourceRoutineName: String(sourceRoutineName || '').trim().slice(0, 80) || 'Workout',
    exercises: ex,
    createdAt: new Date().toISOString(),
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
