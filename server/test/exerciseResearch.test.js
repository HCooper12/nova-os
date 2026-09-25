// Coach researches the exercise library (lib/exerciseResearch.js). His ask,
// 25 Sep: any exercise he adds or Coach suggests is researched and added
// properly, and the library is improved weekly (new exercises, better
// details, variations like a slower lowering or a pause). The model's answer
// is checked field by field against the closed vocabularies before anything
// is written, and every pass is one Inbox record whose Undo puts it back.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-exresearch-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-exresearch-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const R = await import('../lib/exerciseResearch.js');
const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
const { undoRecord } = await import('../lib/inbox.js');
const { getRecord } = await import('../lib/inboxStore.js');
const { ANATOMY_GROUP: CLIENT_MAP } = await import('../../src/muscleHue.js');

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
const facePull = await addCustomExercise(vault, 'Face Pull', 'Shoulders', 'weight_reps');      // in the curated atlas
const bayesian = await addCustomExercise(vault, 'Bayesian Cable Curl', 'Forearms', 'weight_reps'); // new, filed wrong on purpose
const lib = async () => (await loadExerciseLibrary(vault)).exercises;
const byName = async (n) => (await lib()).find((e) => e.name === n);

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const GOOD = {
  muscleGroup: 'Biceps', trackingType: 'weight_reps', equipment: 'cable',
  primary: ['biceps'], secondary: ['forearms', 'biceps', 'wings'],
  cues: 'Step forward so the arm trails behind you · curl without letting the elbow drift forward · lower for three seconds',
  repRange: { low: 10, high: 15 },
  variations: [
    { name: '3-second lowering', how: 'Lower the handle for a slow count of three every rep', why: 'More time under tension in the stretch' },
    { name: '3-Second Lowering', how: 'a duplicate by another spelling', why: '' },
    { name: 'x', how: 'too short a name to keep', why: '' },
  ],
  sources: ['https://example.org/a', 'javascript:alert(1)', 'not a url'],
};

test('normalizeEntry: every field checked against the closed vocabularies', () => {
  const n = R.normalizeEntry(GOOD, { now: new Date('2026-09-25T00:00:00Z'), model: 'sonnet' });
  assert.deepEqual(n.research.primary, ['biceps']);
  assert.deepEqual(n.research.secondary, ['forearms'], 'a primary repeated and a made-up muscle are dropped');
  assert.equal(n.research.equipment, 'Cable', 'matched to his equipment list, whatever the case');
  assert.deepEqual(n.research.variations.map((v) => v.name), ['3-second lowering'], 'one per name, and only real ones');
  assert.deepEqual(n.research.sources, ['https://example.org/a']);
  assert.deepEqual(n.research.repRange, { low: 10, high: 15 });
  assert.equal(n.muscleGroup, 'Biceps');
  assert.ok(n.issues.some((i) => /wings/.test(i)), 'what was dropped is said');
  assert.equal(n.substantive, true);
});

test('the filing follows what the lift is FOR (his reverse-curl lesson)', () => {
  const n = R.normalizeEntry({ ...GOOD, muscleGroup: 'Biceps', primary: ['forearms'], secondary: ['biceps'] });
  assert.equal(n.muscleGroup, 'Forearms');
  assert.ok(n.issues.some((i) => /prime mover is forearms/.test(i)));
  assert.equal(R.normalizeEntry({ ...GOOD, muscleGroup: 'Full Body', primary: ['quads'] }).muscleGroup, 'Full Body', 'a whole-body lift keeps its drawer');
  assert.equal(R.normalizeEntry({ cues: 'too short' }).substantive, false, 'research that says nothing is not research');
});

test('the anatomy-to-filing map is the one the app colours by', () => {
  assert.deepEqual(R.ANATOMY_GROUP, CLIENT_MAP);
});

test('new means: not in the curated atlas and never researched', async () => {
  const pending = R.pendingNew(await lib()).map((e) => e.name);
  assert.deepEqual(pending, ['Bayesian Cable Curl']);
});

test('the weekly window opens Sunday 06:00, stays open to Wednesday, and is one week', () => {
  assert.equal(R.weeklyWindow(new Date('2026-09-27T05:00:00')), null, 'Sunday before six');
  assert.equal(R.weeklyWindow(new Date('2026-09-27T07:00:00')), '2026-09-27');
  assert.equal(R.weeklyWindow(new Date('2026-09-28T09:00:00')), '2026-09-27', 'Monday is the same week');
  assert.equal(R.weeklyWindow(new Date('2026-09-30T23:00:00')), '2026-09-27');
  assert.equal(R.weeklyWindow(new Date('2026-10-01T09:00:00')), null, 'Thursday: closed');
});

test('a new exercise is researched, re-filed by its anatomy, filed with undo; an established one keeps its filing', async () => {
  let calls = 0;
  const run = async (prompt) => {
    calls += 1;
    assert.match(prompt, /Bayesian Cable Curl.*NEW/);
    assert.match(prompt, /Face Pull.*ESTABLISHED/);
    return { cost: 0.4, answer: {
      researched: [
        { id: bayesian.id, ...GOOD },
        { id: facePull.id, muscleGroup: 'Back', trackingType: 'weight_reps', equipment: 'Cable', primary: ['rear-delts'], secondary: ['rhomboids'], cues: 'Pull toward the face with the elbows high · finish with the thumbs behind you', variations: [{ name: 'Pause at the face', how: 'Hold the finish for two seconds each rep', why: 'The rear delts own the end range' }] },
        { id: 'not-a-target', ...GOOD },
      ],
      discovered: [{ name: 'JM Press', why: 'triceps loaded deep in the stretch', ...GOOD, muscleGroup: 'Triceps', primary: ['triceps'], secondary: ['chest'] }, { name: 'face pull', ...GOOD }],
    } };
  };
  const targets = [await byName('Bayesian Cable Curl'), await byName('Face Pull')];
  const faceBefore = (await byName('Face Pull')).muscleGroup; // the seed files it under Back
  const out = await R.researchPass(vault, { targets, discover: 2, reason: 'test research' }, { run, model: 'sonnet', videos: false });
  assert.equal(calls, 1);
  assert.equal(out.cost, 0.4);
  const bay = await byName('Bayesian Cable Curl');
  assert.equal(bay.muscleGroup, 'Biceps', 'a new lift is filed where research puts it');
  assert.deepEqual(bay.research.primary, ['biceps']);
  const fp = await byName('Face Pull');
  assert.equal(fp.muscleGroup, faceBefore, 'an established lift keeps its filing');
  assert.equal(fp.research.variations[0].name, 'Pause at the face');
  assert.ok(out.notes.some((n) => new RegExp(`Face Pull: research files it under Shoulders; it stays under ${faceBefore}`).test(n)), 'the disagreement is said, not acted on');
  const jm = await byName('JM Press');
  assert.equal(jm.muscleGroup, 'Triceps');
  assert.equal(jm.research.why, 'triceps loaded deep in the stretch');
  assert.equal((await lib()).filter((e) => /face pull/i.test(e.name)).length, 1, 'a discovery already in the library is never added twice');

  const rec = await getRecord(out.recordId);
  assert.equal(rec.status, 'filed');
  assert.equal(rec.kind, 'exercise-research');
  assert.match(rec.text, /added JM Press/);
  assert.deepEqual(rec.undoData.created, [jm.id]);

  await undoRecord(vault, out.recordId);
  assert.equal((await byName('Bayesian Cable Curl')).muscleGroup, 'Forearms', 'undo puts the filing back');
  assert.equal((await byName('Bayesian Cable Curl')).research, undefined);
  assert.equal((await byName('Face Pull')).research, undefined);
  assert.equal(await byName('JM Press'), undefined, 'an unused addition is gone again');
});

test('research goes in batches, and a failed batch keeps what the others found', async () => {
  const many = [];
  for (const n of ['Lift A', 'Lift B', 'Lift C', 'Lift D']) many.push(await addCustomExercise(vault, n, 'Chest', 'weight_reps'));
  let call = 0;
  const run = async (prompt) => {
    call += 1;
    if (call === 2) throw Object.assign(new Error("You've hit your session limit · resets 11am"), { cost: 0.05 });
    const ids = [...prompt.matchAll(/id "([^"]+)"/g)].map((m) => m[1]);
    return { cost: 0.3, answer: { researched: ids.map((id) => ({ id, ...GOOD, muscleGroup: 'Chest', primary: ['chest'], secondary: [] })) } };
  };
  const out = await R.researchPass(vault, { targets: many, reason: 'batch test' }, { run, videos: false });
  assert.equal(call, 2, `${R.PER_CALL} to a call`);
  assert.equal(out.updated.length, R.PER_CALL);
  assert.equal(Math.round(out.cost * 100) / 100, 0.35);
  assert.ok(out.notes.some((n) => /1 of 2 research batches failed/.test(n)));
  await assert.rejects(() => R.researchPass(vault, { targets: many.slice(3) }, { run: async () => { throw Object.assign(new Error('limit'), { cost: 0.01 }); }, videos: false }), /limit/);
});

test('improveCandidates: program lifts not yet researched, priority muscles first', async () => {
  const exercises = [
    { id: 'a', muscleGroup: 'Chest' }, { id: 'b', muscleGroup: 'Biceps' },
    { id: 'c', muscleGroup: 'Biceps', research: { at: '2026-09-01T00:00:00Z' } }, { id: 'd', muscleGroup: 'Triceps' },
  ];
  const routines = [{ exercises: [{ exerciseId: 'a' }, { exerciseId: 'b' }, { exerciseId: 'c' }] }];
  const got = R.improveCandidates(exercises, routines, { priority: new Set(['Biceps']), now: new Date('2026-09-25T00:00:00Z') });
  assert.deepEqual(got.map((e) => e.id), ['b', 'a'], 'd is not in his program; c was researched recently');
});
