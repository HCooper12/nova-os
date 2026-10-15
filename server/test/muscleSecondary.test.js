// WHAT ELSE A LIFT TRAINS (15 Oct 2026, src/muscleCredit.js via
// lib/muscleSecondary.js). His ask: every exercise in his program says which
// muscles it also works, and those add up into each muscle's weekly load at
// ½ a set each (fractional counting, Pelland et al. 2024). These pin the
// table for EVERY lift in his real program, so a rule change is a visible
// diff here, plus the fractional totals, the library override and the
// muscles that never take secondary credit.
//
// NOVA_DATA_DIR is set BEFORE import: a test without its own data dir writes
// into his live server/data (the 30-fake-greetings lesson).
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-secondary-'));
process.env.NOVA_DATA_DIR = dataDir;

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const { secondaryFor, creditsFor, formatSets } = await import('../lib/muscleSecondary.js');
const { loadExerciseLibrary, renderLibraryFile, LIBRARY_REL_PATH } = await import('../lib/exercises.js');

test.after(() => rm(dataDir, { recursive: true, force: true }));

// his program on 15 Oct 2026, names copied exactly, with the muscle each is
// filed under in his library
const HIS_PROGRAM = [
  // Pull
  ['Weighted Pull-Up', 'Back', ['Biceps']],
  ['Cable Hammer Curls', 'Biceps', ['Forearms']],
  ['Lying T Bar Row', 'Back', ['Biceps', 'Shoulders']],
  ['Spider Curl', 'Biceps', []],
  ['EZ-Bar Reverse Curl', 'Forearms', ['Biceps']],
  ['Dumbbell Shrug', 'Back', []],
  ['Dead Hang', 'Forearms', []],
  // Push
  ['Incline Barbell Bench Press', 'Chest', ['Triceps', 'Shoulders']],
  ['Dumbbell Shoulder Press (Single Arm)', 'Shoulders', ['Triceps']],
  ['Cable Lateral Raise (behind back, wrist height)', 'Shoulders', []],
  ['Rope Overhead Tricep Extension', 'Triceps', []],
  ['Triceps Pushdown - Straight Bar Attachment', 'Triceps', []],
  ['Face Pull', 'Shoulders', ['Back']],
  ['Cable Flys High Position (per arm weight)', 'Chest', []],
  // Upper Body
  ['Incline Dumbbell Bench With Palms Facing In', 'Chest', ['Triceps', 'Shoulders']],
  ['Barbell Bench Press', 'Chest', ['Triceps', 'Shoulders']],
  ['Wide-Grip Lat Pulldown', 'Back', ['Biceps']],
  ['Cable Lateral Raise (behind back, wrist height)', 'Shoulders', []],
  ['Reverse Pec Deck', 'Shoulders', ['Back']],
  ['Chest-Supported Dumbbell Row', 'Back', ['Biceps', 'Shoulders']],
  // Leg Day
  ['Hack Squat', 'Quads', ['Glutes']],
  ['Machine Hip Thrust', 'Glutes', ['Hamstrings']],
  ['Bulgarian Split Squat', 'Quads', ['Glutes']],
  ['Hamstring Lying Leg Curls', 'Hamstrings', []],
  ['Adductor Machine', 'Quads', []],
  ['Standing Machine Calf Raises', 'Calves', []],
  ['Standing Dumbbell Calf Raise', 'Calves', []],
  // Arms and Delts
  ['Alternate Incline Dumbbell Curl', 'Biceps', []],
  ['Cable Bicep Curl', 'Biceps', []],
  ['Carter Extension', 'Triceps', []],
  ['Cable Overhead Tricep Extension', 'Triceps', []],
  ['Cable Lateral Raise (behind back, wrist height)', 'Shoulders', []],
  ['Reverse Pec Deck', 'Shoulders', ['Back']],
];

test('every lift in his program: the secondary muscles it is credited', () => {
  assert.equal(HIS_PROGRAM.length, 33); // 30 distinct lifts, three of them on two days
  for (const [name, muscleGroup, expected] of HIS_PROGRAM) {
    assert.deepEqual(secondaryFor({ name, muscleGroup }), expected, name);
  }
});

test('the rest of the table: close grip, dips, deadlifts, flyes vs reverse flyes', () => {
  const s = (name, muscleGroup) => secondaryFor({ name, muscleGroup });
  assert.deepEqual(s('Close-Grip Bench Press', 'Triceps'), ['Chest', 'Shoulders']);
  assert.deepEqual(s('Chest Dip', 'Chest'), ['Triceps', 'Shoulders']);
  assert.deepEqual(s('Tricep Dip', 'Triceps'), ['Chest', 'Shoulders']);
  assert.deepEqual(s('Romanian Deadlift', 'Hamstrings'), ['Glutes', 'Back']);
  assert.deepEqual(s('Deadlift', 'Back'), ['Glutes', 'Hamstrings']);
  assert.deepEqual(s('Sumo Deadlift', 'Glutes'), ['Hamstrings', 'Back']);
  assert.deepEqual(s('Dumbbell Flyes', 'Chest'), []);
  assert.deepEqual(s('Pec Deck Machine', 'Chest'), []);
  assert.deepEqual(s('Rear Delt Fly', 'Shoulders'), ['Back']);
  assert.deepEqual(s('Barbell Overhead Press', 'Shoulders'), ['Triceps']);
  assert.deepEqual(s('Push-Up', 'Chest'), ['Triceps', 'Shoulders']);
  assert.deepEqual(s('Seated Cable Row', 'Back'), ['Biceps', 'Shoulders']);
  assert.deepEqual(s('Leg Press', 'Quads'), ['Glutes']);
  assert.deepEqual(s('Walking Lunge', 'Quads'), ['Glutes']);
  assert.deepEqual(s('Leg Extension', 'Quads'), []);
  assert.deepEqual(s('Hammer Curl', 'Biceps'), ['Forearms']);
});

test('Mobility and Full Body take no secondary credit, whatever the name says', () => {
  assert.deepEqual(secondaryFor({ name: 'Spider-Man Lunge', muscleGroup: 'Mobility' }), []);
  assert.deepEqual(secondaryFor({ name: 'Barbell Squat Complex', muscleGroup: 'Full Body' }), []);
  assert.deepEqual(creditsFor({ name: 'Spider-Man Lunge', muscleGroup: 'Mobility' }), [{ muscle: 'Mobility', credit: 1 }]);
  // nor can an override give them any
  assert.deepEqual(secondaryFor({ name: 'Thruster', muscleGroup: 'Full Body', secondary: ['Quads'] }), []);
});

test('creditsFor: primary 1 first, each secondary ½; unfiled is Other at 1', () => {
  assert.deepEqual(creditsFor({ name: 'Incline Barbell Bench Press', muscleGroup: 'Chest' }), [
    { muscle: 'Chest', credit: 1 }, { muscle: 'Triceps', credit: 0.5 }, { muscle: 'Shoulders', credit: 0.5 },
  ]);
  assert.deepEqual(creditsFor({ name: 'Mystery Lift' }), [{ muscle: 'Other', credit: 1 }]);
});

test('formatSets: whole numbers plain, halves as ½', () => {
  assert.equal(formatSets(13), '13');
  assert.equal(formatSets(13.5), '13½');
  assert.equal(formatSets(0.5), '½');
  assert.equal(formatSets(0), '0');
});

test('the library override: his `secondary` wins, is validated, and only an override is ever written back', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-secondary-vault-'));
  try {
    const file = path.join(vault, LIBRARY_REL_PATH);
    await mkdir(path.dirname(file), { recursive: true });
    const raw = renderLibraryFile([
      { id: 'bench', name: 'Barbell Bench Press', muscleGroup: 'Chest', trackingType: 'weight_reps', secondary: ['Triceps', 'Nonsense', 'Chest'] },
      { id: 'hack', name: 'Hack Squat', muscleGroup: 'Quads', trackingType: 'weight_reps', secondary: [] },
      { id: 'row', name: 'Lying T Bar Row', muscleGroup: 'Back', trackingType: 'weight_reps' },
    ]);
    await writeFile(file, raw);
    const before = await readFile(file, 'utf8');
    const { exercises } = await loadExerciseLibrary(vault);
    const by = Object.fromEntries(exercises.map((e) => [e.id, e]));
    assert.deepEqual(by.bench.secondary, ['Triceps']); // invalid and primary dropped
    assert.equal(by.bench.secondarySource, 'override');
    assert.deepEqual(by.hack.secondary, []); // an empty list means none
    assert.deepEqual(by.row.secondary, ['Biceps', 'Shoulders']); // the table
    assert.equal(by.row.secondarySource, 'table');
    assert.deepEqual(creditsFor(by.hack), [{ muscle: 'Quads', credit: 1 }]);
    // reading never writes his vault
    assert.equal(await readFile(file, 'utf8'), before);
    // a writer handed the resolved copy stores the override, never the table's answer
    const again = renderLibraryFile(exercises);
    assert.match(again, /secondary:\n\s+- Triceps/);
    assert.doesNotMatch(again, /secondarySource/);
    assert.equal((again.match(/secondary:/g) || []).length, 2); // bench and hack, not row
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});
