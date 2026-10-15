// THE SPLIT GROUPS, READ EVERYWHERE (15 Oct 2026). The library loader re-files
// an audited lift at READ time (nothing in his vault is rewritten), the split
// rules know the delt heads and the back groups, and every old name in his
// vault ("Shoulders", "Back") still reads, as the family it became.
//
// NOVA_DATA_DIR is set BEFORE import: a test without its own data dir writes
// into his live server/data (the 30-fake-greetings lesson).
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-taxonomy-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.TZ = 'Australia/Sydney';

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const { loadExerciseLibrary, renderLibraryFile, LIBRARY_REL_PATH, MUSCLE_GROUPS } = await import('../lib/exercises.js');
const { AUDITED, creditsFor, expandGroup } = await import('../lib/muscleSecondary.js');
const { splitMisfit } = await import('../lib/coach.js');
const { goalMuscles } = await import('../lib/trainOverview.js');
const { weeklyMuscleVolume } = await import('../lib/trainingAnalytics.js');
const { musclesNamed, muscleVar } = await import('../../src/muscleHue.js');

test.after(() => rm(dataDir, { recursive: true, force: true }));

test('every audited id maps exactly as the committed table says, at read time, and his file is untouched', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-taxonomy-vault-'));
  try {
    const file = path.join(vault, LIBRARY_REL_PATH);
    await mkdir(path.dirname(file), { recursive: true });
    // his library as stored: every lift under the group it was filed under before the audit
    const stored = Object.entries(AUDITED).map(([id, r]) => ({ id, name: r.name, muscleGroup: r.was, trackingType: 'weight_reps' }));
    await writeFile(file, renderLibraryFile(stored));
    const before = await readFile(file, 'utf8');
    const { exercises, muscleGroups } = await loadExerciseLibrary(vault);
    assert.deepEqual(muscleGroups, MUSCLE_GROUPS);
    assert.equal(exercises.length, 140);
    for (const e of exercises) {
      const r = AUDITED[e.id];
      assert.equal(e.audit, 'audited', e.id);
      assert.deepEqual([e.muscleGroup, e.secondary], [r.primary, r.secondary], e.id);
      const credits = creditsFor(e);
      if (['Mobility', 'Full Body', 'Grip'].includes(r.primary)) assert.deepEqual(credits, [], `${e.id} never counts as volume`);
      else assert.deepEqual(credits, [{ muscle: r.primary, credit: 1 }, ...r.secondary.map((m) => ({ muscle: m, credit: 0.5 }))], e.id);
    }
    assert.equal(await readFile(file, 'utf8'), before, 'reading never writes his vault');
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test('the split, with the new groups: a curl is still refused on Push, a face pull belongs on Pull', () => {
  assert.equal(splitMisfit('Push', 'Biceps')?.day, 'a push day', 'a curl on Push breaks his split');
  assert.equal(splitMisfit('Pull', 'Rear Delts'), null, 'a face pull (rear delts) fits a pull day');
  assert.equal(splitMisfit('Push', 'Rear Delts'), null, 'and a push day');
  assert.equal(splitMisfit('Push', 'Side Delts'), null);
  assert.equal(splitMisfit('Pull', 'Side Delts'), null, 'side delts sit on either');
  assert.equal(splitMisfit('Push', 'Lats')?.day, 'a push day');
  assert.equal(splitMisfit('Pull', 'Front Delts')?.day, 'a pull day', 'pressing is not pulling');
  assert.equal(splitMisfit('Leg Day', 'Lower Back'), null);
  assert.equal(splitMisfit('Leg Day', 'Adductors'), null);
  assert.equal(splitMisfit('Upper Body', 'Traps'), null);
  assert.equal(splitMisfit('Pull', 'Grip'), null, 'grip belongs to no one day');
  // an old name on a card raised before the split fits wherever its family does
  assert.equal(splitMisfit('Pull', 'Shoulders'), null);
  assert.equal(splitMisfit('Leg Day', 'Back'), null, 'the lower back is a leg-day group');
  assert.equal(splitMisfit('Push', 'Back')?.day, 'a push day');
});

test('his goal text still says "shoulders": it reads as the side and rear delts, and "back" as lats and upper back', () => {
  // his Fitness Goals page, 15 Oct 2026, unchanged
  const goals = { goal: 'Lean muscle gain with simultaneous fat loss', focus: 'Protein consistency and step goal consistency Priority: grow the arms (triceps, biceps, shoulders) as fast as possible.' };
  assert.deepEqual([...goalMuscles(goals)].sort(), ['Biceps', 'Rear Delts', 'Side Delts', 'Triceps']);
  assert.deepEqual([...goalMuscles({ goal: 'a bigger back' })].sort(), ['Lats', 'Upper Back']);
  for (const m of goalMuscles(goals)) assert.ok(MUSCLE_GROUPS.includes(m), `${m} is a current group`);
});

test('old names read as aliases: the family they became, a hue, a chip in his words', () => {
  assert.deepEqual(expandGroup('Shoulders'), ['Front Delts', 'Side Delts', 'Rear Delts']);
  assert.deepEqual(expandGroup('back'), ['Lats', 'Upper Back', 'Traps', 'Lower Back']);
  assert.deepEqual(expandGroup('Upper Back'), ['Upper Back']);
  assert.deepEqual(expandGroup('Wings'), []);
  assert.equal(muscleVar('Shoulders'), 'var(--nv-m-shoulders)');
  assert.deepEqual(musclesNamed('grow the arms (triceps, biceps, shoulders)'), ['Triceps', 'Biceps', 'Shoulders']);
  assert.deepEqual(musclesNamed('rows for the upper back, then lower back work'), ['Upper Back', 'Lower Back'], 'the longer name wins, once');
});

test('an unaudited lift credits nothing, and the week says how many sets it left out', () => {
  const exercises = [
    { id: 'zottman-curl', name: 'Zottman Curl', muscleGroup: 'Biceps', audit: 'pending', secondary: [] },
    { id: 'hack-squat', name: 'Hack Squat', muscleGroup: 'Quads', audit: 'audited', secondary: ['Glutes'] },
  ];
  assert.deepEqual(creditsFor(exercises[0]), []);
  const sets = (n) => Array.from({ length: n }, () => ({ weight: 20, reps: 10 }));
  const [wk] = weeklyMuscleVolume([{ date: '2026-10-13', exercises: [{ exerciseId: 'zottman-curl', sets: sets(4) }, { exerciseId: 'hack-squat', sets: sets(3) }] }], exercises);
  assert.deepEqual(wk.groups, { Quads: 3, Glutes: 1.5 });
  assert.deepEqual(wk.uncounted, { sets: 4, lifts: [{ name: 'Zottman Curl', sets: 4 }] });
});
