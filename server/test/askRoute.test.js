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

// 1 Nov 2026, 21:16-21:19: the small model claimed "the standardization has
// been applied ... I will wait for your confirmation" with nothing filed, and
// his "You said that you have applied the change ... I can't actually see it"
// went back to the same model
test('a local reply that claims an action is fiction, handed to Claude like a give-up', () => {
  assert.equal(gaveUp('The standardization has been applied across your entire program. All rep ranges are now set to 6 to 12 reps.'), true);
  assert.equal(gaveUp('I have not made any changes yet because you asked me to draft a proposal first. I will wait for your confirmation before executing the update.'), true);
  assert.equal(gaveUp('I cannot see a specific file in your Inbox or Vault right now. The system shows zero drafts waiting.'), true);
  assert.equal(gaveUp('Your front delts get 5 sets a week: the shoulder press and half of the chest press.'), false);
  assert.equal(needsClaude("You said that you have applied the change and made the proposal, but I can't actually read it or see it anywhere. Where do I find it?"), 'you corrected the last answer');
});

test('whether a change was made goes to Claude before the local model answers (1 Nov, 21:02)', () => {
  for (const q of ['No worries, just make sure the changes have been made', 'Has it actually been applied?', 'Did you save that?']) assert.ok(needsClaude(q), q);
  for (const q of ['How many sets of chest this week?', 'Make me a smoothie recipe']) assert.equal(needsClaude(q), null, q);
});

// THE CLAUDE-FREE RESEARCH LANE (1 Nov 2026): a lookup is answered on this
// Mac from pages Nova's browser reads, never sent to Claude; a proper
// research brief is still Claude's. Real-shaped questions, a dozen each way.
test('a lookup is searched on this Mac, never sent to Claude', async () => {
  const { webLookup } = await import('../lib/askRoute.js');
  for (const q of [
    'What is the current recommended protein intake per kg for muscle gain?',
    'Who is the prime minister of Australia?',
    'When does Bunnings open on Sunday?',
    'How much does a Garmin Forerunner 965 cost?',
    'Latest news on the AFL trade period',
    'Look up creatine monohydrate side effects',
    'Search for a good sourdough starter guide',
    'What does https://example.com/post say?',
    "What's the weather in Melbourne this weekend?",
    'Who won the grand final?',
    'What is HRV?',
    'Where is the nearest Coles?',
    'google the release date for the new iPhone',
  ]) {
    assert.equal(needsClaude(q), null, q);
    assert.equal(webLookup(q), true, q);
  }
});

test('his own world, the agents\' questions and quick acts are not web lookups', async () => {
  const { webLookup } = await import('../lib/askRoute.js');
  for (const q of [
    'What is my next session?',
    'How many steps today?',
    'How much protein have I had?',
    'What did I bench last week?',
    "What's on the calendar tomorrow?",
    'When did I last deadlift?',
    'What is the best rep range for hypertrophy?',
    'Is a cable fly better than a dumbbell fly?',
    'Why do my forearms pump out before my biceps?',
    'How should I structure a deload week?',
    'What does the research say about creatine timing?',
    'Add oat milk to my shopping list',
    HIS_QUESTION,
    '',
  ]) assert.equal(webLookup(q), false, q);
});

test('a proper research brief stays Claude\'s; a research question is still the agents\'', async () => {
  for (const q of ['Write me a research brief on creatine timing', 'Can you do a deep dive into zone 2 training?', 'Give me a proper research report on sleep and recovery']) {
    assert.equal(needsClaude(q), 'you asked for a research brief', q);
  }
  assert.equal(needsClaude('What does the research say about creatine timing?'), null);
  assert.ok(ids('What does the research say about creatine timing?').includes('researcher'));
});
