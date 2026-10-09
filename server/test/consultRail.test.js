// THE CONSULT RAIL (29 Sep 2026): every agent can ask every other agent — his
// "nothing should be walled off", with Nova as the CEO who directs. What must
// hold: an agent is told about everyone but itself (and whoever is waiting on
// it); Nova and the Leader run the same loop the Coach does, asks in
// parallel, answers back to the same session, a synthesis at the end; the
// line saying who was asked is written by code; the loop guard ends a turn
// that keeps asking; the Librarian answers from his library with checked
// citations and writes nothing; the record says who answered and whom they
// asked.
//
// CLAUDE_BIN is a stub and NOVA_DATA_DIR a temp dir, both set BEFORE import.
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-consult-stub-'));
const stubBin = path.join(stubDir, 'claude');
writeFileSync(stubBin, `#!/usr/bin/env node
// Conversational (stream-json) when --input-format is given, one-shot JSON
// otherwise. The reply is chosen from the words in the message.
const argv = process.argv.slice(2);
const reply = (text) => {
  if (/The agents you consulted have answered/.test(text)) {
    if (/CONSULT_LOOP/.test(text)) return 'CONSULT {"asks":[{"agent":"coach","question":"Same thing again?"}]}';
    const names = (text.match(/FROM ([A-Z ]+) \\(/g) || []).map((m) => m.slice(5, -2)).join(' + ');
    return 'Synthesis from ' + names + '.';
  }
  if (/You have consulted as many times/.test(text)) return 'CONSULT {"asks":[{"agent":"coach","question":"Same thing again?"}]}';
  if (/CONSULT_LOOP/.test(text)) return 'CONSULT {"asks":[{"agent":"coach","question":"Same thing again?"},{"agent":"nova","question":"myself?"}]}';
  if (/CONSULT_NOVA/.test(text)) return 'CONSULT {"asks":[{"agent":"coach","question":"Should he deload this week?"},{"agent":"librarian","question":"What does Atomic Habits say about identity?"}]}';
  if (/CONSULT_LEADER/.test(text)) return 'CONSULT {"asks":[{"agent":"researcher","question":"What does the evidence say about one-to-ones?"}]}';
  if (/LIBRARY_Q/.test(text)) return 'Identity comes first (Wiki/Sources/Atomic Habits.md). A ghost claim (Wiki/Sources/Ghost Book.md).\\nRead: Wiki/Sources/Atomic Habits.md';
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
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-consult-data-'));

// a tiny vault with one real source
const vault = mkdtempSync(path.join(tmpdir(), 'nova-consult-vault-'));
mkdirSync(path.join(vault, 'Wiki', 'Sources'), { recursive: true });
mkdirSync(path.join(vault, 'Wiki', 'Concepts'), { recursive: true });
writeFileSync(path.join(vault, 'Wiki', 'Sources', 'Atomic Habits.md'), '---\ntitle: Atomic Habits\nauthor: James Clear\ntype: book\nprovenance: researched\n---\nIdentity-based habits come first. [[Identity]]\n');
writeFileSync(path.join(vault, 'Wiki', 'Concepts', 'Identity.md'), '# Identity\n');

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  AGENTS, consultableBy, consultCapability, parseConsult, handoverLine, runConsults, trimForRecord,
  MAX_CONSULT_ROUNDS, _setConsultDepsForTest,
} = await import('../lib/consult.js');
const { startAskNova, startAskLeader, startAskCoach, getMessageJob, _dropAllWarm } = await import('../lib/claudeCode.js');
const { normaliseTurn, recentConversationBlock, appendTurns } = await import('../lib/conversationLog.js');
const { pendingTurns } = await import('../../src/conversationSync.js');
const { runLibrarianAsk, checkLibraryCitations } = await import('../lib/librarianAsk.js');

test.after(() => { _dropAllWarm(); _setConsultDepsForTest(null); });

const waitFor = async (pred, ms = 20_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = pred();
    if (r) return r;
    await new Promise((r2) => setTimeout(r2, 20));
  }
  throw new Error('timed out waiting');
};
const settled = (jobId) => waitFor(() => { const j = getMessageJob(jobId); return j.status !== 'running' ? j : null; });

test('every agent may ask everyone but itself, and never whoever is waiting on it', () => {
  const all = Object.keys(AGENTS);
  for (const id of ['nova', 'coach', 'leader', 'researcher', 'librarian', 'calendar', 'cfo']) assert.ok(all.includes(id), id);
  for (const from of all) {
    assert.deepEqual(consultableBy(from), all.filter((id) => id !== from), from);
    const cap = consultCapability(from);
    assert.ok(!cap.includes(`"${from}" (`), `${from} is not offered itself`);
    for (const id of all.filter((x) => x !== from)) assert.ok(cap.includes(`"${id}" (`), `${from} can ask ${id}`);
  }
  // the Coach, asked by Nova, cannot ask Nova back (he is waiting on it)
  assert.deepEqual(consultableBy('coach', { chain: ['nova'] }).sort(), ['calendar', 'cfo', 'leader', 'librarian', 'researcher']);
  assert.match(consultCapability('coach', { chain: ['nova'] }), /Nova is waiting on your answer/);
  assert.equal(parseConsult('CONSULT {"asks":[{"agent":"nova","question":"q"}]}', { from: 'coach', chain: ['nova'] }), null);
  assert.equal(parseConsult('CONSULT {"asks":[{"agent":"coach","question":"q"}]}', { from: 'coach' }), null, 'never itself');
  // the contract: code names who was asked, so the model is told not to
  assert.match(consultCapability('nova'), /code tells him who you asked/);
});

test('the hand-over line is written by code from the asks', () => {
  assert.equal(handoverLine([{ agent: 'coach' }]), 'Asking the Coach.');
  assert.equal(handoverLine([{ agent: 'coach' }, { agent: 'librarian' }]), 'Asking the Coach and the Librarian.');
  assert.equal(handoverLine([{ agent: 'coach' }, { agent: 'librarian' }, { agent: 'researcher' }]), 'Asking the Coach, the Librarian and the Researcher.');
  assert.equal(handoverLine([{ agent: 'calendar' }]), 'Checking your calendar.');
  assert.equal(handoverLine([{ agent: 'coach' }, { agent: 'calendar' }]), 'Asking the Coach, and checking your calendar.');
  assert.equal(handoverLine([]), '');
});

test('a repeat is answered from the turn ledger and never re-run; the chain passes down', async () => {
  const ledger = new Map();
  let calls = 0;
  let seenChain = null;
  const deps = { coach: async (q, o) => { calls++; seenChain = o.chain; return { text: `answer to ${q}` }; } };
  const asks = [{ agent: 'coach', question: 'Deload?', label: 'the Coach' }];
  await runConsults('/v', asks, { from: 'nova', deps, ledger });
  const again = await runConsults('/v', [{ agent: 'coach', question: '  deload? ', label: 'the Coach' }], { from: 'nova', deps, ledger });
  assert.equal(calls, 1, 'the same agent is not asked the same question twice in one turn');
  assert.equal(again[0].answer, 'answer to Deload?');
  assert.deepEqual(seenChain, ['nova']);
});

test('Nova CONSULTs the Coach and the Librarian in parallel, says so first, then synthesises', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const started = [];
  _setConsultDepsForTest({
    coach: async (q, o) => { started.push(['coach', o.from]); await gate; return { text: 'Deload: yes, cut volume by a third.' }; },
    librarian: async (q, o) => { started.push(['librarian', o.from]); await gate; return { text: 'Identity first (Wiki/Sources/Atomic Habits.md).' }; },
  });
  const jobId = startAskNova(stubDir, { question: 'CONSULT_NOVA should I deload', context: 'ctx' });
  // before any answer exists, the screen already has the code-written line and the roster
  const running = await waitFor(() => { const j = getMessageJob(jobId); return started.length === 2 && j.consult?.length === 2 ? j : null; });
  assert.equal(running.status, 'running');
  assert.equal(running.partial, 'Asking the Coach and the Librarian.');
  assert.deepEqual(started.map((s) => s[0]).sort(), ['coach', 'librarian'], 'both asked before either answered');
  assert.ok(started.every((s) => s[1] === 'nova'));
  for (const a of running.consult) {
    assert.ok(a.askedAt && a.settledAt === null && a.ok === null, 'working, not settled');
  }
  release();
  const done = await settled(jobId);
  assert.equal(done.status, 'ready', done.error);
  assert.match(done.result.text, /^Asking the Coach and the Librarian\.\n\nSynthesis from THE COACH \+ THE LIBRARIAN\.$/);
  const roster = done.result.consult;
  assert.deepEqual(roster.map((a) => a.agent).sort(), ['coach', 'librarian']);
  for (const a of roster) {
    assert.equal(a.ok, true);
    assert.ok(Number.isFinite(a.ms) && a.settledAt && a.answer);
  }
  _setConsultDepsForTest(null);
});

test('the loop guard: never itself, twice at most, one "answer now", then the answer it has', async () => {
  let calls = 0;
  _setConsultDepsForTest({ coach: async () => { calls++; return { text: 'Same answer.' }; } });
  const done = await settled(startAskNova(stubDir, { question: 'CONSULT_LOOP', context: 'ctx' }));
  assert.equal(done.status, 'ready', done.error);
  assert.equal(calls, 1, 'the repeated ask was answered from the ledger');
  assert.ok(done.result.consult.every((a) => a.agent === 'coach'), 'Nova was never asked by Nova');
  assert.equal(new Set(done.result.consult.map((a) => a.round)).size, MAX_CONSULT_ROUNDS);
  assert.match(done.result.text, /I've asked twice already/);
  assert.match(done.result.text, /^Asking the Coach\./);
  _setConsultDepsForTest(null);
});

test('the Leader consults the Researcher and answers from its brief', async () => {
  let asked = null;
  _setConsultDepsForTest({ researcher: async (q, o) => { asked = { q, o }; return { text: 'Weekly one-to-ones help [1].', recordId: 'rec9' }; } });
  const done = await settled(startAskLeader(stubDir, { question: 'CONSULT_LEADER how often should I meet my team', context: 'ctx' }));
  assert.equal(done.status, 'ready', done.error);
  assert.equal(asked.q, 'What does the evidence say about one-to-ones?');
  assert.equal(asked.o.from, 'leader');
  assert.match(asked.o.context, /the Leader is asking this/i);
  assert.match(done.result.text, /^Asking the Researcher\.\n\nSynthesis from THE RESEARCHER\.$/);
  assert.equal(done.result.consult[0].recordId, 'rec9');
  _setConsultDepsForTest(null);
});

test('a consulted agent answers the one who asked; an answer with no PROPOSE files nothing', async () => {
  const done = await settled(startAskCoach(stubDir, { question: 'Should he deload?', context: 'ctx', consulted: { by: 'nova', question: 'should I deload', chain: ['nova'] } }));
  assert.equal(done.status, 'ready', done.error);
  assert.equal(done.result.text, 'A plain answer.');
  assert.equal(done.result.proposals, undefined, 'a consulted turn never takes the Coach chat\'s card path');
  assert.deepEqual(done.result.cards, [], 'no card from an answer that proposed nothing');
});

test('the Librarian answers from his library, citations checked by code, and writes nothing', async () => {
  const snapshot = () => {
    const out = [];
    const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else out.push(`${p}:${statSync(p).mtimeMs}`); } };
    walk(vault);
    return out.sort().join('\n');
  };
  const before = snapshot();
  const out = await runLibrarianAsk(vault, 'LIBRARY_Q what does my library say about identity', { from: 'nova', question: 'who am I becoming', chain: ['nova'] });
  assert.match(out.text, /Identity comes first \(Wiki\/Sources\/Atomic Habits\.md\)/);
  assert.deepEqual(out.citations, [
    { path: 'Wiki/Sources/Atomic Habits.md', title: 'Atomic Habits', exists: true },
    { path: 'Wiki/Sources/Ghost Book.md', title: 'Ghost Book', exists: false },
  ]);
  assert.match(out.text, /not in his vault.*Ghost Book\.md/s, 'a citation that points at nothing is named');
  assert.equal(snapshot(), before, 'the vault is byte-for-byte untouched');
  assert.deepEqual(checkLibraryCitations(vault, 'no paths here'), []);
});

test('the record says who answered and whom they asked; readers keep working', async () => {
  const roster = [{ agent: 'coach', label: 'the Coach', question: 'Deload?', ms: 1200, ok: true, answer: 'Yes.', askedAt: 'x', settledAt: 'y', state: 'done' }];
  const from = trimForRecord(roster);
  assert.deepEqual(from, [{ agent: 'coach', question: 'Deload?', ms: 1200, ok: true, answer: 'Yes.' }]);
  const now = new Date('2026-09-29T02:00:00Z');
  const row = normaliseTurn({ id: 'dev-abcdef-1', at: now.toISOString(), who: 'nova', text: 'Asking the Coach.\n\nDeload.', via: 'voice', from }, now);
  assert.equal(row.by, 'nova');
  assert.deepEqual(row.from, from);
  const plain = normaliseTurn({ who: 'nova', text: 'Hello.' }, now);
  assert.equal(plain.by, 'nova');
  assert.equal(plain.from, undefined, 'no consult, no from');
  assert.equal(normaliseTurn({ who: 'you', text: 'hi' }, now).by, undefined, 'his own line has no author field');
  assert.equal(normaliseTurn({ who: 'nova', text: 'x', by: 'DROP TABLE' }, now).by, 'nova');
  // a specialist's line in the voice chat goes up as nova-by-coach
  const up = pendingTurns([{ at: 1000, who: 'coach', text: 'Deload.', from }], {}, { dev: 'dev1' });
  assert.equal(up[0].who, 'nova');
  assert.equal(up[0].by, 'coach');
  assert.deepEqual(up[0].from, from);
  // Nova's recall reads it back with the author and whom they asked
  await appendTurns([{ id: 'dev-abcdef-2', at: now.toISOString(), who: 'nova', by: 'coach', text: 'Deload this week.', via: 'voice', from }], { now });
  const block = await recentConversationBlock({ now });
  assert.match(block, /the Coach \(through you\) \[consulted: the Coach\]: Deload this week\./);
});
