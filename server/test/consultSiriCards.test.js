// THE CONSULT RAIL, 30 SEP 2026 — his three calls that morning:
//   1. "Let nova always ask the researcher … a response saying that the
//      researcher is being consulted so check back later, so I avoid Siri's
//      response saying it took too long but I still know it's working."
//      → a hands-free turn that asks the Researcher answers at once with a
//      code-written interim; the synthesis lands in his thread afterwards.
//   2. "Coach can file cards directly but I want duplicates to be avoided."
//      → a consulted Coach files through its checked pipeline, one card per
//      change, never a twin (waiting, or filed earlier in the same turn), and
//      Nova's own PROPOSE never duplicates it.
//   3. The source is named ("Stronger Slowly, chapter 4"), never "your book".
//      → the Librarian's citations carry titles; every synthesis says so.
//
// CLAUDE_BIN is a stub and NOVA_DATA_DIR a temp dir, both set BEFORE import.
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-siricards-stub-'));
const stubBin = path.join(stubDir, 'claude');
const P = (o) => `PROPOSE ${JSON.stringify(o)}`;
const MOVE = { action: 'move', exercise: 'Rope Overhead Tricep Extension', from: 'Upper Body', to: 'Push', after: 'Incline Barbell Bench Press', reason: 'your only overhead triceps work belongs on your pressing day' };
const NOVA_MOVE = { kind: 'routine-edit', ...MOVE };
const TARGETS_A = { action: 'targets', routine: 'Push', exercise: 'Carter Extension', targetSets: 4, targetRepsLow: 8, targetRepsHigh: 10, reason: 'one more set' };
const TARGETS_B = { action: 'targets', routine: 'Push', exercise: 'Carter Extension', targetSets: 3, targetRepsLow: 10, targetRepsHigh: 12, reason: 'more reps' };
writeFileSync(stubBin, `#!/usr/bin/env node
// Conversational (stream-json) when --input-format is given, one-shot JSON
// otherwise. The reply is chosen from the words in the message.
const argv = process.argv.slice(2);
const reply = (text) => {
  if (/The agents you consulted have answered/.test(text)) {
    if (/NOVA_DUP/.test(text)) return ${JSON.stringify(`The Coach has the move up for you.\n${P(NOVA_MOVE)}`)};
    const names = (text.match(/FROM ([A-Z ]+) \\(/g) || []).map((m) => m.slice(5, -2)).join(' + ');
    const titles = /Its sources, by title: \\[1\\] "Kreider 2017/.test(text) ? ' Titles seen.' : '';
    return 'Synthesis from ' + names + '.' + titles;
  }
  if (/CONSULT_RESEARCH/.test(text)) return 'CONSULT {"asks":[{"agent":"researcher","question":"Is creatine worth taking?"}]}';
  if (/CONSULT_COACH_SLOW/.test(text)) return 'CONSULT {"asks":[{"agent":"coach","question":"Deload this week?"}]}';
  // the Coach's prompt carries Nova's question too, so its own word comes first
  if (/COACH_MOVE/.test(text)) return ${JSON.stringify(`Move the rope extension to Push.\n${P({ ...MOVE, instructed: true })}`)};
  if (/NOVA_DUP/.test(text)) return 'CONSULT {"asks":[{"agent":"coach","question":"COACH_MOVE should the rope extension move?"}]}';
  if (/COACH_TARGETS_A/.test(text)) return ${JSON.stringify(`Add a set.\n${P(TARGETS_A)}`)};
  if (/COACH_TARGETS_B/.test(text)) return ${JSON.stringify(`More reps.\n${P(TARGETS_B)}`)};
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
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-siricards-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

const vault = mkdtempSync(path.join(tmpdir(), 'nova-siricards-vault-'));
mkdirSync(path.join(vault, 'Wiki', 'Health'), { recursive: true });
mkdirSync(path.join(vault, 'Wiki', 'Sources'), { recursive: true });
writeFileSync(path.join(vault, 'Wiki', 'Sources', 'stronger-slowly.md'), '---\ntype: book\n---\n# Stronger Slowly\n\n## Chapter 4\nTempo before load.\n');
writeFileSync(path.join(vault, 'Wiki', 'Sources', 'Atomic Habits.md'), '---\ntitle: Atomic Habits\ntype: book\n---\nIdentity first.\n');

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { _setConsultDepsForTest, consultReplyText, consultedBrief, SOURCE_RULE, researchSources, unwrapDocuments } = await import('../lib/consult.js');
const { startAskNova, startAskCoach, getMessageJob, _dropAllWarm } = await import('../lib/claudeCode.js');
const { awaitHandsFree, interimLine, followThrough } = await import('../lib/handsFree.js');
const { readTurns } = await import('../lib/conversationLog.js');
const { listRecords, getRecord } = await import('../lib/inboxStore.js');
const { changeSignatures, waitingDuplicate } = await import('../lib/coachProposals.js');
const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
const { createRoutine } = await import('../lib/workouts.js');
const { checkLibraryCitations, formatCatalogue } = await import('../lib/librarianAsk.js');
const { libraryCatalogue } = await import('../lib/library.js');
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

test.after(() => { _dropAllWarm(); _setConsultDepsForTest(null); });

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

// the Coach's own consulted lane, exactly as consult.js's askCoach waits on it
const askCoachHere = async (q, o = {}) => {
  const done = await settled(startAskCoach(vault, { question: q, context: 'ctx', consulted: { by: o.from || 'nova', question: o.question || '', chain: o.chain || ['nova'], ledger: o.ledger || null } }));
  if (done.status !== 'ready') throw new Error(done.error);
  return { text: done.result.text, consult: done.result.consult, cards: done.result.cards };
};

/* -------------------- 1. Siri, the Researcher, the interim -------------------- */

test('the interim line is written by code from the roster, and never says "took too long"', () => {
  assert.equal(interimLine([{ agent: 'researcher' }]), "I've asked the Researcher; it takes a few minutes. The answer will be in your Nova thread and your Inbox.");
  assert.equal(interimLine([{ agent: 'coach' }, { agent: 'researcher' }]), "I've asked the Coach and the Researcher; the Researcher takes a few minutes. The answer will be in your Nova thread and your Inbox.");
  assert.equal(interimLine([{ agent: 'coach' }]), "I've asked the Coach; it is still working. The answer will be in your Nova thread.");
  for (const r of [[{ agent: 'researcher' }], [{ agent: 'coach' }]]) assert.doesNotMatch(interimLine(r), /too long/);
});

test('the hands-free prompt no longer limits asking the Researcher', async () => {
  const { buildAskPrompt } = await import('../lib/claudeCode.js');
  const p = buildAskPrompt({ question: 'q', direct: true });
  assert.doesNotMatch(p, /ask it only when he asked for research/);
  assert.match(p, /the Researcher included/);
});

test('Siri: a turn that consults the Researcher answers at once with the interim, and the synthesis lands in his thread afterwards', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let asked = null;
  _setConsultDepsForTest({
    researcher: async (q, o) => {
      asked = { q, o };
      await gate;
      const body = 'Creatine works for strength [1].\n\n## Sources\n[1] Kreider 2017, "ISSN position stand: creatine" https://example.org/kreider';
      return { text: body, recordId: 'rec-research-1', sources: researchSources(body) };
    },
  });
  const app = express();
  app.use(express.json());
  app.use('/api', voiceRouter(vault));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  // a spoken conversation already open, so the ask resumes it: no context
  // assembly (which would reach for his calendar), only the question
  const { takeSpokenSession } = await import('../lib/spokenSession.js');
  takeSpokenSession();
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/ask/sync`;
    const t0 = Date.now();
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'CONSULT_RESEARCH is creatine worth it' }) });
    const body = JSON.parse((await res.text()).trim());
    const took = Date.now() - t0;
    assert.equal(body.text, "I've asked the Researcher; it takes a few minutes. The answer will be in your Nova thread and your Inbox.");
    assert.equal(body.error, undefined);
    assert.equal(body.pending, true);
    assert.ok(took < 20_000, `answered inside the line (${took}ms)`);
    assert.equal(asked.q, 'Is creatine worth taking?');
    assert.equal(asked.o.from, 'nova');
    // what he said and the interim are in the record now; the answer is not yet
    // (the record is written fire-and-forget, so wait for the rows to land)
    let rows = await waitFor(async () => {
      const got = await readTurns({ limit: 50 });
      return got.some((r) => r.who === 'nova' && r.text === body.text) ? got : null;
    });
    assert.ok(rows.some((r) => r.who === 'you' && /CONSULT_RESEARCH/.test(r.text)));
    assert.ok(!rows.some((r) => /Synthesis from/.test(r.text)), 'the synthesis has not been written yet');
    release();
    const late = await waitFor(async () => (await readTurns({ limit: 50 })).find((r) => r.who === 'nova' && /Synthesis from THE RESEARCHER/.test(r.text)));
    assert.equal(late.by, 'nova');
    assert.equal(late.via, 'siri');
    assert.equal(late.from[0].agent, 'researcher');
    assert.equal(late.from[0].ok, true);
    assert.match(late.text, /^Asking the Researcher\./, 'the code-written hand-over opens it');
    assert.match(late.text, /Titles seen\./, 'the sources reached the synthesis by title');
    rows = await readTurns({ limit: 50 });
    assert.ok(!rows.some((r) => /took too long/.test(r.text)), 'nothing ever said it took too long');
  } finally {
    release(); // a failed assertion must not leave the turn waiting forever
    server.close();
    _setConsultDepsForTest(null);
  }
});

test('at the limit, a turn still waiting on a consult gets the interim, never "took too long", and is followed to its end', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  _setConsultDepsForTest({ coach: async () => { await gate; return { text: 'Deload: yes.' }; } });
  const jobId = startAskNova(stubDir, { question: 'CONSULT_COACH_SLOW should I deload', context: 'ctx', direct: true });
  const out = await awaitHandsFree(jobId, { getJob: getMessageJob, limitMs: 400, pollMs: 20 });
  assert.equal(out.kind, 'interim');
  assert.equal(out.text, "I've asked the Coach; it is still working. The answer will be in your Nova thread.");
  let landed = null;
  const following = followThrough(jobId, { getJob: getMessageJob, pollMs: 20, onReady: (job) => { landed = job.result.text; } });
  release();
  await following;
  assert.match(landed, /^Asking the Coach\.\n\nSynthesis from THE COACH\.$/);
  _setConsultDepsForTest(null);
});

/* ------------------ 2. a consulted Coach files, never twice ------------------ */

test('the duplicate rule: same lift + same kind of change, or the same lift landing on the same routine', () => {
  const push = { routineId: 'push', routineName: 'Push' };
  const a = { action: 'targets', ...push, removeExerciseId: 'carter', removeName: 'Carter Extension', targetSets: 4, targetRepsLow: 8, targetRepsHigh: 10 };
  const b = { ...a, targetSets: 3, targetRepsLow: 10, targetRepsHigh: 12 };
  const pending = (route, payload) => ({ id: 'w1', status: 'pending', decision: { route, payload, title: 'Coach: retarget Carter Extension in Push to 4 × 8–10' } });
  assert.equal(waitingDuplicate('routine-edit', b, [pending('routine-edit', a)])?.id, 'w1', 'a second retarget of the same lift');
  assert.equal(waitingDuplicate('routine-edit', b, [{ ...pending('routine-edit', a), status: 'withdrawn' }]), null, 'a withdrawn card is not waiting');
  assert.equal(waitingDuplicate('routine-edit', b, [{ ...pending('routine-edit', a), status: 'rejected' }]), null, 'his no is not a waiting card');
  const other = { ...a, removeExerciseId: 'face', removeName: 'Face Pull' };
  assert.equal(waitingDuplicate('routine-edit', other, [pending('routine-edit', a)]), null, 'a different lift is a different change');
  // an add of X onto Push and a move of X onto Push land the same lift in the same place
  const add = { action: 'add', routineId: 'push', addExerciseId: 'rope', addName: 'Rope' };
  const move = { action: 'move', routineId: 'push', fromRoutineId: 'upper', removeExerciseId: 'rope', removeName: 'Rope' };
  assert.ok(changeSignatures('routine-edit', add).some((s) => changeSignatures('routine-edit', move).includes(s)));
  assert.equal(waitingDuplicate('schedule-edit', { action: 'schedule', day: 'monday', routineId: 'pull' }, [pending('schedule-edit', { action: 'schedule', day: 'monday', routineId: 'push' })])?.id, 'w1', 'one card per weekday');
});

test('a consulted Coach\'s PROPOSE files exactly one card, for HIS yes, and says so under its answer', async () => {
  const before = (await pendingCoachCards()).length;
  const out = await askCoachHere('COACH_MOVE should the rope extension move?', { from: 'nova', question: 'tidy my upper body day' });
  const cards = await pendingCoachCards();
  assert.equal(cards.length, before + 1, 'exactly one card');
  assert.equal(out.cards.length, 1);
  assert.equal(out.cards[0].state, 'filed');
  const card = await getRecord(out.cards[0].recordId);
  assert.equal(card.status, 'pending', 'even an "instructed" line waits for his yes when another agent asked');
  assert.equal(card.instructed, false);
  assert.equal(card.text, 'tidy my upper body day', 'the card carries his question, not the agent\'s');
  assert.match(out.text, /^Move the rope extension to Push\./);
  assert.match(out.text, /On a card for your yes on the Coach tab: move Rope Overhead Tricep Extension from Upper Body to Push/);
  assert.doesNotMatch(out.text, /PROPOSE/);
});

test('the same PROPOSE again (already pending) files none and is reported as already waiting on his call', async () => {
  const before = (await pendingCoachCards()).length;
  const out = await askCoachHere('COACH_MOVE once more?', { from: 'leader', question: 'my week', chain: ['leader'] });
  assert.equal((await pendingCoachCards()).length, before, 'no twin');
  assert.equal(out.cards[0].state, 'waiting');
  assert.match(out.text, /Already waiting on your call, so not filed again: move Rope Overhead Tricep Extension/);
});

// 1 Oct 2026, his call "Yes replace the waiting card": different numbers on
// the same lift replace the card rather than being reported as waiting
// (consultInstructed.test.js carries the rule); still never two cards.
test('two consulted Coaches in the same turn, same lift and kind of change, different numbers: one card, the other replaced', async () => {
  const before = (await pendingCoachCards()).length;
  const [a, b] = await Promise.all([
    askCoachHere('COACH_TARGETS_A carter?', { question: 'push day' }),
    askCoachHere('COACH_TARGETS_B carter?', { question: 'push day' }),
  ]);
  assert.equal((await pendingCoachCards()).length, before + 1, 'one card between them');
  assert.deepEqual([a.cards[0].state, b.cards[0].state], ['filed', 'filed']);
  assert.equal([a, b].filter((x) => /Replaced the card that was waiting on your call/.test(x.text)).length, 1);
});

test('Nova consults the Coach, the Coach files the card, and Nova\'s own PROPOSE of it files nothing', async () => {
  // a fresh program change so this test owns it: withdraw what the move tests left
  const { updateRecord } = await import('../lib/inboxStore.js');
  for (const r of await pendingCoachCards()) await updateRecord(r.id, { status: 'withdrawn' });
  let roster = null;
  _setConsultDepsForTest({ coach: askCoachHere });
  const done = await settled(startAskNova(vault, { question: 'NOVA_DUP should my rope extension move', context: 'ctx' }));
  _setConsultDepsForTest(null);
  assert.equal(done.status, 'ready', done.error);
  roster = done.result.consult;
  assert.equal(roster[0].agent, 'coach');
  assert.equal(roster[0].cards.length, 1);
  assert.equal(roster[0].cards[0].state, 'filed');
  const cards = await pendingCoachCards();
  assert.equal(cards.length, 1, 'one card for the one change');
  assert.equal(done.result.proposal, null, 'Nova filed no twin');
  assert.match(done.result.text, /already waiting on your call on the Coach tab \(move Rope Overhead Tricep Extension/);
});

test('the consulted Coach is told it may file, for his yes only; others still file nothing', () => {
  assert.match(consultedBrief('nova', 'q', { canPropose: true }), /You may file program changes/);
  assert.match(consultedBrief('nova', 'q', { canPropose: true }), /never "instructed"/);
  assert.match(consultedBrief('nova', 'q'), /no PROPOSE/);
  assert.doesNotMatch(consultedBrief('nova', 'q', { canPropose: true }), /\n\n/, 'one paragraph');
  // a PROPOSE inside a document is never a card
  assert.equal(unwrapDocuments('Plan:\n<<<ARTIFACT {"title":"x"}\nPROPOSE {"a":1}\nbody\nARTIFACT>>>\nPROPOSE {"b":2}'), 'Plan:\n\nbody\n\nPROPOSE {"b":2}');
});

/* ------------------------ 3. the source, by its title ------------------------ */

test('every synthesis contract names the source by its title, and Nova\'s says not to re-propose a Coach card', () => {
  const r = [{ ok: true, label: 'the Librarian', question: 'q', answer: 'a', citations: [{ path: 'Wiki/Sources/stronger-slowly.md', title: 'Stronger Slowly', exists: true }] }];
  for (const opts of [{ from: 'nova' }, { from: 'leader' }, { from: 'coach' }, { from: 'coach', answeringTo: 'nova' }]) {
    const t = consultReplyText(r, 'q', opts);
    assert.ok(t.includes(SOURCE_RULE), JSON.stringify(opts));
    assert.match(t, /never "your book"/);
    assert.match(t, /Its sources, by title: "Stronger Slowly" \(Wiki\/Sources\/stronger-slowly\.md\)/);
  }
  assert.match(consultReplyText(r, 'q', { from: 'nova' }), /If the Coach filed a card.*do not PROPOSE the same change yourself/);
  assert.match(consultedBrief('coach', 'q'), /Name every source by its title/);
});

test('the Librarian\'s catalogue and checked citations carry each source\'s title', async () => {
  const cat = await libraryCatalogue(vault);
  const titles = cat.sources.map((s) => s.title).sort();
  assert.deepEqual(titles, ['Atomic Habits', 'Stronger Slowly'], 'frontmatter title, else the first heading');
  assert.match(formatCatalogue(cat), /- "Stronger Slowly" — Wiki\/Sources\/stronger-slowly\.md \(book\)/);
  const cites = checkLibraryCitations(vault, 'Tempo first (Wiki/Sources/stronger-slowly.md). Identity (Wiki/Sources/Atomic Habits.md). Ghost (Wiki/Sources/Gone.md).');
  assert.deepEqual(cites, [
    { path: 'Wiki/Sources/stronger-slowly.md', title: 'Stronger Slowly', exists: true },
    { path: 'Wiki/Sources/Atomic Habits.md', title: 'Atomic Habits', exists: true },
    { path: 'Wiki/Sources/Gone.md', title: 'Gone', exists: false },
  ]);
  const { buildLibrarianAskPrompt } = await import('../lib/librarianAsk.js');
  assert.match(buildLibrarianAskPrompt({ question: 'q', catalogue: '' }), /NAME THE SOURCE BY ITS TITLE/);
});

test('the Researcher\'s sources travel by title', () => {
  assert.deepEqual(researchSources('Claim [1] [2].\n\n## Sources\n1. [Schoenfeld 2017, Dose-response of weekly volume](https://x.org/a)\n[2] Pelland 2022 — "Effects of RIR" https://y.org/b'), [
    { n: 1, title: 'Schoenfeld 2017, Dose-response of weekly volume', url: 'https://x.org/a' },
    { n: 2, title: 'Pelland 2022 — "Effects of RIR"', url: 'https://y.org/b' },
  ]);
  assert.deepEqual(researchSources('no list here'), []);
});
