// FROM COACH'S REPLY TO HIS CARDS (25 Sep 2026). The replies below are the
// shapes Coach really sent him between 11:01 and 11:26 AEST. What must hold:
//   - a refused line is sent back to the SAME Coach before any card exists;
//     a wording fault is fixed line by line, a wrong placement rewrites the
//     advice, and only what still fails reaches him, in plain words
//   - an instructed change applies and CODE says what changed
//   - Coach can take back its own waiting card; a re-sent card is not a twin
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-coachprop-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-coachprop-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { settleCoachChanges, parseWithdraw, repairRequest } = await import('../lib/coachProposals.js');
const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
const { createRoutine, loadRoutines } = await import('../lib/workouts.js');
const { getRecord, listRecords } = await import('../lib/inboxStore.js');
const { createCoachEditRecord, coachCardsContext, programContext } = await import('../lib/coach.js');

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
const ex = {};
for (const [name, group] of [
  ['Incline Barbell Bench Press', 'Chest'], ['Carter Extension', 'Triceps'], ['Face Pull', 'Shoulders'],
  ['Weighted Pull-Up', 'Back'], ['Spider Curl', 'Biceps'],
  ['Barbell Bench Press', 'Chest'], ['Rope Overhead Tricep Extension', 'Triceps'], ['Cable Bicep Curl', 'Biceps'],
  ['Cable Lateral Raise (behind back, wrist height)', 'Shoulders'],
  ['Hack Squat', 'Quads'], ['Rear Delt Fly', 'Shoulders'],
]) ex[name] = await addCustomExercise(vault, name, group, 'weight_reps');
const lib = async () => (await loadExerciseLibrary(vault)).exercises;
const e = (name, sets = 3, low = 8, high = 12) => ({ exerciseId: ex[name].id, targetSets: sets, targetRepsLow: low, targetRepsHigh: high });
const push = await createRoutine(vault, await lib(), 'Push', [e('Incline Barbell Bench Press', 3, 6, 10), e('Carter Extension'), e('Face Pull', 3, 12, 12)]);
await createRoutine(vault, await lib(), 'Pull', [e('Weighted Pull-Up', 3, 12, 12), e('Spider Curl')]);
const upper = await createRoutine(vault, await lib(), 'Upper Body', [e('Barbell Bench Press', 3, 6, 8), e('Rope Overhead Tricep Extension', 3, 6, 7), e('Cable Bicep Curl', 3, 6, 8), e('Cable Lateral Raise (behind back, wrist height)', 3, 8, 9)]);
await createRoutine(vault, await lib(), 'Leg Day', [e('Hack Squat', 3, 12, 12)]);

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const order = async (id) => (await loadRoutines(vault, await lib())).routines.find((r) => r.id === id).exercises.map((x) => x.name);
const P = (o) => `PROPOSE ${JSON.stringify(o)}`;

test('his 11:02 reply: curls onto Push are refused as substance, the advice is rewritten, and only the rewrite files', async () => {
  const reply = [
    'Move two exercises out of Upper Body. The cable curl goes to Push, paired with your pushdowns.',
    P({ action: 'remove', routine: 'Upper Body', exercise: 'Cable Bicep Curl', reason: 'moving to Push' }),
    P({ action: 'add', routine: 'Push', exercise: 'Cable Bicep Curl', targetSets: 3, targetRepsLow: 6, targetRepsHigh: 8, reason: 'pairs with pushdowns' }),
    P({ action: 'add', routine: 'Leg Day', exercise: 'Rear Delt Fly', targetSets: 3, reason: 'fresh upper body on leg day' }),
  ].join('\n');
  const sent = [];
  const settled = await settleCoachChanges(vault, {
    question: 'What change could be made to my upper body workout…',
    replyText: reply,
    resume: async (text, { rewrite }) => {
      sent.push({ text, rewrite });
      return [
        'Keep the curls on your pull side. Move the rope overhead extension to Push instead, straight after the incline bench.',
        P({ action: 'move', exercise: 'Rope Overhead Tricep Extension', from: 'Upper Body', to: 'Push', after: 'Incline Barbell Bench Press', targetRepsLow: 8, targetRepsHigh: 12, reason: 'triceps belong on your pressing day' }),
      ].join('\n');
    },
  });
  assert.equal(sent.length, 1, 'one repair round');
  assert.equal(sent[0].rewrite, true, 'a split refusal is a wrong answer, not a typo');
  assert.match(sent[0].text, /Cable Bicep Curl trains Biceps, and Push is a push day/);
  assert.match(sent[0].text, /Rear Delt Fly trains Shoulders, and Leg Day is a leg day/);
  assert.match(sent[0].text, /nothing has been filed yet/);
  assert.match(settled.text, /^Keep the curls on your pull side/, 'he reads the corrected advice, not the first draft');
  assert.doesNotMatch(settled.text, /PROPOSE/);
  assert.equal(settled.filed.length, 1, 'the first draft\'s remove never became a card');
  const card = await getRecord(settled.filed[0].recordId);
  assert.equal(card.status, 'pending', 'a suggestion waits for his yes');
  assert.equal(card.decision.title, 'Coach: move Rope Overhead Tricep Extension from Upper Body to Push, after Incline Barbell Bench Press, at 3 × 8–12');
  assert.equal(card.text, 'What change could be made to my upper body workout…', 'the card carries his question');
  assert.deepEqual(await order(push.id), ['Incline Barbell Bench Press', 'Carter Extension', 'Face Pull'], 'nothing written without his yes');
});

test('a wording fault is fixed line by line: the answer stands, the corrected card joins the good one', async () => {
  const reply = [
    'Two tweaks.',
    P({ action: 'targets', routine: 'Push', exercise: 'Carter Extension', targetSets: 4 }),
    P({ action: 'add', add: 'Rear Delt Fly', reason: 'rear delts are short' }), // no routine
  ].join('\n');
  const sent = [];
  const settled = await settleCoachChanges(vault, {
    question: 'tweaks?', replyText: reply,
    resume: async (text, { rewrite }) => { sent.push({ rewrite }); return P({ action: 'add', routine: 'Pull', add: 'Rear Delt Fly', position: 'last', reason: 'rear delts are short' }); },
  });
  assert.equal(sent[0].rewrite, false);
  assert.equal(settled.text, 'Two tweaks.');
  assert.deepEqual(settled.filed.map((f) => f.title), ['Coach: retarget Carter Extension in Push to 4 sets', 'Coach: add Rear Delt Fly to Pull']);
});

test('when the repair turn fails he still gets the answer, what passed, and plain words about what did not', async () => {
  const settled = await settleCoachChanges(vault, {
    question: 'q',
    replyText: ['Here you go.', P({ action: 'remove', routine: 'Push', exercise: 'Face Pull' }), P({ action: 'move', exercise: 'Cable Bicep Curl', from: 'Upper Body', to: 'Push' })].join('\n'),
    resume: async () => null,
  });
  assert.equal(settled.filed.length, 1);
  assert.match(settled.text, /Not on a card, so nothing changed: move Cable Bicep Curl from Upper Body to Push\. Cable Bicep Curl trains Biceps, and Push is a push day .* belongs on Pull or Upper Body\.$/);
  assert.doesNotMatch(settled.text, /instructed/, 'the model\'s instruction is not his to read');
});

test('HIS instruction applies at once, and code, not Coach, says what changed', async () => {
  const settled = await settleCoachChanges(vault, {
    question: 'Put the rope extension on Push, straight after the incline bench',
    replyText: ['Moving it now.', P({ action: 'move', exercise: 'Rope Overhead Tricep Extension', from: 'Upper Body', to: 'Push', after: 'Incline Barbell Bench Press', instructed: true, reason: 'you asked' })].join('\n'),
  });
  const f = settled.filed.find((x) => x.payload.action === 'move' && x.instructed);
  assert.equal(f.status, 'done');
  assert.match(settled.text, /Done: Rope Overhead Tricep Extension is on Push now, straight after Incline Barbell Bench Press, 3 sets of 6 to 7, and off Upper Body\./);
  assert.deepEqual(await order(push.id), ['Incline Barbell Bench Press', 'Rope Overhead Tricep Extension', 'Carter Extension', 'Face Pull']);
  assert.ok(!(await order(upper.id)).includes('Rope Overhead Tricep Extension'));
});

test('Coach takes its own card back; a card already waiting is reused, not twinned', async () => {
  const waiting = await createCoachEditRecord(vault, { question: 'q', proposal: { action: 'add', routine: 'Pull', add: 'Face Pull', reason: 'rear delts' } });
  const before = (await listRecords()).length;
  const again = await settleCoachChanges(vault, { question: 'q', replyText: `Still worth it.\n${P({ action: 'add', routine: 'Pull', add: 'Face Pull', reason: 'rear delts' })}` });
  assert.equal(again.filed[0].recordId, waiting.id, 'the same change is the same card');
  assert.equal(again.filed[0].reused, true);
  assert.equal((await listRecords()).length, before, 'and no second push to his phone');
  const back = await settleCoachChanges(vault, { question: 'q', replyText: `Scratch that one.\nWITHDRAW {"ids":["${waiting.id}"]}` });
  assert.equal((await getRecord(waiting.id)).status, 'withdrawn', 'not "declined": nothing learns from it as his answer');
  assert.match(back.text, /^Scratch that one\.\n\nTaken off the Coach tab: add Face Pull to Pull\.$/);
  assert.deepEqual(parseWithdraw('WITHDRAW {"ids":["abc12345","not an id!"]}').ids, ['abc12345']);
});

test('Coach sees its cards and his program every turn, from the record', async () => {
  const ctx = await coachCardsContext();
  assert.match(ctx, /YOUR CARDS \(the record, not your memory\)/);
  assert.match(ctx, /waiting on him: .*\[[0-9a-f]{8}\] move Rope Overhead Tricep Extension from Upper Body to Push/);
  assert.match(ctx, /you took it back: add Face Pull to Pull/);
  assert.match(ctx, /WITHDRAW \{"ids":\["<id>"\]\}/);
  const prog = await programContext(vault);
  assert.match(prog, /HIS PROGRAM NOW/);
  assert.match(prog, /Push \[\d+ sets\]: 1 Incline Barbell Bench Press 3×6–10 \(Chest\) · 2 Rope Overhead Tricep Extension/);
  assert.match(prog, /HIS SPLIT \(code refuses a suggestion that breaks it\): Push holds Chest, Shoulders, Triceps/);
  assert.ok(!/\n\n/.test(prog), 'one paragraph, so the transcript reader knows it is plumbing');
});

test('the repair request names every refusal and what to send back', () => {
  const r = repairRequest([{ line: 'PROPOSE {"action":"add"}', reason: 'the proposal names no exercise to add' }]);
  assert.match(r, /^\[Code check, before anything reaches him: one of your PROPOSE lines could not become a card/);
  assert.match(r, /Reply with ONLY the corrected PROPOSE lines/);
  assert.match(r, /Never say a change is done/);
});
