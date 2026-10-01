// The chat as the front door — Phase 1 of the delegation plan.
//
// His report: "Currently I am unable to ask specific commands like this when
// I'm just dropping a YouTube video link." The router existed and was tested;
// it simply had one caller, the command palette. Wiring the conversation to it
// is the fix — and the risk it introduces is the one pinned here: the chat
// must not start a JOB when he asked a QUESTION.
//
// His decision, 4 Sep: routing stays invisible until it matters, so a
// dispatched lane announces itself and offers an undo rather than asking
// first. That makes a wrong dispatch cheap but not free — hence the
// deliberately narrow set.
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeIntent } from '../lib/intentRouter.js';
import { CHAT_JOB_LANES, CHAT_CONVERSATION_LANES, CHAT_DEFERRED_LANES, CHAT_NAVIGATING_LANES, CHAT_CLIENT_LANES, chatStartsAJob, chatDispatchesHere } from '../../src/chatLanes.js';

const laneFor = (t) => routeIntent(t).lane;

test('the job lanes are the ones the chat may start', () => {
  // Phase 4 (5 Sep) added weave — the deep vault weave, reachable by words now
  // that the Inbox button is gone — and code, inherited from the folded-in
  // palette as the one dispatch that changes screens
  // 'browse' joined 7 Sep 2026 — the browser hand, started from the chat like
  // any other job and landing the same way: a pending record he reads
  // 'repertoire' joined 15 Sep 2026 — a clip he wants to LEARN from. It is a
  // job (it fetches, researches and files a pending record), and pasting a
  // link with "teach me techniques like this" is exactly how he asked for it,
  // so the chat starts it. Not delegable: it ends in a curriculum on Home.
  // 'build' joined 16 Sep 2026 — the Builder, which makes something new in his
  // projects directory rather than changing Nova itself. It is a job (it runs
  // for minutes and lands a pending record), it is delegable, and the contract
  // in capabilities.test.js is that anything a PLAN may delegate, the CHAT may
  // start — otherwise he could only get it by asking for four things at once.
  // 'recipe' and 'brief' joined 1 Oct 2026 (every door): the chat reaches
  // them now, through the server's verbs (lib/verbJobs.js) like every other
  // door — a recipe reel no longer goes to the Watcher, a briefing no longer
  // needs the palette. Only browse and code still START on the device
  // (CHAT_CLIENT_LANES): they need this device's own screen.
  assert.deepEqual(CHAT_JOB_LANES, ['watch', 'weave', 'study', 'repertoire', 'research', 'browse', 'book', 'code', 'build', 'recipe', 'brief']);
  for (const l of CHAT_JOB_LANES) assert.equal(chatStartsAJob(l), true);
  assert.deepEqual(CHAT_NAVIGATING_LANES, ['code'], 'only a build request may move him to another screen');
  assert.deepEqual(CHAT_CLIENT_LANES, ['browse', 'code']);
  for (const l of CHAT_JOB_LANES) assert.equal(chatDispatchesHere(l), CHAT_CLIENT_LANES.includes(l));
  for (const l of CHAT_CLIENT_LANES) assert.ok(CHAT_JOB_LANES.includes(l), 'a lane started on the device is still a job lane');
});

test('"watch and analyse fully" is the deep weave; "watch this" is the Watcher', () => {
  const url = 'https://www.youtube.com/watch?v=abc';
  assert.equal(laneFor(`${url} watch this and analyse it fully`), 'weave');
  assert.equal(laneFor(`${url} weave this into my vault`), 'weave');
  assert.equal(laneFor(`${url} watch this`), 'watch');
  assert.equal(laneFor(`${url} what does this claim?`), 'watch', '"analyse" alone is not enough — people say it about any video');
});

test('conversation and deferred lanes are never dispatched from the chat', () => {
  for (const l of [...CHAT_CONVERSATION_LANES, ...CHAT_DEFERRED_LANES]) {
    assert.equal(chatStartsAJob(l), false, `${l} must not start a job from the chat`);
  }
});

test('every lane the router can return is accounted for in exactly one list', () => {
  // a lane added to the router later must be a deliberate decision here, not
  // an accident of omission
  // 'leader' joined 6 Sep 2026 (Verbs phase 2): a conversation lane, answered in the transcript, never a job
  // 'repertoire' joined 15 Sep 2026 — a job lane, see above
  // 'build' joined 16 Sep 2026 — a job lane: the Builder, making something new
  // in his projects directory. ('brief' and 'paper' are router lanes the chat
  // deliberately does not start, and were never in this local list.)
  // 'practice' joined 27 Sep 2026 — a conversation lane: the rehearsal room,
  // never a job the chat starts by itself
  // 'recipe' and 'brief' joined 1 Oct 2026 — job lanes the chat reaches
  // through the server's verbs ('paper' stays a palette lane)
  const { LANES } = { LANES: ['watch', 'weave', 'study', 'repertoire', 'research', 'browse', 'build', 'code', 'coach', 'leader', 'practice', 'capture', 'play', 'ask', 'book', 'recipe', 'brief'] };
  const all = [...CHAT_JOB_LANES, ...CHAT_CONVERSATION_LANES, ...CHAT_DEFERRED_LANES];
  assert.deepEqual([...all].sort(), [...LANES].sort(), 'a router lane is in no list, or a list names a lane that does not exist');
});

test('his exact case: a pasted video link with an instruction starts the Watcher', () => {
  const lane = laneFor('https://www.youtube.com/watch?v=sxn5kPQ4Gl0 — watch and analyse this');
  assert.equal(lane, 'watch');
  assert.equal(chatStartsAJob(lane), true);
});

test('a channel link is a study, and the chat may start it', () => {
  const lane = laneFor('https://www.youtube.com/@hubermanlab analyse this creator');
  assert.equal(lane, 'study');
  assert.equal(chatStartsAJob(lane), true);
});

test('questions stay questions', () => {
  // the regression this test exists to prevent
  for (const q of [
    'what did I train yesterday?',
    'how much protein have I had today',
    'why am I so tired',
    'what does my shelf say about sleep',
  ]) {
    assert.equal(chatStartsAJob(laneFor(q)), false, `"${q}" must be answered, not dispatched`);
  }
});

test('training questions reach the Coach rather than a job', () => {
  // Coach stays its own agent — his instruction — and a question for it is
  // still conversation, not a task to run
  for (const q of ['should I deload this week?', 'why has my bench stalled', 'is my volume too high']) {
    const lane = laneFor(q);
    assert.equal(chatStartsAJob(lane), false, `"${q}" must not start a job`);
  }
});

test('a bare "add ..." is not dispatched, however it routes', () => {
  // capture is excluded precisely because its rule fires on a leading verb
  assert.equal(chatStartsAJob(laneFor('add some context on why that happened')), false);
  assert.equal(chatStartsAJob(laneFor('remind me to call Nanna')), false);
});

test('"add the book X by Y" IS dispatched — the book rule outranks capture', () => {
  const lane = laneFor('add the book Atomic Habits by James Clear');
  assert.equal(lane, 'book');
  assert.equal(chatStartsAJob(lane), true);
});
