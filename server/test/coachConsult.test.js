// CONSULT (25 Sep 2026): the Coach asks the other agents before it answers —
// his ask, with "no caps on the work". What must hold: only real agents can
// be asked, a malformed line is ignored rather than guessed at, every ask
// runs (in parallel) and a failure is reported honestly instead of sinking
// the others, he can see who is working while he waits, and the answers go
// back to the Coach named.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSULT_AGENTS, parseConsult, consultProgress, consultReplyText, runConsults,
  consultCapability, formatFortnight, MAX_CONSULT_ROUNDS,
} from '../lib/coachConsult.js';
import { buildCoachPrompt } from '../lib/claudeCode.js';

const line = (asks) => `I'll check the evidence and your week first.\nCONSULT ${JSON.stringify({ asks })}`;

test('a CONSULT line becomes asks, and the sentence for him is kept', () => {
  const c = parseConsult(line([{ agent: 'researcher', question: 'Weekly sets per muscle for hypertrophy?' }, { agent: 'calendar', question: 'How long are his sessions booked for?' }]));
  assert.equal(c.cleanText, "I'll check the evidence and your week first.");
  assert.deepEqual(c.asks.map((a) => a.agent), ['researcher', 'calendar']);
  assert.equal(c.asks[0].label, 'the Researcher');
});

test('only agents that exist can be asked; junk is dropped, duplicates collapse', () => {
  const c = parseConsult(line([
    { agent: 'Researcher', question: 'q1' },
    { agent: 'researcher', question: 'q1' },
    { agent: 'cfo', question: 'what does it cost' },
    { agent: 'nova', question: '' },
    { agent: 'nova', question: 'What has he written about work stress this month?' },
  ]));
  assert.deepEqual(c.asks.map((a) => `${a.agent}:${a.question}`), ['researcher:q1', 'nova:What has he written about work stress this month?']);
  assert.equal(parseConsult(line([{ agent: 'cfo', question: 'x' }])), null, 'nothing valid means no consult');
  assert.equal(parseConsult('CONSULT {not json'), null);
  assert.equal(parseConsult('A normal answer with no directive.'), null);
  assert.equal(parseConsult('CONSULT {"asks":[{"agent":"researcher","question":"x"}]} and then more prose'), null, 'the line must be the last thing');
});

test('while he waits, the bubble says who is working and who has answered', () => {
  const asks = [
    { label: 'the Researcher', question: 'sets per muscle', state: 'done' },
    { label: 'your calendar', question: 'session length', state: 'asking' },
    { label: 'Nova', question: 'work stress', state: 'failed', error: 'offline' },
  ];
  const p = consultProgress('Checking first.', asks);
  assert.match(p, /^Checking first\.\n\nAsking now:/);
  assert.match(p, /The Researcher: answered/);
  assert.match(p, /Your calendar: working on it/);
  assert.match(p, /Nova: could not answer \(offline\)/);
});

test('every ask runs in parallel, and one failure does not sink the others', async () => {
  const seen = [];
  const started = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const deps = {
    researcher: async (q) => { started.push('r'); await gate; return { text: `brief on ${q}`, recordId: 'rec1' }; },
    calendar: async () => { started.push('c'); await gate; return { text: 'Thu 08:45–09:30 Workout' }; },
    nova: async () => { started.push('n'); throw new Error('vault unreadable'); },
  };
  const asks = parseConsult(line([
    { agent: 'researcher', question: 'volume' }, { agent: 'calendar', question: 'time' }, { agent: 'nova', question: 'stress' },
  ])).asks;
  const run = runConsults('/vault', asks, { question: 'is 3 sets too much', deps, onUpdate: (s) => seen.push(s.map((a) => a.state).join(',')) });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(started.length, 3, 'all three started before any finished');
  release();
  const results = await run;
  assert.deepEqual(results.map((r) => r.ok), [true, true, false]);
  assert.equal(results[0].recordId, 'rec1');
  assert.equal(results[2].error, 'vault unreadable');
  assert.ok(seen.length >= 3, 'the bubble was updated as each settled');
});

test('the answers go back to the Coach named, failures included', () => {
  const t = consultReplyText([
    { ok: true, label: 'the Researcher', question: 'volume', answer: '10–20 hard sets per muscle per week.' },
    { ok: false, label: 'Nova', question: 'stress', error: 'offline' },
  ], 'Is 3 sets too much?');
  assert.match(t, /His question was: Is 3 sets too much\?/);
  assert.match(t, /FROM THE RESEARCHER \(you asked: volume\):\n10–20 hard sets/);
  assert.match(t, /NOVA COULD NOT ANSWER \(you asked: stress\): offline/);
  assert.match(t, /cited brief is in his Inbox/);
});

test('the Coach is told about exactly the agents that exist, in its prompt', () => {
  const cap = consultCapability();
  for (const id of Object.keys(CONSULT_AGENTS)) assert.ok(cap.includes(`"${id}"`), id);
  const prompt = buildCoachPrompt({ question: 'q', context: 'c' });
  assert.ok(prompt.includes('CONSULT {"asks"'), 'the directive shape is in the Coach prompt');
  assert.ok(MAX_CONSULT_ROUNDS >= 2, 'a loop guard, set so it can ask, read, and ask once more');
});

test('the calendar is read by code into a plain fortnight', () => {
  assert.equal(formatFortnight([]), 'Nothing is booked in the next 14 days.');
  const f = formatFortnight([
    { date: '2026-09-25', time: '08:45', end: '09:30', label: 'Workout', calendar: 'Health' },
    { date: '2026-09-25', time: '11:00', end: '11:45', label: 'Walk Tank', calendar: 'Family' },
    { date: '2026-09-26', time: null, end: null, label: 'Public holiday' },
  ]);
  assert.match(f, /25 Sept?: 08:45–09:30 Workout \(Health\); 11:00–11:45 Walk Tank \(Family\)/);
  assert.match(f, /26 Sept?: all day Public holiday/);
});
