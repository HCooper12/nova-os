// Which questions the model on this Mac may answer (lib/askRoute.js). The
// fixtures are his real turns from the morning of 29 Oct 2026, when the 4B
// model answered a training-science question with "I cannot answer" twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsClaude, gaveUp, knowledgeKind, agentsFor } from '../lib/askRoute.js';

const HIS_QUESTION = 'When it comes to something like a bench press exercise, especially for maximizing chest growth and muscle growth, what would be the best version to be able to complete? Does it really matter if I did a standard barbell bench press or a machine chest press?';
const HIS_CORRECTION = "You seem to be getting confused. There is nothing relevant to the shoulder that I am referring to. I'm literally just asking you a simple question. So you should be conducting the research, asking coach, checking any research in my vault, everything that you should be referring to so that you can answer that question. Which is better for muscle growth and chest growth in terms of Physical development. Is it a machine press or is it a barbell bench press? What is going to be more effective overall? And why?";

const REPLY_1 = 'Your vault does not contain data comparing the Bench Press to the Machine Chest Press for your specific goals. It only lists them as separate exercises in your rotation.\n\nI cannot answer which is better because that comparison is missing from your records.';
const REPLY_2 = 'I cannot find the "COACH" card or any research comparing machines versus barbells in your vault. Your shoulder flag and form notes are unrelated to this question.';

const ids = (q, o) => agentsFor(q, o).map((a) => a.agent).sort();

test('his 29 Oct question is put to the Coach and the Researcher on this Mac; his correction goes to Claude', () => {
  assert.equal(needsClaude(HIS_QUESTION), null);
  assert.deepEqual(ids(HIS_QUESTION), ['coach', 'researcher']);
  assert.equal(agentsFor(HIS_QUESTION)[0].question, HIS_QUESTION, 'the agent hears his own words');
  assert.equal(needsClaude(HIS_CORRECTION), 'you corrected the last answer');
  assert.equal(needsClaude('just ask Claude'), 'you asked for Claude');
});

test('each question reaches the agents whose ground it is', () => {
  assert.deepEqual(ids('Should I train to failure on isolation work?'), ['coach']);
  assert.deepEqual(ids('How should I handle a staff member who keeps arriving late at work?'), ['leader']);
  assert.deepEqual(ids('What does Atomic Habits say about identity?'), ['librarian']);
  assert.deepEqual(ids('Am I on track with my budget, should I cut back?'), ['cfo']);
  assert.deepEqual(ids('How should I build a wider back?'), ['coach']);
  // creatine is the Coach's ground too
  assert.deepEqual(ids('Ask the researcher whether creatine timing matters'), ['coach', 'researcher']);
  // a hands-free line cannot hold for minutes of research
  assert.deepEqual(ids(HIS_QUESTION, { handsFree: true }), ['coach']);
});

test('knowledge, advice, comparison and agent questions are recognised', () => {
  for (const q of [
    'Is a cable fly better than a dumbbell fly?',
    'Squat vs leg press for quads',
    'Should I train to failure on isolation work?',
    'Why do my forearms pump out before my biceps?',
    'How should I structure a deload week?',
    'What does the research say about creatine timing?',
    'Ask Coach whether I should add a fourth set',
    "What's the best time of day to train?",
    'Does it matter if I eat protein right after training?',
  ]) assert.ok(knowledgeKind(q) && agentsFor(q).length, q);
});

test('lookups, quick acts and his own past ask no one', () => {
  for (const q of [
    'What did I bench last week?',
    'How many steps today?',
    'Add oat milk to my shopping list',
    "What's on my calendar tomorrow?",
    'How much protein have I had?',
    'What is my next session?',
    'Log my weight at 84.2',
    'How did I sleep?',
    'and compared to last week?',
    'Is my bench better than last week?',
    '',
  ]) {
    assert.equal(needsClaude(q), null, q);
    assert.deepEqual(agentsFor(q), [], q);
  }
});

test('both of his 29 Oct replies count as giving up', () => {
  assert.equal(gaveUp(REPLY_1), true);
  assert.equal(gaveUp(REPLY_2), true);
  assert.equal(gaveUp("I can't find that in your vault, sir."), true);
  assert.equal(gaveUp('I have not yet asked Coach about this comparison, so I do not have an answer.'), true);
  assert.equal(gaveUp(''), true);
});

test('a real answer is not giving up, even when it names a gap later on', () => {
  assert.equal(gaveUp('Your last bench was Monday: 80 kg for 6, 6 and 5. That is 2.5 kg up on the week before.'), false);
  assert.equal(gaveUp('11,124 steps yesterday, sir.'), false);
  assert.equal(gaveUp(`Push today, six lifts, starting with the incline press at 30 kg. ${'Your notes say to keep the elbows tucked and the shoulder blades pinned. '.repeat(5)}I cannot find a note for the last cable fly.`), false);
});
