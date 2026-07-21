import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { createVaultStateFile, createWriteLock } from './vaultStateFile.js';

const ROUTINES_REL_PATH = 'Wiki/Health/Workout Routines.md';
export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
// A schedule day can hold a routine id, be empty (rest), or this sentinel:
// "active rest" — no weight workout, but still active (a treadmill walk for
// steps, stretching). Distinct from plain rest so Nova plans around it.
export const ACTIVE_REST = 'active-rest';
const WEEKDAY_LABEL = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };

function resolveExercise(entry, exercisesById) {
  const ex = exercisesById.get(entry.exerciseId);
  return {
    exerciseId: entry.exerciseId,
    name: ex ? ex.name : '(deleted exercise)',
    muscleGroup: ex ? ex.muscleGroup : null,
    trackingType: ex ? ex.trackingType : 'weight_reps',
    targetSets: entry.targetSets,
    targetRepsLow: entry.targetRepsLow,
    targetRepsHigh: entry.targetRepsHigh,
  };
}

function bodyFor(routines, schedule, exercisesById) {
  const lines = ['# Workout Routines', '', 'Managed via Nova OS.', ''];
  const scheduled = WEEKDAYS.filter((d) => schedule[d]);
  if (scheduled.length) {
    lines.push('## This Week', '');
    for (const d of WEEKDAYS) {
      const r = schedule[d] && schedule[d] !== ACTIVE_REST ? routines.find((x) => x.id === schedule[d]) : null;
      const label = r ? r.name : schedule[d] === ACTIVE_REST ? '_active rest (walk / stretch)_' : '_rest / unscheduled_';
      lines.push(`- **${WEEKDAY_LABEL[d]}:** ${label}`);
    }
    lines.push('');
  }
  for (const r of routines) {
    lines.push(`## ${r.name}`, '');
    for (const entry of r.exercises) {
      const resolved = resolveExercise(entry, exercisesById);
      lines.push(`- ${resolved.name} — ${resolved.targetSets} × ${resolved.targetRepsLow}-${resolved.targetRepsHigh}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// Cache + iCloud staleness handling + external-edit detection live in the
// shared helper — see vaultStateFile.js.
const stateFile = createVaultStateFile({
  relPath: ROUTINES_REL_PATH,
  parse(raw) {
    const data = matter(raw).data;
    return { routines: Array.isArray(data.routines) ? data.routines : [], schedule: data.schedule || {} };
  },
  empty: () => ({ routines: [], schedule: {} }),
});

function getData(vaultPath) {
  return stateFile.load(vaultPath);
}

async function persist(vaultPath, data, exercisesById) {
  const frontmatter = { type: 'workout-routines', updated: new Date().toISOString().slice(0, 10), routines: data.routines, schedule: data.schedule };
  const content = matter.stringify(bodyFor(data.routines, data.schedule, exercisesById), frontmatter);
  await stateFile.write(vaultPath, content, data);
}

const withWriteLock = createWriteLock();

export async function loadRoutines(vaultPath, exercises) {
  const exercisesById = new Map(exercises.map((e) => [e.id, e]));
  const { routines, schedule } = await getData(vaultPath);
  return {
    routines: routines.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      exercises: r.exercises.map((entry) => resolveExercise(entry, exercisesById)),
    })),
    schedule,
    weekdays: WEEKDAYS,
  };
}

function validateExerciseEntries(exercises, exercisesById) {
  if (!Array.isArray(exercises)) throw new Error('exercises must be an array');
  return exercises.map((e) => {
    if (!e || typeof e.exerciseId !== 'string' || !exercisesById.has(e.exerciseId)) throw new Error('unknown exercise id');
    const targetSets = Number(e.targetSets) || 3;
    const targetRepsLow = Number(e.targetRepsLow) || 8;
    const targetRepsHigh = Number(e.targetRepsHigh) || targetRepsLow;
    return { exerciseId: e.exerciseId, targetSets, targetRepsLow, targetRepsHigh };
  });
}

export async function createRoutine(vaultPath, exercises, name, inputExercises) {
  const exercisesById = new Map(exercises.map((e) => [e.id, e]));
  const entries = validateExerciseEntries(inputExercises || [], exercisesById);
  return withWriteLock(async () => {
    const data = await getData(vaultPath);
    const routine = { id: randomUUID().slice(0, 8), name, exercises: entries, createdAt: new Date().toISOString() };
    const updated = { routines: [...data.routines, routine], schedule: data.schedule };
    await persist(vaultPath, updated, exercisesById);
    return { id: routine.id, name: routine.name, createdAt: routine.createdAt, exercises: entries.map((e) => resolveExercise(e, exercisesById)) };
  });
}

export async function updateRoutine(vaultPath, exercises, routineId, { name, exercises: inputExercises }) {
  const exercisesById = new Map(exercises.map((e) => [e.id, e]));
  const entries = inputExercises ? validateExerciseEntries(inputExercises, exercisesById) : null;
  return withWriteLock(async () => {
    const data = await getData(vaultPath);
    const idx = data.routines.findIndex((r) => r.id === routineId);
    if (idx === -1) throw new Error('routine not found');
    const current = data.routines[idx];
    const routine = {
      ...current,
      name: typeof name === 'string' && name.trim() ? name.trim() : current.name,
      exercises: entries || current.exercises,
    };
    const routines = [...data.routines];
    routines[idx] = routine;
    const updated = { routines, schedule: data.schedule };
    await persist(vaultPath, updated, exercisesById);
    return { id: routine.id, name: routine.name, createdAt: routine.createdAt, exercises: routine.exercises.map((e) => resolveExercise(e, exercisesById)) };
  });
}

export async function deleteRoutine(vaultPath, exercises, routineId) {
  const exercisesById = new Map(exercises.map((e) => [e.id, e]));
  return withWriteLock(async () => {
    const data = await getData(vaultPath);
    const routines = data.routines.filter((r) => r.id !== routineId);
    if (routines.length === data.routines.length) throw new Error('routine not found');
    const schedule = { ...data.schedule };
    for (const d of WEEKDAYS) if (schedule[d] === routineId) delete schedule[d];
    const updated = { routines, schedule };
    await persist(vaultPath, updated, exercisesById);
  });
}

export async function setScheduleDay(vaultPath, exercises, day, routineId) {
  if (!WEEKDAYS.includes(day)) throw new Error('invalid day');
  const exercisesById = new Map(exercises.map((e) => [e.id, e]));
  return withWriteLock(async () => {
    const data = await getData(vaultPath);
    if (routineId && routineId !== ACTIVE_REST && !data.routines.some((r) => r.id === routineId)) throw new Error('unknown routine id');
    const schedule = { ...data.schedule };
    if (routineId) schedule[day] = routineId;
    else delete schedule[day];
    const updated = { routines: data.routines, schedule };
    await persist(vaultPath, updated, exercisesById);
    return schedule;
  });
}
