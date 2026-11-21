import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The queue on fake time with no tools: transcripts, reads, the meter, his
// conversation and the battery are all stand-ins in `deps`. The data dir is
// set BEFORE any lib is imported.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-mentor-queue-'));
process.env.NOVA_DATA_DIR = dir;

let Q; let R; let P; let T; let J;
before(async () => {
  Q = await import('../lib/mentorQueue.js');
  R = await import('../lib/mentorRegister.js');
  P = await import('../lib/mentorPeople.js');
  T = await import('../lib/mentorTranscripts.js');
  J = await import('../lib/jobRegistry.js');
});
after(() => { Q._setQueueDepsForTest(null); fs.rmSync(dir, { recursive: true, force: true }); });

const NOW = Date.parse('2026-11-21T00:00:00Z');
let clock;
let env; // what the stand-ins do
let log;

function talk(seed, n = 1500) {
  const vocab = 'we talk about conversations people arguments listen calm voice pause question answer label truth fear feel safe trust story boss team family home work next because when then always never more less first last little big'.split(' ');
  let x = seed; const out = [];
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) % 2147483648; out.push(vocab[x % vocab.length]); }
  return `[00:00] ${out.join(' ')}`;
}

const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function install() {
  Q._setQueueDepsForTest(lastDeps = {
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    busy: async () => env.busy(),
    onBattery: async () => env.battery,
    readClaudeUsage: async () => { log.push('usage'); return env.usage; },
    getTranscript: async (src, opts) => {
      log.push(`transcript ${src.key}`);
      if (env.yield) await opts.yieldToHim();
      if (env.hold[src.key]) await env.hold[src.key].promise;
      const fail = env.fail[src.key];
      if (fail) { const e = new Error(fail.message); e.kind = fail.kind; throw e; }
      const text = env.text[src.key] || talk(src.key.length * 7919 + src.key.charCodeAt(src.key.length - 1) * 31 + src.key.charCodeAt(3));
      const file = T.transcriptPathFor(src.key);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      return { source: src.audio?.url ? 'podcast-audio' : 'youtube-audio', path: file, chars: text.length, timed: true, audioSec: 60, sttSec: 3 };
    },
    readSource: async (src) => {
      log.push(`read ${src.key}`);
      if (env.hold[`read:${src.key}`]) await env.hold[`read:${src.key}`].promise;
      if (env.fail[`read:${src.key}`]) throw new Error(env.fail[`read:${src.key}`]);
      return { notesPath: path.join(dir, 'mentors', 'notes', 'x.md'), jsonPath: 'x', model: 'sonnet', costUsd: 0.1, ms: 1, parts: 1, counts: { ideas: 3, frameworks: 1, scripts: 2, lines: 4, verifiedLines: 4, verifiedScripts: 2 } };
    },
  });
}

const okUsage = { at: 'x', session: { percent: 10, resetsAt: '2026-11-21T05:00:00Z' }, week: { percent: 20, resetsAt: '2026-11-25T00:00:00Z' }, scoped: [] };
const day = (n) => new Date(NOW - n * 86_400_000).toISOString();
const vid = (id, extra = {}) => ({ key: `yt:${id}`, kind: 'video', tier: 1, title: `Video ${id}`, durationSec: 600, views: 100, publishedAt: null, people: [{ id: 'fisher', role: 'host' }], ...extra });

async function person(extra = {}) {
  await P.savePerson({ id: 'fisher', name: 'Fisher', status: 'following', scope: 'everything', followedAt: day(30), ...extra });
}

beforeEach(async () => {
  Q._resetQueueForTests();
  R._resetRegisterForTests();
  P._resetPeopleForTests();
  fs.rmSync(path.join(dir, 'mentors'), { recursive: true, force: true });
  clock = NOW;
  log = [];
  env = { busy: () => false, battery: false, usage: okUsage, hold: {}, fail: {}, text: {}, yield: false };
  install();
});

test('rule 1: one transcript at a time, two reads at most, and `working` marks what is in flight', async () => {
  await person();
  await R.upsertSources([vid('a', { publishedAt: day(1) }), vid('b', { publishedAt: day(2) }), vid('c', { publishedAt: day(3) })]);
  env.hold['yt:a'] = deferred();
  const first = await Q.tick();
  assert.deepEqual(first.map((x) => x.what), ['transcript']);
  assert.equal((await R.getSource('yt:a')).working, 'transcript');
  assert.deepEqual(await Q.tick(), [], 'a second transcript never starts while one runs');
  env.hold['yt:a'].resolve();
  await Q.runUntilIdle();
  assert.deepEqual((await R.listSources()).map((s) => s.stage), ['transcript', 'transcript', 'transcript']);
  await Q.allowReading('fisher');
  for (const k of ['a', 'b', 'c']) env.hold[`read:yt:${k}`] = deferred();
  const reads = await Q.tick();
  assert.deepEqual(reads.map((x) => x.key), ['yt:a', 'yt:b'], 'two reads, newest first');
  assert.equal((await R.getSource('yt:a')).working, 'read');
  assert.deepEqual(await Q.tick(), [], 'no third read while two run');
  for (const k of ['a', 'b', 'c']) env.hold[`read:yt:${k}`].resolve();
  await Q.runUntilIdle();
  const a = await R.getSource('yt:a');
  assert.equal(a.stage, 'read');
  assert.equal(a.working, null);
  assert.equal(a.read.version, 'read-v1');
  assert.equal(a.read.costUsd, 0.1);
  assert.equal(a.reads, 1);
});

test('rule 2: newest first; narrow is the 60 most viewed, the last 12 months, and what was found after he followed; none is nothing', async () => {
  await person();
  await R.upsertSources([vid('old', { publishedAt: day(400) }), vid('new', { publishedAt: day(5) }), vid('mid', { publishedAt: day(100) }), vid('undated'), { ...vid('short1'), kind: 'short', tier: 2 }]);
  await Q.runUntilIdle();
  assert.deepEqual(log.filter((l) => l.startsWith('transcript')), ['transcript yt:new', 'transcript yt:mid', 'transcript yt:old', 'transcript yt:undated'], 'tier 2 is not in the main scope');

  const now = NOW;
  const many = Array.from({ length: 70 }, (_, i) => ({ key: `yt:v${i}`, tier: 1, views: 1000 - i, publishedAt: day(800) }));
  many.push({ key: 'yt:recent', tier: 1, views: null, publishedAt: day(30) });
  many.push({ key: 'yt:later', tier: 1, views: null, publishedAt: null, foundAt: day(1) });
  many.push({ key: 'yt:sameday', tier: 1, views: null, publishedAt: null, foundAt: day(29.5) });
  many.push({ key: 'yt:nothing', tier: 1, views: null, publishedAt: null });
  const narrow = Q.inScope(many, { scope: 'narrow', followedAt: day(30), now }).map((s) => s.key);
  assert.equal(narrow.length, 62);
  assert.ok(narrow.includes('yt:v59') && !narrow.includes('yt:v60'));
  assert.ok(narrow.includes('yt:recent') && narrow.includes('yt:later'));
  assert.ok(!narrow.includes('yt:sameday'), 'found within a day of following is the catalogue, not new');
  assert.ok(!narrow.includes('yt:nothing'));
  assert.equal(Q.inScope(many, { scope: 'everything', now }).length, many.length);
  assert.deepEqual(Q.inScope(many, { scope: 'none', now }), []);

  Q._resetQueueForTests(); R._resetRegisterForTests(); P._resetPeopleForTests();
  fs.rmSync(path.join(dir, 'mentors'), { recursive: true, force: true });
  log = [];
  await person({ scope: 'none' });
  await R.upsertSources([vid('x')]);
  assert.deepEqual(await Q.tick(), []);
});

test('rule 3: repeats are found before any read, a duplicate is held with the titles, and a later transcript is checked on its own', async () => {
  await person();
  const same = talk(42, 3000);
  env.text['yt:ep'] = same;
  env.text['yt:copy'] = same;
  await R.upsertSources([vid('ep', { durationSec: 3600, publishedAt: day(3) }), vid('copy', { durationSec: 3600, publishedAt: day(2) }), vid('own', { durationSec: 900, publishedAt: day(1) })]);
  await Q.allowReading('fisher');
  const got = await Q.runUntilIdle();
  const whats = got.map((g) => g.what);
  assert.ok(whats.indexOf('repeats') > whats.lastIndexOf('transcript'), 'repeats after the last transcript');
  assert.ok(whats.indexOf('repeats') < whats.indexOf('read'), 'and before any read');
  const copy = await R.getSource('yt:copy');
  const ep = await R.getSource('yt:ep');
  const held = [copy, ep].filter((s) => s.hold?.state === 'duplicate');
  assert.equal(held.length, 1, 'exactly one of the twins is held');
  assert.match(held[0].hold.why, /^the same words as Video (ep|copy)$/);
  assert.ok((await P.getPerson('fisher')).repeatsCheckedAt);
  assert.equal(log.filter((l) => l.startsWith('read')).length, 2, 'the duplicate is never read');

  // a new upload of the same words arrives later: checked against the rest on its own
  env.text['yt:reup'] = same;
  await R.upsertSources([vid('reup', { durationSec: 3600, publishedAt: day(0) })]);
  await Q.runUntilIdle();
  const reup = await R.getSource('yt:reup');
  assert.equal(reup.hold?.state, 'duplicate');
  assert.equal(reup.stage, 'transcript');
});

test('rule 4: no read without his go, none at or over a ceiling, none when usage is unknown; the status says which', async () => {
  await person();
  await R.upsertSources([vid('a')]);
  await Q.runUntilIdle();
  assert.equal((await R.getSource('yt:a')).stage, 'transcript');
  assert.equal(log.filter((l) => l.startsWith('read')).length, 0, 'no go, no read');
  let st = (await Q.queueStatus()).people[0];
  assert.equal(st.doing, 'waiting');
  assert.deepEqual(st.waiting, { on: 'go', until: null });

  await Q.allowReading('fisher');
  env.usage = { ...okUsage, session: { percent: 60, resetsAt: '2026-11-21T05:00:00Z' } };
  assert.deepEqual(await Q.tick(), []);
  st = (await Q.queueStatus()).people[0];
  assert.equal(st.waiting.on, 'usage');
  assert.equal(st.waiting.until, '2026-11-21T05:00:00Z');
  env.usage = { ...okUsage, week: { percent: 75, resetsAt: '2026-11-25T00:00:00Z' } };
  assert.deepEqual(await Q.tick(), []);
  assert.equal((await Q.queueStatus()).people[0].waiting.until, '2026-11-25T00:00:00Z');
  env.usage = null;
  assert.deepEqual(await Q.tick(), []);
  st = (await Q.queueStatus()).people[0];
  assert.deepEqual(st.waiting, { on: 'usage', until: null, why: 'usage not known' });
  await Q.setCeilings({ week: 90 });
  env.usage = { ...okUsage, week: { percent: 80, resetsAt: null } };
  assert.equal((await Q.tick()).length, 1, 'under his raised ceiling it reads');
  await assert.rejects(Q.setCeilings({ session: 0 }), /percent/);
  await Q.runUntilIdle();
  assert.equal((await Q.queueStatus()).people[0].doing, 'done');
});

test('rule 5: nothing starts while a conversation turn is in flight; a piece waits for him, then carries on after 10 minutes', async () => {
  await person();
  await R.upsertSources([vid('a')]);
  env.busy = () => true;
  assert.deepEqual(await Q.tick(), []);
  // the real busy test reads the claudeCode and coachPlan job maps
  Q._setQueueDepsForTest(null);
  const coach = J.registerJobMap('coachPlan', new Map([['j1', { status: 'running' }]]));
  const realBusy = await (await import('../lib/mentorQueue.js')).tick();
  assert.deepEqual(realBusy, [], 'a Coach plan in flight holds the queue');
  coach.clear();
  install();
  let polls = 0;
  env.busy = () => { polls += 1; return polls < 4; };
  const t0 = clock;
  await Q.yieldToHim();
  assert.equal(clock - t0, 15_000, 'polled every 5 s until he was done');
  env.busy = () => true;
  const t1 = clock;
  await Q.yieldToHim();
  assert.equal(clock - t1, 600_000, 'gave up waiting after 10 minutes');
  // and the transcript's pieces are handed this same wait
  env.busy = () => false;
  env.yield = true;
  await Q.runUntilIdle();
  assert.equal((await R.getSource('yt:a')).stage, 'transcript');
});

test('rule 6: reads are on the job registry, transcripts are not, and a reload waiting drains the queue for 90 s', async () => {
  await person();
  await R.upsertSources([vid('a', { publishedAt: day(1) }), vid('b', { publishedAt: day(2) })]);
  env.hold['yt:a'] = deferred();
  await Q.tick();
  assert.equal(J.activeJobs().byLane.mentors, undefined, 'a transcript does not block a reload');
  env.hold['yt:a'].resolve();
  await Q.runUntilIdle();
  await Q.allowReading('fisher');
  env.hold['read:yt:a'] = deferred();
  env.hold['read:yt:b'] = deferred();
  await Q.tick();
  assert.equal(J.activeJobs().byLane.mentors, 2, 'a read in flight is active work');
  env.hold['read:yt:a'].resolve(); env.hold['read:yt:b'].resolve();
  await Q.runUntilIdle();
  assert.equal(J.activeJobs().byLane.mentors, undefined);

  await R.upsertSources([vid('c', { publishedAt: day(0) })]);
  Q.noteReloadWaiting();
  assert.deepEqual(await Q.tick(), [], 'nothing new while a reload waits');
  clock += 89_000;
  assert.deepEqual(await Q.tick(), []);
  clock += 2_000;
  assert.equal((await Q.tick())[0].key, 'yt:c');
});

test('rule 7: a refusal waits six hours, three in a row stop YouTube for six hours (podcast audio carries on), a success resets', async () => {
  await person();
  await R.upsertSources([
    vid('r1', { publishedAt: day(1) }), vid('r2', { publishedAt: day(2) }), vid('r3', { publishedAt: day(3) }), vid('r4', { publishedAt: day(4) }),
    vid('pod', { publishedAt: day(5), audio: { url: 'https://pod.example/e.mp3' } }),
  ]);
  for (const k of ['r1', 'r2', 'r3', 'r4']) env.fail[`yt:${k}`] = { kind: 'refused', message: `YouTube refused the audio of Video ${k}: ERROR: HTTP Error 429` };
  await Q.runUntilIdle();
  const r1 = await R.getSource('yt:r1');
  assert.equal(r1.hold.state, 'refused');
  assert.equal(r1.hold.retryAt, new Date(NOW + 6 * 3600_000).toISOString());
  assert.equal(r1.working, null);
  const st = JSON.parse(fs.readFileSync(path.join(dir, 'mentors', 'queue.json'), 'utf8'));
  assert.equal(st.youtubeBlockedUntil, new Date(NOW + 6 * 3600_000).toISOString());
  assert.equal((await R.getSource('yt:r4')).hold, null, 'after the third refusal no YouTube download was tried');
  assert.equal((await R.getSource('yt:pod')).stage, 'transcript', 'podcast audio carried on');
  assert.equal(st.refusals, 0, 'the podcast success reset the count');
  assert.equal((await Q.queueStatus()).youtubeBlockedUntil, st.youtubeBlockedUntil);
  // six hours on, the refused ones come round again
  clock += 6 * 3600_000 + 1;
  for (const k of ['r1', 'r2', 'r3', 'r4']) delete env.fail[`yt:${k}`];
  await Q.runUntilIdle();
  assert.equal((await R.getSource('yt:r4')).stage, 'transcript');
});

test('rule 7: unavailable is skipped for good; failed retries in an hour and stays failed after three until he retries', async () => {
  await person();
  await R.upsertSources([vid('gone', { publishedAt: day(1) }), vid('flaky', { publishedAt: day(2) })]);
  env.fail['yt:gone'] = { kind: 'unavailable', message: 'YouTube will not serve Video gone: ERROR: Private video' };
  env.fail['yt:flaky'] = { kind: 'failed', message: 'ffmpeg could not cut Video flaky into pieces: x' };
  await Q.runUntilIdle();
  const gone = await R.getSource('yt:gone');
  assert.equal(gone.hold.state, 'skipped');
  assert.match(gone.hold.why, /Private video/);
  let flaky = await R.getSource('yt:flaky');
  assert.equal(flaky.hold.state, 'failed');
  assert.equal(flaky.hold.retryAt, new Date(NOW + 3600_000).toISOString());
  for (let i = 0; i < 2; i++) { clock += 3600_001; await Q.runUntilIdle(); }
  flaky = await R.getSource('yt:flaky');
  assert.equal(flaky.hold.retryAt, null, 'three failures: it waits for him');
  clock += 10 * 3600_000;
  assert.deepEqual(await Q.tick(), []);
  clock += 48 * 3600_000;
  assert.deepEqual(await Q.tick(), [], 'never retried on its own');
  delete env.fail['yt:flaky'];
  await Q.retrySource('yt:flaky');
  assert.equal((await R.getSource('yt:flaky')).hold, null);
  await Q.runUntilIdle();
  assert.equal((await R.getSource('yt:flaky')).stage, 'transcript');
  assert.equal((await R.getSource('yt:gone')).stage, 'found', 'the skipped one stays skipped');
});

test('rule 8: after a restart nothing is in flight, and a transcript already on disk is adopted, not fetched', async () => {
  await person();
  await R.upsertSources([vid('half', { publishedAt: day(1) })]);
  await R.setWorking('yt:half', 'transcript');
  const file = T.transcriptPathFor('yt:half');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '[00:00] already transcribed before the restart');
  assert.equal(await R.resetWorking(), 1);
  const got = await Q.tick();
  assert.equal(got[0].what, 'adopt');
  assert.equal(log.filter((l) => l.startsWith('transcript')).length, 0, 'not fetched again');
  const s = await R.getSource('yt:half');
  assert.equal(s.stage, 'transcript');
  assert.equal(s.transcript.path, 'mentors/transcripts/yt_half.txt');
  assert.equal(s.transcript.timed, true);
});

test('rule 9: no transcription on battery; the status says so', async () => {
  await person();
  await R.upsertSources([vid('a')]);
  env.battery = true;
  assert.deepEqual(await Q.tick(), []);
  env.battery = false;
  assert.equal((await Q.tick())[0].what, 'transcript');
});

test('pause, a paused person, and the status shape', async () => {
  await person();
  await R.upsertSources([vid('a')]);
  await Q.pauseQueue(true);
  assert.deepEqual(await Q.tick(), []);
  let st = await Q.queueStatus();
  assert.equal(st.paused, true);
  assert.equal(st.people[0].doing, 'paused');
  await Q.pauseQueue(false);
  env.hold['yt:a'] = deferred();
  await Q.tick();
  st = await Q.queueStatus();
  assert.equal(st.people[0].doing, 'transcript');
  assert.equal(st.people[0].item.key, 'yt:a');
  assert.equal(st.people[0].item.title, 'Video a');
  assert.equal(st.people[0].counts.total, 1);
  env.hold['yt:a'].resolve();
  await Q.runUntilIdle();
  await P.setStatus('fisher', 'paused');
  await R.upsertSources([vid('b')]);
  assert.deepEqual(await Q.tick(), [], 'a paused person is not worked on');
  assert.equal((await Q.queueStatus()).people[0].doing, 'paused');
});

/* ------------------------------ weaves (part 3) ----------------------------- */

let weaves;
function installWeave() {
  install();
  weaves = [];
  const base = deps();
  Q._setQueueDepsForTest({
    ...base,
    weaveBatch: async (personId, keys, opts) => {
      const w = { personId, keys, opts, gate: deferred() };
      weaves.push(w);
      log.push(`weave ${personId} ${keys.length}`);
      if (env.fail[`weave:${personId}`]) throw new Error(env.fail[`weave:${personId}`]);
      if (env.holdWeave) await w.gate.promise;
      for (const k of keys) await R.setStage(k, 'woven', { woven: { version: 'weave-v2', batchId: 'b' } });
      return { batchId: 'b', costUsd: 0.2, model: 'sonnet' };
    },
  });
  Q._setVaultPathForTests('/nonexistent/vault-for-tests');
}
// the deps install() just set, so a weave stand-in can be added beside them
let lastDeps = null;
function deps() { return lastDeps; }

async function readSources(ids, personId = 'fisher') {
  await R.upsertSources(ids.map((id) => vid(id, { people: [{ id: personId, role: 'host' }] })));
  for (const id of ids) await R.setStage(`yt:${id}`, 'read', { read: { version: 'read-v1' } });
}

test('weave: none before his go; with it, fewer than ten start once nothing is left to read, registered and marked', async () => {
  await person({ repeatsCheckedAt: day(1) });
  await readSources(['a', 'b', 'c']);
  installWeave();
  assert.deepEqual((await Q.tick()).filter((x) => x.what === 'weave'), [], 'no go, no weave');
  await Q.allowReading('fisher');
  env.holdWeave = true;
  const got = await Q.tick();
  assert.deepEqual(got.map((x) => x.what), ['weave']);
  assert.equal(weaves[0].keys.length, 3);
  assert.equal(weaves[0].opts.vaultPath, '/nonexistent/vault-for-tests');
  assert.equal((await R.getSource('yt:a')).working, 'weave');
  assert.equal(J.activeJobs().byLane.mentorWeave, 1, 'a weave cut off by a reload wastes money: it is registered');
  assert.equal((await Q.queueStatus()).people[0].doing, 'weaving');
  assert.ok(log.includes('usage'), 'the meter is read before a weave');
  weaves[0].gate.resolve();
  await Q.runUntilIdle();
  assert.equal((await R.getSource('yt:a')).stage, 'woven');
  assert.equal(J.activeJobs().byLane.mentorWeave, undefined);
});

test('weave: fewer than ten wait while he still has something to read; ten go at once', async () => {
  await person({ repeatsCheckedAt: day(1) });
  await readSources(['a', 'b', 'c']);
  await R.upsertSources([vid('t')]);
  await R.setStage('yt:t', 'transcript', {});
  installWeave();
  await Q.allowReading('fisher');
  env.hold['read:yt:t'] = deferred();
  assert.deepEqual((await Q.tick()).map((x) => x.what), ['read'], 'reads, but three wait for the rest');
  assert.equal(weaves.length, 0);
  await readSources(Array.from({ length: 7 }, (_, i) => `r${i}`));
  const got = await Q.tick();
  assert.deepEqual(got.map((x) => x.what), ['weave']);
  assert.equal(weaves[0].keys.length, 10);
  env.hold['read:yt:t'].resolve();
  await Q.runUntilIdle();
});

test('weave: not over his ceilings, not when the meter cannot be read, not during a reload drain', async () => {
  await person({ repeatsCheckedAt: day(1) });
  await readSources(['a']);
  installWeave();
  await Q.allowReading('fisher');
  env.usage = { session: { percent: 61 }, week: { percent: 10 } };
  assert.deepEqual(await Q.tick(), []);
  env.usage = null;
  assert.deepEqual(await Q.tick(), []);
  env.usage = okUsage;
  Q.noteReloadWaiting();
  assert.deepEqual(await Q.tick(), []);
  clock += 91_000;
  assert.deepEqual((await Q.tick()).map((x) => x.what), ['weave']);
  await Q.runUntilIdle();
});

test('weave: one at a time across everyone; a failure frees the sources and waits an hour', async () => {
  await person({ repeatsCheckedAt: day(1) });
  await P.savePerson({ id: 'hormozi', name: 'Hormozi', status: 'following', scope: 'everything', followedAt: day(30), repeatsCheckedAt: day(1) });
  await readSources(['a']);
  await readSources(['h'], 'hormozi');
  installWeave();
  await Q.allowReading('fisher');
  await Q.allowReading('hormozi');
  env.holdWeave = true;
  assert.equal((await Q.tick()).filter((x) => x.what === 'weave').length, 1);
  assert.deepEqual(await Q.tick(), [], 'never two weaves at once');
  env.holdWeave = false;
  weaves[0].gate.resolve();
  await Q.runUntilIdle();
  assert.equal(weaves.length, 2, 'the other person after');

  await readSources(['b']);
  env.fail['weave:fisher'] = 'the weave\'s sort step failed its checks twice';
  await Q.runUntilIdle();
  assert.equal((await R.getSource('yt:b')).working, null);
  assert.equal((await R.getSource('yt:b')).stage, 'read');
  const n = weaves.length;
  assert.deepEqual(await Q.tick(), [], 'an hour before it is tried again');
  clock += 3600_000 + 1;
  delete env.fail['weave:fisher'];
  await Q.runUntilIdle();
  assert.equal(weaves.length, n + 1);
  assert.equal((await R.getSource('yt:b')).stage, 'woven');
});
