// THE GROWTH RANGE (16 Oct 2026, his decision): 10 to 20 working sets per
// muscle per week, one constant read everywhere a week's volume is judged;
// a muscle may carry its own range for his goal (goals.volumeRanges), set
// only by Coach on his yes.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-volrange-data-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { VOLUME_RANGE, rangeFor, cleanVolumeRanges } = await import('../../src/muscleTaxonomy.js');
const { findChronicUnderVolume, findJunkVolume, JUNK_VOLUME_CEILING } = await import('../lib/coachProgramReview.js');
const { getFitnessGoals, setFitnessGoals, addGoalTarget, volumeRangeLine } = await import('../lib/fitnessGoals.js');

test('one range, 10 to 20, and a muscle reads its own only when his goal sets one', () => {
  assert.deepEqual([...VOLUME_RANGE], [10, 20]);
  assert.deepEqual(rangeFor('Biceps'), [10, 20]);
  assert.deepEqual(rangeFor('Side Delts', { 'Side Delts': [12, 22] }), [12, 22]);
  assert.deepEqual(rangeFor('Biceps', { 'Side Delts': [12, 22] }), [10, 20]);
  assert.equal(JUNK_VOLUME_CEILING, 20, "Coach's junk line is the range's top");
});

test('a range is validated, never guessed at', () => {
  assert.deepEqual(cleanVolumeRanges({ 'side delts': [12, 22], Biceps: ['8', '16'] }), { 'Side Delts': [12, 22], Biceps: [8, 16] });
  assert.equal(cleanVolumeRanges({ Grip: [5, 10] }), null, 'not a volume muscle');
  assert.equal(cleanVolumeRanges({ Shoulders: [10, 20] }), null, 'an old name is not one muscle');
  assert.equal(cleanVolumeRanges({ Lats: [20, 10] }), null, 'low must be under high');
  assert.equal(cleanVolumeRanges({ Lats: [10, 99] }), null, 'a typo never becomes a range');
  assert.equal(cleanVolumeRanges({ Lats: [10.5, 20] }), null);
  assert.equal(cleanVolumeRanges([10, 20]), null);
});

test("Coach's under-volume check holds goal muscles to the range's low end (10), or their own", () => {
  const weekly = [
    { week: '2026-10-05', groups: { Biceps: 11, 'Side Delts': 11 } },
    { week: '2026-09-28', groups: { Biceps: 10.5, 'Side Delts': 10 } },
    { week: '2026-09-21', groups: { Biceps: 10, 'Side Delts': 11 } },
  ];
  assert.deepEqual(findChronicUnderVolume(weekly, { goalMuscles: ['Biceps', 'Side Delts'] }), [], 'at or above 10 is in range (it was 12)');
  const own = findChronicUnderVolume(weekly, { goalMuscles: ['Biceps', 'Side Delts'], ranges: { 'Side Delts': [12, 22] } });
  assert.deepEqual(own.map((f) => [f.muscle, f.target]), [['Side Delts', 12]]);
  weekly[1].groups.Biceps = 9;
  weekly[0].groups.Biceps = 9.5;
  weekly[2].groups.Biceps = 8;
  assert.equal(findChronicUnderVolume(weekly, { goalMuscles: ['Biceps'] })[0].target, 10);
});

test("Coach's junk check: past 20 every week is raised; 20 itself is still in range", () => {
  const at20 = [{ week: 'b', groups: { Chest: 20 } }, { week: 'a', groups: { Chest: 20 } }];
  assert.deepEqual(findJunkVolume(at20), []);
  const past = [{ week: 'b', groups: { Chest: 21 } }, { week: 'a', groups: { Chest: 22 } }];
  const [f] = findJunkVolume(past);
  assert.equal(f.ceiling, 20);
  assert.equal(f.avg, 21.5);
  // a muscle with its own range is held to its own top
  assert.deepEqual(findJunkVolume(past, { ranges: { Chest: [12, 24] } }), []);
});

test('his goals page carries volumeRanges, and a settings save never wipes them', async () => {
  const vault = mkdtempSync(path.join(tmpdir(), 'nova-volrange-vault-'));
  const dir = path.join(vault, 'Wiki/Health');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'Fitness Goals.md'), '---\ntype: fitness-goals\ngoal: Grow\nvolumeRanges:\n  Side Delts: [12, 22]\n  Grip: [1, 5]\n---\n# Fitness Goals\n');
  assert.deepEqual((await getFitnessGoals(vault)).volumeRanges, { 'Side Delts': [12, 22] }, 'read validated');
  await setFitnessGoals(vault, { goal: 'Grow faster' }); // the Train settings form
  assert.deepEqual((await getFitnessGoals(vault)).volumeRanges, { 'Side Delts': [12, 22] });
  await addGoalTarget(vault, { metric: 'Steps', value: 10000 });
  assert.deepEqual((await getFitnessGoals(vault)).volumeRanges, { 'Side Delts': [12, 22] }, 'a new target keeps them too');
  assert.match(readFileSync(path.join(dir, 'Fitness Goals.md'), 'utf8'), /volumeRanges:/);
  await setFitnessGoals(vault, { goal: 'Grow', volumeRanges: null });
  assert.equal((await getFitnessGoals(vault)).volumeRanges, null, 'only an input that names them changes them');
});

test('Coach is told the range, and any muscle his goal gives its own', () => {
  assert.match(volumeRangeLine(null), /^GROWTH RANGE: 10-20 working sets per muscle per week/);
  assert.match(volumeRangeLine({ volumeRanges: { 'Side Delts': [12, 22] } }), /This goal sets its own range for Side Delts 12-22\.$/);
});

test("Coach's goal card can give one muscle its own range; his yes writes it and undo takes it back", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), 'nova-volrange-card-'));
  const dir = path.join(vault, 'Wiki/Health');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'Fitness Goals.md'), '---\ntype: fitness-goals\ngoal: Lean muscle gain\nfocus: grow the arms\n---\n# Fitness Goals\n');
  const { validateCoachEdit } = await import('../lib/coach.js');
  const { fileDecision, undoFiling } = await import('../lib/inbox.js');
  const card = await validateCoachEdit(vault, { action: 'goal', volumeRanges: { 'Side Delts': [12, 22] } });
  assert.deepEqual(card.payload, { action: 'goal', settings: { volumeRanges: { 'Side Delts': [12, 22] } } });
  assert.equal(card.title, 'Coach: set Side Delts range 12-22');
  await assert.rejects(() => validateCoachEdit(vault, { action: 'goal', volumeRanges: { 'Side Delts': [22, 12] } }), /volumeRanges must map/);
  await assert.rejects(() => validateCoachEdit(vault, { action: 'goal', volumeRanges: { 'Side Delts': [12, 22], Shoulders: [1, 2] } }), /volumeRanges must map/, 'one bad entry refuses the card, never a silent half');
  const { destination, undo } = await fileDecision(vault, { route: 'goal-target', payload: card.payload });
  assert.match(destination, /volumeRanges updated/);
  const g = await getFitnessGoals(vault);
  assert.deepEqual(g.volumeRanges, { 'Side Delts': [12, 22] });
  assert.equal(g.focus, 'grow the arms', 'nothing else on the page moved');
  await undoFiling(vault, undo);
  assert.equal((await getFitnessGoals(vault)).volumeRanges, null);
});
