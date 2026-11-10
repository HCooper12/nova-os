// Coach can rename an exercise (10 Nov 2026). He asked it to rename the
// single-arm reverse pec deck mid-session and was told "I cannot rename
// exercises". The id stays, so a routine and a logged set follow the name.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-rename-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-rename-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { validateCoachEdit, parseCoachProposal, createCoachEditRecord, routeForAction } = await import('../lib/coach.js');
const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
const { fileDecision, undoFiling } = await import('../lib/inbox.js');

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
const pec = await addCustomExercise(vault, 'Reverse Single Arm Pec Deck', 'Rear Delts', 'weight_reps');
await addCustomExercise(vault, 'Lying T Bar Close Grip Row', 'Lats', 'weight_reps');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const entry = async () => (await loadExerciseLibrary(vault)).exercises.find((e) => e.id === pec.id);

test('rename validates, files on its own route, keeps the id and filing, and undoes', async () => {
  assert.equal(routeForAction('rename'), 'exercise-rename');
  const { payload, title } = await validateCoachEdit(vault, { action: 'rename', exercise: 'Reverse Single Arm Pec Deck', to: 'Single Arm Reverse Pec Deck (Cable)' });
  assert.equal(payload.exerciseId, pec.id);
  assert.equal(title, 'Coach: rename Reverse Single Arm Pec Deck to Single Arm Reverse Pec Deck (Cable)');

  const { destination, undo } = await fileDecision(vault, { route: 'exercise-rename', confidence: 'high', title, reason: 'x', payload });
  assert.match(destination, /is now Single Arm Reverse Pec Deck \(Cable\)/);
  const after = await entry();
  assert.equal(after.name, 'Single Arm Reverse Pec Deck (Cable)');
  assert.equal(after.muscleGroup, 'Rear Delts');
  assert.match(await undoFiling(vault, undo), /has its name back/);
  assert.equal((await entry()).name, 'Reverse Single Arm Pec Deck');
});

test('rename refuses what would be wrong, and accepts the model\'s other spellings', async () => {
  await assert.rejects(() => validateCoachEdit(vault, { action: 'rename', exercise: 'Reverse Single Arm Pec Deck', to: 'Reverse Single Arm Pec Deck' }), /already (has that name|exists)/);
  await assert.rejects(() => validateCoachEdit(vault, { action: 'rename', exercise: 'Reverse Single Arm Pec Deck', to: 'Lying T-Bar Close Grip Row' }), /already exists/);
  await assert.rejects(() => validateCoachEdit(vault, { action: 'rename', exercise: 'Nope Fly', to: 'Something' }), /no exercise called/);
  await assert.rejects(() => validateCoachEdit(vault, { action: 'rename', exercise: 'Reverse Single Arm Pec Deck' }), /new name in "to"/);
  const { proposal } = parseCoachProposal('Renaming it.\n\nPROPOSE {"action":"relabel","exercise":"Reverse Single Arm Pec Deck","newName":"Single Arm Reverse Pec Deck","instructed":true}');
  const v = await validateCoachEdit(vault, proposal);
  assert.equal(v.payload.newName, 'Single Arm Reverse Pec Deck');
  const rec = await createCoachEditRecord(vault, { question: 'rename it', proposal });
  assert.equal(rec.decision.route, 'exercise-rename');
});
