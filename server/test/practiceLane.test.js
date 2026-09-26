// Practice — the model half, with the model stubbed. The directive parsers,
// the debrief's validation and filing, the scene plumbing, finding a skill in
// a sentence, and Prepare's job end to end with a fake dossier. Nothing here
// spawns the CLI. Temp data dir + temp vault BEFORE imports.
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-practicelane-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { formatPracticePage, readPracticeState, updatePracticeState, parsePracticePage, readSkill, PRACTICE_DIR } = await import('../lib/practice.js');
const {
  parsePracticeNote, parsePracticeDebrief, validateDebrief, matchPracticeAsk, resolvePracticeAsk,
  finishPracticeTurn, startRehearsal, startPrepare, buildPartnerPrompt, buildDebriefInstruction,
  PRACTICE_TURN_REMINDER, RESEARCH_WORDS,
} = await import('../lib/practiceLane.js');
const { listRecords, getRecord } = await import('../lib/inboxStore.js');

const SKILL = {
  title: 'Questions of intent',
  summary: 'Answering a dig with a question.',
  status: 'active', created: '2026-09-20', updated: '2026-09-20',
  sources: ['[[Questions of Intent]]'],
  why: '"I want to practise chapter 8."',
  moves: [
    { name: 'Question of intent', summary: 's', line: '"Did you mean for that to sound rude?"', when: 'w', tell: 't', source: '[[Questions of Intent]]' },
    { name: 'Silence first', summary: 's', line: 'Say nothing for five seconds.', when: 'w', tell: 't', source: 'his words' },
  ],
  scenarios: [
    { name: 'The offhand dig in a team meeting', setting: 'A colleague comments on your work.', other: 'Mark, a peer.', pressure: 'he doubles down once.', moves: ['Question of intent', 'Silence first'] },
    { name: 'The email with a tone', setting: 'A sharp one-liner.', other: 'Priya, a client.', pressure: 'she escalates.', moves: ['Question of intent'] },
  ],
  gaps: [], sessions: [],
};
const MOVES = SKILL.moves.map((m) => m.name);

async function tempVault(skill = SKILL) {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-practicelane-vault-'));
  await mkdir(path.join(vault, PRACTICE_DIR), { recursive: true });
  await mkdir(path.join(vault, 'Wiki', 'Concepts'), { recursive: true });
  await writeFile(path.join(vault, 'Wiki', 'Concepts', 'Questions of Intent.md'), '# Questions of Intent\n', 'utf8');
  if (!skill) return { vault };
  const rel = `${PRACTICE_DIR}/${skill.title}.md`;
  await writeFile(path.join(vault, rel), formatPracticePage(skill), 'utf8');
  return { vault, rel, full: path.join(vault, rel) };
}

/* ---------------------------------- NOTE ---------------------------------- */

test('NOTE: a valid line is parsed off the reply and never spoken', () => {
  const reply = 'Right. I just meant the numbers were late.\nNOTE {"moves":[{"name":"question of intent","hit":true,"quote":"Did you mean that to sound rude?"}],"stage":"mid","sceneOver":false}';
  const { cleanText, note, parseError } = parsePracticeNote(reply, MOVES);
  assert.equal(cleanText, 'Right. I just meant the numbers were late.');
  assert.equal(parseError, undefined);
  assert.deepEqual(note.moves, [{ name: 'Question of intent', hit: true, quote: 'Did you mean that to sound rude?' }]);
  assert.equal(note.stage, 'mid');
  assert.equal(note.sceneOver, false);
});

test('NOTE: unknown move names are dropped by code', () => {
  const { note } = parsePracticeNote('Fine.\nNOTE {"moves":[{"name":"Mirroring","hit":true,"quote":"x"},{"name":"Silence first","hit":true,"quote":"..."}],"stage":"close","sceneOver":true}', MOVES);
  assert.deepEqual(note.moves.map((m) => m.name), ['Silence first']);
  assert.deepEqual(note.dropped, ['Mirroring']);
  assert.equal(note.sceneOver, true);
});

test('NOTE: prose is a parse error (the REFLECT contract); a missing line is fine; bad JSON is said', () => {
  const prose = parsePracticeNote('I hear you.\nNOTE he used silence well', MOVES);
  assert.equal(prose.note, null);
  assert.match(prose.parseError, /prose/);
  assert.equal(prose.cleanText, 'I hear you.');
  const none = parsePracticeNote('I hear you.', MOVES);
  assert.equal(none.note, null);
  assert.equal(none.parseError, undefined);
  assert.equal(none.cleanText, 'I hear you.');
  const bad = parsePracticeNote('Hm.\nNOTE {"moves": [ ,,, ]}', MOVES);
  assert.match(bad.parseError, /not valid JSON/);
});

test('NOTE: a pretty-printed JSON block over several lines still parses', () => {
  const { cleanText, note } = parsePracticeNote('Okay.\nNOTE {\n  "moves": [],\n  "stage": "open",\n  "sceneOver": false\n}', MOVES);
  assert.equal(cleanText, 'Okay.');
  assert.equal(note.stage, 'open');
});

/* --------------------------------- DEBRIEF --------------------------------- */

const DEBRIEF_REPLY = `That landed. When Mark doubled down you asked him what he meant, and he backed off. You rushed the silence, though; next time let it run.
DEBRIEF {"landed":[{"move":"Question of intent","quote":"Did you mean that to sound rude?"}],"missed":[{"move":"Silence first","instead":"Say nothing for five seconds.","source":"his words"},{"move":"Mirroring","instead":"x","source":"y"}],"best":"Did you mean that to sound rude?","work":"let the pause run to five seconds","next":"the email with a tone"}`;

test('DEBRIEF: valid, prose and missing forms', () => {
  const ok = parsePracticeDebrief(DEBRIEF_REPLY);
  assert.ok(ok.debrief);
  assert.ok(ok.cleanText.startsWith('That landed.'));
  assert.ok(!ok.cleanText.includes('DEBRIEF'));
  const prose = parsePracticeDebrief('Good work.\nDEBRIEF: you landed the question.');
  assert.equal(prose.debrief, null);
  assert.match(prose.parseError, /prose/);
  assert.match(parsePracticeDebrief('Good work.').parseError, /no DEBRIEF line/);
});

test('validateDebrief: unknown moves dropped and said, next checked against the page, work falls back', () => {
  const d = validateDebrief(parsePracticeDebrief(DEBRIEF_REPLY).debrief, SKILL, { existingPaths: new Set(['questions of intent']) });
  assert.deepEqual(d.landed, [{ move: 'Question of intent', quote: 'Did you mean that to sound rude?' }]);
  assert.deepEqual(d.missed.map((m) => m.move), ['Silence first']);
  assert.equal(d.missed[0].instead, 'Say nothing for five seconds.');
  assert.equal(d.missed[0].source, 'his words', 'a page line carries the page\'s source');
  assert.equal(d.next, 'The email with a tone');
  assert.ok(d.notes.some((n) => /"Mirroring" is not a move on the page/.test(n)));
  const bare = validateDebrief({ landed: [], missed: [{ move: 'Silence first', instead: 'An invented line from the book', source: '[[A Book Nova Never Read]]' }], next: 'somewhere else' }, SKILL, { existingPaths: new Set() });
  assert.equal(bare.work, 'keep rehearsing this scene');
  assert.equal(bare.next, null);
  assert.equal(bare.missed[0].instead, 'Say nothing for five seconds.', 'an unattributable line is replaced by the page\'s own');
  assert.ok(bare.notes.some((n) => /page's own line stands in/.test(n)));
});

/* ------------------------------ finding a skill ----------------------------- */

test('resolvePracticeAsk matches a title, a move and a scene, and returns null otherwise', async () => {
  const { vault } = await tempVault();
  assert.deepEqual(await resolvePracticeAsk(vault, 'I want to practise questions of intent'), { slug: 'questions-of-intent', title: 'Questions of intent', scenario: null });
  assert.deepEqual(await resolvePracticeAsk(vault, "let's rehearse silence first"), { slug: 'questions-of-intent', title: 'Questions of intent', scenario: null });
  assert.deepEqual(await resolvePracticeAsk(vault, 'can we role-play the email with a tone'), { slug: 'questions-of-intent', title: 'Questions of intent', scenario: 'The email with a tone' });
  assert.equal(await resolvePracticeAsk(vault, 'I want to practise negotiating a raise'), null);
});

test('the longest name wins', () => {
  const skills = [{ slug: 'a', title: 'Dig', moves: [], scenarios: [{ name: 'The dig in the meeting', moves: [] }] }];
  assert.deepEqual(matchPracticeAsk(skills, 'rehearse the dig in the meeting'), { slug: 'a', title: 'Dig', scenario: 'The dig in the meeting' });
});

/* --------------------------------- prompts --------------------------------- */

test('the partner prompt carries the lines verbatim, the pressure, the NOTE contract and the spoken register; the debrief names the moves', () => {
  const p = buildPartnerPrompt({ skill: { ...SKILL, slug: 'questions-of-intent' }, scenario: SKILL.scenarios[0] });
  assert.match(p, /Did you mean for that to sound rude\?/);
  assert.match(p, /he doubles down once/);
  assert.match(p, /NOTE \{"moves"/);
  assert.match(p, /HE HEARS THIS/);
  assert.match(p, /OPENING TURN/);
  assert.match(PRACTICE_TURN_REMINDER, /NOTE/);
  const d = buildDebriefInstruction(SKILL);
  assert.match(d, /DEBRIEF \{"landed"/);
  assert.match(d, /Question of intent, Silence first/);
  assert.match(d, /Never invent a quote from the book/);
  assert.ok(RESEARCH_WORDS.test('look it up and help me practise'));
  assert.ok(!RESEARCH_WORDS.test('help me practise the silence'));
});

/* ------------------------------- the scenes -------------------------------- */

function stubAsk() {
  const calls = [];
  const ask = (cwd, opts) => { calls.push({ cwd, ...opts }); return `job${calls.length}`; };
  return { ask, calls };
}

test('a scene starts on the picked scenario, never shows the pressure, and takes his turns', async () => {
  const { vault } = await tempVault();
  const { ask, calls } = stubAsk();
  const out = await startRehearsal(vault, { slug: 'questions-of-intent' }, { ask });
  assert.equal(out.jobId, 'job1');
  assert.equal(out.scene.scenario, 'The offhand dig in a team meeting', 'page order when nothing has been tried');
  assert.equal(out.scene.pressure, undefined);
  assert.deepEqual(out.scene.moves.map((m) => m.name), ['Question of intent', 'Silence first']);
  assert.equal(calls[0].resume, false);
  assert.equal(calls[0].sessionId, out.sessionId);
  assert.match(calls[0].text, /SCENE PARTNER/);

  await startRehearsal(vault, { sessionId: out.sessionId, text: 'Did you mean that to sound rude?' }, { ask });
  assert.equal(calls[1].resume, true);
  assert.ok(calls[1].text.startsWith(PRACTICE_TURN_REMINDER));
  assert.ok(calls[1].text.endsWith('Did you mean that to sound rude?'));
  const state = await readPracticeState();
  assert.deepEqual(state.scenes[out.sessionId].turns.map((t) => t.who), ['you']);

  await startRehearsal(vault, { sessionId: out.sessionId, end: true }, { ask });
  assert.equal(calls[2].mode, 'debrief');
  assert.match(calls[2].text, /DEBRIEF/);

  const named = await startRehearsal(vault, { slug: 'questions-of-intent', scenario: 'the email with a tone' }, { ask });
  assert.equal(named.scene.scenario, 'The email with a tone');
});

test('a scene is refused for a paused skill, a skill with no scenes, and an unknown session', async () => {
  const { ask } = stubAsk();
  const paused = await tempVault({ ...SKILL, status: 'paused' });
  await assert.rejects(startRehearsal(paused.vault, { slug: 'questions-of-intent' }, { ask }), /paused/);
  const empty = await tempVault({ ...SKILL, scenarios: [] });
  await assert.rejects(startRehearsal(empty.vault, { slug: 'questions-of-intent' }, { ask }), /no scenario/);
  await assert.rejects(startRehearsal(empty.vault, { sessionId: 'nope', text: 'hi' }, { ask }), /not one Nova knows/);
});

async function openScene(vault) {
  const { ask } = stubAsk();
  const out = await startRehearsal(vault, { slug: 'questions-of-intent' }, { ask });
  return out.sessionId;
}

test('a scene turn strips the NOTE, records his hits with his words, and keeps the partner\'s line', async () => {
  const { vault } = await tempVault();
  const sid = await openScene(vault);
  const res = await finishPracticeTurn('Well, no. I just meant it was late.\nNOTE {"moves":[{"name":"Question of intent","hit":true,"quote":"Did you mean that?"},{"name":"Made up","hit":true,"quote":"x"}],"stage":"mid","sceneOver":false}', { vaultPath: vault, sessionId: sid, mode: 'scene' });
  assert.equal(res.text, 'Well, no. I just meant it was late.');
  assert.deepEqual(res.notes.moves, [{ name: 'Question of intent', hit: true, quote: 'Did you mean that?' }]);
  assert.equal(res.sceneOver, false);
  const scene = (await readPracticeState()).scenes[sid];
  assert.equal(scene.turns.at(-1).who, 'partner');
  assert.equal(scene.notes[0].quote, 'Did you mean that?');
  // a missing NOTE is not an error mid-scene, and nothing is appended to his ears
  const quiet = await finishPracticeTurn('Fine.', { vaultPath: vault, sessionId: sid, mode: 'scene' });
  assert.equal(quiet.text, 'Fine.');
  assert.equal(quiet.noted, false);
});

test('the debrief files exactly one practice-session record with the undo shape, and the undo puts the page back', async () => {
  const { vault, full } = await tempVault();
  const before = await readFile(full, 'utf8');
  const sid = await openScene(vault);
  const count = (await listRecords()).filter((r) => r.kind === 'practice-session').length;
  const res = await finishPracticeTurn(DEBRIEF_REPLY, { vaultPath: vault, sessionId: sid, mode: 'debrief', now: new Date(2026, 8, 27, 9) });
  assert.ok(res.text.startsWith('That landed.'));
  assert.ok(!res.text.includes('DEBRIEF'));
  assert.equal(res.sceneOver, true);
  assert.equal(res.debrief.work, 'let the pause run to five seconds');
  const filed = (await listRecords()).filter((r) => r.kind === 'practice-session');
  assert.equal(filed.length, count + 1);
  const rec = await getRecord(res.record.id);
  assert.equal(rec.status, 'filed');
  assert.equal(rec.auto, true);
  assert.equal(rec.undoData.route, 'practice-session');
  assert.equal(rec.undoData.relPath, 'Wiki/Practice/Questions of intent.md');
  assert.equal(rec.undoData.slug, 'questions-of-intent');
  assert.equal(rec.undoData.sessionId, sid);
  assert.equal(rec.undoData.line, '- 2026-09-27 · The offhand dig in a team meeting · landed: Question of intent · missed: Silence first · work on: let the pause run to five seconds');
  assert.match(rec.text, /^Practice: Questions of intent · The offhand dig in a team meeting · landed Question of intent · missed Silence first · work on: let the pause run/);

  const page = parsePracticePage(await readFile(full, 'utf8'));
  assert.equal(page.sessions[0].date, '2026-09-27');
  assert.equal((await readPracticeState()).scenes[sid].ended, true);
  assert.deepEqual((await readPracticeState()).tallies['questions-of-intent']['Question of intent'], { tried: 1, landed: 1, lastAt: '2026-09-27' });
  await assert.rejects(startRehearsal(vault, { sessionId: sid, text: 'again' }, stubAsk()), /already been debriefed/);

  // the rails: undoFiling routes the record back to Practice
  const { undoFiling } = await import('../lib/inbox.js');
  assert.match(await undoFiling(vault, rec.undoData), /took that session back/);
  assert.equal(await readFile(full, 'utf8'), before);
});

test('a prose DEBRIEF files nothing and says so, and the scene stays open to try again', async () => {
  const { vault, full } = await tempVault();
  const before = await readFile(full, 'utf8');
  const sid = await openScene(vault);
  const count = (await listRecords()).filter((r) => r.kind === 'practice-session').length;
  const res = await finishPracticeTurn('Nice work.\nDEBRIEF: you landed it.', { vaultPath: vault, sessionId: sid, mode: 'debrief' });
  assert.equal(res.debrief, null);
  assert.equal(res.record, null);
  assert.match(res.text, /nothing was filed/);
  assert.equal((await listRecords()).filter((r) => r.kind === 'practice-session').length, count);
  assert.equal(await readFile(full, 'utf8'), before);
  assert.equal((await readPracticeState()).scenes[sid].ended, false);
});

/* --------------------------------- prepare --------------------------------- */

async function settled(id) {
  for (let i = 0; i < 200; i++) {
    const r = await getRecord(id);
    if (r && r.status !== 'classifying') return r;
    await new Promise((res) => setTimeout(res, 10));
  }
  throw new Error('prepare never settled');
}

test('prepare: a stubbed dossier is validated, written and filed auto with its undo; the why is his sentence', async () => {
  const { vault } = await tempVault(null);
  const said = 'I really love the ideas in chapter 8 and I want to practise them';
  let release;
  const gate = new Promise((r) => { release = r; });
  const runImpl = async (prompt, { research }) => {
    assert.equal(research, false);
    assert.match(prompt, /HIS SENTENCE, verbatim: """I really love/);
    await gate;
    return {
      title: 'Questions of intent', summary: 'Make them own it.',
      moves: [
        { name: 'Question of intent', line: 'Did you mean for that to sound rude?', source: '[[Questions of Intent]]' },
        { name: 'No line', line: '' },
      ],
      scenarios: [{ name: 'The dig', setting: 's', other: 'Mark', pressure: 'p', moves: ['Question of intent'] }],
      sourcesUsed: ['[[Questions of Intent]]'],
      gaps: ['the book is unread'],
    };
  };
  const record = await startPrepare(vault, { text: said }, { runImpl });
  assert.equal(record.kind, 'practice-skill');
  assert.equal(record.status, 'classifying');
  assert.equal(record.source, 'practice');
  // the same ask while the first is still running rides the first record
  const again = await startPrepare(vault, { text: `  ${said.toUpperCase()} ` }, { runImpl });
  assert.equal(again.id, record.id);
  assert.equal(again.repeat, true);
  release();
  const done = await settled(record.id);
  assert.equal(done.status, 'filed');
  assert.equal(done.auto, true);
  assert.equal(done.destination, 'Wiki/Practice/Questions of intent.md');
  assert.deepEqual(Object.keys(done.undoData).sort(), ['created', 'hash', 'relPath', 'route']);
  assert.equal(done.undoData.route, 'practice-skill');
  assert.equal(done.decision.payload.slug, 'questions-of-intent');
  assert.match(done.text, /^Practice: Questions of intent\. 1 move, 1 scenario, from 1 of your source\. Gaps: the book is unread\. 1 note: dropped "No line"/);
  const skill = await readSkill(vault, 'questions-of-intent');
  assert.equal(skill.why, `"${said}"`);

  const { undoFiling } = await import('../lib/inbox.js');
  assert.match(await undoFiling(vault, done.undoData), /deleted the practice page/);
  assert.equal(await readSkill(vault, 'questions-of-intent'), null);
});

test('prepare: a dossier with no usable move lands as an error on the record, and no page', async () => {
  const { vault } = await tempVault(null);
  const record = await startPrepare(vault, { text: 'help me practise something vague' }, { runImpl: async () => ({ title: 'Vague', moves: [], scenarios: [] }) });
  const done = await settled(record.id);
  assert.equal(done.status, 'error');
  assert.match(done.error, /no move/);
  assert.equal(await readSkill(vault, 'vague'), null);
  await assert.rejects(startPrepare(vault, { text: '   ' }), /which skill/);
});

test('the scene\'s hidden state never reaches the vault', async () => {
  const { vault, full } = await tempVault();
  const sid = await openScene(vault);
  await updatePracticeState((s) => { s.scenes[sid].turns.push({ who: 'you', text: 'secret', at: 'x' }); });
  assert.ok(!(await readFile(full, 'utf8')).includes('secret'));
});

/* ---------------------------------- routes --------------------------------- */

test('the routes: the summary, the refusals, a status change on the rails, and the front door forwarding a known skill', async () => {
  const { vault, full } = await tempVault();
  const before = await readFile(full, 'utf8');
  const express = (await import('express')).default;
  const { practiceRouter } = await import('../routes/practice.js');
  const { intentRouter } = await import('../routes/intent.js');
  const app = express();
  app.use(express.json());
  app.use('/api', practiceRouter(vault));
  app.use('/api', intentRouter(vault));
  const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const post = (p, body) => fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const sum = await (await fetch(`${base}/practice`)).json();
    assert.equal(sum.skills[0].slug, 'questions-of-intent');
    assert.equal(sum.today.scenario, 'The offhand dig in a team meeting');

    assert.equal((await post('/practice/prepare', { text: '' })).status, 400);
    assert.equal((await post('/practice/rehearse', {})).status, 400);
    assert.equal((await post('/practice/skills/questions-of-intent/status', { status: 'finished' })).status, 400);

    const st = await (await post('/practice/skills/questions-of-intent/status', { status: 'landed' })).json();
    assert.equal(st.status, 'landed');
    assert.equal(st.prior, 'active');
    const rec = await getRecord(st.record.id);
    assert.equal(rec.kind, 'practice-status');
    assert.equal(rec.undoData.route, 'practice-status');
    const { undoFiling } = await import('../lib/inbox.js');
    await undoFiling(vault, rec.undoData);
    assert.equal(await readFile(full, 'utf8'), before, 'the status undo puts the page back byte for byte');

    const intent = await (await post('/intent', { text: 'I want to practise questions of intent' })).json();
    assert.equal(intent.lane, 'practice');
    assert.deepEqual(intent.forward, { screen: 'practice', slug: 'questions-of-intent', scenario: null, question: 'I want to practise questions of intent' });
    assert.equal(intent.said, 'Opening Practice: Questions of intent.');
  } finally {
    srv.close();
  }
});
