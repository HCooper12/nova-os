import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

// The News routes (GET /mentors/news, the transcript around a moment, "Brief
// me", the research route) on a router mounted here, with no model, no tools
// and no real vault. The data dir is set BEFORE any lib is imported.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-mentor-news-'));
process.env.NOVA_DATA_DIR = dir;
const vault = path.join(dir, 'vault');

let A; let W; let R; let P; let Q; let T; let server; let base;
before(async () => {
  A = await import('../lib/mentorAsk.js');
  W = await import('../lib/mentorWeave.js');
  R = await import('../lib/mentorRegister.js');
  P = await import('../lib/mentorPeople.js');
  Q = await import('../lib/mentorQueue.js');
  T = await import('../lib/mentorTranscripts.js');
  const { mentorsRouter } = await import('../routes/mentors.js');
  const app = express();
  app.use(express.json());
  app.use('/api', mentorsRouter(vault));
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  server?.close();
  A._setAskDepsForTest(null); Q._setQueueDepsForTest(null); W._setWeaveDepsForTest(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };
const post = async (p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const deferred = () => { let resolve; const promise = new Promise((a) => { resolve = a; }); return { promise, resolve }; };

const DAY = 86_400_000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();
const TRANSCRIPT = Array.from({ length: 60 }, (_, i) => `[${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}] words at minute ${Math.floor(i / 2)} part ${i % 2}`).join('\n');
const NOTES = {
  summary: 'Three tools for a rude comment.',
  ideas: [
    { name: 'Ask about intent', text: 'A question makes them double back. More.', by: 'Sam Host', at: '00:30' },
    { name: 'Silence answers', text: 'Four seconds says enough.', by: 'Sam Host', at: '01:00' },
    { name: 'No goes first', text: 'Decline first.', by: 'Sam Host', at: '01:30' },
  ],
  frameworks: [],
};

const vid = (id, personId, extra = {}) => ({ key: `yt:${id}`, kind: 'video', tier: 1, title: `Video ${id}`, durationSec: 600, people: [{ id: personId, role: 'host' }], ...extra });
const writeTranscript = (key, text = TRANSCRIPT) => { const f = T.transcriptPathFor(key); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const writeNotes = (key) => {
  const base = path.join(dir, 'mentors', 'notes', `${key.replace(/:/g, '_')}.read-v1`);
  fs.mkdirSync(path.dirname(base), { recursive: true });
  fs.writeFileSync(`${base}.json`, JSON.stringify({ version: 'read-v1', key, parsed: NOTES }));
  return `${base}.json`;
};
const okUsage = { at: 'x', session: { percent: 10, resetsAt: null }, week: { percent: 20, resetsAt: null } };

let log;
let env;
beforeEach(async () => {
  fs.rmSync(path.join(dir, 'mentors'), { recursive: true, force: true });
  fs.rmSync(vault, { recursive: true, force: true });
  R._resetRegisterForTests(); P._resetPeopleForTests(); Q._resetQueueForTests(); W._resetWeaveForTests(); A._resetAskForTests();
  log = [];
  env = { usage: okUsage, hold: {} };
  Q._setQueueDepsForTest({
    busy: async () => false,
    onBattery: async () => false,
    readClaudeUsage: async () => env.usage,
    getTranscript: async (src) => {
      log.push(`transcript ${src.key}`);
      if (env.hold[src.key]) await env.hold[src.key].promise;
      writeTranscript(src.key);
      return { source: 'youtube-audio', path: T.transcriptPathFor(src.key), chars: TRANSCRIPT.length, timed: true };
    },
    readSource: async (src) => {
      log.push(`read ${src.key}`);
      if (env.hold[`read:${src.key}`]) await env.hold[`read:${src.key}`].promise;
      const jsonPath = writeNotes(src.key);
      return { notesPath: jsonPath.replace(/json$/, 'md'), jsonPath, model: 'sonnet', costUsd: 0.12, ms: 1, parts: 1, counts: { ideas: 3, frameworks: 0, scripts: 1, lines: 2, verifiedLines: 2, verifiedScripts: 1 } };
    },
  });
  A._setAskDepsForTest({ ask: async (lane) => { log.push(`brief ${lane}`); return { text: JSON.stringify({ top: [{ n: 2, new: true, line: 'The idea said plainly in one short sentence here.' }, { n: 1, new: false, line: 'The idea said plainly in one short sentence here.' }, { n: 3, new: true, line: 'The idea said plainly in one short sentence here.' }] }), usd: 0.01, answeredBy: 'claude-sonnet-4-5' }; } });
});

/* ---------------------------------- 5 news --------------------------------- */

const weaveRec = (batchId, personId, at, extra = {}) => ({ batchId, personId, at, version: 'weave-v3', model: 'sonnet', costUsd: 1, ms: 1, keys: [`yt:${batchId}a`, `yt:${batchId}b`], calls: [], counts: { sources: 2, concepts: 3, conceptsEdited: 1, chapters: 1, scripts: 4, cards: 5, held: 0, notes: 1, raised: 1 }, files: [], undoneAt: null, ...extra });

test('news: videos in the last 14 days, at most 8 a person, newest first across people; none in the window means the newest anyway; undated left out', async () => {
  await P.savePerson({ id: 'sam', name: 'Sam Host', status: 'following', colour: '#fb6b2f', channel: { handle: '@sam', subscribers: 1200 }, art: { avatar: 'sam-avatar.jpg' } });
  await P.savePerson({ id: 'kim', name: 'Kim Old', status: 'following', channel: { handle: '@kim', subscribers: null }, art: {} });
  await P.savePerson({ id: 'gus', name: 'A Guest', status: 'guest' });
  const samVideos = Array.from({ length: 10 }, (_, i) => vid(`s${i}`, 'sam', { publishedAt: ago(i + 1), publishedApprox: false }));
  await R.upsertSources([
    ...samVideos,
    vid('s-old', 'sam', { publishedAt: ago(20) }),
    vid('s-undated', 'sam'),
    { ...vid('s-short', 'sam', { publishedAt: ago(0.5) }), kind: 'short', tier: 2 },
    vid('k1', 'kim', { publishedAt: ago(30), audio: { url: 'https://pod.example/k1.mp3', sec: 601 } }),
    vid('k2', 'kim', { publishedAt: ago(40) }),
  ]);
  await R.setStage('yt:s0', 'read', { read: { version: 'read-v1', costUsd: 0.12, ideas: 9, scripts: 2, lines: 5, model: 'sonnet' } });
  writeTranscript('yt:s0');
  const r = await get('/mentors/news');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.people.map((p) => p.id).sort(), ['kim', 'sam'], 'followed people, no guests');
  assert.deepEqual(r.body.people.find((p) => p.id === 'sam'), { id: 'sam', name: 'Sam Host', handle: '@sam', subs: 1200, colour: '#fb6b2f', art: { avatar: '/api/mentors/art/sam-avatar.jpg' } });
  const keys = r.body.videos.map((v) => v.key);
  assert.deepEqual(keys, [...samVideos.slice(0, 8).map((v) => v.key), 'yt:k1']);
  const s0 = r.body.videos[0];
  assert.deepEqual(s0, {
    key: 'yt:s0', id: 's0', personId: 'sam', title: 'Video s0', sec: 600, date: samVideos[0].publishedAt, approx: false,
    stage: 'read', working: null, hold: null, audio: null,
    read: { costUsd: 0.12, ideas: 9, scripts: 2, lines: 5 }, brief: null, briefError: null, hasTranscript: true,
  });
  assert.deepEqual(r.body.videos.at(-1).audio, { url: 'https://pod.example/k1.mp3', sec: 601 });
  assert.deepEqual(r.body.learned, [], 'nothing woven this week');
  assert.deepEqual(r.body.raised, [], 'no raised items, no entry');
});

test('news: learned counts from the week, undo only when undoWeave would accept it, and raised items in every status', async () => {
  await P.savePerson({ id: 'sam', name: 'Sam Host', status: 'following' });
  await P.savePerson({ id: 'kim', name: 'Kim Old', status: 'following' });
  const weaves = path.join(dir, 'mentors', 'weaves');
  fs.mkdirSync(weaves, { recursive: true });
  fs.writeFileSync(path.join(weaves, 'w-1.json'), JSON.stringify(weaveRec('w-1', 'sam', ago(3))));
  fs.writeFileSync(path.join(weaves, 'w-2.json'), JSON.stringify(weaveRec('w-2', 'sam', ago(1))));
  fs.writeFileSync(path.join(weaves, 'w-3.json'), JSON.stringify(weaveRec('w-3', 'kim', ago(10))));
  // the Book: the week's two batches wove sources 1 to 4; one chapter and one
  // idea were touched by both batches and are counted once, and what stands
  // only on an older source (5) is not of this week
  const book = { ...W.emptyBook('sam', 'Sam Host'),
    sources: [{ n: 1, key: 'yt:w-1a' }, { n: 2, key: 'yt:w-1b' }, { n: 3, key: 'yt:w-2a' }, { n: 4, key: 'yt:w-2b' }, { n: 5, key: 'yt:old' }],
    chapters: [{ title: 'Both', sources: [1, 3] }, { title: 'One', sources: [4] }, { title: 'Old', sources: [5] }],
    concepts: [{ title: 'A', sources: [1, 2, 3, 4] }, { title: 'B', sources: [2] }, { title: 'C', sources: [5, 3] }, { title: 'Old', sources: [5] }],
    scripts: [{ id: 'P1.1', s: 1 }, { id: 'P3.1', s: 3 }, { id: 'P5.1', s: 5 }],
    raised: [
    { rid: 'R1.1', kind: 'idea', name: 'One', text: 'T.', by: 'A', s: 1, t: '01:00', why: 'Why it is worth a look.', status: 'dismissed', at: ago(2), batchId: 'w-1' },
    { rid: 'R1.2', kind: 'idea', name: 'Two', text: 'T.', by: 'A', s: 1, t: '02:00', why: 'Why it is worth a look.', status: 'new', at: ago(1), batchId: 'w-2' },
  ] };
  fs.mkdirSync(path.join(dir, 'mentors', 'books'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'mentors', 'books', 'sam.json'), JSON.stringify(book));
  const r = await get('/mentors/news');
  assert.equal(r.body.learned.length, 1, 'kim wove nothing in the last 7 days');
  const l = r.body.learned[0];
  assert.deepEqual({ ...l, from: null, to: null }, { personId: 'sam', from: null, to: null, videos: 4, chapters: 2, ideas: 3, scripts: 2, undo: { batchId: 'w-2', videos: 2 } });
  assert.match(l.from, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(r.body.raised.map((x) => [x.personId, x.items.map((i) => [i.rid, i.status])]), [['sam', [['R1.2', 'new'], ['R1.1', 'dismissed']]]]);
  assert.deepEqual(r.body.raised[0].items[0].questions, { true: null, deeper: null, use: null });
  // a weave running for him: undoWeave would refuse, so no undo is offered
  W._setActiveForTests('sam');
  assert.equal((await get('/mentors/news')).body.learned[0].undo, null);
  W._resetWeaveForTests();
  // the newest undone: the one below it is the one undo takes
  fs.writeFileSync(path.join(weaves, 'w-2.json'), JSON.stringify(weaveRec('w-2', 'sam', ago(1), { undoneAt: ago(0.5) })));
  assert.deepEqual((await get('/mentors/news')).body.learned[0].undo, { batchId: 'w-1', videos: 2 });
});

/* ------------------------------ 6 the transcript --------------------------- */

test('transcript: the span either side of the mark, the marked paragraph, the default and the cap, the first twelve, 404 and the untimed 409', async () => {
  await P.savePerson({ id: 'sam', name: 'Sam Host', status: 'following' });
  await R.upsertSources([vid('t1', 'sam', { publishedAt: ago(1) }), vid('t2', 'sam'), vid('t3', 'sam')]);
  await R.setStage('yt:t1', 'read', { read: { version: 'read-v1' } });
  writeTranscript('yt:t1');
  writeNotes('yt:t1');
  const r = await get('/mentors/source/transcript?key=yt:t1&at=1590');
  assert.equal(r.status, 200);
  assert.equal(r.body.key, 'yt:t1');
  assert.equal(r.body.title, 'Video t1');
  assert.equal(r.body.at, 1590);
  assert.equal(r.body.note, 'Three tools for a rude comment.');
  assert.deepEqual(r.body.paras.map((p) => [p.t, p.s, p.m]), [['25:30', 1530, false], ['26:00', 1560, false], ['26:30', 1590, true], ['27:00', 1620, false], ['27:30', 1650, false]]);
  assert.equal(r.body.paras[2].x, 'words at minute 26 part 1');
  const between = await get('/mentors/source/transcript?key=yt:t1&at=1600&span=20');
  assert.deepEqual(between.body.paras.map((p) => [p.t, p.m]), [['26:30', true], ['27:00', false]], 'the paragraph holding the mark is the one that started before it');
  const capped = await get('/mentors/source/transcript?key=yt:t1&at=900&span=99999');
  assert.deepEqual([capped.body.paras[0].s, capped.body.paras.at(-1).s], [300, 1500], 'span is at most 600');
  const first = await get('/mentors/source/transcript?key=yt:t1');
  assert.equal(first.body.at, null);
  assert.deepEqual(first.body.paras.map((p) => p.s), [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
  assert.ok(first.body.paras.every((p) => p.m === false));
  assert.equal((await get('/mentors/source/transcript?key=yt:t2&at=10')).status, 404, 'no transcript');
  assert.equal((await get('/mentors/source/transcript?key=yt:nope')).status, 404);
  assert.equal((await get('/mentors/source/transcript?key=yt:t1&at=abc')).status, 400);
  writeTranscript('yt:t3', 'words with no marks at all\nand more');
  const untimed = await get('/mentors/source/transcript?key=yt:t3&at=10');
  assert.equal(untimed.status, 409);
  assert.match(untimed.body.error, /has no time marks/);
  const unread = await get('/mentors/source/transcript?key=yt:t2');
  assert.equal(unread.status, 404);
});

/* --------------------------------- 4 brief me ------------------------------ */

async function settle() {
  for (let i = 0; i < 200; i++) {
    const flying = ['yt:b1', 'yt:b2'].map((k) => Q.briefJob(k)).filter(Boolean);
    if (!flying.length) return;
    await Promise.all(flying);
  }
}

test('brief me: transcript, then read, then the brief, ahead of the queue, with working on the news item; a second tap is 409', async () => {
  await P.savePerson({ id: 'sam', name: 'Sam Host', status: 'following', repeatsCheckedAt: ago(5) });
  await R.upsertSources([vid('b1', 'sam', { publishedAt: ago(2) })]);
  env.hold['yt:b1'] = deferred();
  const r = await post('/mentors/source/brief', { key: 'yt:b1' });
  assert.equal(r.status, 200);
  assert.equal(r.body.video.key, 'yt:b1');
  assert.equal(r.body.video.working, 'transcript');
  assert.equal(r.body.video.briefError, null);
  const again = await post('/mentors/source/brief', { key: 'yt:b1' });
  assert.equal(again.status, 409);
  assert.match(again.body.error, /already being made/);
  assert.equal((await get('/mentors/news')).body.videos[0].working, 'transcript');
  env.hold['yt:b1'].resolve();
  await settle();
  assert.deepEqual(log, ['transcript yt:b1', 'read yt:b1', 'brief mentor-brief'], 'in order, each once, though reading was never allowed for him');
  const v = (await get('/mentors/news')).body.videos[0];
  assert.equal(v.stage, 'read');
  assert.equal(v.working, null);
  assert.deepEqual(v.brief.ideas.map((i) => [i.name, i.text, i.ts, i.new]), [['Silence answers', 'The idea said plainly in one short sentence here.', 60, true], ['Ask about intent', 'The idea said plainly in one short sentence here.', 30, false], ['No goes first', 'The idea said plainly in one short sentence here.', 90, true]]);
  assert.equal(v.brief.costUsd, 0.01);
  assert.equal(v.read.costUsd, 0.12);
  assert.equal((await post('/mentors/source/brief', { key: 'yt:nope' })).status, 404);
  assert.equal((await post('/mentors/source/brief', {})).status, 400);
});

test('brief me: a source the queue is transcribing is waited for, never started twice', async () => {
  await P.savePerson({ id: 'sam', name: 'Sam Host', status: 'following', repeatsCheckedAt: ago(5) });
  await R.upsertSources([vid('b2', 'sam', { publishedAt: ago(2) })]);
  env.hold['yt:b2'] = deferred();
  const started = await Q.tick();
  assert.deepEqual(started.map((s) => `${s.what} ${s.key}`), ['transcript yt:b2']);
  const r = await post('/mentors/source/brief', { key: 'yt:b2' });
  assert.equal(r.status, 200);
  env.hold['yt:b2'].resolve();
  await settle();
  assert.deepEqual(log, ['transcript yt:b2', 'read yt:b2', 'brief mentor-brief']);
  assert.ok((await R.getSource('yt:b2')).brief);
});

test('brief me: usage over a ceiling is a 409 with the reason and reset time; a failed read keeps the stage and says why', async () => {
  await P.savePerson({ id: 'sam', name: 'Sam Host', status: 'following', repeatsCheckedAt: ago(5) });
  await R.upsertSources([vid('b1', 'sam', { publishedAt: ago(2) })]);
  env.usage = { at: 'x', session: { percent: 10, resetsAt: null }, week: { percent: 80, resetsAt: '2026-12-01T00:00:00Z' } };
  const blocked = await post('/mentors/source/brief', { key: 'yt:b1' });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error, 'his Claude usage is over a ceiling: the week is at 80% (his ceiling 75%); it resets 2026-12-01T00:00:00Z');
  assert.deepEqual(log, []);
  env.usage = okUsage;
  Q._setQueueDepsForTest({
    busy: async () => false, onBattery: async () => false, readClaudeUsage: async () => env.usage,
    getTranscript: async (src) => { writeTranscript(src.key); return { source: 'youtube-audio', path: T.transcriptPathFor(src.key), chars: 10, timed: true }; },
    readSource: async () => { throw new Error('the read came back without its Ideas section'); },
  });
  assert.equal((await post('/mentors/source/brief', { key: 'yt:b1' })).status, 200);
  await settle();
  const s = await R.getSource('yt:b1');
  assert.equal(s.stage, 'transcript', 'it keeps the stage it reached');
  assert.equal(s.briefError.why, 'the read failed: the read came back without its Ideas section');
  assert.equal((await get('/mentors/news')).body.videos[0].briefError.why, s.briefError.why);
});

/* ------------------------------ research route ----------------------------- */

test('the research route: 400, 404, 200 with the item, his status call refused while it runs, then answered', async () => {
  await P.savePerson({ id: 'sam', name: 'Sam Host', status: 'following' });
  const published = ago(2);
  await R.upsertSources([vid('r1', 'sam', { publishedAt: published })]);
  const book = { ...W.emptyBook('sam', 'Sam Host'), sources: [{ n: 1, key: 'yt:r1', title: 'Video r1', publishedAt: published }], raised: [
    { rid: 'R1.1', kind: 'idea', name: 'One', text: 'A claim.', by: 'A Guest', s: 1, t: '01:00', why: 'Why it is worth a look.', question: 'Is the claim true at all?', status: 'new', at: ago(1), batchId: 'w-1' },
  ] };
  fs.mkdirSync(path.join(dir, 'mentors', 'books'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'mentors', 'books', 'sam.json'), JSON.stringify(book));
  const hold = deferred();
  A._setAskDepsForTest({ ask: async () => { await hold.promise; return { text: JSON.stringify({ answer: 'No. It is not.', sources: [{ title: 'A paper, 2020', url: 'https://example.org/p' }] }), usd: 0.03, answeredBy: 'claude-sonnet-4-5', seen: 'https://example.org/p' }; } });
  assert.equal((await post('/mentors/sam/raised/R1.1/research', { kind: 'nope', question: 'x' })).status, 400);
  assert.equal((await post('/mentors/sam/raised/R1.1/research', { kind: 'true' })).status, 400);
  assert.equal((await post('/mentors/sam/raised/R9.9/research', { kind: 'true', question: 'Is it?' })).status, 404);
  assert.equal((await post('/mentors/nobody/raised/R1.1/research', { kind: 'true', question: 'Is it?' })).status, 404);
  const r = await post('/mentors/sam/raised/R1.1/research', { kind: 'true', question: 'Is the claim true at all?' });
  assert.equal(r.status, 200);
  assert.equal(r.body.raised.status, 'research');
  assert.deepEqual(r.body.raised.source, { id: 'r1', title: 'Video r1', sec: 600, date: book.sources[0].publishedAt });
  assert.equal(r.body.raised.ts, 60);
  assert.equal(r.body.raised.answer, null);
  const twice = await post('/mentors/sam/raised/R1.1/research', { kind: 'deeper', question: 'Where from?' });
  assert.equal(twice.status, 409);
  const set = await post('/mentors/sam/raised/R1.1', { status: 'kept' });
  assert.equal(set.status, 409);
  assert.match(set.body.error, /being researched now/);
  hold.resolve();
  await A.researchJob('sam', 'R1.1');
  const after = (await get('/mentors/sam/raised')).body.raised[0];
  assert.equal(after.status, 'answered');
  assert.deepEqual(after.answer.sources, [{ title: 'A paper, 2020', url: 'https://example.org/p' }]);
  assert.equal(after.asked.text, 'Is the claim true at all?');
  const more = await post('/mentors/sam/raised/R1.1', { status: 'new' });
  assert.equal(more.status, 200);
  assert.equal(more.body.raised.status, 'new');
  assert.equal(more.body.raised.answer.text, 'No. It is not.', '"Ask more" keeps the last answer');
});

test('the queue\'s own read of a video from the last 14 days makes its brief right after; an older one gets none; a failed brief never fails the read', async () => {
  await P.savePerson({ id: 'sam', name: 'Sam Host', status: 'following', repeatsCheckedAt: ago(5) });
  await R.upsertSources([vid('q1', 'sam', { publishedAt: ago(3) }), vid('q2', 'sam', { publishedAt: ago(20) })]);
  for (const k of ['yt:q1', 'yt:q2']) { writeTranscript(k); await R.setStage(k, 'transcript', { transcript: { source: 'youtube-audio', timed: true } }); }
  await Q.allowReading('sam');
  await Q.runUntilIdle({ maxMs: 5000 });
  // the two reads run side by side (two at a time); the one brief comes after q1's read
  const work = log.filter((l) => !l.startsWith('transcript'));
  assert.deepEqual([...work].sort(), ['brief mentor-brief', 'read yt:q1', 'read yt:q2']);
  assert.ok(work.indexOf('brief mentor-brief') > work.indexOf('read yt:q1'));
  assert.equal((await R.getSource('yt:q1')).brief.ideas.length, 3);
  assert.equal((await R.getSource('yt:q2')).brief, undefined);
  // a brief that fails: the read stands, the failure is on the source and in the log
  await R.upsertSources([vid('q3', 'sam', { publishedAt: ago(1) })]);
  writeTranscript('yt:q3');
  await R.setStage('yt:q3', 'transcript', { transcript: { source: 'youtube-audio', timed: true } });
  A._setAskDepsForTest({ ask: async () => ({ text: 'not json', usd: 0.01 }) });
  await Q.runUntilIdle({ maxMs: 5000 });
  const q3 = await R.getSource('yt:q3');
  assert.equal(q3.stage, 'read');
  assert.match(q3.briefError.why, /^the brief failed its checks twice: the reply was not a JSON object/);
  assert.ok((await Q.queueStatus()).log.some((l) => l.what === 'brief failed' && l.key === 'yt:q3'));
});
