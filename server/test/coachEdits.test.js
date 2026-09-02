// Coach's edits: the remap action that was missing (Coach bent "tune" to
// retag and nothing rendered), and the instructed-vs-suggested contract —
// his direct instruction applies on the rails with undo; Coach's own idea
// waits for his yes.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-coachedits-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-coachedits-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { validateCoachEdit, createCoachEditRecord, parseCoachProposal, getCoachEditConfig, setCoachEditConfig } = await import('../lib/coach.js');
const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
const { fileDecision, undoFiling, approveRecord } = await import('../lib/inbox.js');
const { getRecord } = await import('../lib/inboxStore.js');

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
const curl = await addCustomExercise(vault, 'EZ-Bar Reverse Curl', 'Biceps', 'weight_reps');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('remap: his exact case validates, files on the rails with undo, and undoes back to Biceps', async () => {
  const { payload, title } = await validateCoachEdit(vault, { action: 'remap', exercise: 'EZ-Bar Reverse Curl', muscleGroup: 'Forearms', reason: 'pronated grip — brachioradialis is the prime mover' });
  assert.equal(payload.exerciseId, curl.id);
  assert.equal(payload.before, 'Biceps');
  assert.equal(title, 'Coach: re-file EZ-Bar Reverse Curl under Forearms (was Biceps)');
  await assert.rejects(() => validateCoachEdit(vault, { action: 'remap', exercise: 'Nope Curl', muscleGroup: 'Forearms' }), /isn't in the exercise library/);
  await assert.rejects(() => validateCoachEdit(vault, { action: 'remap', exercise: 'EZ-Bar Reverse Curl', muscleGroup: 'Wings' }), /muscleGroup must be one of/);
  await assert.rejects(() => validateCoachEdit(vault, { action: 'tune', exercise: 'EZ-Bar Reverse Curl', muscleGroup: 'Forearms' }), /./, 'the old workaround still fails validation — remap is the honest path');

  const { destination, undo } = await fileDecision(vault, { route: 'exercise-remap', confidence: 'high', title, reason: 'x', payload });
  assert.match(destination, /filed under Forearms \(was Biceps\)/);
  assert.equal((await loadExerciseLibrary(vault)).exercises.find((e) => e.id === curl.id).muscleGroup, 'Forearms');
  assert.match(await undoFiling(vault, undo), /filed under Biceps again/);
  assert.equal((await loadExerciseLibrary(vault)).exercises.find((e) => e.id === curl.id).muscleGroup, 'Biceps');
});

test('the instructed flag survives the PROPOSE parse and rides the record; the grant defaults to direct and can be withdrawn', async () => {
  const { proposal } = parseCoachProposal('Retagging it now.\n\nPROPOSE {"action":"remap","exercise":"EZ-Bar Reverse Curl","muscleGroup":"Forearms","reason":"grip","instructed":true}');
  assert.equal(proposal.instructed, true);
  const rec = await createCoachEditRecord(vault, { question: 'Make the change', proposal });
  assert.equal(rec.instructed, true);
  assert.equal(rec.decision.route, 'exercise-remap');
  assert.equal(rec.status, 'pending', 'the record itself is always filed pending — the caller decides whether to approve it now');
  // a suggestion carries no flag
  const sug = parseCoachProposal('Worth considering.\n\nPROPOSE {"action":"remap","exercise":"EZ-Bar Reverse Curl","muscleGroup":"Forearms","reason":"grip"}').proposal;
  assert.equal(sug.instructed, undefined);
  assert.equal((await createCoachEditRecord(vault, { question: 'thoughts?', proposal: sug })).instructed, false);
  // the standing grant
  assert.deepEqual(await getCoachEditConfig(), { direct: true }, 'his standing permission is the default');
  assert.deepEqual(await setCoachEditConfig({ direct: false }), { direct: false });
  assert.deepEqual(await getCoachEditConfig(), { direct: false });
  await setCoachEditConfig({ direct: true });
  // approving the instructed record through the same rail his tap uses files it with undo
  const filed = await approveRecord(vault, rec.id);
  assert.equal(filed.status, 'filed');
  assert.equal(filed.undoData.kind, 'exercise-muscle-group');
  assert.equal((await getRecord(rec.id)).status, 'filed');
  await undoFiling(vault, filed.undoData);
});
