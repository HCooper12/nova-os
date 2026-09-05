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
import { CHAT_JOB_LANES, CHAT_CONVERSATION_LANES, CHAT_DEFERRED_LANES, CHAT_NAVIGATING_LANES, chatStartsAJob } from '../../src/chatLanes.js';

const laneFor = (t) => routeIntent(t).lane;

test('the job lanes are the ones the chat may start', () => {
  // Phase 4 (5 Sep) added weave — the deep vault weave, reachable by words now
  // that the Inbox button is gone — and code, inherited from the folded-in
  // palette as the one dispatch that changes screens
  assert.deepEqual(CHAT_JOB_LANES, ['watch', 'weave', 'study', 'research', 'book', 'code']);
  for (const l of CHAT_JOB_LANES) assert.equal(chatStartsAJob(l), true);
  assert.deepEqual(CHAT_NAVIGATING_LANES, ['code'], 'only a build request may move him to another screen');
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
  const { LANES } = { LANES: ['watch', 'weave', 'study', 'research', 'code', 'coach', 'capture', 'play', 'ask', 'book'] };
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
