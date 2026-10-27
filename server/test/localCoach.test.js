// The Coach on the model on this Mac (lib/localCoach.js) and its dispatch
// (lib/coachTurn.js): the change gate, the code-run tools, the round cap, and
// every road to Claude on the SAME job id (an ESCALATE line, a PROPOSE, a
// failure before any text), plus what never runs here (a consult, a change
// request, the planner). Ollama is a stub on its own port (NOVA_OLLAMA_URL),
// Claude is a stream-json stub (CLAUDE_BIN), the vault is a scratch folder
// filled by the real writers, and the data dir is a temp dir set BEFORE any
// lib module loads. Nothing reaches the real model, Claude, his vault, his
// server/data or his conversation record.
import { mkdtemp, writeFile, mkdir, readFile, chmod, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

const root = await mkdtemp(path.join(tmpdir(), 'nova-localcoach-'));
const dataDir = path.join(root, 'data');
await mkdir(dataDir, { recursive: true });
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_LOCAL_LLM_BACKEND = 'ollama';
process.env.NOVA_LOCAL_LLM_MODEL = 'qwen3.5:4b';
process.env.NOVA_OLLAMA_NO_SPAWN = '1';
process.env.NOVA_LOCAL_COACH_TIMEOUT_MS = '15000';

// Claude: answers every turn with one line, and logs what it was sent
const sentLog = path.join(root, 'claude-sent.log');
const stubBin = path.join(root, 'claude');
await writeFile(stubBin, `#!/usr/bin/env node
const fs = require('node:fs');
const rl = require('node:readline').createInterface({ input: process.stdin });
const say = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
rl.on('line', (line) => {
  if (!line.trim()) return;
  let text = '';
  try { text = JSON.parse(line).message.content.map((c) => c.text).join(''); } catch {}
  fs.appendFileSync(${JSON.stringify(sentLog)}, JSON.stringify({ argv: process.argv.slice(2).join(' '), text: text.slice(-400) }) + '\\n');
  say({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Claude coach ' } } });
  say({ type: 'result', is_error: false, result: 'Claude coach answered.' });
});
`);
await chmod(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;

// Ollama: /api/tags, /api/ps (the model loaded, so no boot), /api/chat
const seen = [];
let reply = () => ({ content: 'Your bench is flat at 80 kg.' });
let chatStatus = 200;
const stub = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'qwen3.5:4b', size: 3324173934 }] }));
    if (req.url === '/api/ps') return res.end(JSON.stringify({ models: [{ name: 'qwen3.5:4b', model: 'qwen3.5:4b', size: 3_400_000_000 }] }));
    if (req.url === '/api/chat' && req.method === 'POST') {
      const b = JSON.parse(body);
      seen.push(b);
      if (chatStatus !== 200) { res.statusCode = chatStatus; return res.end('the runner crashed'); }
      const r = reply(b, seen.length);
      return res.end(JSON.stringify({ model: b.model, message: { role: 'assistant', content: r.content || '', ...(r.tool_calls ? { tool_calls: r.tool_calls } : {}) }, done: true, done_reason: 'stop', prompt_eval_count: 900, eval_count: 40 }));
    }
    res.statusCode = 404;
    res.end('{}');
  });
});
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
process.env.NOVA_OLLAMA_URL = `http://127.0.0.1:${stub.address().port}`;

import test from 'node:test';
import assert from 'node:assert/strict';

const vault = path.join(root, 'vault');
await mkdir(path.join(vault, 'Wiki', 'Health'), { recursive: true });
await writeFile(path.join(vault, 'Wiki', 'Health', 'Coaching Principles.md'), '# Coaching Principles\n## Volume\n- 10-20 hard sets per muscle a week.\n## Deloads\n- Deload when HRV drops 10% for three days.\n');
await writeFile(path.join(vault, 'Wiki', 'Health', 'What Works For Hayden.md'), '# What Works For Hayden\n- Drop sets keep his lateral raises honest.\n');

const lc = await import('../lib/localCoach.js');
const { startCoachTurn } = await import('../lib/coachTurn.js');
const { getMessageJob, _dropAllWarm } = await import('../lib/claudeCode.js');
const { providerFor, setLocalPrefs, setLanePref, resetLanePref, refreshLocalStatus } = await import('../lib/modelPrefs.js');
const { refreshOllama, _setHeadroomForTests } = await import('../lib/localModel.js');
const { loadExerciseLibrary } = await import('../lib/exercises.js');
const { createRoutine } = await import('../lib/workouts.js');
const { completeSession } = await import('../lib/workoutSessions.js');
const { _reset: resetLocalAsk } = await import('../lib/localAsk.js');

// the fixture, written by the real writers: a Push routine and one session today
const { exercises } = await loadExerciseLibrary(vault);
const bench = exercises.find((e) => e.name === 'Barbell Bench Press');
const fly = exercises.find((e) => e.name === 'Cable Crossover');
const push = await createRoutine(vault, exercises, 'Push', [
  { exerciseId: bench.id, targetSets: 3, targetRepsLow: 6, targetRepsHigh: 8 },
  { exerciseId: fly.id, targetSets: 3, targetRepsLow: 12, targetRepsHigh: 15 },
]);
await completeSession(vault, {
  routineId: push.id, routineName: 'Push',
  exercises: [
    { exerciseId: bench.id, name: bench.name, sets: [{ weight: 80, reps: 6, rpe: 8 }, { weight: 80, reps: 6, rpe: 9 }], note: 'Elbows flared on the last rep' },
    { exerciseId: fly.id, name: fly.name, sets: [{ weight: 15, reps: 12 }] },
  ],
});

test.beforeEach(async () => {
  seen.length = 0;
  chatStatus = 200;
  reply = () => ({ content: 'Your bench is flat at 80 kg.' });
  await resetLanePref();
  await setLocalPrefs({ first: true });
  // the Coach is not local by default (27 Oct bench); these drive its local
  // path, so the scratch board picks This Mac, as he would in Settings
  await setLanePref('coach', { provider: 'local' });
  _setHeadroomForTests(() => ({ ok: true, freeMB: 9000, reason: null }));
  await refreshOllama();
  await resetLocalAsk({ file: true });
  await rm(sentLog, { force: true });
});
test.after(async () => {
  _dropAllWarm();
  _setHeadroomForTests(null);
  stub.closeAllConnections?.();
  await new Promise((r) => stub.close(r));
  await new Promise((r) => setTimeout(r, 200));
  await rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});

async function settle(jobId, ms = 20_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const j = getMessageJob(jobId);
    if (j && j.status !== 'running') return j;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`job ${jobId} never settled`);
}
const claudeTurns = async () => (existsSync(sentLog) ? (await readFile(sentLog, 'utf8')).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const toolCall = (name, args) => ({ tool_calls: [{ function: { name, arguments: args } }] });

/* ------------------------------ the change gate ----------------------------- */

// his own Coach turns, from the Coach's session journals (Jul to Oct 2026)
const ORDERS = [
  'Can you please swap out face pulls in my program for reverse cable crossovers or rear delt flys (whichever is more effective)',
  'Alter my plan to make the recommended tricep and pull up changes',
  'Swap out the Single-Arm Cable Extensions (Cross Body optional)exercise in my plan for a Carter extension that’s a similar but different tricep exercise',
  'Perfect. Apply the change now',
  'Edit the EZ bar reverse curl to say it’s forearms focused not biceps',
  'Make the change, also make it so I can see what each exercise targets when looking at my workouts on the main page',
  'I don’t think I’m performing it correctly so that information helps. Also rename the exercise to make sure it’s noted this is single arm cable overhead tricep extension',
  'Thank you. Yes, swap the attached resource for one that shows the single arm version',
  'Change tricep push down v bar to straight bar attachment',
  'Yes — make this a change: You have flagged your own form on Cable Lateral Raise 5 times across your recent sessions. Propose the exact edits.',
  'Let’s create a new workout split, focused on my upper body goal',
  'Proceed with building that program',
  'I want you to just add the extra workout and create it all',
  'Go ahead and build it',
  'Change the rear delt fly in my program from dumbbells to the machine version',
  'Ensure it’s changed for my active session I am currently doing but don’t change anything else in today’s workout',
  'Okay, nova that looks great. Make that change to my program.',
  'You’ve set up cable lateral raises for 5 sets on two days. Alter the program so it’s 3 sets max',
  'Let’s make the push day have five sets but change it from a standard exercise to a drop set',
  'https://youtu.be/sUFUQVMWdnU?si=abc Make this the form check video for this exercise and rename it to show that it’s unilateral',
  'My Pull-Up has outgrown its rep target — propose the concrete change: weighted, a harder variation from my library, or new targets.',
  'Deload me this week',
  'Move legs to Thursday',
  'Set my protein target to 170 g',
];
const QUESTIONS = [
  'What would be a better alternative exercise than face pulls?',
  'Are face pulls or an alternative actually work keeping in my program while working for increasing muscle size?',
  'Why is my Cable Flys Low Position (per arm weight) stalled, and what\'s the fix?',
  'I want to be performing the best cable exercise for my triceps. Currently I’m doing a standing tricep push down single arm. Is this the best for tricep growth? If not, what should I try instead?',
  'Should I have all 3 of the chest exercises for this one workout? Or should I drop it back to 2? If I drop it back to 2 then which should I remove and why?',
  'Mid-session — talk me through Cable Overhead Tricep Extension: cues, common mistakes, and what matters most for my goals.',
  'What is the optimal pre workout snack or meal?',
  'My upper workout just took 1 and 1/2 hours and I still couldn’t finish two final exercises. What should I do?',
  'My weekly sets for Triceps are under target for my goal — how should I add volume?',
  'Why is my HRV down?',
  'What change could be made to my upper body workout without losing volume? I am happy to try reshuffling an exercise to another session if that’ll help',
  'What would a version of my refined workout plan look like if it was changed to 4 days? I don’t need you to change it but I just want to know what this would look like',
  'Would an adductor/abductor machine exercise be beneficial to add? If so, should I replace Bulgarian split squats since I already am doing hack squats?',
  'How many sets does Andrew huberman and other experts say are needed for optimising muscle growth per week?',
  'should I deload next week given my last three sessions',
  'is my bench progressing or stalling',
  'Drop sets: are they worth it for side delts?',
];

test('wantsChange: his orders are changes, his questions about change are not', () => {
  for (const q of ORDERS) assert.equal(lc.wantsChange(q), true, `an order: ${q}`);
  for (const q of QUESTIONS) assert.equal(lc.wantsChange(q), false, `a question: ${q}`);
  assert.equal(lc.wantsChange(''), false);
});

/* ------------------------------- reading replies ---------------------------- */

test('readCoachReply: ESCALATE, PROPOSE and a document hand up; plain words are the answer', () => {
  assert.deepEqual(lc.readCoachReply('Your bench is flat.'), { escalate: false, text: 'Your bench is flat.' });
  const e = lc.readCoachReply('I cannot swap that here.\nESCALATE: he wants a swap.');
  assert.equal(e.escalate, true);
  assert.equal(e.reason, 'the model on this Mac handed it up: he wants a swap');
  assert.equal(lc.readCoachReply('Sure.\nPROPOSE {"action":"swap"}').reason, 'a change to your program goes to Claude');
  assert.equal(lc.readCoachReply('<<<ARTIFACT {"title":"x"}\n# x').escalate, true);
});

/* --------------------------------- the tools -------------------------------- */

test('tools: a known lift is narrowed, an unknown one names the nearest real names', async () => {
  const log = await lc.runCoachTool(vault, { name: 'training_log', args: { exercise: 'barbell bench press' } });
  assert.match(log, /Barbell Bench Press 80x6@8, 80x6@9/);
  assert.match(log, /his note: "Elbows flared on the last rep"/);
  assert.doesNotMatch(log, /Cable Crossover/, 'narrowed to the lift asked about');

  const unknown = await lc.runCoachTool(vault, { name: 'lift_trend', args: { exercise: 'Zercher Benchpress' } });
  assert.match(unknown, /There is no exercise called "Zercher Benchpress" in his library/);
  const near = /nearest real names: (.*?)\. Use/.exec(unknown)?.[1]?.split('; ') || [];
  assert.ok(near.length >= 1, 'at least one real name offered');
  const names = new Set(exercises.map((e) => e.name));
  for (const n of near) assert.ok(names.has(n), `"${n}" is a real library name`);

  const trend = await lc.runCoachTool(vault, { name: 'lift_trend', args: { exercise: 'Barbell Bench Press' } });
  assert.match(trend, /Barbell Bench Press: /);
  assert.match(await lc.runCoachTool(vault, { name: 'knowledge', args: { query: 'deload' } }), /Deload when HRV drops 10%/);
  assert.match(await lc.runCoachTool(vault, { name: 'nope', args: {} }), /There is no tool "nope"/);
});

test('tools: every result is clipped with an honest marker, and Claude-only directives never reach the model', () => {
  const long = lc.clipResult('x'.repeat(9000));
  assert.ok(long.length <= lc.TOOL_RESULT_CHARS);
  assert.match(long, /\(clipped: ask a narrower question for the rest\)$/);
  assert.equal(lc.clipResult('short'), 'short');
  assert.equal(lc.forLocal('NO TRAINING BLOCK SET. Explain the value. PROPOSE {"action":"block"} to start one.'), 'NO TRAINING BLOCK SET. Explain the value.');
});

/* --------------------------------- the turn --------------------------------- */

test('a question is answered on this Mac: code runs the lookup, the result settles in the Coach shape', async () => {
  reply = (b, n) => (n === 1 ? toolCall('training_log', { exercise: 'bench' }) : { content: 'Your bench was 80 kg for 6 on both sets today.' });
  const jobId = await startCoachTurn(vault, { question: 'How did my bench go today?' });
  const job = await settle(jobId);
  assert.equal(job.status, 'ready', job.error);
  assert.equal(job.result.provider, 'local');
  assert.equal(job.result.text, 'Your bench was 80 kg for 6 on both sets today.');
  assert.deepEqual(job.result.proposals, []);
  assert.ok(job.result.sessionId, 'a session id the client keeps');
  assert.deepEqual(job.result.lookups.map((l) => l.name), ['training_log']);
  // the second call carried the tool's result, computed by code
  const toolMsg = seen[1].messages.find((m) => m.role === 'tool');
  assert.match(toolMsg.content, /Barbell Bench Press 80x6@8/);
  assert.equal(seen[0].think, false, 'thinking off');
  assert.equal(seen[0].options.num_ctx, 16384, 'the one context size every call shares');
  assert.match(seen[0].messages[0].content, /Today is \w+day \d+ \w+ 20\d\d \(20\d\d-\d\d-\d\d\)/, 'the date, written by code');
  assert.match(seen[0].messages[0].content, /TODAY'S PLAN|a rest day/);
  assert.equal((await claudeTurns()).length, 0, 'Claude was never asked');
});

test('the round cap: after four rounds of lookups the model is made to answer, with no tools offered', async () => {
  reply = (b) => (b.tools ? toolCall('recovery', { days: 3 }) : { content: 'I looked four times and found no HRV recorded.' });
  const job = await settle(await startCoachTurn(vault, { question: 'What is my HRV doing?' }));
  assert.equal(job.status, 'ready', job.error);
  assert.equal(seen.length, lc.MAX_ROUNDS + 1);
  assert.ok(!seen.at(-1).tools, 'the last call offers no tools');
  assert.match(seen.at(-1).messages.at(-1).content, /That is all the lookups for this turn/);
  assert.equal(job.result.rounds, lc.MAX_ROUNDS);
});

test('an ESCALATE line hands the turn to Claude on the SAME job id, labelled with why', async () => {
  reply = () => ({ content: 'That needs your program changed.\nESCALATE: he wants the swap made' });
  const jobId = await startCoachTurn(vault, { question: 'What do you reckon about the cable crossover on my push day?' });
  const job = await settle(jobId);
  assert.equal(job.id, jobId);
  assert.equal(job.status, 'ready', job.error);
  assert.equal(job.result.text, 'Claude coach answered.');
  assert.equal(job.result.provider, 'claude');
  assert.equal(job.result.escalated, true);
  assert.equal(job.result.reason, 'the model on this Mac handed it up: he wants the swap made');
  assert.equal((await claudeTurns()).length, 1);
});

test('a PROPOSE in the local reply is never shown or filed: Claude answers, same id', async () => {
  reply = () => ({ content: 'Swap it.\nPROPOSE {"action":"swap","routine":"Push","remove":"Cable Crossover","add":"Pec Deck Machine"}' });
  const jobId = await startCoachTurn(vault, { question: 'Is the cable crossover any good for me?' });
  const job = await settle(jobId);
  assert.equal(job.status, 'ready', job.error);
  assert.equal(job.result.escalated, true);
  assert.equal(job.result.reason, 'a change to your program goes to Claude');
  assert.equal(job.result.text, 'Claude coach answered.');
});

test('a failure before any text (the runner crashed) is answered by Claude on the same job', async () => {
  chatStatus = 500;
  const jobId = await startCoachTurn(vault, { question: 'How is my bench going?' });
  const job = await settle(jobId);
  assert.equal(job.status, 'ready', job.error);
  assert.equal(job.result.escalated, true);
  assert.match(job.result.reason, /^the model on this Mac could not answer: /);
  assert.equal(job.result.text, 'Claude coach answered.');
});

test('a change request never reaches this Mac: Claude answers, unlabelled, as today', async () => {
  const job = await settle(await startCoachTurn(vault, { question: 'Swap the cable crossover for the pec deck machine' }));
  assert.equal(job.status, 'ready', job.error);
  assert.equal(seen.length, 0, 'the local model was not asked');
  assert.equal(job.result.text, 'Claude coach answered.');
  assert.equal(job.result.escalated, undefined);
});

test('a consult and the planner stay on Claude', async () => {
  const consult = await settle(await startCoachTurn(vault, { question: 'How is his bench going?', consulted: { by: 'nova', question: 'How is my bench going?', chain: [] } }));
  assert.notEqual(consult.status, 'running');
  const planned = await settle(await startCoachTurn(vault, { question: 'Review his program in full.', claudeOnly: true }));
  assert.equal(planned.status, 'ready', planned.error);
  assert.equal(seen.length, 0, 'neither ran on this Mac');
  assert.equal((await claudeTurns()).length, 2);
});

test('a session the local Coach opened goes to Claude fresh, carrying what was said', async () => {
  reply = () => ({ content: 'Your bench was 80 kg for 6.' });
  const first = await settle(await startCoachTurn(vault, { question: 'How did my bench go today?' }));
  assert.equal(first.result.provider, 'local');
  const sid = first.result.sessionId;
  const second = await settle(await startCoachTurn(vault, { question: 'Swap the bench for dumbbells then', sessionId: sid }));
  assert.equal(second.status, 'ready', second.error);
  const [turn] = await claudeTurns();
  assert.match(turn.argv, /--session-id/, 'a fresh Claude session, never a --resume of an id Claude never saw');
  assert.doesNotMatch(turn.argv, new RegExp(`--resume ${sid}`));
});

test('the coach lane stays on Claude by default even under local first, and runs here only when he picks This Mac (27 Oct bench)', async () => {
  await resetLanePref('coach');
  assert.equal(providerFor('coach'), 'claude', 'localFirst: false on the lane: built, not the default');
  await setLanePref('coach', { provider: 'local' });
  assert.equal(providerFor('coach'), 'local', 'his own pick wins');
  await resetLanePref('coach');
  assert.equal(providerFor('coach'), 'claude', 'a reset goes back to Claude, never quietly to the Mac');
  await setLanePref('coach', { provider: 'local' }); // the rest of this suite drives the local path
  await refreshLocalStatus().catch(() => {});
});

test('the prompt keeps its stable head first and fits its budget', () => {
  const p = lc.buildLocalCoachPrompt({ today: 'Tuesday 27 October 2026 (2026-10-27)', facts: 'x'.repeat(9000), history: Array.from({ length: 10 }, (_, i) => ({ q: `q${i} ${'w'.repeat(400)}`, a: 'a'.repeat(900) })) });
  assert.ok(p.length <= lc.PROMPT_BUDGET);
  assert.ok(p.startsWith('NOVA OPERATING LENS'));
  assert.ok(p.indexOf('HANDING UP') < p.indexOf('FACTS (computed'), 'the fixed rules before the day\'s facts');
  assert.match(p, /Never write PROPOSE/);
});
