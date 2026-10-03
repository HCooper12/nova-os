// HIS WORDS COUNT ON EVERY DOOR — 3 Oct 2026. His words: "Yes my own words in
// the Leader chat or the Coach tab count the same way when those agents
// consult the Coach. It's just a difference in who I am directly talking to.
// It should all interact and have the same functionality."
//
// What this pins:
//   1. the Leader chat (/api/leader/chat) marks what he typed as his words,
//      so when the Leader consults the Coach with them, a change he told the
//      Leader to make applies on his standing grant, with the Coach chat's
//      checks, receipt and Undo, exactly as it does from Nova;
//   2. the Coach tab (/api/workouts/coach) marks what he typed, so an agent
//      the Coach consults is told these are his own words;
//   3. a code-written turn (a plan step, a ritual) is never marked, and then
//      the same instructed line waits for his yes.
//
// CLAUDE_BIN is a stub and NOVA_DATA_DIR a temp dir, both set BEFORE import.
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-hiswords-stub-'));
const stubBin = path.join(stubDir, 'claude');
const P = (o) => `PROPOSE ${JSON.stringify(o)}`;
const MOVE = { action: 'move', exercise: 'Rope Overhead Tricep Extension', from: 'Upper Body', to: 'Push', after: 'Incline Barbell Bench Press', reason: 'your only overhead triceps work belongs on your pressing day' };
const consult = (agent, q) => `CONSULT ${JSON.stringify({ asks: [{ agent, question: q }] })}`;
writeFileSync(stubBin, `#!/usr/bin/env node
const argv = process.argv.slice(2);
const reply = (text) => {
  if (/The agents you consulted have answered/.test(text)) return 'Synthesis.';
  if (/\\[Code check, before anything reaches him/.test(text)) return 'Understood: it stays where it is.';
  // the consulted Coach marks the move instructed whenever it is told the
  // words are his; code decides whether that holds
  if (/COACH_MOVE_HIS/.test(text)) return /in his own words: "LEADER_ASK_MOVE move my rope overhead tricep extension to push/.test(text)
    ? ${JSON.stringify(`Moving it as you asked.\n${P({ ...MOVE, instructed: true })}`)}
    : ${JSON.stringify(`Moving it.\n${P({ ...MOVE, instructed: true })}`)};
  // Nova, consulted by the Coach: does he know these were his own words?
  if (/NOVA_FROM_COACH/.test(text)) return /because of what Hayden said to the Coach, in his own words: "COACHTAB_ASK what does my week look like for a shoulder rehab block/.test(text) ? 'HIS_WORDS_SEEN' : 'NO_HIS_WORDS';
  if (/LEADER_ASK_MOVE/.test(text)) return ${JSON.stringify(consult('coach', 'COACH_MOVE_HIS should the rope extension move to Push?'))};
  if (/COACHTAB_ASK/.test(text)) return ${JSON.stringify(consult('nova', 'NOVA_FROM_COACH what has he written about his shoulder lately?'))};
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
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-hiswords-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

const vault = mkdtempSync(path.join(tmpdir(), 'nova-hiswords-vault-'));

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { _setConsultDepsForTest, heldHisWords, consultedBrief, _clearHisWordsForTest } = await import('../lib/consult.js');
const { startAskNova, startAskCoach, getMessageJob, _dropAllWarm } = await import('../lib/claudeCode.js');
const { getRecord, listRecords, updateRecord } = await import('../lib/inboxStore.js');
const { undoRecord } = await import('../lib/inbox.js');
const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
const { createRoutine, loadRoutines } = await import('../lib/workouts.js');
const { leaderRouter } = await import('../routes/leader.js');
const { workoutsRouter } = await import('../routes/workouts.js');
const { startCoachTurn } = await import('../lib/coachTurn.js');

const ex = {};
for (const [name, group] of [
  ['Incline Barbell Bench Press', 'Chest'], ['Carter Extension', 'Triceps'], ['Face Pull', 'Shoulders'],
  ['Barbell Bench Press', 'Chest'], ['Rope Overhead Tricep Extension', 'Triceps'], ['Cable Bicep Curl', 'Biceps'],
]) ex[name] = await addCustomExercise(vault, name, group, 'weight_reps');
const lib = async () => (await loadExerciseLibrary(vault)).exercises;
const e = (name, sets = 3, low = 8, high = 12) => ({ exerciseId: ex[name].id, targetSets: sets, targetRepsLow: low, targetRepsHigh: high });
await createRoutine(vault, await lib(), 'Push', [e('Incline Barbell Bench Press', 3, 6, 10), e('Carter Extension'), e('Face Pull', 3, 12, 12)]);
await createRoutine(vault, await lib(), 'Upper Body', [e('Barbell Bench Press', 3, 6, 8), e('Rope Overhead Tricep Extension', 3, 6, 7), e('Cable Bicep Curl', 3, 6, 8)]);

test.after(() => { _dropAllWarm(); _setConsultDepsForTest(null); _clearHisWordsForTest(); });

const waitFor = async (pred, ms = 30_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await pred();
    if (r) return r;
    await new Promise((r2) => setTimeout(r2, 25));
  }
  throw new Error('timed out waiting');
};
const settled = (jobId) => waitFor(() => { const j = getMessageJob(jobId); return j && j.status !== 'running' ? j : null; });
const names = async (routine) => {
  const { routines } = await loadRoutines(vault, await lib());
  return routines.find((r) => r.name === routine).exercises.map((x) => x.name);
};
const clearCards = async () => {
  for (const r of await listRecords()) if (r.status === 'pending' && r.decision?.route) await updateRecord(r.id, { status: 'withdrawn' });
};

// the consulted lanes exactly as consult.askCoach / consult.askNova run them:
// runConsults' options become `consulted` (consult.consultedOpts)
const consultedOf = (o) => ({ by: o.from, question: o.question || '', chain: o.chain || [], ledger: o.ledger || null });
const coachAsConsulted = async (q, o = {}) => {
  const done = await settled(startAskCoach(vault, { question: q, context: 'ctx', consulted: consultedOf(o) }));
  if (done.status !== 'ready') throw new Error(done.error);
  return { text: done.result.text, consult: done.result.consult, cards: done.result.cards };
};
const novaAsConsulted = async (q, o = {}) => {
  const done = await settled(startAskNova(vault, { question: q, context: 'ctx', consulted: consultedOf(o) }));
  if (done.status !== 'ready') throw new Error(done.error);
  return { text: done.result.text };
};

function serve(router) {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
}
const post = async (server, route, body) => {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
};

test('THE LEADER CHAT: he tells the Leader to move it, the Leader asks the Coach, and the move applies on his standing grant with its Undo', async () => {
  await clearCards();
  _setConsultDepsForTest({ coach: coachAsConsulted });
  const server = await serve(leaderRouter(vault));
  try {
    const his = 'LEADER_ASK_MOVE move my rope overhead tricep extension to push after the incline bench, I have no time on upper day';
    const out = await post(server, '/leader/chat', { question: his });
    assert.ok(out.jobId, out.error);
    assert.equal(heldHisWords(his), true, 'the Leader chat marked what he typed');
    const done = await settled(out.jobId);
    assert.equal(done.status, 'ready', done.error);
    assert.match(done.result.text, /^Asking the Coach\.\n\nSynthesis\./, 'code says who was asked; the Leader answers');
    const coach = done.result.consult[0];
    assert.equal(coach.agent, 'coach');
    assert.match(coach.answer, /^Moving it as you asked\./, 'his words reached the Coach verbatim, said to the Leader');
    assert.match(coach.answer, /Done: Rope Overhead Tricep Extension is on Push now, straight after Incline Barbell Bench Press/);
    const card = await getRecord(coach.cards[0].recordId);
    assert.equal(card.status, 'filed', 'applied on his word, not waiting');
    assert.equal(card.instructed, true);
    assert.deepEqual(await names('Push'), ['Incline Barbell Bench Press', 'Rope Overhead Tricep Extension', 'Carter Extension', 'Face Pull']);
    await undoRecord(vault, card.id);
    assert.ok((await names('Upper Body')).includes('Rope Overhead Tricep Extension'), 'the Undo is real');
  } finally {
    server.close();
    _setConsultDepsForTest(null);
  }
});

test('the same move from a Leader turn code started (never his words) waits for his yes', async () => {
  await clearCards();
  const { startAskLeader } = await import('../lib/claudeCode.js');
  _setConsultDepsForTest({ coach: coachAsConsulted });
  try {
    // a code-written turn: nobody marked it
    const q = 'LEADER_ASK_MOVE move my rope overhead tricep extension to push (a plan step)';
    const done = await settled(startAskLeader(vault, { question: q, context: 'ctx', sessionId: null }));
    assert.equal(done.status, 'ready', done.error);
    const coach = done.result.consult[0];
    assert.match(coach.answer, /^Moving it\./, 'the Coach was never told these were his words');
    const card = await getRecord(coach.cards[0].recordId);
    assert.equal(card.status, 'pending', 'an agent asking is not him instructing');
    assert.equal(card.instructed, false);
    assert.deepEqual(await names('Push'), ['Incline Barbell Bench Press', 'Carter Extension', 'Face Pull']);
  } finally {
    _setConsultDepsForTest(null);
  }
});

test('THE COACH TAB: what he types to the Coach is marked, and an agent the Coach consults is told they are his own words', async () => {
  _setConsultDepsForTest({ nova: novaAsConsulted });
  const server = await serve(workoutsRouter(vault));
  try {
    const his = 'COACHTAB_ASK what does my week look like for a shoulder rehab block';
    const out = await post(server, '/workouts/coach', { question: his });
    assert.ok(out.jobId, out.error);
    assert.equal(heldHisWords(his), true, 'the Coach tab marked what he typed');
    const done = await settled(out.jobId);
    assert.equal(done.status, 'ready', done.error);
    const nova = done.result.consult[0];
    assert.equal(nova.agent, 'nova');
    assert.equal(nova.answer, 'HIS_WORDS_SEEN', 'Nova was told what he said to the Coach, verbatim');
    // and a Coach turn code started is not his words
    const coded = 'COACHTAB_ASK what does my week look like for a shoulder rehab block (a plan step)';
    const plan = await settled(await startCoachTurn(vault, { question: coded, sessionId: null }));
    assert.equal(plan.status, 'ready', plan.error);
    assert.equal(plan.result.consult[0].answer, 'NO_HIS_WORDS');
    assert.equal(heldHisWords(coded), false);
  } finally {
    server.close();
    _setConsultDepsForTest(null);
  }
});

test('the brief names whom he said it to, for every asking agent; an unmarked question is framed as a question', () => {
  const his = 'COACHTAB_ASK what does my week look like for a shoulder rehab block';
  assert.match(consultedBrief('coach', his), /because of what Hayden said to the Coach, in his own words: "COACHTAB_ASK/);
  assert.match(consultedBrief('nova', his), /because of what Hayden said to him, in his own words/);
  assert.match(consultedBrief('coach', 'an unmarked question'), /to help answer Hayden's question: "an unmarked question"/);
  // only the Coach may file, and only it is told it may mark "instructed"
  assert.doesNotMatch(consultedBrief('leader', his), /instructed/);
  assert.match(consultedBrief('leader', his, { canPropose: true }), /HIS OWN, said to the Leader/);
});
