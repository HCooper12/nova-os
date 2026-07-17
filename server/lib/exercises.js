import matter from 'gray-matter';
import { createVaultStateFile, createWriteLock } from './vaultStateFile.js';

const LIBRARY_REL_PATH = 'Wiki/Health/Exercise Library.md';

export const MUSCLE_GROUPS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
  'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs', 'Forearms', 'Full Body',
];

// How a set of this exercise is logged. "reps" fields elsewhere in the app
// (session sets, exercise-state carryover) double as seconds when the
// tracking type ends in "_time" — kept as one shape to avoid a second set of
// fields throughout the stack; only the label/visibility in the UI differs.
export const TRACKING_TYPES = ['weight_reps', 'bodyweight_reps', 'weight_time', 'bodyweight_time', 'weighted_bodyweight_reps'];
const DEFAULT_TRACKING_TYPE = 'weight_reps';

// A curated starting set spanning every muscle group — not an exhaustive
// database, just enough to build real routines with. Users can add any
// exercise not listed here via the "+ Create" flow in the picker. Third
// tuple element is trackingType; omitted means the default (weight_reps).
const SEED_EXERCISES = [
  ['Barbell Bench Press', 'Chest'], ['Incline Barbell Bench Press', 'Chest'], ['Decline Barbell Bench Press', 'Chest'],
  ['Dumbbell Bench Press', 'Chest'], ['Incline Dumbbell Press', 'Chest'], ['Dumbbell Flyes', 'Chest'],
  ['Incline Dumbbell Flyes', 'Chest'], ['Cable Crossover', 'Chest'], ['Pec Deck Machine', 'Chest'],
  ['Machine Chest Press', 'Chest'], ['Push-Up', 'Chest'], ['Chest Dip', 'Chest'],

  ['Deadlift', 'Back'], ['Barbell Row', 'Back'], ['Pendlay Row', 'Back'], ['T-Bar Row', 'Back'],
  ['Seated Cable Row', 'Back'], ['One-Arm Dumbbell Row', 'Back'], ['Lat Pulldown', 'Back'],
  ['Wide-Grip Pull-Up', 'Back', 'bodyweight_reps'], ['Pull-Up', 'Back', 'bodyweight_reps'], ['Chin-Up', 'Back', 'bodyweight_reps'], ['Straight-Arm Pulldown', 'Back'],
  ['Face Pull', 'Back'], ['Rack Pull', 'Back'], ['Single-Arm Lat Pulldown', 'Back'],

  ['Barbell Overhead Press', 'Shoulders'], ['Seated Dumbbell Shoulder Press', 'Shoulders'], ['Arnold Press', 'Shoulders'],
  ['Lateral Raise', 'Shoulders'], ['Cable Lateral Raise', 'Shoulders'], ['Front Raise', 'Shoulders'],
  ['Rear Delt Fly', 'Shoulders'], ['Machine Shoulder Press', 'Shoulders'], ['Upright Row', 'Shoulders'],
  ['Push Press', 'Shoulders'], ['Landmine Press', 'Shoulders'],

  ['Barbell Curl', 'Biceps'], ['EZ-Bar Curl', 'Biceps'], ['Dumbbell Curl', 'Biceps'], ['Hammer Curl', 'Biceps'],
  ['Preacher Curl', 'Biceps'], ['Concentration Curl', 'Biceps'], ['Cable Curl', 'Biceps'],
  ['Incline Dumbbell Curl', 'Biceps'], ['Spider Curl', 'Biceps'],

  ['Close-Grip Bench Press', 'Triceps'], ['Tricep Pushdown', 'Triceps'], ['Rope Pushdown', 'Triceps'],
  ['Overhead Tricep Extension', 'Triceps'], ['Skull Crushers', 'Triceps'], ['Dumbbell Kickback', 'Triceps'],
  ['Bench Dip', 'Triceps'], ['Tricep Dip', 'Triceps'], ['Diamond Push-Up', 'Triceps'],

  ['Back Squat', 'Quads'], ['Front Squat', 'Quads'], ['Leg Press', 'Quads'], ['Leg Extension', 'Quads'],
  ['Bulgarian Split Squat', 'Quads', 'weighted_bodyweight_reps'], ['Walking Lunge', 'Quads'], ['Goblet Squat', 'Quads'],
  ['Hack Squat', 'Quads'], ['Step-Up', 'Quads'], ['Sissy Squat', 'Quads'],

  ['Romanian Deadlift', 'Hamstrings'], ['Stiff-Leg Deadlift', 'Hamstrings'], ['Seated Leg Curl', 'Hamstrings'],
  ['Lying Leg Curl', 'Hamstrings'], ['Nordic Curl', 'Hamstrings'], ['Glute-Ham Raise', 'Hamstrings'],
  ['Single-Leg RDL', 'Hamstrings'],

  ['Hip Thrust', 'Glutes'], ['Barbell Glute Bridge', 'Glutes'], ['Cable Glute Kickback', 'Glutes'],
  ['Sumo Deadlift', 'Glutes'], ['Glute Kickback Machine', 'Glutes'], ['Cable Pull-Through', 'Glutes'],
  ['Banded Hip Abduction', 'Glutes'],

  ['Standing Calf Raise', 'Calves'], ['Seated Calf Raise', 'Calves'], ['Leg Press Calf Raise', 'Calves'],
  ['Donkey Calf Raise', 'Calves'],

  ['Plank', 'Abs', 'bodyweight_time'], ['Side Plank', 'Abs', 'bodyweight_time'], ['Crunch', 'Abs'], ['Cable Crunch', 'Abs'],
  ['Hanging Leg Raise', 'Abs'], ['Hanging Knee Raise', 'Abs'], ['Russian Twist', 'Abs'],
  ['Ab Wheel Rollout', 'Abs'], ['Sit-Up', 'Abs'], ['Bicycle Crunch', 'Abs'], ['Mountain Climber', 'Abs'],

  ['Wrist Curl', 'Forearms'], ['Reverse Wrist Curl', 'Forearms'], ["Farmer's Carry", 'Forearms'], ['Dead Hang', 'Forearms', 'bodyweight_time'],

  ['Burpee', 'Full Body'], ['Kettlebell Swing', 'Full Body'], ['Clean and Jerk', 'Full Body'],
  ['Power Clean', 'Full Body'], ['Snatch', 'Full Body'], ['Thruster', 'Full Body'],
  ['Rowing Machine', 'Full Body'], ['Assault Bike', 'Full Body'], ['Jump Rope', 'Full Body'], ['Battle Ropes', 'Full Body'],
];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const TRACKING_TYPE_LABEL = {
  weight_reps: 'weight × reps',
  bodyweight_reps: 'bodyweight × reps',
  weight_time: 'weight × time',
  bodyweight_time: 'bodyweight × time',
  weighted_bodyweight_reps: 'weighted bodyweight × reps',
};

function bodyFor(exercises) {
  const lines = ['# Exercise Library', '', 'Managed via Nova OS. Used to build workout routines in Train.', ''];
  for (const group of MUSCLE_GROUPS) {
    const inGroup = exercises.filter((e) => e.muscleGroup === group);
    if (!inGroup.length) continue;
    lines.push(`## ${group}`, '');
    for (const ex of inGroup) {
      const tt = ex.trackingType || DEFAULT_TRACKING_TYPE;
      lines.push(tt === DEFAULT_TRACKING_TYPE ? `- ${ex.name}` : `- ${ex.name} _(${TRACKING_TYPE_LABEL[tt]})_`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function seedExercises() {
  const taken = new Set();
  return SEED_EXERCISES.map(([name, muscleGroup, trackingType]) => {
    const id = uniqueId(slugify(name), taken);
    taken.add(id);
    return { id, name, muscleGroup, trackingType: trackingType || DEFAULT_TRACKING_TYPE };
  });
}

// Cache + iCloud staleness handling + external-edit detection live in the
// shared helper — see vaultStateFile.js. parse/empty return null for a
// missing or invalid library so getExercises can seed it.
const stateFile = createVaultStateFile({
  relPath: LIBRARY_REL_PATH,
  parse(raw) {
    const exercises = matter(raw).data.exercises;
    if (!Array.isArray(exercises)) return null;
    // Older entries predate the trackingType field — default them rather than
    // requiring a migration.
    return exercises.map((e) => ({ ...e, trackingType: e.trackingType || DEFAULT_TRACKING_TYPE }));
  },
  empty: () => null,
});

async function persist(vaultPath, exercises) {
  const frontmatter = { type: 'exercise-library', updated: new Date().toISOString().slice(0, 10), exercises };
  const content = matter.stringify(bodyFor(exercises), frontmatter);
  await stateFile.write(vaultPath, content, exercises);
}

async function getExercises(vaultPath) {
  const fromDisk = await stateFile.load(vaultPath);
  if (fromDisk) return fromDisk;
  const seeded = seedExercises();
  await persist(vaultPath, seeded);
  return seeded;
}

export async function loadExerciseLibrary(vaultPath) {
  return { exercises: await getExercises(vaultPath), muscleGroups: MUSCLE_GROUPS, trackingTypes: TRACKING_TYPES };
}

let writeLock = Promise.resolve();
function withWriteLock(fn) {
  const run = writeLock.catch(() => {}).then(fn);
  writeLock = run.catch(() => {});
  return run;
}

export async function addCustomExercise(vaultPath, name, muscleGroup, trackingType) {
  if (!MUSCLE_GROUPS.includes(muscleGroup)) throw new Error('invalid muscle group');
  const tt = trackingType || DEFAULT_TRACKING_TYPE;
  if (!TRACKING_TYPES.includes(tt)) throw new Error('invalid tracking type');
  return withWriteLock(async () => {
    const existing = [...(await getExercises(vaultPath))];
    const dupe = existing.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (dupe) return dupe;
    const taken = new Set(existing.map((e) => e.id));
    const id = uniqueId(slugify(name), taken);
    const exercise = { id, name, muscleGroup, trackingType: tt };
    const updated = [...existing, exercise];
    await persist(vaultPath, updated);
    return exercise;
  });
}
