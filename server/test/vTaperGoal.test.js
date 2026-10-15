// HIS V-TAPER (16 Oct 2026): goal muscles come from an explicit list on his
// goals page when present, else his goal's words (and "V-taper" reads as
// exactly the six); and one Coach card, filed once, proposes the list and
// the goal line so his yes writes them. Nothing touches his page before that.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-vtaper-data-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { V_TAPER_MUSCLES, cleanGoalMuscles } = await import('../../src/muscleTaxonomy.js');
const { goalMuscles } = await import('../lib/trainOverview.js');
const { fileVTaperGoalCard, vTaperProposal, V_TAPER_GOAL_LINE, V_TAPER_CARD_KEY } = await import('../lib/vTaperGoal.js');
const { getFitnessGoals } = await import('../lib/fitnessGoals.js');
const { listRecords } = await import('../lib/inboxStore.js');
const { fileDecision, undoFiling } = await import('../lib/inbox.js');
const { validateCoachEdit } = await import('../lib/coach.js');

const PAGE = '---\ntype: fitness-goals\ngoal: Lean muscle gain with simultaneous fat loss\nfocus: "Priority: grow the arms (triceps, biceps, shoulders) as fast as possible."\ndaysPerWeek: 4\ntargets:\n  - id: koari79p\n    metric: Daily steps\n    value: 10000\n---\n# Fitness Goals\n\nHis notes.\n';
const vaultWith = (page = PAGE) => {
  const vault = mkdtempSync(path.join(tmpdir(), 'nova-vtaper-vault-'));
  mkdirSync(path.join(vault, 'Wiki/Health'), { recursive: true });
  writeFileSync(path.join(vault, 'Wiki/Health/Fitness Goals.md'), page);
  return vault;
};

test('the V-taper is six muscles: side and rear delts, lats, upper back, biceps, triceps', () => {
  assert.deepEqual([...V_TAPER_MUSCLES], ['Side Delts', 'Rear Delts', 'Lats', 'Upper Back', 'Biceps', 'Triceps']);
  assert.equal(V_TAPER_MUSCLES.includes('Front Delts'), false, 'pressing already trains them');
});

test('goal muscles: his explicit list first, validated; else the words; V-taper reads exactly the six', () => {
  assert.deepEqual([...goalMuscles({ goal: 'anything', goalMuscles: ['Lats', 'biceps'] })], ['Lats', 'Biceps']);
  assert.deepEqual(cleanGoalMuscles(['Lats', 'Shoulders', 'Grip', 'lats', 'Nope']), ['Lats'], 'old names, non-volume and unknowns drop out');
  assert.equal(cleanGoalMuscles(['Grip']), null);
  // a list with nothing valid falls back to the words
  assert.deepEqual([...goalMuscles({ goal: 'grow the chest', goalMuscles: ['Grip'] })], ['Chest']);
  assert.deepEqual([...goalMuscles({ goal: V_TAPER_GOAL_LINE })], [...V_TAPER_MUSCLES]);
  assert.deepEqual([...goalMuscles({ goal: 'a V taper and big legs' })], [...V_TAPER_MUSCLES], 'exactly that list');
  assert.deepEqual([...goalMuscles({ focus: 'grow the arms (triceps, biceps, shoulders)' })].sort(), ['Biceps', 'Rear Delts', 'Side Delts', 'Triceps'], 'the old words read as before');
});

test("the card is Coach's own goal card: the same payload and title his goal PROPOSE line makes", async () => {
  const vault = vaultWith();
  const made = await validateCoachEdit(vault, { action: 'goal', goalLine: V_TAPER_GOAL_LINE, goalMuscles: [...V_TAPER_MUSCLES] });
  const { payload, title } = vTaperProposal();
  assert.equal(title, made.title);
  assert.deepEqual({ ...payload, reason: undefined }, { ...made.payload, reason: undefined });
  await assert.rejects(() => validateCoachEdit(vault, { action: 'goal', goalMuscles: ['Lats', 'Shoulders'] }), /goalMuscles must be a list of exact muscle groups/);
});

test('ONE card, filed once ever, pending his yes; his page untouched until then', async () => {
  const vault = vaultWith();
  const before = readFileSync(path.join(vault, 'Wiki/Health/Fitness Goals.md'), 'utf8');
  const r = await fileVTaperGoalCard(vault);
  assert.ok(r.filed, JSON.stringify(r));
  const rec = (await listRecords()).find((x) => x.id === r.filed.id);
  assert.equal(rec.status, 'pending');
  assert.equal(rec.key, V_TAPER_CARD_KEY);
  assert.equal(rec.decision.route, 'goal-target');
  assert.deepEqual(rec.decision.payload.settings, { goal: V_TAPER_GOAL_LINE, goalMuscles: [...V_TAPER_MUSCLES] });
  assert.equal(rec.text, 'Shoulders, arms and back for building a V-taper physique.');
  assert.equal(readFileSync(path.join(vault, 'Wiki/Health/Fitness Goals.md'), 'utf8'), before, 'nothing written to his vault');
  assert.match((await fileVTaperGoalCard(vault)).skipped, /raised before/);
  assert.equal((await listRecords()).filter((x) => x.key === V_TAPER_CARD_KEY).length, 1);
  // his yes, through the Inbox's own approve
  const { approveRecord, undoRecord } = await import('../lib/inbox.js');
  const done = await approveRecord(vault, rec.id);
  assert.equal(done.status, 'filed');
  assert.deepEqual((await getFitnessGoals(vault)).goalMuscles, [...V_TAPER_MUSCLES]);
  await undoRecord(vault, rec.id);
  assert.equal((await getFitnessGoals(vault)).goalMuscles, null, 'one tap back');
});

test('his yes writes exactly the two fields and keeps the rest; undo puts them back', async () => {
  const vault = vaultWith();
  const { payload } = vTaperProposal();
  const { undo } = await fileDecision(vault, { route: 'goal-target', payload });
  const g = await getFitnessGoals(vault);
  assert.equal(g.goal, V_TAPER_GOAL_LINE);
  assert.deepEqual(g.goalMuscles, [...V_TAPER_MUSCLES]);
  assert.match(g.focus, /grow the arms/);
  assert.equal(g.targets.length, 1, 'his steps target stays');
  assert.equal(g.daysPerWeek, 4);
  assert.deepEqual([...goalMuscles(g)], [...V_TAPER_MUSCLES], 'and every surface now reads the six');
  await undoFiling(vault, undo);
  const back = await getFitnessGoals(vault);
  assert.equal(back.goal, 'Lean muscle gain with simultaneous fat loss');
  assert.equal(back.goalMuscles, null);
});

test('nothing is filed when his page already says it', async () => {
  const page = `---\ntype: fitness-goals\ngoal: "${V_TAPER_GOAL_LINE}"\ngoalMuscles: [${V_TAPER_MUSCLES.map((m) => `"${m}"`).join(', ')}]\n---\n# Fitness Goals\n`;
  const created = [];
  const r = await fileVTaperGoalCard(vaultWith(page), {
    readMarker: async () => null, writeMarker: async () => {}, listRecords: async () => [],
    createCoachEditRecord: async (...a) => { created.push(a); return { id: 'x' }; },
  });
  assert.equal(r.skipped, 'his goals page already says this');
  assert.equal(created.length, 0);
});
