// Which Coach questions the model on this Mac may answer (lib/coachRoute.js).
// The fixtures are his 17 real Coach questions from the 27 Oct bench
// (design/audits/2026-10-27-local-coach-bench.md), his orders from the same
// journals, and short lookups in his voice. Pure: no data dir, no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coachNeedsClaude, coachGaveUp } from '../lib/coachRoute.js';

// the 17, in the bench's order, with where each must go and the rule's why
// (null = stays on this Mac). The bench's wrong answers (#3, #5, #6, #9,
// #16, #17) all go to Claude; so does #14, whose "give me a detailed report"
// is a review by the brief's own rule (and its local answer was wrong: a
// five-day plan he does not have). #11 is a why question.
const BENCH = [
  ['What would be a better alternative exercise than face pulls?', 'choosing or replacing an exercise goes to Claude'],
  ['Are face pulls or an alternative actually work keeping in my program while working for increasing muscle size?', 'choosing or replacing an exercise goes to Claude'],
  ["Why is my Cable Flys Low Position (per arm weight) stalled, and what's the fix?", 'a why question goes to Claude'],
  ['I want to be performing the best cable exercise for my triceps. Currently I’m doing a standing tricep push down single arm. Facing the machine. Is this the best for tricep growth? If not, what should I try instead?', 'choosing or replacing an exercise goes to Claude'],
  ['Should I have all 3 of the chest exercises for this one workout? Or should I drop it back to 2? If I drop it back to 2 then which should I remove and why?', 'a comparison or a choice goes to Claude'],
  ['Mid-session — talk me through Cable Overhead Tricep Extension: cues, common mistakes, and what matters most for my goals.', 'form cues go to Claude'],
  ['What is the optimal pre workout snack or meal?', null],
  ['Would my protein smoothie in my breakfast rotation be an okay option?', null],
  ['My upper workout just took 1 and 1/2 hours and I still couldn’t finish two final exercises. What should I do?', 'an open "what should I do" goes to Claude'],
  ['My weekly sets for Triceps are under target for my goal — how should I add volume?', null],
  ['Why is my HRV down?', 'a why question goes to Claude'],
  ['What change could be made to my upper body workout without losing volume needed across the week for muscle growth, so that the session is closer to an hour instead of an hour and a half? I am happy to try reshuffling an exercise to another session if that’ll help', null],
  ['My weekly sets for Biceps, Triceps, Shoulders are under target for my goal — how should I add volume?', null],
  ['What would a version of my refined workout plan look like if it was changed to 4 days instead of five but with the same overall goals? Also keeping in mind that I want to maximise the amount of optimal sets that I complete for the main muscle groups that I want to grow for an aesthetic strong appearance. I don’t need you to change it but I just want to know what this would look like so give me a detailed report showing before workout days and the exercise exercises and focus of them all also provide me with a theoretical breakdown of how many times each muscle group is worked across the week for this four day plan', 'a review of your program goes to Claude'],
  ['Would an adductor/abductor machine exercise be beneficial to add? If so, should I replace Bulgarian split squats since I already am doing hack squats?', 'choosing or replacing an exercise goes to Claude'],
  ['How many sets does Andrew huberman and other experts say are needed for optimising muscle growth per week?', 'what an expert or the research says goes to Claude'],
  ['Walk me through what the plan found, the way Jarvis would: the two or three things that matter, then the concrete changes you would make to my program and why. As you go, put each muscle you judge on screen with a body panel, then the routine it comes from as a program panel with the exercise you would drop and the one the evidence protects, and finish with the numbered changes as steps I can tick.', 'a review of your program goes to Claude'],
];

test('the 17 bench questions route where the bench says they should', () => {
  BENCH.forEach(([q, why], i) => {
    const r = coachNeedsClaude(q);
    assert.equal(r.claude, why !== null, `#${i + 1}: ${q.slice(0, 60)}`);
    assert.equal(r.why, why || '', `#${i + 1} reason`);
  });
});

test('his orders the change gate missed, and his corrections, go to Claude', () => {
  for (const q of [
    'Conduct research and analysis and come back to me with a review of my current workout program',
    'Re evaluate my workout program. I still want the total time to be within 50-60 minutes',
    'My shoulder pain is okay at the moment, so ignore this and re-evaluate as needed.',
    "That's not right, my bench was 80 not 70",
    'You said you would check my pull-ups',
    'Have the changes been made?',
  ]) assert.equal(coachNeedsClaude(q).claude, true, q);
});

test('each rule, in his kind of words', () => {
  const cases = [
    ['Am I doing the Romanian deadlift right? My lower back takes over', 'form cues go to Claude'],
    ['What are the cues for a hack squat?', 'form cues go to Claude'],
    ['How should I brace for a heavy squat?', 'form cues go to Claude'],
    ['Evaluate my push day for me', 'a review of your program goes to Claude'],
    ['Break down my program for chest volume', 'a review of your program goes to Claude'],
    ['What does Mike Israetel say about junk volume?', 'what an expert or the research says goes to Claude'],
    ['Is it true you need protein within 30 minutes of training?', 'what an expert or the research says goes to Claude'],
    ['What does the research say about training to failure?', 'what an expert or the research says goes to Claude'],
    ['My elbow hurts on skull crushers, what should I swap to?', 'anything about pain or an injury goes to Claude'],
    ['I have a niggle in my left shoulder on lateral raises', 'anything about pain or an injury goes to Claude'],
    ['My knee is sore after leg day', 'anything about pain or an injury goes to Claude'],
    ['How many sessions have I missed over the last 6 weeks?', 'a count across weeks goes to Claude'],
    ['How often have I trained legs this month?', 'a count across weeks goes to Claude'],
    ['Incline dumbbell vs incline barbell for upper chest?', 'a comparison or a choice goes to Claude'],
    ['Is a cable fly better than a pec deck for me?', 'a comparison or a choice goes to Claude'],
    ['Which is better for my lats, pull-ups or pulldowns?', 'a comparison or a choice goes to Claude'],
    ['Should I do RDLs instead of leg curls?', 'a comparison or a choice goes to Claude'],
    ['Why has my bench stalled for three weeks?', 'a why question goes to Claude'],
    ["What's causing my grip to fail on rows?", 'a why question goes to Claude'],
  ];
  for (const [q, why] of cases) assert.deepEqual(coachNeedsClaude(q), { claude: true, why }, q);
});

test('lookups, definitions and his schedule stay on this Mac', () => {
  for (const q of [
    'What did I bench today?',
    'What was my bench last session?',
    "What's on today?",
    'How much protein have I had today?',
    'What weight did I use for hack squats last time?',
    'How many sets of chest did I do today?',
    'What is a drop set?',
    'What does RPE mean?',
    'When is my next leg day?',
    'What should I do today?',
    'How many reps should I aim for on lateral raises?',
    'What is my best on incline bench?',
    'How did I sleep last night?',
    'Is my bench up compared to last week?',
    'What is my calorie target?',
    'How long should I rest between sets of curls?',
    'My legs are sore today, is that normal after the hack squats?',
    'What grip should I use on the lat pulldown machine for pinch grip work?',
  ]) assert.deepEqual(coachNeedsClaude(q), { claude: false, why: '' }, q);
});

test('mid-session, the words that only mean pain while training go to Claude', () => {
  const q = 'Felt a pinch in my shoulder on that last set';
  assert.equal(coachNeedsClaude(q).claude, false, 'outside a session, "pinch" is not caught by itself');
  assert.deepEqual(coachNeedsClaude(q, { liveSession: { exercises: [{ name: 'Cable Lateral Raise' }] } }), { claude: true, why: 'anything about pain or an injury goes to Claude' });
  assert.equal(coachNeedsClaude('What weight for my next set?', { liveSession: { exercises: [] } }).claude, false);
});

test('empty input stays local and never throws', () => {
  assert.deepEqual(coachNeedsClaude(''), { claude: false, why: '' });
  assert.deepEqual(coachNeedsClaude(null), { claude: false, why: '' });
});

// bench #5's local reply, as the model wrote it on 27 Oct
const BENCH_5 = 'You have three chest exercises on Monday Push. That is too much volume for your current recovery state. Your HRV is up 23%, but you had shoulder pain last week and are in an aggressive cut phase. You need to prioritize quality over quantity. Drop one exercise to reduce total stress. Remove the Dumbbell Shoulder Press. It targets front delts, which overlap with chest, and your shoulder has been nagging since mid-October. Keep the two chest movements: Incline Barbell Bench Press and Cable Lateral Raise (which you listed under Push but is actually a side delt exercise). Wait, that\'s not right. Let me re-read your question. You asked about chest exercises. Looking at Monday Push, there are no three chest exercises. There is only one: Incline Barbell Bench Press.';
// bench #17's local reply (second run)
const BENCH_17 = "I cannot access your personal training data, vault notes, or specific injury history to build this plan for you. My tools only show Hayden Cooper's public profile from October 2026, which is not your data.\n\nTo give you the concrete changes and muscle panels you asked for, I need you to tell me:\n1. What are your current goals?";

test('a reply that argues with itself, gives up, claims an action or breaks off is handed up', () => {
  assert.equal(coachGaveUp(BENCH_5), 'the answer on this Mac contradicted itself');
  assert.equal(coachGaveUp(BENCH_17), 'the model on this Mac could not answer it');
  assert.equal(coachGaveUp("I don't have your specific pre-workout snack or meal data."), 'the model on this Mac could not answer it');
  assert.equal(coachGaveUp('The swap has been applied to your program. I will wait for your confirmation.'), 'the model on this Mac could not answer it');
  assert.equal(coachGaveUp('Move the heavy rows to Thursday. Then keep the pull-ups on Tuesday and'), 'the answer on this Mac broke off');
  assert.equal(coachGaveUp('Here is the change I would make:'), 'the answer on this Mac broke off');
  assert.equal(coachGaveUp('Your triceps are getting about 8 working sets this week. You need 10 to 20 total. Add one set of Rope Overhead'), 'the answer on this Mac broke off');
  assert.equal(coachGaveUp('Scratch that, your best was 82.5.'), 'the answer on this Mac contradicted itself');
  assert.equal(coachGaveUp(''), 'the model on this Mac gave no answer');
});

test('real answers from the bench stand', () => {
  for (const r of [
    // #11, #10, #12, #8 as the model wrote them
    'Your HRV is up today at 104 ms. It was lower on Tuesday and Wednesday due to less sleep and more steps. Your average over the last week is still higher than before.',
    'Your triceps are getting about 8 working sets this week. You need 10 to 20 total. Add one set of Rope Overhead Tricep Extension on Monday Push, or Cable Overhead Tricep Extension on Saturday Arms. Keep reps in the 8 to 12 range.',
    'Move the heavy rows from Tuesday to Thursday. That frees up Tuesday volume while keeping total back work high.',
    'Your smoothie can be part of your breakfast, but it is not hitting your daily protein target yet. You are averaging 145 grams, when you need to hit 166 grams every day.',
    // a list may end on a word; a follow-up question is an answer
    'Two options for Thursday:\n- Hack squat 3 x 10\n- Leg curl 3 x 12',
    'Your best bench is 82.5 kg for 6. Want me to check how it moved this month?',
  ]) assert.equal(coachGaveUp(r), null, r.slice(0, 60));
});
