import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listSources, getSource, setStage, setWorking, setHold, clearHold, resetWorking, countsFor, patchSource,
} from './mentorRegister.js';
import { listPeople, getPerson, savePerson } from './mentorPeople.js';
import { getTranscript, transcriptPathFor } from './mentorTranscripts.js';
import { signature, saveSignature, loadSignature, findRepeats, containment, REPEAT_SHARE } from './mentorRepeats.js';
import { readSource, READ_VERSION } from './mentorRead.js';
import { weaveBatch, recoverPendingWeaves, getBook, weaving, MAX_KEYS as WEAVE_MAX } from './mentorWeave.js';
import { ensureQuestions, itemsNeedingQuestions, writeBrief, startResearch, recoverResearch } from './mentorAsk.js';
import { readClaudeUsage } from './claudeUsage.js';
import { registerJobMap } from './jobRegistry.js';

// THE MENTORS QUEUE (part 2, 21 Nov 2026): the register worked down, one
// source at a time, durably, for days or weeks.
//
// Two kinds of work, priced very differently:
//   transcripts  free (audio transcribed on this Mac), ONE at a time because
//                the Mac is the bottleneck; not registered with jobRegistry,
//                because a restart only loses the current episode's Mac time
//                and resetWorking() on boot puts it back;
//   reads        his Claude usage, TWO at a time at most, and only after HE
//                said go for that person, and only while the meter is under
//                his ceilings (60% of the session, 75% of the week) and can
//                be read at all. Registered with jobRegistry: a read cut off
//                by a reload is money spent for nothing.
//   weaves       (part 3) the read sources of one person into the vault, ONE
//                weave at a time across everyone, up to ten sources a batch;
//                a batch starts when ten are waiting, or fewer when he has
//                nothing left to read. The same go and the same ceilings as
//                reading, registered with jobRegistry for the same reason.
// It yields to him (nothing starts while a Coach, Ask or Code turn is in
// flight), it respects a refusal from YouTube (the item waits; three in a row
// and no YouTube download is tried for six hours), it does no transcription
// on battery, and it never blocks a server reload (for 90 s after
// scripts/reload-server.mjs asks, nothing new starts, so it drains).
//
// State that is not the register's lives in dataRoot()/mentors/queue.json,
// with the bookCovers.js store idiom. Everything outside the process comes
// through `deps`, so the tests run on fake time with no tools at all.

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const queuePath = () => path.join(dataRoot(), 'mentors', 'queue.json');

export const TICK_MS = 2 * 60_000;
export const MAX_READS = 2;
export const NARROW_TOP = 60;
const YEAR_MS = 365 * 24 * 3600_000;
const DAY_MS = 24 * 3600_000;
const REFUSED_WAIT_MS = 6 * 3600_000;
const FAILED_WAIT_MS = 3600_000;
const MAX_FAILS = 3;
const RELOAD_QUIET_MS = 90_000;
const YIELD_POLL_MS = 5_000;
const YIELD_MAX_MS = 10 * 60_000;
const LOG_MAX = 200;
export const BRIEF_RECENT_DAYS = 7; // a video is "new" in News for a week: the full frame with its takeaways; after that it is a compact row
const BRIEFS_AT_START = 3;
const QUESTIONS_RETRY_MS = 3600_000;

/* ---------------------------------- deps ----------------------------------- */

let deps = null;
export function _setQueueDepsForTest(d) { deps = d || null; }
const D = () => ({
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  busy: async () => {
    const { activeJobs } = await import('./jobRegistry.js');
    const { byLane } = activeJobs();
    return (byLane.claudeCode || 0) + (byLane.coachPlan || 0) > 0;
  },
  // `pmset -g batt` says "Battery Power" when unplugged; a failed read is
  // "not on battery" (a desktop Mac has no battery line at all)
  onBattery: () => new Promise((resolve) => {
    execFile('/usr/bin/pmset', ['-g', 'batt'], { timeout: 5_000 }, (err, stdout) => resolve(!err && /Battery Power/.test(String(stdout))));
  }),
  readClaudeUsage: () => readClaudeUsage(),
  weaveBatch: (personId, keys, opts) => weaveBatch(personId, keys, opts),
  getTranscript: (source, opts) => getTranscript(source, opts),
  readSource: (source, text, opts) => readSource(source, text, opts),
  ensureQuestions: (personId) => ensureQuestions(personId),
  writeBrief: (key) => writeBrief(key),
  ...(deps || {}),
});

/* ---------------------------------- scope ---------------------------------- */

/**
 * The sources a person's scope covers (pure; the preview's narrow price and
 * the queue use this same function). Tier 1 only. `everything` is all of
 * them, `none` nothing, `narrow` the 60 most viewed plus everything published
 * in the last 12 months plus anything found more than a day after he
 * followed. A null `views` or `publishedAt` simply does not match its test.
 */
export function inScope(sources, { scope = 'everything', followedAt = null, now = Date.now() } = {}) {
  const tier1 = (sources || []).filter((s) => s && (s.tier == null || s.tier === 1));
  if (scope === 'none') return [];
  if (scope !== 'narrow') return tier1;
  const keyOf = (s) => s.key || s.id;
  const top = new Set(tier1.filter((s) => typeof s.views === 'number')
    .sort((a, b) => b.views - a.views || (String(keyOf(a)) < String(keyOf(b)) ? -1 : 1))
    .slice(0, NARROW_TOP).map(keyOf));
  const t = typeof now === 'number' ? now : new Date(now).getTime();
  const followed = followedAt ? new Date(followedAt).getTime() : null;
  return tier1.filter((s) => top.has(keyOf(s))
    || (s.publishedAt && t - new Date(s.publishedAt).getTime() <= YEAR_MS)
    || (followed !== null && s.foundAt && new Date(s.foundAt).getTime() - followed > DAY_MS));
}

// newest first, undated last in the order they were listed
function newestFirst(list) {
  const dated = list.filter((s) => s.publishedAt).sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
  return [...dated, ...list.filter((s) => !s.publishedAt)];
}

/* ---------------------------------- store ---------------------------------- */

const emptyState = () => ({
  version: 1, paused: false, youtubeBlockedUntil: null, refusals: 0,
  ceilings: { session: 60, week: 75 }, readingAllowed: {}, failures: {}, weaveFailures: {}, log: [],
});

let state = null;
let loading = null;
let writing = Promise.resolve();
let tmpCounter = 0;

async function readState() {
  let text;
  try { text = await readFile(queuePath(), 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return emptyState();
    await moveAside();
    return emptyState();
  }
  try {
    const o = JSON.parse(text);
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      const base = emptyState();
      return { ...base, ...o, ceilings: { ...base.ceilings, ...(o.ceilings || {}) }, readingAllowed: o.readingAllowed || {}, failures: o.failures || {}, weaveFailures: o.weaveFailures || {}, log: Array.isArray(o.log) ? o.log : [] };
    }
  } catch { /* falls through */ }
  await moveAside();
  return emptyState();
}

async function moveAside() {
  try { await rename(queuePath(), `${queuePath()}.corrupt-${Date.now()}`); } catch { /* already gone */ }
}

function load() {
  if (state) return Promise.resolve(state);
  if (!loading) loading = readState().then((s) => { state = s; return s; }).finally(() => { loading = null; });
  return loading;
}

function persist() {
  const job = writing.then(async () => {
    await mkdir(path.dirname(queuePath()), { recursive: true });
    const tmp = `${queuePath()}.${process.pid}.${Date.now()}.${tmpCounter++}.tmp`;
    await writeFile(tmp, JSON.stringify(state), 'utf8');
    await rename(tmp, queuePath());
  });
  writing = job.then(() => {}, () => {});
  return job;
}

async function log(personId, key, what, detail = null) {
  const s = await load();
  s.log.push({ at: new Date(D().now()).toISOString(), personId, key, what, detail: detail ? String(detail).slice(0, 300) : null });
  if (s.log.length > LOG_MAX) s.log = s.log.slice(-LOG_MAX);
  await persist();
}

/* ------------------------------ in flight now ------------------------------ */

let transcribing = null;           // { key, personId, title, startedAt, promise }
const readJobs = registerJobMap('mentors', new Map()); // key -> { status, personId, title, startedAt, promise }
const weaveJobs = registerJobMap('mentorWeave', new Map()); // personId -> { status, personId, keys, startedAt, promise }
// News (25 Nov 2026): a "Brief me" he asked for, key -> { status, key, phase, promise },
// and the questions of a person's raised items, personId -> { status, promise }
const briefJobs = registerJobMap('mentorBrief', new Map());
const questionJobs = registerJobMap('mentorQuestions', new Map());
const questionTried = new Map(); // personId -> when a call last left gaps or failed
// set by startMentorQueue; a no-op in tests and scripts that drive tick() themselves
let kick = () => {};
let reloadQuietUntil = 0;
let lastUsage = null;
let vaultPathNow = null;

export function _resetQueueForTests() {
  state = null; loading = null; writing = Promise.resolve();
  transcribing = null; readJobs.clear(); weaveJobs.clear(); briefJobs.clear(); questionJobs.clear(); questionTried.clear();
  reloadQuietUntil = 0; lastUsage = null; vaultPathNow = null;
}

/** scripts/reload-server.mjs is waiting: for 90 s nothing new starts, so the
 *  reads in flight finish and the active count reaches zero. */
export function noteReloadWaiting() {
  reloadQuietUntil = D().now() + RELOAD_QUIET_MS;
}

const readsInFlight = () => [...readJobs.values()].filter((j) => j.status === 'running').length;
const weaveInFlight = () => [...weaveJobs.values()].find((j) => j.status === 'running') || null;

/** Resolves when no conversation turn is in flight: polls every 5 s, and
 *  after 10 minutes carries on (a stuck job must not stop the queue for good). */
export async function yieldToHim() {
  const d = D();
  const until = d.now() + YIELD_MAX_MS;
  while (await d.busy()) {
    if (d.now() >= until) return;
    await d.sleep(YIELD_POLL_MS);
  }
}

/* ------------------------------- his controls ------------------------------ */

export async function allowReading(personId, allowed = true) {
  const s = await load();
  if (allowed) s.readingAllowed[personId] = true;
  else delete s.readingAllowed[personId];
  await persist();
  return !!s.readingAllowed[personId];
}

export async function setCeilings({ session, week } = {}) {
  const ok = (v) => v === undefined || (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 100);
  if (!ok(session) || !ok(week)) throw new Error('a ceiling is a percent above 0 and at most 100');
  const s = await load();
  if (session !== undefined) s.ceilings.session = session;
  if (week !== undefined) s.ceilings.week = week;
  await persist();
  return { ...s.ceilings };
}

export async function pauseQueue(paused) {
  const s = await load();
  s.paused = !!paused;
  await persist();
  return s.paused;
}

export async function retrySource(key) {
  const src = await getSource(key);
  if (!src) throw new Error(`no source with key "${key}"`);
  const s = await load();
  delete s.failures[key];
  await persist();
  await clearHold(key);
  return getSource(key);
}

/* --------------------------------- choosing -------------------------------- */

const isYoutubeRoute = (src) => src.key.startsWith('yt:') && !src.audio?.url && src.transcript?.source !== 'vault';

// A hold that is over: a refusal or a failure whose retry time has passed
// (a source failed three times stays failed until he retries it).
function holdLifted(src, s, now) {
  if (!src.hold) return true;
  if (!['refused', 'failed'].includes(src.hold.state)) return false;
  if (src.hold.state === 'failed' && (s.failures[src.key] || 0) >= MAX_FAILS) return false;
  return !!src.hold.retryAt && new Date(src.hold.retryAt).getTime() <= now;
}

async function personWork(person, s, now) {
  const all = await listSources({ personId: person.id, tier: 1 });
  const scoped = inScope(all, { scope: person.scope || 'everything', followedAt: person.followedAt, now });
  const needTranscript = newestFirst(scoped.filter((x) => x.stage === 'found' && !x.working && holdLifted(x, s, now)));
  const needRead = newestFirst(scoped.filter((x) => x.stage === 'transcript' && !x.working && !x.hold));
  return { all, scoped, needTranscript, needRead };
}

async function following() {
  return (await listPeople()).filter((p) => p.status === 'following');
}

/* --------------------------------- the work -------------------------------- */

function relPath(abs) {
  const rel = path.relative(dataRoot(), abs);
  return rel.startsWith('..') ? abs : rel.split(path.sep).join('/');
}

// A transcript that just landed, checked on its own against the rest of the
// person's catalogue, once that person's first repeats pass has run.
async function checkOneRepeat(person, key, sig) {
  if (!person.repeatsCheckedAt || !sig.length) return;
  const others = (await listSources({ personId: person.id, tier: 1 })).filter((x) => x.key !== key && x.hold?.state !== 'duplicate');
  const union = new Set();
  const titles = [];
  for (const o of others) {
    const os = await loadSignature(o.key);
    if (!os?.length) continue;
    const set = new Set(os);
    const n = containment(sig, set);
    if (n > 0) titles.push({ title: o.title, n });
    for (const h of os) union.add(h);
  }
  const share = containment(sig, union);
  if (share < REPEAT_SHARE) return;
  const of = titles.sort((a, b) => b.n - a.n).slice(0, 3).map((t) => t.title);
  await setHold(key, { state: 'duplicate', why: `the same words as ${of.join(', ')}` });
  await log(person.id, key, 'repeat', `${Math.round(share * 100)}% already in ${of.join(', ')}`);
}

async function landTranscript(person, src, got) {
  const d = D();
  await setStage(src.key, 'transcript', {
    transcript: { source: got.source, path: relPath(got.path), chars: got.chars, timed: !!got.timed, at: new Date(d.now()).toISOString() },
  });
  const text = await readFile(got.path, 'utf8');
  const sig = signature(text);
  await saveSignature(src.key, sig);
  await checkOneRepeat(await getPerson(person.id), src.key, sig);
}

async function runTranscript(person, src) {
  const d = D();
  const s = await load();
  try {
    const got = await d.getTranscript(src, { vaultPath: vaultPathNow, yieldToHim });
    await landTranscript(person, src, got);
    s.refusals = 0;
    delete s.failures[src.key];
    await persist();
    await log(person.id, src.key, 'transcript', `${got.source}, ${got.chars} characters${got.sttSec ? `, ${got.sttSec} s on this Mac` : ''}`);
    return { ok: true, why: null };
  } catch (e) {
    const now = d.now();
    const kind = e?.kind || 'failed';
    const why = e?.message || 'it failed and gave no reason';
    try {
      if (kind === 'refused') {
        s.refusals = (s.refusals || 0) + 1;
        await setHold(src.key, { state: 'refused', why, retryAt: new Date(now + REFUSED_WAIT_MS).toISOString() });
        if (s.refusals >= 3) s.youtubeBlockedUntil = new Date(now + REFUSED_WAIT_MS).toISOString();
        await persist();
        await log(person.id, src.key, 'refused', why);
      } else if (kind === 'unavailable') {
        await setHold(src.key, { state: 'skipped', why });
        await log(person.id, src.key, 'skipped', why);
      } else {
        s.failures[src.key] = (s.failures[src.key] || 0) + 1;
        const stays = s.failures[src.key] >= MAX_FAILS;
        await setHold(src.key, { state: 'failed', why, retryAt: stays ? null : new Date(now + FAILED_WAIT_MS).toISOString() });
        await persist();
        await log(person.id, src.key, 'failed', stays ? `${why} (failed ${MAX_FAILS} times; it waits for his retry)` : why);
      }
      await setWorking(src.key, null);
    } catch (e2) { console.error(`mentor queue: could not record the failure of ${src.key}: ${e2.message}`); }
    return { ok: false, why };
  }
}

async function runRead(person, src, { brief = true } = {}) {
  const d = D();
  const s = await load();
  const job = readJobs.get(src.key);
  try {
    const text = await readFile(transcriptPathFor(src.key), 'utf8');
    const r = await d.readSource(src, text);
    await setStage(src.key, 'read', {
      read: { version: READ_VERSION, at: new Date(d.now()).toISOString(), model: r.model, costUsd: r.costUsd, notesPath: relPath(r.notesPath), ideas: r.counts.ideas, scripts: r.counts.scripts, lines: r.counts.lines },
    });
    delete s.failures[src.key];
    await persist();
    await log(person.id, src.key, 'read', `$${r.costUsd} on ${r.model}, ${r.counts.ideas} ideas, ${r.counts.verifiedLines} of ${r.counts.lines} lines word for word`);
    if (job) job.status = 'done';
    // a video published in the last 7 days is briefed right after its read;
    // a failure is logged and never fails the read
    if (brief && recent(src, d.now()) && r.jsonPath && existsSync(r.jsonPath) && !briefJobs.has(src.key)) await autoBrief(person.id, src.key);
    return { ok: true, why: null };
  } catch (e) {
    if (job) job.status = 'failed';
    const why = e?.message || 'it failed and gave no reason';
    try {
      if (e?.limited || e?.laneOff) {
        // his plan's limit or the lane switched off: nothing is wrong with the source
        await setWorking(src.key, null);
        await log(person.id, src.key, 'waiting', why);
      } else {
        s.failures[src.key] = (s.failures[src.key] || 0) + 1;
        const stays = s.failures[src.key] >= MAX_FAILS;
        await setHold(src.key, { state: 'failed', why, retryAt: stays ? null : new Date(d.now() + FAILED_WAIT_MS).toISOString() });
        await setWorking(src.key, null);
        await persist();
        await log(person.id, src.key, 'failed', why);
      }
    } catch (e2) { console.error(`mentor queue: could not record the failed read of ${src.key}: ${e2.message}`); }
    return { ok: false, why };
  } finally {
    readJobs.delete(src.key);
  }
}

async function runWeave(person, keys) {
  const d = D();
  const s = await load();
  const job = weaveJobs.get(person.id);
  try {
    const rec = await d.weaveBatch(person.id, keys, { vaultPath: vaultPathNow });
    delete s.weaveFailures[person.id];
    await persist();
    await log(person.id, null, 'woven', `${keys.length} source${keys.length === 1 ? '' : 's'}, $${rec.costUsd} on ${rec.model}, batch ${rec.batchId}`);
    if (job) job.status = 'done';
    // the new raised items get their questions; started once the weave has
    // let go of the Book, and a failure never fails the batch
    weaveJobs.delete(person.id);
    startQuestions(person.id, 'after the weave');
  } catch (e) {
    if (job) job.status = 'failed';
    const why = e?.message || 'it failed and gave no reason';
    try {
      for (const k of keys) {
        const cur = await getSource(k);
        if (cur?.working === 'weave') await setWorking(k, null);
      }
      if (e?.limited || e?.laneOff) await log(person.id, null, 'waiting', why);
      else {
        const f = s.weaveFailures[person.id] || { n: 0 };
        s.weaveFailures[person.id] = { n: f.n + 1, at: new Date(d.now()).toISOString(), why: why.slice(0, 300) };
        await persist();
        await log(person.id, null, 'weave failed', s.weaveFailures[person.id].n >= MAX_FAILS ? `${why} (failed ${MAX_FAILS} times; it waits for his retry)` : why);
      }
    } catch (e2) { console.error(`mentor queue: could not record the failed weave for ${person.id}: ${e2.message}`); }
  } finally {
    weaveJobs.delete(person.id);
  }
}

/** A person's weave that failed three times waits for this. */
export async function retryWeave(personId) {
  const s = await load();
  delete s.weaveFailures[personId];
  await persist();
}

// what a person has waiting to be woven, when a batch may start now: ten
// waiting, or fewer when nothing of his is left to transcribe or read
function weaveReady(person, work) {
  const waiting = newestFirst(work.scoped.filter((x) => x.stage === 'read' && !x.hold && !x.working));
  if (!waiting.length) return null;
  const readingNow = [...readJobs.values()].some((j) => j.personId === person.id && j.status === 'running')
    || (transcribing && transcribing.personId === person.id);
  const left = work.needTranscript.length || work.needRead.length || readingNow || !person.repeatsCheckedAt;
  if (waiting.length < WEAVE_MAX && left) return null;
  return waiting.slice(0, WEAVE_MAX);
}

// rule 3: once a person has no transcript work left, one pass over every
// tier 1 source of his with a signature, longest first
async function runRepeats(person) {
  const all = await listSources({ personId: person.id, tier: 1 });
  const items = [];
  for (const x of all) {
    const sig = await loadSignature(x.key);
    if (sig?.length) items.push({ key: x.key, durationSec: x.durationSec, sig });
  }
  const titleOf = new Map(all.map((x) => [x.key, x.title]));
  const found = findRepeats(items);
  for (const r of found) {
    await setHold(r.key, { state: 'duplicate', why: `the same words as ${r.of.map((k) => titleOf.get(k) || k).join(', ')}` });
    await log(person.id, r.key, 'repeat', `${Math.round(r.share * 100)}% already in ${r.of.join(', ')}`);
  }
  await savePerson({ id: person.id, repeatsCheckedAt: new Date(D().now()).toISOString() });
  return found.length;
}

// rule 4: the meter, read before each read; null means do not read
function usageBlock(usage, ceilings) {
  if (!usage || (!usage.session && !usage.week)) return { on: 'usage', until: null, why: 'usage not known' };
  if (usage.session && typeof usage.session.percent === 'number' && usage.session.percent >= ceilings.session) {
    return { on: 'usage', until: usage.session.resetsAt || null, why: `the session is at ${usage.session.percent}% (his ceiling ${ceilings.session}%)` };
  }
  if (usage.week && typeof usage.week.percent === 'number' && usage.week.percent >= ceilings.week) {
    return { on: 'usage', until: usage.week.resetsAt || null, why: `the week is at ${usage.week.percent}% (his ceiling ${ceilings.week}%)` };
  }
  return null;
}

/* --------------------------------- the tick -------------------------------- */

/** One pass: starts what may start now and returns it; never waits for the
 *  work itself to finish. */
export async function tick() {
  const d = D();
  const s = await load();
  const started = [];
  const now = d.now();
  if (s.paused || now < reloadQuietUntil) return started;
  if (await d.busy()) return started;
  const people = await following();

  // transcripts: one at a time across everyone
  if (!transcribing && !(await d.onBattery())) {
    const ytBlocked = s.youtubeBlockedUntil && new Date(s.youtubeBlockedUntil).getTime() > now;
    outer: for (const person of people) {
      const { needTranscript } = await personWork(person, s, now);
      for (const src of needTranscript) {
        // after a restart: a transcript already on disk is adopted, not fetched
        if (existsSync(transcriptPathFor(src.key))) {
          const text = await readFile(transcriptPathFor(src.key), 'utf8');
          await landTranscript(person, src, { source: src.transcript?.source || (src.audio?.url ? 'podcast-audio' : src.key.startsWith('yt:') ? 'youtube-audio' : 'vault'), path: transcriptPathFor(src.key), chars: text.length, timed: /^\[\d{1,3}:\d{2}/m.test(text) });
          await log(person.id, src.key, 'transcript', 'adopted the transcript already on disk');
          started.push({ what: 'adopt', key: src.key, personId: person.id });
          continue;
        }
        if (ytBlocked && isYoutubeRoute(src)) continue;
        if (transcribing) break outer; // a "Brief me" took the Mac while this pass looked
        if (src.hold) await clearHold(src.key);
        await setWorking(src.key, 'transcript');
        const job = { key: src.key, personId: person.id, title: src.title, startedAt: new Date(now).toISOString() };
        job.promise = runTranscript(person, src).finally(() => { if (transcribing === job) transcribing = null; kick(); });
        transcribing = job;
        started.push({ what: 'transcript', key: src.key, personId: person.id });
        break outer;
      }
    }
  }

  // repeats, then reads
  for (const person of people) {
    const fresh = await getPerson(person.id);
    const work = await personWork(fresh, s, now);
    const transcriptLeft = work.needTranscript.length || (transcribing && transcribing.personId === person.id);
    if (transcriptLeft) continue;
    // nothing transcribed yet (scope none, or everything held): nothing to compare
    if (!fresh.repeatsCheckedAt && !work.scoped.some((x) => x.stage !== 'found')) continue;
    if (!fresh.repeatsCheckedAt) {
      const n = await runRepeats(fresh);
      started.push({ what: 'repeats', personId: person.id, held: n });
      continue;
    }
    if (!s.readingAllowed[person.id]) continue;
    const candidates = (await personWork(fresh, s, now)).needRead.filter((x) => !readJobs.has(x.key));
    for (const src of candidates) {
      if (readsInFlight() >= MAX_READS) break;
      lastUsage = await d.readClaudeUsage();
      if (usageBlock(lastUsage, s.ceilings)) break;
      if (readJobs.has(src.key)) continue; // a "Brief me" is reading it already
      const job = { status: 'running', personId: person.id, key: src.key, title: src.title, startedAt: new Date(now).toISOString() };
      readJobs.set(src.key, job);
      await setWorking(src.key, 'read');
      job.promise = runRead(person, src).finally(() => kick());
      started.push({ what: 'read', key: src.key, personId: person.id });
    }
  }

  // weaves: one at a time across everyone, after his go, under his ceilings
  if (!weaveInFlight() && vaultPathNow) {
    for (const person of people) {
      if (!s.readingAllowed[person.id]) continue;
      const wf = s.weaveFailures[person.id];
      if (wf && (wf.n >= MAX_FAILS || now - new Date(wf.at).getTime() < FAILED_WAIT_MS)) continue;
      const fresh = await getPerson(person.id);
      const batch = weaveReady(fresh, await personWork(fresh, s, now));
      if (!batch) continue;
      lastUsage = await d.readClaudeUsage();
      if (usageBlock(lastUsage, s.ceilings)) break;
      const keys = batch.map((x) => x.key);
      for (const k of keys) await setWorking(k, 'weave');
      const job = { status: 'running', personId: person.id, keys, title: `${keys.length} source${keys.length === 1 ? '' : 's'}`, key: keys[0], startedAt: new Date(now).toISOString() };
      weaveJobs.set(person.id, job);
      job.promise = runWeave(fresh, keys).finally(() => kick());
      started.push({ what: 'weave', personId: person.id, keys });
      break;
    }
  }

  // questions: a person whose new raised items lack them, at most once an
  // hour after a call that failed or left gaps, under his ceilings
  for (const person of people) {
    if (questionJobs.has(person.id) || weaving() === person.id || weaveJobs.has(person.id)) continue;
    const tried = questionTried.get(person.id);
    if (tried && now - tried < QUESTIONS_RETRY_MS) continue;
    let book = null;
    try { book = await getBook(person.id); } catch { continue; }
    if (!itemsNeedingQuestions(book).length) continue;
    if (startQuestions(person.id, 'on the beat')) started.push({ what: 'questions', personId: person.id });
  }
  return started;
}

/* ------------------------------ news: the calls ----------------------------- */

const recent = (src, now) => !!src?.publishedAt && now - new Date(src.publishedAt).getTime() <= BRIEF_RECENT_DAYS * DAY_MS;

/** His usage against his ceilings now: null when a paid call may start, else
 *  { on, until, why, message } (the message names the reset time). */
export async function paidBlock() {
  const s = await load();
  lastUsage = await D().readClaudeUsage();
  const b = usageBlock(lastUsage, s.ceilings);
  if (!b) return null;
  return { ...b, message: `${b.why === 'usage not known' ? 'his Claude usage cannot be read now, so nothing paid starts' : `his Claude usage is over a ceiling: ${b.why}`}${b.until ? `; it resets ${b.until}` : ''}` };
}

// The questions of one person's raised items, in the background. Returns
// true when it started. The usage check runs inside, so the tick never waits.
function startQuestions(personId, when) {
  if (questionJobs.has(personId)) return false;
  const job = { status: 'running', personId, startedAt: new Date(D().now()).toISOString() };
  questionJobs.set(personId, job);
  job.promise = (async () => {
    try {
      const block = await paidBlock();
      if (block) { await log(personId, null, 'questions waiting', block.message); questionTried.set(personId, D().now()); return; }
      const r = await D().ensureQuestions(personId);
      if (r?.missing) questionTried.set(personId, D().now()); else questionTried.delete(personId);
      if (r?.asked) await log(personId, null, 'questions', `${r.written} written for ${r.asked} item${r.asked === 1 ? '' : 's'} ${when}${r.dropped ? `, ${r.dropped} dropped by the checks` : ''}, $${r.costUsd} on ${r.model}`);
    } catch (e) {
      questionTried.set(personId, D().now());
      await log(personId, null, 'questions failed', e?.message || 'it failed and gave no reason').catch(() => {});
    }
  })().finally(() => { job.status = 'done'; questionJobs.delete(personId); });
  return true;
}

// The brief of a read the queue made, or one owed at start-up: under his
// ceilings, a failure logged and kept on the source as briefError.
async function autoBrief(personId, key) {
  try {
    const block = await paidBlock();
    if (block) { await log(personId, key, 'brief waiting', block.message); return false; }
    const b = await D().writeBrief(key);
    await log(personId, key, 'brief', `${b.ideas.length} takeaways, $${b.costUsd} on ${b.model}`);
    return true;
  } catch (e) {
    const why = e?.message || 'the brief failed and gave no reason';
    await patchSource(key, { briefError: { why, at: new Date(D().now()).toISOString() } }).catch(() => {});
    await log(personId, key, 'brief failed', why).catch(() => {});
    return false;
  }
}

/** What a "Brief me" he asked for is doing for this source now, or null. */
export function briefWorking(key) {
  const j = briefJobs.get(key);
  return j && j.status === 'running' ? j.phase : null;
}
export const briefJob = (key) => briefJobs.get(key)?.promise || null;

/**
 * "Brief me" (POST /mentors/source/brief): refused (`refused`, a 409) when a
 * brief of this source is already being made or his usage is over a ceiling.
 * Marks the source as wanted now and returns at once; in the background,
 * ahead of the queue: the transcript if there is none (the queue's own
 * runTranscript), the read if it was not read (the queue's own runRead; his
 * tap is the go for this source), then the brief. A source the queue is
 * working on is waited for, never started twice.
 */
export async function briefNow(key) {
  const src = await getSource(key);
  if (!src) { const e = new Error(`no source with key "${key}"`); e.notFound = true; throw e; }
  if (briefJobs.has(key)) { const e = new Error(`a brief of ${src.title || key} is already being made`); e.refused = true; throw e; }
  const block = await paidBlock();
  if (block) { const e = new Error(block.message); e.refused = true; throw e; }
  const d = D();
  const job = { status: 'running', key, title: src.title, phase: src.stage === 'found' ? 'transcript' : 'reading', startedAt: new Date(d.now()).toISOString() };
  briefJobs.set(key, job);
  await patchSource(key, { briefAskedAt: job.startedAt, briefError: null });
  job.promise = runBrief(key, job)
    .then(() => { job.status = 'done'; }, async (e) => {
      job.status = 'failed';
      const why = e?.message || 'the brief failed and gave no reason';
      await patchSource(key, { briefError: { why, at: new Date(D().now()).toISOString() } }).catch(() => {});
      const personId = (await getSource(key).catch(() => null))?.people?.[0]?.id || null;
      await log(personId, key, 'brief failed', why).catch(() => {});
    })
    .finally(() => { briefJobs.delete(key); kick(); });
  return getSource(key);
}

async function runBrief(key, job) {
  const d = D();
  let src = await getSource(key);
  const personId = src.people?.[0]?.id;
  const person = (personId && await getPerson(personId)) || { id: personId || null, name: src.show || 'unknown' };

  // 1. the words: wait for the queue's own transcript of it, or take the next turn on this Mac
  if (src.stage === 'found') {
    job.phase = 'transcript';
    for (;;) {
      const cur = transcribing;
      if (!cur) break;
      if (cur.promise) await cur.promise.catch(() => {});
      else await d.sleep(50);
      if (cur.key === key && cur.promise) break;
    }
    src = await getSource(key);
    if (src.stage === 'found') {
      const s = await load();
      if (s.youtubeBlockedUntil && new Date(s.youtubeBlockedUntil).getTime() > d.now() && isYoutubeRoute(src)) {
        throw new Error(`YouTube refused three downloads in a row, so no YouTube audio is fetched until ${s.youtubeBlockedUntil}`);
      }
      const tj = { key, personId: person.id, title: src.title, startedAt: new Date(d.now()).toISOString() };
      transcribing = tj;
      if (src.hold && ['refused', 'failed'].includes(src.hold.state)) await clearHold(key);
      await setWorking(key, 'transcript');
      tj.promise = runTranscript(person, src).finally(() => { if (transcribing === tj) transcribing = null; });
      const out = await tj.promise;
      src = await getSource(key);
      if (src.stage === 'found') throw new Error(`the transcript failed: ${out?.why || src.hold?.why || 'it gave no reason'}`);
    }
  }

  // 2. the read: wait for the queue's own read of it, or read it now
  job.phase = 'reading';
  if (src.stage === 'transcript') {
    const running = readJobs.get(key);
    if (running) await running.promise?.catch(() => {});
    src = await getSource(key);
    if (src.stage === 'transcript') {
      const block = await paidBlock();
      if (block) throw new Error(`the read did not start: ${block.message}`);
      const rj = { status: 'running', personId: person.id, key, title: src.title, startedAt: new Date(d.now()).toISOString() };
      readJobs.set(key, rj);
      await setWorking(key, 'read');
      rj.promise = runRead(person, src, { brief: false });
      const out = await rj.promise;
      src = await getSource(key);
      if (src.stage === 'transcript') throw new Error(`the read failed: ${out?.why || src.hold?.why || 'it gave no reason'}`);
    }
  }

  // 3. the brief (the news item still says "reading")
  const block = await paidBlock();
  if (block) throw new Error(`the brief did not start: ${block.message}`);
  const b = await d.writeBrief(key);
  await log(person.id, key, 'brief', `${b.ideas.length} takeaways, $${b.costUsd} on ${b.model}`);
  return b;
}

/** POST /mentors/:id/raised/:rid/research, under his ceilings. */
export function researchRaised(personId, rid, body, { vaultPath } = {}) {
  return startResearch(personId, rid, body || {}, { vaultPath, gate: paidBlock });
}

// at start-up: up to three read or woven videos of the last 7 days that
// have no brief get one, one after another, under his ceilings
async function startupBriefs() {
  const now = D().now();
  const owed = [];
  for (const person of await following()) {
    for (const src of await listSources({ personId: person.id, tier: 1 })) {
      if ((src.stage === 'read' || src.stage === 'woven') && !src.brief && recent(src, now) && !owed.some((x) => x.key === src.key)) owed.push({ personId: person.id, key: src.key, at: src.publishedAt });
    }
  }
  owed.sort((a, b) => (a.at < b.at ? 1 : -1));
  let n = 0;
  for (const o of owed.slice(0, BRIEFS_AT_START)) if (await autoBrief(o.personId, o.key)) n += 1;
  return n;
}

/** For tests and scripts: tick and wait until nothing starts and nothing is
 *  in flight, or `maxMs` passes. */
export async function runUntilIdle({ maxMs = 60_000 } = {}) {
  const until = Date.now() + maxMs;
  const all = [];
  while (Date.now() < until) {
    const got = await tick();
    all.push(...got);
    const flying = [transcribing?.promise, ...[...readJobs.values()].map((j) => j.promise), ...[...weaveJobs.values()].map((j) => j.promise), ...[...questionJobs.values()].map((j) => j.promise), ...[...briefJobs.values()].map((j) => j.promise)].filter(Boolean);
    if (!got.length && !flying.length) break;
    if (flying.length) await Promise.race([Promise.all(flying), new Promise((r) => setTimeout(r, 50))]);
  }
  return all;
}

/* --------------------------------- status ---------------------------------- */

const itemOf = (j) => (j ? { key: j.key, title: j.title, startedAt: j.startedAt } : null);

export async function queueStatus() {
  const d = D();
  const s = await load();
  const now = d.now();
  const ytBlocked = s.youtubeBlockedUntil && new Date(s.youtubeBlockedUntil).getTime() > now ? s.youtubeBlockedUntil : null;
  const people = [];
  for (const p of await listPeople()) {
    if (p.status === 'guest') continue;
    const counts = await countsFor(p.id);
    let doing = 'idle';
    let item = null;
    let waiting = null;
    const reading = [...readJobs.values()].filter((j) => j.personId === p.id && j.status === 'running');
    if (s.paused || p.status === 'paused') doing = 'paused';
    else if (transcribing && transcribing.personId === p.id) { doing = 'transcript'; item = itemOf(transcribing); }
    else if (reading.length) { doing = 'reading'; item = itemOf(reading[0]); }
    else if (weaveJobs.get(p.id)?.status === 'running') { doing = 'weaving'; item = itemOf(weaveJobs.get(p.id)); }
    else if (!counts.total) doing = 'finding';
    else {
      const work = await personWork(p, s, now);
      if (work.needTranscript.length) {
        if (ytBlocked && work.needTranscript.every(isYoutubeRoute)) { doing = 'waiting'; waiting = { on: 'youtube', until: ytBlocked }; }
        else doing = 'idle';
      } else if (!p.repeatsCheckedAt) doing = work.scoped.some((x) => x.stage !== 'found') ? 'repeats' : 'idle';
      else if (work.needRead.length) {
        if (!s.readingAllowed[p.id]) { doing = 'waiting'; waiting = { on: 'go', until: null }; }
        else {
          const block = usageBlock(lastUsage, s.ceilings);
          if (block && lastUsage !== null) { doing = 'waiting'; waiting = block; }
          else if (!lastUsage) { doing = 'waiting'; waiting = { on: 'usage', until: null, why: 'usage not known' }; }
        }
      } else {
        // a weave of his that failed is not "done": it waits an hour, or for
        // his retry after three, and the status says which and why
        const wf = s.weaveFailures[p.id];
        const toWeave = wf && work.scoped.some((x) => x.stage === 'read' && !x.hold && !x.working);
        const again = wf ? new Date(wf.at).getTime() + FAILED_WAIT_MS : 0;
        const step = String(wf?.why || '').match(/the weave's (\w+) step/)?.[1] || null;
        if (toWeave && wf.n >= MAX_FAILS) { doing = 'waiting'; waiting = { on: 'weave', until: null, why: wf.why, failed: wf.n, step }; }
        else if (toWeave && now < again) { doing = 'waiting'; waiting = { on: 'weave', until: new Date(again).toISOString(), why: wf.why, failed: wf.n, step }; }
        else doing = 'done';
      }
    }
    people.push({ id: p.id, name: p.name, doing, item, counts, waiting, readingAllowed: !!s.readingAllowed[p.id] });
  }
  return { paused: s.paused, people, youtubeBlockedUntil: ytBlocked, usage: lastUsage, ceilings: { ...s.ceilings }, log: s.log.slice(-20) };
}

/* --------------------------------- running --------------------------------- */

let timer = null;
let running = false;

async function recoverHalfWeaves(vaultPath) {
  if (!vaultPath) { console.log('mentor queue: no vault path at start-up, so no half-finished weave was looked for'); return; }
  try {
    for (const r of await recoverPendingWeaves({ vaultPath })) {
      console.log(`mentor queue: the weave ${r.batchId} was cut off; ${r.restored.length} file${r.restored.length === 1 ? '' : 's'} put back${r.left.length ? `, ${r.left.length} left as they are (${r.left.map((l) => `${l.relPath}: ${l.why}`).join('; ')})` : ''}`);
    }
  } catch (e) { console.error('mentor queue: looking for half-finished weaves failed:', e.message); }
}

export function startMentorQueue(vaultPath) {
  vaultPathNow = vaultPath || null;
  // one pass at a time: the two minute beat and a kick must never both see an
  // empty slot and start two transcripts on this one Mac
  const run = async () => {
    if (running) return;
    running = true;
    try { (await import('./heartbeat.js')).beat('mentors'); } catch { /* the beat is a convenience */ }
    try {
      const got = await tick();
      if (got.length) console.log(`mentor queue: ${got.map((g) => `${g.what} ${g.key || g.personId}`).join(', ')}`);
    } catch (e) { console.error('mentor queue tick failed:', e.message); } finally { running = false; }
  };
  // A finished transcript or read asks for the next pass at once. Waiting for
  // the beat would leave this Mac idle up to two minutes after every one of
  // several hundred videos.
  kick = () => { const t = setTimeout(run, 1000); t.unref?.(); };
  // a weave cut off by a crash left its vault changes with a pending record:
  // put those back before anything new starts
  const recovered = recoverHalfWeaves(vaultPath);
  recovered
    .then(() => resetWorking())
    .then((n) => { if (n) console.log(`mentor queue: ${n} source${n === 1 ? '' : 's'} cut off by the restart will start again`); })
    .catch((e) => console.error('mentor queue: resetWorking failed:', e.message))
    .then(async () => {
      // a raised item left mid-research by the restart goes back to new, saying why
      const n = await recoverResearch((await listPeople()).map((p) => p.id), { vaultPath: vaultPathNow });
      if (n) console.log(`mentor queue: ${n} raised item${n === 1 ? '' : 's'} cut off mid-research by the restart put back to new`);
    })
    .catch((e) => console.error('mentor queue: the research recovery failed:', e.message))
    .finally(() => {
      run();
      if (!timer) { timer = setInterval(run, TICK_MS); timer.unref?.(); }
      startupBriefs()
        .then((n) => { if (n) console.log(`mentor queue: ${n} recent video${n === 1 ? '' : 's'} briefed at start-up`); })
        .catch((e) => console.error('mentor queue: the start-up briefs failed:', e.message));
    });
}

export function _setVaultPathForTests(p) { vaultPathNow = p; }
