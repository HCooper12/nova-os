// THE WORKOUT PANEL WITH LIVE MARKS (3 Oct 2026) — mockup 67 screens 3 and 5,
// his rule in NOVA-METHOD.md §2b ("When a glass panel appears").
//
// The model names a logged session and, before each sentence, a part of it to
// light; code builds the panel from his session record, checks every address
// against it, drops one that is not there, and lights each only while its
// sentence is spoken. Temp vault + data dir BEFORE imports; no model runs.
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-sesspanel-vault-'));
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-sesspanel-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';
process.env.CLAUDE_BIN = '/usr/bin/false';

import test from 'node:test';
import assert from 'node:assert/strict';
import matter from 'gray-matter';

const { buildSessionPanel, buildSourcesPanel, buildPanel, findPassage } = await import('../lib/panels.js');
const { addCustomExercise, loadExerciseLibrary } = await import('../lib/exercises.js');
const { createRoutine } = await import('../lib/workouts.js');
const { resolveVisual, deps: resolveDeps } = await import('../lib/visualResolve.js');
const { attachVisuals, GLASS_CONTRACT } = await import('../lib/visualStream.js');
const { buildAskPrompt, buildCoachPrompt } = await import('../lib/claudeCode.js');
const { consultReplyText, jointPanelNote } = await import('../lib/consult.js');
const { parseVisualStream } = await import('../../src/visualBeats.js');
const { resolveMark, normaliseMark, sentenceAfter, litNow, hueOf, finderWords } = await import('../../src/glassMarks.js');
const { glassOf, dataCard } = await import('../../src/glassBeats.js');
const { AGENT } = await import('../../src/artifactClient.js');
const { glassSnapshot, bindGlassSentences, panelsOf, settleStage, gistOf } = await import('../../src/novaThreadFacts.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
  await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true });
});

// ---- the fixture: his Push session on Monday 28 Sep, bench 80 kg × 8, 7, 6 ----
const DIR = path.join(vault, 'Wiki/Health/Workouts');
async function writeSession(s) {
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, `${s.date} — ${s.routineName}.md`), matter.stringify(`# ${s.routineName}\n`, { type: 'workout-session', ...s }), 'utf8');
}
let bench;
let incline;
const ready = (async () => {
  bench = await addCustomExercise(vault, 'Bench Press', 'Chest', 'weight_reps');
  incline = await addCustomExercise(vault, 'Incline Dumbbell Press', 'Chest', 'weight_reps');
  const { exercises } = await loadExerciseLibrary(vault);
  const push = await createRoutine(vault, exercises, 'Push', [
    { exerciseId: bench.id, targetSets: 3, targetRepsLow: 8, targetRepsHigh: 8 },
    { exerciseId: incline.id, targetSets: 3, targetRepsLow: 10, targetRepsHigh: 12 },
  ]);
  await writeSession({ id: 'p0921', date: '2026-09-21', routineId: push.id, routineName: 'Push', finishedAt: '2026-09-21T08:00:00Z',
    exercises: [{ exerciseId: bench.id, name: 'Bench Press', sets: [{ weight: 77.5, reps: 8 }, { weight: 77.5, reps: 8 }] }] });
  await writeSession({ id: 'p0928', date: '2026-09-28', routineId: push.id, routineName: 'Push', finishedAt: '2026-09-28T08:00:00Z',
    exercises: [
      { exerciseId: bench.id, name: 'Bench Press', sets: [
        { weight: 40, reps: 10, setType: 'warmup' },
        { weight: 80, reps: 8, rpe: 8 }, { weight: 80, reps: 7, rpe: 9 }, { weight: 80, reps: 6, rpe: 9.5 },
      ] },
      { exerciseId: incline.id, name: 'Incline Dumbbell Press', sets: [{ weight: 26, reps: 10 }, { weight: 26, reps: 10 }, { weight: 26, reps: 9 }] },
    ] });
})();

const REPLY = [
  'VIS {"panel":"session","date":"2026-09-28","by":"coach"}',
  'VIS {"mark":{"lift":"Bench press"}}',
  'The Coach says not yet on bench.',
  'VIS {"mark":{"lift":"Bench press","set":3}}',
  'Your third set on Monday stopped at 6 reps, at RPE 9.5.',
  'VIS {"mark":{"lift":"Bench press","field":"kg","target":true}}',
  'Hold three sets at 80 kg until all three reach 8.',
].join('\n');

test('the session panel is built by code from the fixture session', async () => {
  await ready;
  const d = await buildSessionPanel(vault, { date: '2026-09-28' });
  assert.equal(d.routineName, 'Push');
  assert.equal(d.date, '2026-09-28');
  assert.equal(d.weekday, 'Monday');
  const b = d.lifts[0];
  assert.equal(b.name, 'Bench Press');
  assert.equal(b.topKg, 80);
  assert.deepEqual(b.sets.filter((s) => s.n).map((s) => [s.n, s.kg, s.reps, s.rpe]), [[1, 80, 8, 8], [2, 80, 7, 9], [3, 80, 6, 9.5]]);
  assert.equal(b.sets[0].type, 'warmup');
  assert.equal(b.sets[0].n, null, 'a warm-up is never "set 1"');
  assert.deepEqual(b.target, { sets: 3, repsLow: 8, repsHigh: 8 }, "the program's target, read from the routine");
  assert.equal(d.lifts[1].target.repsHigh, 12);
  // "the last Push" finds the same session; a weekday finds the latest such day
  assert.equal((await buildSessionPanel(vault, { routine: 'push' })).date, '2026-09-28');
  assert.equal((await buildSessionPanel(vault, { date: 'monday' }, { now: new Date('2026-09-30T09:00:00') })).date, '2026-09-28');
  // and SHOW reaches it through the one builder
  assert.equal((await buildPanel(vault, { panel: 'session', date: '2026-09-21' })).data.lifts[0].topKg, 77.5);
});

test('a missing session yields no panel and a reason the reply can say', async () => {
  await ready;
  await assert.rejects(() => buildSessionPanel(vault, { date: '2026-09-29' }), /no session is logged on 2026-09-29/);
  await assert.rejects(() => buildSessionPanel(vault, { routine: 'Legs' }), /nothing is logged for a routine matching "Legs"/);
  const v = await resolveVisual({ kind: 'session', date: '2026-09-29', by: 'coach' }, { vaultPath: vault });
  assert.equal(v.state, 'no-record');
  assert.match(v.reason, /no session is logged/);
  assert.equal(dataCard({ kind: 'session', date: '2026-09-29', by: 'coach' }, v), null, 'a record that cannot be read draws no panel');
});

test('the grammar: a data panel, then marks; a malformed address costs its beat', () => {
  const { text, beats } = parseVisualStream(REPLY);
  assert.equal(text, 'The Coach says not yet on bench.\nYour third set on Monday stopped at 6 reps, at RPE 9.5.\nHold three sets at 80 kg until all three reach 8.');
  assert.deepEqual(beats.map((b) => b.spec.kind), ['session', 'mark', 'mark', 'mark'], 'two directive lines in a row are both read, never spoken');
  assert.equal(beats[0].spec.by, 'coach');
  assert.deepEqual(beats[2].spec.mark, { lift: 'Bench press', set: 3 });
  assert.equal(normaliseMark({ lift: 'Bench press', set: 'three' }), null, 'never "set three" read as the whole lift');
  assert.equal(normaliseMark({ lift: 'Bench press', field: 'tempo' }), null);
  assert.equal(parseVisualStream('VIS {"mark":{"set":3}}\nWords.').beats.length, 0, 'an address names a place');
  // a mark may ride the panel line itself, as the mockup's note writes it
  const inline = parseVisualStream('VIS {"panel":"session","date":"2026-09-28","by":"coach","mark":{"lift":"Bench press"}}\nWords.').beats;
  assert.deepEqual(inline[0].spec.mark, { lift: 'Bench press' });
});

test('marks resolve against the panel code built; a bad address is dropped', async () => {
  await ready;
  const card = { kind: 'session', by: 'coach', data: await buildSessionPanel(vault, { date: '2026-09-28' }) };
  const lift = resolveMark(card, { lift: 'Bench press' });
  assert.equal(lift.ok, true);
  assert.equal(lift.name, 'Bench Press');
  const set3 = resolveMark(card, { lift: 'bench press', set: 3 });
  assert.deepEqual(set3.at, { kind: 'session', lift: 0, set: 3, field: null, target: false });
  assert.equal(set3.detail, '6 at RPE 9.5', 'the words are the record\'s numbers');
  const tgt = resolveMark(card, { lift: 'Bench press', field: 'kg', target: true });
  assert.equal(tgt.ok, true);
  assert.equal(tgt.short, '80 kg');
  assert.equal(tgt.name, 'Bench Press, 80 kg · target 8 reps');
  for (const bad of [{ lift: 'Bench press', set: 4 }, { lift: 'Squat' }, { lift: 'Press' }, { lift: 'Incline Dumbbell Press', field: 'rpe', set: 1 }]) {
    const r = resolveMark(card, bad);
    assert.equal(r.ok, false, `${JSON.stringify(bad)} is not there, so it lights nothing`);
    assert.ok(r.why);
  }
});

test('the server checks every mark and logs the one it drops', async () => {
  await ready;
  const logs = [];
  const job = { id: 't1' };
  attachVisuals(job, { vaultPath: vault, log: (m) => logs.push(m) });
  job.onPartial(`${REPLY}\nVIS {"mark":{"lift":"Bench press","set":5}}\nAnd that is all.`);
  for (let i = 0; i < 50 && Object.keys(job.markChecks).length < 4; i++) await new Promise((r) => setTimeout(r, 20));
  const verdicts = Object.values(job.markChecks);
  assert.equal(verdicts.length, 4);
  assert.equal(verdicts.filter((v) => v.ok).length, 3);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /dropped a mark: Bench Press has no set 5/);
  const panel = Object.values(job.visuals).find((v) => v.kind === 'session');
  assert.equal(panel.data.lifts[0].topKg, 80, 'the panel rides the job, so the poll carries it');
});

test('a mark binds to its sentence: lit while it is spoken, and only then', async () => {
  await ready;
  const { text, beats } = parseVisualStream(REPLY);
  const s1 = sentenceAfter(text, beats[1].at);
  assert.equal(text.slice(s1.start, s1.end), 'The Coach says not yet on bench.');
  const s2 = sentenceAfter(text, beats[2].at);
  assert.equal(text.slice(s2.start, s2.end), 'Your third set on Monday stopped at 6 reps, at RPE 9.5.', '"9.5" is not a full stop');
  // sentence by sentence, as the voice raises the glass
  const end1 = s1.end;
  const end2 = s2.end;
  assert.equal(litNow(beats[1], text, end1), true);
  assert.equal(litNow(beats[1], text, end2), false, 'the light goes out when its sentence ends');
  assert.equal(litNow(beats[2], text, end1), false, 'and never shows ahead of its sentence');
  assert.equal(litNow(beats[2], text, end2), true);

  // the stage, through the same function the app runs
  const visuals = { [beats[0].key]: await resolveVisual(beats[0].spec, { vaultPath: vault }) };
  const st = (spokenTo) => ({ glassBeats: beats, glassVisuals: visuals, glassSpokenTo: spokenTo, voiceChat: [{ who: 'coach', text }] });
  const g1 = glassOf(st(end1));
  assert.equal(g1.hero.lit.at.set, null);
  assert.equal(g1.hero.lit.name, 'Bench Press');
  assert.equal(g1.n, 1);
  assert.equal(g1.total, 3);
  const g2 = glassOf(st(end2));
  assert.equal(g2.hero.lit.at.set, 3);
  assert.equal(g2.key, g1.key, 'a relight keeps the panel up, never a new one');
  assert.equal(g2.rail.length, 0, 'the marks fold into their panel, never the rail');
  const g3 = glassOf(st(text.length));
  assert.equal(g3.hero.lit.at.target, true);
  // a dropped mark leaves the panel up and unlit
  const bad = parseVisualStream(`${REPLY}\nVIS {"mark":{"lift":"Squat"}}\nThat is the plan.`);
  const badVis = { [bad.beats[0].key]: visuals[beats[0].key] };
  const gb = glassOf({ glassBeats: bad.beats, glassVisuals: badVis, glassSpokenTo: bad.text.length, voiceChat: [{ who: 'coach', text: bad.text }] });
  assert.equal(gb.hero.kind, 'session');
  assert.equal(gb.hero.lit, null);
});

test('`by` sets the hue and the words that name the finder', () => {
  assert.equal(hueOf('coach'), 'var(--nv-m-chest)');
  assert.equal(hueOf('researcher'), 'var(--nv-m-quads)');
  assert.equal(hueOf('librarian'), 'var(--nv-m-back)');
  assert.equal(hueOf('leader'), 'var(--nv-mg)');
  assert.equal(hueOf('nova'), 'var(--nv-nova)');
  assert.equal(hueOf('someone'), 'var(--nv-nova)', 'an unknown finder is Nova\'s own, never a borrowed colour');
  // the same hues the documents wear (src/artifactClient.js AGENT)
  for (const k of ['coach', 'leader', 'nova']) assert.equal(hueOf(k), AGENT[k].hue, `${k} drifted from AGENT`);
  assert.equal(finderWords('coach'), 'from the Coach');
  assert.equal(finderWords('nova'), 'Nova’s own');
  const card = dataCard({ kind: 'session', by: 'coach' }, { state: 'ready', data: { lifts: [] } });
  assert.equal(card.hue, 'var(--nv-m-chest)');
  assert.equal(card.finder, 'from the Coach');
});

test('the joint panel: a section per contributor, from its own record', async () => {
  await ready;
  await mkdir(path.join(vault, 'Library'), { recursive: true });
  await writeFile(path.join(vault, 'Library/Stronger Slowly.md'), '---\ntype: book\n---\n# Stronger Slowly\n\nChapter four. Change the split when the log shows a stall, never because you are bored. Most lifters change too early.\n', 'utf8');
  const roster = [
    { agent: 'coach', ok: true, answer: 'Your Bench Press has climbed from 77.5 to 80 kg; hold it there.' },
    { agent: 'librarian', ok: true, answer: 'Stronger Slowly says "change the split when the log shows a stall" in chapter four.', citations: [{ path: 'Library/Stronger Slowly.md', title: 'Stronger Slowly', exists: true }] },
    { agent: 'researcher', ok: true, answer: 'Brief: "Twice a week edges once a week"\n\nBody.', sources: [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5 }], recordId: 'r1' },
    { agent: 'leader', ok: true, answer: 'Lead by example in the gym too.' },
    { agent: 'calendar', ok: false, error: 'offline' },
  ];
  const { sections } = await buildSourcesPanel(vault, roster);
  assert.deepEqual(sections.map((s) => [s.agent, s.type]), [['coach', 'trend'], ['librarian', 'passage'], ['researcher', 'finding'], ['leader', 'words']], 'a failed ask gets no section');
  const coach = sections[0];
  assert.equal(coach.lift, 'Bench Press');
  assert.deepEqual(coach.points.map((p) => p.topKg), [77.5, 80], 'the trend is his log, oldest first');
  const lib = sections[1];
  assert.equal(lib.excerpt.slice(lib.span.start, lib.span.end).toLowerCase(), 'change the split when the log shows a stall', 'the light falls on his note\'s own words');
  assert.equal(lib.title, 'Stronger Slowly');
  assert.equal(sections[2].claim, 'Twice a week edges once a week');
  assert.equal(sections[2].sourceCount, 5);
  assert.match(sections[3].words, /Lead by example/);
  // a quote his note does not hold is never highlighted
  assert.equal(findPassage('# Note\n\nSomething else entirely.', ['change the split when the log shows a stall']), null);
  const { sections: s2 } = await buildSourcesPanel(vault, [{ agent: 'librarian', ok: true, answer: 'It says "words that are nowhere in the note at all".', citations: [{ path: 'Library/Stronger Slowly.md', title: 'Stronger Slowly', exists: true }] }]);
  assert.equal(s2[0].type, 'words');
  // marks address a section; a quote that is not there drops the mark
  const card = { kind: 'sources', by: 'nova', data: { sections } };
  assert.equal(resolveMark(card, { section: 'librarian', quote: true }).ok, true);
  assert.equal(resolveMark(card, { section: 'researcher' }).by, 'researcher', 'a section lights in its own agent\'s hue');
  assert.equal(resolveMark(card, { section: 'leader', quote: true }).ok, false);
  assert.equal(resolveMark(card, { section: 'calendar' }).ok, false);
  // and it is built off the job's own consult roster when the line arrives
  const v = await resolveVisual({ kind: 'sources', by: 'nova' }, { vaultPath: vault, consult: () => roster });
  assert.equal(v.data.sections.length, 4);
  const none = await resolveVisual({ kind: 'sources', by: 'nova' }, { vaultPath: vault, consult: () => [] });
  assert.equal(none.state, 'no-record');
  assert.ok(resolveDeps.buildSourcesPanel);
});

test('the snapshot keeps the panel, the marks and each sentence, and round-trips', async () => {
  await ready;
  const { text, beats } = parseVisualStream(REPLY);
  const visuals = { [beats[0].key]: await resolveVisual(beats[0].spec, { vaultPath: vault }) };
  const g = bindGlassSentences(glassSnapshot(beats, visuals), text);
  // what localStorage keeps, and reads back after a reload
  const back = JSON.parse(JSON.stringify(g));
  assert.deepEqual(back.beats.slice(1).map((b) => b.sentence), [0, 1, 2]);
  assert.equal(back.beats[2].said, 'Your third set on Monday stopped at 6 reps, at RPE 9.5.');
  assert.deepEqual(back.beats[3].spec.mark, { lift: 'Bench press', field: 'kg', target: true });
  const frames = panelsOf(back);
  assert.deepEqual(frames.map((f) => f.lit?.short), ['Bench Press', 'Set 3', '80 kg'], 'Replay steps through the lights in spoken order');
  assert.equal(frames[1].said, 'Your third set on Monday stopped at 6 reps, at RPE 9.5.');
  const s = settleStage(frames);
  assert.equal(s.last.kind, 'session');
  assert.equal(s.last.lit, null, 'the settled panel is unlit: nothing is being said');
  assert.deepEqual(s.others.map((o) => gistOf(o).b), ['Bench Press', 'Set 3', '80 kg']);
  assert.equal(gistOf(s.others[1]).hue, 'var(--nv-m-chest)');
  assert.equal(s.count, 3);
  // a panel whose record could not be read leaves no frame behind
  const gone = glassSnapshot(beats, { [beats[0].key]: { state: 'no-record', reason: 'no session' } });
  assert.deepEqual(panelsOf(gone), []);
});

test('the prompts carry the rule, and the Coach\'s reminder stays one paragraph', async () => {
  // the reminder is module-private; read it as written, the way cleanTurnText sees it
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../lib/claudeCode.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('const COACH_TURN_REMINDER = ['), src.indexOf("].join('\\n');", src.indexOf('const COACH_TURN_REMINDER = [')));
  assert.ok(block.length > 200, 'the reminder was found');
  assert.match(block, /VIS \{"panel":"session","date":"YYYY-MM-DD","by":"coach"\}/);
  assert.match(block, /one thing lit at a time/);
  assert.doesNotMatch(block, /\\n\\n/, 'no blank line: it stays ONE paragraph');
  for (const p of [GLASS_CONTRACT, buildAskPrompt({ question: 'q', context: 'c' }), buildCoachPrompt({ question: 'q', context: 'c' })]) {
    assert.match(p, /"panel":"session"/);
    assert.match(p, /\{"mark":\{"lift"/);
    assert.match(p, /a number he should see, two things compared, or a place in his own record/);
    assert.match(p, /A plain sentence gets no panel/);
    assert.match(p, /One thing lit at a time, only while you say it/);
    assert.match(p, /If the record cannot be read, raise no panel and say so/);
  }
});

test('the joint panel is offered to the synthesis only when two answered', () => {
  const two = [{ agent: 'coach', label: 'the Coach', question: 'q', ok: true, answer: 'a' }, { agent: 'librarian', label: 'the Librarian', question: 'q', ok: true, answer: 'b', citations: [{ exists: true, path: 'x.md', title: 'X' }] }];
  assert.match(consultReplyText(two, 'his question', { from: 'nova' }), /VIS \{"panel":"sources","by":"nova"\}/);
  assert.match(jointPanelNote(two), /"section":"<coach\|librarian>"/);
  assert.match(jointPanelNote(two), /"quote":true/);
  assert.equal(jointPanelNote([two[0]]), '', 'one answer is not a comparison');
  assert.doesNotMatch(consultReplyText([two[0]], 'q', { from: 'nova' }), /"panel":"sources"/);
  assert.doesNotMatch(consultReplyText(two, 'q', { from: 'nova', answeringTo: 'coach' }), /"panel":"sources"/, 'an answer for another agent raises no panel');
});
