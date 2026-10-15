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
const { secondaryFor, creditsFor, formatSets, resolveMuscles } = await import('../lib/muscleSecondary.js');
const { loadExerciseLibrary, renderLibraryFile, LIBRARY_REL_PATH } = await import('../lib/exercises.js');

test.after(() => rm(dataDir, { recursive: true, force: true }));

// Since phase 2 (15 Oct 2026) the name table credits nothing: what a lift
// trains comes from the AUDITED table by id (src/muscleAudit.js), pinned
// lift by lift in muscleAudit.test.js. These pin the credit rules around it.
const by = (id) => ({ id, name: id, muscleGroup: 'Other' });

test('the rest of the audit: close grip, deadlifts, flyes vs reverse flyes', () => {
  const s = (id) => secondaryFor(resolveMuscles(by(id), { strict: true }));
  const p = (id) => resolveMuscles(by(id), { strict: true }).muscleGroup;
  assert.deepEqual([p('close-grip-bench-press'), s('close-grip-bench-press')], ['Triceps', ['Chest', 'Front Delts']]);
  assert.deepEqual([p('deadlift'), s('deadlift')], ['Glutes', ['Hamstrings', 'Lower Back']]);
  assert.deepEqual([p('dumbbell-flyes'), s('dumbbell-flyes')], ['Chest', []]);
  assert.deepEqual([p('rear-delt-fly'), s('rear-delt-fly')], ['Rear Delts', []]);
  assert.deepEqual([p('barbell-overhead-press'), s('barbell-overhead-press')], ['Front Delts', ['Triceps']]);
  assert.deepEqual([p('leg-extension'), s('leg-extension')], ['Quads', []]);
  assert.deepEqual([p('hammer-curl'), s('hammer-curl')], ['Biceps', ['Forearms']]);
});

test('Mobility, Full Body and Grip take no credit at all, whatever the name says', () => {
  assert.deepEqual(secondaryFor({ name: 'Spider-Man Lunge', muscleGroup: 'Mobility' }), []);
  assert.deepEqual(secondaryFor({ name: 'Barbell Squat Complex', muscleGroup: 'Full Body' }), []);
  assert.deepEqual(creditsFor({ name: 'Spider-Man Lunge', muscleGroup: 'Mobility' }), []);
  assert.deepEqual(creditsFor({ id: 'dead-hang', name: 'Dead Hang', muscleGroup: 'Forearms' }), [], 'a dead hang is grip: never volume');
  assert.deepEqual(creditsFor({ id: 'thruster', name: 'Thruster', muscleGroup: 'Full Body' }), []);
  // nor can an override give them any
  assert.deepEqual(secondaryFor({ name: 'Thruster', muscleGroup: 'Full Body', secondary: ['Quads'] }), []);
});

test('creditsFor: primary 1 first, each secondary ½; unfiled is Other at 1; unaudited is nothing', () => {
  assert.deepEqual(creditsFor({ id: 'incline-barbell-bench-press', name: 'Incline Barbell Bench Press', muscleGroup: 'Chest' }), [
    { muscle: 'Chest', credit: 1 }, { muscle: 'Front Delts', credit: 0.5 }, { muscle: 'Triceps', credit: 0.5 },
  ]);
  assert.deepEqual(creditsFor({ name: 'Mystery Lift' }), [{ muscle: 'Other', credit: 1 }]);
  assert.deepEqual(creditsFor(resolveMuscles({ id: 'mystery', name: 'Mystery Lift', muscleGroup: 'Chest' }, { strict: true })), []);
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
      { id: 'lying-t-bar-row', name: 'Lying T Bar Row', muscleGroup: 'Back', trackingType: 'weight_reps' },
    ]);
    await writeFile(file, raw);
    const before = await readFile(file, 'utf8');
    const { exercises } = await loadExerciseLibrary(vault);
    const by = Object.fromEntries(exercises.map((e) => [e.id, e]));
    assert.deepEqual(by.bench.secondary, ['Triceps']); // invalid and primary dropped
    assert.equal(by.bench.secondarySource, 'override');
    assert.deepEqual(by.hack.secondary, []); // an empty list means none
    // the audited table, which also re-files the old 'Back' at read time
    assert.deepEqual(by['lying-t-bar-row'].secondary, ['Lats', 'Rear Delts', 'Biceps']);
    assert.equal(by['lying-t-bar-row'].secondarySource, 'audit');
    assert.equal(by['lying-t-bar-row'].muscleGroup, 'Upper Back');
    assert.equal(by['lying-t-bar-row'].filedAs, 'Back');
    assert.deepEqual(creditsFor(by.hack), [], 'not audited, so nothing, override or not');
    // reading never writes his vault
    assert.equal(await readFile(file, 'utf8'), before);
    // a writer handed the resolved copy stores the override, never the table's answer
    const again = renderLibraryFile(exercises);
    assert.match(again, /secondary:\n\s+- Triceps/);
    assert.doesNotMatch(again, /secondarySource|primarySource|filedAs|audit:/);
    assert.equal((again.match(/secondary:/g) || []).length, 2); // bench and hack, not the row
    assert.match(again, /muscleGroup: Back/, 'the stored filing goes back as it was: nothing is rewritten in bulk');
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});
