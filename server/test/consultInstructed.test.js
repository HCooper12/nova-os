// THE CONSULT RAIL, 1 OCT 2026 — his three answers:
//   1. "Yes, own words to Nova count as the instruction, so the change applies
//      on my standing grant as it does in the Coach chat."
//      → what he said to Nova travels verbatim to the Coach she consults; an
//      instructed change applies with the Coach chat's checks, receipt and
//      Undo; one he did not instruct still waits for his yes.
//   2. "Yes replace the waiting card."
//      → same lift, same kind of change, different numbers: the waiting card
//      is withdrawn (never his decline) and the new one filed, in one locked
//      step, and the receipt says what was replaced.
//   3. "Yes, push notification."
//      → a late hands-free answer sends ONE push to his phone, naming who
//      answered and the first sentence, opening the Nova thread; none when
//      the turn fails, and the failure line still lands.
//
// CLAUDE_BIN is a stub and NOVA_DATA_DIR a temp dir, both set BEFORE import.
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from 'node:os';
import path from 'node:path';

const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-instructed-stub-'));
const stubBin = path.join(stubDir, 'claude');
const P = (o) => `PROPOSE ${JSON.stringify(o)}`;
const MOVE = { action: 'move', exercise: 'Rope Overhead Tricep Extension', from: 'Upper Body', to: 'Push', after: 'Incline Barbell Bench Press', reason: 'your only overhead triceps work belongs on your pressing day' };
const CURL = { action: 'move', exercise: 'Cable Bicep Curl', from: 'Upper Body', to: 'Push', reason: 'arms on the pressing day' };
const TARGETS_A = { action: 'targets', routine: 'Push', exercise: 'Carter Extension', targetSets: 4, targetRepsLow: 8, targetRepsHigh: 10, reason: 'one more set' };
const TARGETS_B = { action: 'targets', routine: 'Push', exercise: 'Carter Extension', targetSets: 3, targetRepsLow: 10, targetRepsHigh: 12, reason: 'more reps' };
const consultCoach = (q) => `CONSULT ${JSON.stringify({ asks: [{ agent: 'coach', question: q }] })}`;
writeFileSync(stubBin, `#!/usr/bin/env node
// Conversational (stream-json) when --input-format is given, one-shot JSON
// otherwise. The reply is chosen from the words in the message; the Coach's
// markers come first, because its prompt carries his words to Nova too.
const argv = process.argv.slice(2);
const reply = (text) => {
  if (/The agents you consulted have answered/.test(text)) return 'Synthesis.';
  if (/\\[Code check, before anything reaches him/.test(text)) return 'Understood: it stays where it is.';
  // the move is marked instructed only if HIS words reached the Coach verbatim
  if (/COACH_MOVE_HIS/.test(text)) return /in his own words: "NOVA_ASK_MOVE move my rope overhead tricep extension to push/.test(text)
    ? ${JSON.stringify(`Moving it as you asked.\n${P({ ...MOVE, instructed: true })}`)}
    : 'NO_HIS_WORDS';
  // the model claiming "instructed" whatever it was told: code must decide
  if (/COACH_MOVE_ANYWAY/.test(text)) return ${JSON.stringify(`Moving it.\n${P({ ...MOVE, instructed: true })}`)};
  if (/COACH_SUGGEST/.test(text)) return ${JSON.stringify(`One more set would help.\n${P(TARGETS_A)}`)};
  // the model overreaching: "instructed" on a split-breaking move
  if (/COACH_SPLIT/.test(text)) return ${JSON.stringify(`Curls on Push.\n${P({ ...CURL, instructed: true })}`)};
  if (/COACH_TARGETS_A/.test(text)) return ${JSON.stringify(`Add a set.\n${P(TARGETS_A)}`)};
  if (/COACH_TARGETS_B/.test(text)) return ${JSON.stringify(`More reps.\n${P(TARGETS_B)}`)};
  if (/NOVA_ASK_MOVE/.test(text)) return ${JSON.stringify(consultCoach('COACH_MOVE_HIS should the rope extension move to Push?'))};
  if (/NOVA_ASK_SUGGEST/.test(text)) return ${JSON.stringify(consultCoach('COACH_SUGGEST anything for the Carter extension?'))};
  if (/NOVA_ASK_SPLIT/.test(text)) return ${JSON.stringify(consultCoach('COACH_SPLIT where should the curl go?'))};
  return 'A plain answer.';
};
if (argv.includes('--input-format')) {
  const rl = require('node:readline').createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let text = '';
    try { text = JSON.parse(line).message.content.map((c) => c.text).join(''); } catch {}
    const out = reply(text);
    process.stdout.write(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: out }] } }) + '\\n');
    process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: out }) + '\\n');
  });
} else {
  const prompt = argv[argv.indexOf('-p') + 1] || '';
  process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: reply(prompt) }));
}
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-instructed-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

const vault = mkdtempSync(path.join(tmpdir(), 'nova-instructed-vault-'));

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { _setConsultDepsForTest, consultedBrief, markHisWords, heldHisWords, spokenPart, _clearHisWordsForTest } = await import('../lib/consult.js');
const { startAskNova, startAskCoach, getMessageJob, _dropAllWarm } = await import('../lib/claudeCode.js');
const { followThrough, latePush, firstSentence, lateFailureLine } = await import('../lib/handsFree.js');
const { listRecords, getRecord, updateRecord } = await import('../lib/inboxStore.js');
const { waitingConflict, fileUnlessWaiting, receiptLines } = await import('../lib/coachProposals.js');
const { hisWordsOf } = await import('../lib/coach.js');
const { undoRecord } = await import('../lib/inbox.js');
const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
const { createRoutine, loadRoutines } = await import('../lib/workouts.js');
const { voiceRouter } = await import('../routes/voice.js');

// his program, small: Push, Pull, Upper Body
const ex = {};
for (const [name, group] of [
  ['Incline Barbell Bench Press', 'Chest'], ['Carter Extension', 'Triceps'], ['Face Pull', 'Shoulders'],
  ['Weighted Pull-Up', 'Back'], ['Spider Curl', 'Biceps'],
  ['Barbell Bench Press', 'Chest'], ['Rope Overhead Tricep Extension', 'Triceps'], ['Cable Bicep Curl', 'Biceps'],
]) ex[name] = await addCustomExercise(vault, name, group, 'weight_reps');
const lib = async () => (await loadExerciseLibrary(vault)).exercises;
const e = (name, sets = 3, low = 8, high = 12) => ({ exerciseId: ex[name].id, targetSets: sets, targetRepsLow: low, targetRepsHigh: high });
await createRoutine(vault, await lib(), 'Push', [e('Incline Barbell Bench Press', 3, 6, 10), e('Carter Extension'), e('Face Pull', 3, 12, 12)]);
await createRoutine(vault, await lib(), 'Pull', [e('Weighted Pull-Up', 3, 12, 12), e('Spider Curl')]);
await createRoutine(vault, await lib(), 'Upper Body', [e('Barbell Bench Press', 3, 6, 8), e('Rope Overhead Tricep Extension', 3, 6, 7), e('Cable Bicep Curl', 3, 6, 8)]);

test.after(() => { _dropAllWarm(); _setConsultDepsForTest(null); _clearHisWordsForTest(); });

const waitFor = async (pred, ms = 20_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await pred();
    if (r) return r;
    await new Promise((r2) => setTimeout(r2, 25));
  }
  throw new Error('timed out waiting');
};
const settled = (jobId) => waitFor(() => { const j = getMessageJob(jobId); return j.status !== 'running' ? j : null; });
const pendingCoachCards = async () => (await listRecords()).filter((r) => r.status === 'pending' && r.decision?.route);
const clearCards = async () => { for (const r of await pendingCoachCards()) await updateRecord(r.id, { status: 'withdrawn' }); };
const names = async (routine) => {
  const { routines } = await loadRoutines(vault, await lib());
  return routines.find((r) => r.name === routine).exercises.map((x) => x.name);
};

// The Coach's consulted lane exactly as consult.askCoach runs it: the options
// runConsults hands over become `consulted` (consult.consultedOpts).
const coachAsConsulted = async (q, o = {}) => {
  const done = await settled(startAskCoach(vault, { question: q, context: 'ctx', consulted: { by: o.from, question: o.question || '', chain: o.chain || [], ledger: o.ledger || null } }));
  if (done.status !== 'ready') throw new Error(done.error);
  return { text: done.result.text, consult: done.result.consult, cards: done.result.cards };
};
// Nova's turn on his words, the Coach consulted through the rail
const novaTurn = async (his, { mark = true } = {}) => {
  if (mark) markHisWords(his); // what the door does (routes/voice.js, telegram.js)
  _setConsultDepsForTest({ coach: coachAsConsulted });
  try {
    const done = await settled(startAskNova(vault, { question: his, context: 'ctx' }));
    assert.equal(done.status, 'ready', done.error);
    return done;
  } finally {
    _setConsultDepsForTest(null);
  }
};

/* ---------------- 1. his own words to Nova are his instruction ---------------- */

test('his words to Nova travel to the consulted Coach verbatim, and only his words count', () => {
  const his = '[The plan he is most likely referring to: x]\n\nMove my rope extension\n\nto Push, straight after incline.';
  assert.equal(heldHisWords(his), false);
  markHisWords(his);
  assert.equal(heldHisWords(his), true);
  const brief = consultedBrief('nova', his, { canPropose: true });
  assert.match(brief, /in his own words: "Move my rope extension to Push, straight after incline\."/, 'verbatim, the machine\'s bracket left off');
  assert.equal(spokenPart(his), hisWordsOf(his), 'the same rule as the Coach chat\'s hisWordsOf');
  assert.match(brief, /mark a PROPOSE line "instructed":true only when those words ask for exactly that change/);
  assert.match(brief, /Nova's question to you is never his instruction/);
  assert.doesNotMatch(brief, /\n\n/, 'one paragraph');
  // 3 Oct 2026, his call: "my own words in the Leader chat or the Coach tab
  // count the same way when those agents consult the Coach". The same held
  // string asked by the Leader is his instruction too, said to the Leader.
  const viaLeader = consultedBrief('leader', his, { canPropose: true });
  assert.match(viaLeader, /because of what Hayden said to the Leader, in his own words: "Move my rope extension to Push, straight after incline\."/);
  assert.match(viaLeader, /HIS OWN, said to the Leader: mark a PROPOSE line "instructed":true only when those words ask for exactly that change/);
  assert.match(viaLeader, /the Leader's question to you is never his instruction/);
  // an agent's rewording, or a code-written ritual, was never marked
  assert.match(consultedBrief('nova', 'Should the rope extension move?', { canPropose: true }), /never "instructed"/);
  markHisWords('[MORNING BRIEF, scaffolding only]');
  assert.equal(heldHisWords('[MORNING BRIEF, scaffolding only]'), false, 'nothing of his in it, nothing held');
  // forgets after a day
  markHisWords('old words', { now: 0 });
  assert.equal(heldHisWords('old words', { now: 25 * 60 * 60_000 }), false);
});

test('he tells Nova to move it: the consulted Coach\'s instructed move applies on his standing grant, with the receipt and Undo', async () => {
  await clearCards();
  const his = 'NOVA_ASK_MOVE move my rope overhead tricep extension to push after the incline bench';
  const done = await novaTurn(his);
  const coach = done.result.consult[0];
  assert.equal(coach.agent, 'coach');
  assert.equal(coach.cards.length, 1);
  assert.doesNotMatch(coach.answer, /NO_HIS_WORDS/, 'his words reached the Coach');
  assert.match(coach.answer, /^Moving it as you asked\./);
  assert.match(coach.answer, /Done: Rope Overhead Tricep Extension is on Push now, straight after Incline Barbell Bench Press, 3 sets of 6 to 7, and off Upper Body\. Undo is in your Inbox\./);
  const card = await getRecord(coach.cards[0].recordId);
  assert.equal(card.status, 'filed', 'applied, not waiting');
  assert.equal(card.instructed, true);
  assert.equal(card.text, his, 'the card carries what he said to Nova');
  assert.deepEqual(await names('Push'), ['Incline Barbell Bench Press', 'Rope Overhead Tricep Extension', 'Carter Extension', 'Face Pull']);
  assert.ok(!(await names('Upper Body')).includes('Rope Overhead Tricep Extension'));
  assert.equal((await pendingCoachCards()).length, 0);
  // the Undo is real
  await undoRecord(vault, card.id);
  assert.ok((await names('Upper Body')).includes('Rope Overhead Tricep Extension'));
  assert.ok(!(await names('Push')).includes('Rope Overhead Tricep Extension'));
});

test('the same instructed line, when the question is not his own words, waits for his yes', async () => {
  await clearCards();
  const his = 'NOVA_ASK_MOVE move my rope overhead tricep extension to push after the incline bench (unmarked)';
  const done = await novaTurn(his, { mark: false });
  const coach = done.result.consult[0];
  assert.match(coach.answer, /NO_HIS_WORDS/, 'the Coach was never told these were his words');
  // and when the Coach claims "instructed" anyway, code decides: the question
  // Nova passed on is not held as his words, so the card waits
  const asked = 'move the rope extension to push after the incline (not marked)';
  const out = await coachAsConsulted('COACH_MOVE_ANYWAY?', { from: 'nova', question: asked, chain: ['nova'] });
  const card = await getRecord(out.cards[0].recordId);
  assert.equal(card.status, 'pending', 'waits for his yes');
  assert.equal(card.instructed, false);
  assert.match(out.text, /On a card for your yes on the Coach tab: move Rope Overhead Tricep Extension from Upper Body to Push/);
  assert.deepEqual(await names('Push'), ['Incline Barbell Bench Press', 'Carter Extension', 'Face Pull']);
  // the same words, held as his: the same line applies (the registry is the switch)
  await clearCards();
  markHisWords(asked);
  const held = await coachAsConsulted('COACH_MOVE_ANYWAY?', { from: 'nova', question: asked, chain: ['nova'] });
  assert.equal((await getRecord(held.cards[0].recordId)).status, 'filed');
  await undoRecord(vault, held.cards[0].recordId);
  assert.deepEqual(await names('Push'), ['Incline Barbell Bench Press', 'Carter Extension', 'Face Pull']);
  // an agent further down the chain asking with its own words: not his
  const leader = await coachAsConsulted('COACH_SPLIT where should the curl go?', { from: 'leader', question: 'my arms', chain: ['leader'] });
  assert.equal((leader.cards || []).length, 0, 'an agent\'s question cannot carry a split-breaking move either');
});

test('a change he did not instruct still waits for his yes, even on his own words', async () => {
  await clearCards();
  const done = await novaTurn('NOVA_ASK_SUGGEST how is my push day looking');
  const coach = done.result.consult[0];
  assert.equal(coach.cards.length, 1);
  const card = await getRecord(coach.cards[0].recordId);
  assert.equal(card.status, 'pending');
  assert.equal(card.instructed, false);
  assert.match(coach.answer, /On a card for your yes on the Coach tab: retarget Carter Extension in Push/);
  assert.doesNotMatch(coach.answer, /Done:/);
});

test('a split-breaking change needs his own words naming the lift and the day, as in the Coach chat', async () => {
  await clearCards();
  // the Coach marks it instructed, but he never named the curl or Push
  const vague = await novaTurn('NOVA_ASK_SPLIT sort my arms out');
  const coach = vague.result.consult[0];
  assert.equal((coach.cards || []).length, 0, 'refused, so no card');
  assert.match(coach.answer, /^Understood: it stays where it is\./, 'the refusal went back to the Coach, which rewrote its answer');
  assert.deepEqual(await names('Push'), ['Incline Barbell Bench Press', 'Carter Extension', 'Face Pull']);
  // he names both: it applies
  const named = await novaTurn('NOVA_ASK_SPLIT put my cable bicep curl on push');
  const c2 = named.result.consult[0];
  assert.equal(c2.cards.length, 1);
  assert.equal((await getRecord(c2.cards[0].recordId)).status, 'filed');
  assert.match(c2.answer, /Done: Cable Bicep Curl is on Push now/);
  assert.ok((await names('Push')).includes('Cable Bicep Curl'));
  await undoRecord(vault, c2.cards[0].recordId);
  assert.ok(!(await names('Push')).includes('Cable Bicep Curl'));
});

test('the Siri door marks what he said as his words', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', voiceRouter(vault));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const { takeSpokenSession } = await import('../lib/spokenSession.js');
  takeSpokenSession(); // resume: no context assembly
  try {
    const q = 'HELD_CHECK what is on for tomorrow afternoon';
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/ask/sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: q }) });
    const body = JSON.parse((await res.text()).trim());
    assert.equal(body.text, 'A plain answer.');
    assert.equal(heldHisWords(q), true);
  } finally {
    server.close();
  }
});

/* ------------------ 2. a new change replaces the waiting card ------------------ */

test('the replace rule: same lift + same kind + different numbers replaces; identical is waiting; another verb still overlaps', () => {
  const push = { routineId: 'push', routineName: 'Push' };
  const a = { action: 'targets', ...push, removeExerciseId: 'carter', removeName: 'Carter Extension', targetSets: 4, targetRepsLow: 8, targetRepsHigh: 10 };
  const b = { ...a, targetSets: 3, targetRepsLow: 10, targetRepsHigh: 12 };
  const card = (id, route, payload, status = 'pending') => ({ id, status, decision: { route, payload, title: 't' } });
  assert.deepEqual(waitingConflict('routine-edit', b, [card('w1', 'routine-edit', a)]).replace.map((r) => r.id), ['w1']);
  assert.equal(waitingConflict('routine-edit', a, [card('w1', 'routine-edit', a)]).same?.id, 'w1');
  assert.equal(waitingConflict('routine-edit', b, [card('w1', 'routine-edit', a, 'rejected')]).replace.length, 0, 'his no is not replaced');
  // the rope extension: a move of it onto Push is waiting; an ADD of it onto Push is a different verb
  const move = { action: 'move', routineId: 'push', fromRoutineId: 'upper', removeExerciseId: 'rope', removeName: 'Rope' };
  const add = { action: 'add', routineId: 'push', addExerciseId: 'rope', addName: 'Rope' };
  const c = waitingConflict('routine-edit', add, [card('w2', 'routine-edit', move)]);
  assert.equal(c.overlap?.id, 'w2');
  assert.equal(c.replace.length, 0);
  // the same move to a different place is newer advice about the same thing
  const elsewhere = { ...move, routineId: 'pull' };
  assert.deepEqual(waitingConflict('routine-edit', elsewhere, [card('w2', 'routine-edit', move)]).replace.map((r) => r.id), ['w2']);
  // one card per weekday is unchanged
  assert.equal(waitingConflict('schedule-edit', { action: 'schedule', day: 'monday', routineId: 'pull' }, [card('w3', 'schedule-edit', { action: 'schedule', day: 'monday', routineId: 'push' })]).overlap?.id, 'w3');
  // the receipt names what was replaced
  const lines = receiptLines({ filed: [{ title: 'Coach: retarget Carter Extension in Push to 3 × 10–12', route: 'routine-edit', payload: b, replaced: [{ id: 'w1', title: 'Coach: retarget Carter Extension in Push to 4 × 8–10' }] }], announce: true });
  assert.deepEqual(lines, [
    'Replaced the card that was waiting on your call (retarget Carter Extension in Push to 4 × 8–10) with the new numbers: retarget Carter Extension in Push to 3 × 10–12.',
    'The new card is waiting for your yes on the Coach tab.',
  ]);
});

test('a consulted Coach with new numbers replaces its waiting card in one step, withdrawn not declined; the identical change is still waiting', async () => {
  await clearCards();
  const first = await coachAsConsulted('COACH_TARGETS_A carter?', { from: 'nova', question: 'push day', chain: ['nova'] });
  assert.equal(first.cards[0].state, 'filed');
  const oldId = first.cards[0].recordId;
  const second = await coachAsConsulted('COACH_TARGETS_B carter?', { from: 'nova', question: 'push day', chain: ['nova'] });
  assert.equal(second.cards[0].state, 'filed');
  const newId = second.cards[0].recordId;
  assert.notEqual(newId, oldId);
  const old = await getRecord(oldId);
  assert.equal(old.status, 'withdrawn', 'never "rejected": it was not his no');
  assert.equal(old.withdrawnBy, 'coach');
  assert.equal(old.replacedBy, newId);
  const pending = await pendingCoachCards();
  assert.deepEqual(pending.map((r) => r.id), [newId], 'one card, the new one');
  assert.match(second.text, /Replaced the card that was waiting on your call \(retarget Carter Extension in Push to 4 × 8–10\) with the new numbers: retarget Carter Extension in Push to 3 × 10–12\./);
  // the identical change again: already waiting, nothing replaced
  const third = await coachAsConsulted('COACH_TARGETS_B carter again?', { from: 'nova', question: 'push day', chain: ['nova'] });
  assert.equal(third.cards[0].state, 'waiting');
  assert.match(third.text, /Already waiting on your call, so not filed again: retarget Carter Extension in Push to 3 × 10–12/);
  assert.deepEqual((await pendingCoachCards()).map((r) => r.id), [newId]);
});

test('two consulted Coaches in one turn on the same lift, different numbers: one card stands, the other replaced', async () => {
  await clearCards();
  const [a, b] = await Promise.all([
    coachAsConsulted('COACH_TARGETS_A carter?', { from: 'nova', question: 'push day', chain: ['nova'] }),
    coachAsConsulted('COACH_TARGETS_B carter?', { from: 'leader', question: 'push day', chain: ['leader'] }),
  ]);
  assert.equal((await pendingCoachCards()).length, 1, 'never two cards for one lift');
  assert.equal([a, b].filter((x) => /Replaced the card that was waiting/.test(x.text)).length, 1);
});

test('Nova\'s own PROPOSE keeps reporting "already waiting" until its reply can say what it replaced; with replace on, it replaces', async () => {
  await clearCards();
  const first = await coachAsConsulted('COACH_TARGETS_A carter?', { from: 'nova', question: 'push day', chain: ['nova'] });
  const waiting = await getRecord(first.cards[0].recordId);
  const payload = { ...waiting.decision.payload, targetSets: 5 };
  let created = 0;
  const create = async () => { created += 1; const { createCoachEditRecord } = await import('../lib/coach.js'); return createCoachEditRecord(vault, { question: 'five sets', proposal: {}, source: 'voice', validated: { payload, title: 'Coach: retarget Carter Extension in Push to 5 sets' } }); };
  const off = await fileUnlessWaiting({ route: 'routine-edit', payload, create });
  assert.equal(off.duplicate, true);
  assert.equal(created, 0);
  const on = await fileUnlessWaiting({ route: 'routine-edit', payload, create, replace: true });
  assert.equal(on.duplicate, false);
  assert.deepEqual(on.replaced.map((r) => r.id), [waiting.id]);
  const old = await getRecord(waiting.id);
  assert.equal(old.status, 'withdrawn');
  assert.equal(old.withdrawnBy, 'nova');
  assert.equal(old.replacedBy, on.record.id);
});

/* ------------------- 3. the late answer taps his phone, once ------------------- */

const lateJob = (over = {}) => ({
  id: 'job12345',
  status: 'ready',
  result: {
    text: 'Asking the Coach and the Researcher.\n\n**Creatine** works for strength, per Kreider 2017. Take 3 to 5 g a day.',
    consult: [{ agent: 'coach', ok: false, state: 'failed' }, { agent: 'researcher', ok: true, state: 'done' }],
  },
  ...over,
});

test('a late answer sends exactly one push, after it lands, naming who answered and its first sentence, opening the Nova thread', async () => {
  const order = [];
  const pushes = [];
  const job = lateJob();
  await followThrough('job12345', {
    getJob: () => job, pollMs: 5,
    onReady: async () => { order.push('landed'); },
    push: async (note) => { order.push('push'); pushes.push(note); },
  });
  assert.deepEqual(order, ['landed', 'push']);
  assert.equal(pushes.length, 1);
  assert.deepEqual(pushes[0], {
    title: 'Nova answered, with the Researcher',
    body: 'Creatine works for strength, per Kreider 2017.',
    tag: 'late-answer-job12345',
    url: './#/voice',
  });
});

test('a failed late answer sends no push, and its failure line still lands', async () => {
  const pushes = [];
  const rows = [];
  const job = { id: 'jobfail1', status: 'error', error: 'the Researcher could not reach the web', consult: [{ agent: 'researcher' }] };
  await followThrough('jobfail1', {
    getJob: () => job, pollMs: 5,
    onReady: () => { throw new Error('never ready'); },
    onError: (error, j) => { rows.push(lateFailureLine(j?.consult, error)); },
    push: async (note) => { pushes.push(note); },
  });
  assert.equal(pushes.length, 0);
  assert.deepEqual(rows, ['The answer I was building with the Researcher did not arrive: the Researcher could not reach the web.']);
  // a vanished job: the same
  await followThrough('gone', { getJob: () => null, onError: (error) => { rows.push(error); }, push: async (n) => { pushes.push(n); } });
  assert.equal(pushes.length, 0);
  assert.equal(rows[1], 'the answer was lost before it finished');
});

test('a push that fails to send never sinks the follow-through', async () => {
  let landed = false;
  await followThrough('job12345', { getJob: () => lateJob(), onReady: () => { landed = true; }, push: async () => { throw new Error('APNs down'); } });
  assert.equal(landed, true);
});

test('the push reads plainly: no consult, a long first sentence, an empty answer', () => {
  assert.equal(latePush({ result: { text: 'Rest today.' } }, 'j1').title, 'Nova answered');
  assert.equal(latePush({ result: { text: '' } }, 'j1').body, 'Your answer is in your Nova thread.');
  assert.ok(firstSentence(`${'word '.repeat(80)}end.`).length <= 180);
  assert.equal(firstSentence('See [Kreider 2017](https://x.org/k) first. Then rest.'), 'See Kreider 2017 first.');
  assert.equal(firstSentence('Take 3.5 g daily. Then rest.'), 'Take 3.5 g daily.');
});

test("Nova's own proposal replaces a waiting card with different numbers, and her reply says so in code's words", () => {
  const va = readFileSync(new URL('../lib/voiceActions.js', import.meta.url), 'utf8');
  assert.match(va, /fileUnlessWaiting\(\{\s*route, payload: validated\.payload, replace: true,/, 'Nova files with the replace rule');
  assert.match(va, /replaced: out\.replaced\.map/, 'what it replaced travels back');
  const cc = readFileSync(new URL('../lib/claudeCode.js', import.meta.url), 'utf8');
  assert.match(cc, /It replaces the card that was waiting on your call/, 'code says what was replaced');
});
