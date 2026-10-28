// The one front door for Ask Nova (lib/askDispatch.js): Claude answers, and
// when Claude fails before a word arrived the model on this Mac stands in on
// the SAME job id the client is polling; when he chose the local model it
// answers outright. The greeting's local path rides here too.
// CLAUDE_BIN is a persistent stream-json stub whose behaviour is picked by a
// marker in the question; the local model is a stub HTTP server; the data
// dir is a temp dir set BEFORE import. Nothing reaches Claude, the real
// model, his server/data or his conversation record.
import { mkdtemp, writeFile, mkdir, readFile, chmod, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

const root = await mkdtemp(path.join(tmpdir(), 'nova-askdispatch-'));
const dataDir = path.join(root, 'data');
await mkdir(dataDir, { recursive: true });
process.env.NOVA_DATA_DIR = dataDir;
const voiceDir = path.join(root, 'voice');
await mkdir(path.join(voiceDir, 'env', 'bin'), { recursive: true });
await writeFile(path.join(voiceDir, 'env', 'bin', 'python'), '#!/bin/sh\nexit 1\n');
process.env.NOVA_VOICE_DIR = voiceDir;
process.env.NOVA_LOCAL_LLM_PORT = '4288';
process.env.NOVA_LOCAL_LLM_WAIT_MS = '1500';
process.env.NOVA_LOCAL_LLM_MODEL = 'mlx-community/Qwen3-4B-Instruct-2507-4bit';
// the stub below speaks the MLX server's /v1; the Ollama shape is
// localModel.test.js's
process.env.NOVA_LOCAL_LLM_BACKEND = 'mlx';
process.env.NOVA_OLLAMA_NO_SPAWN = '1';

const argvLog = path.join(root, 'argv.log');
const stdinLog = path.join(root, 'stdin.log');
const stubBin = path.join(root, 'claude');
await writeFile(stubBin, `#!/usr/bin/env node
require('node:fs').appendFileSync(${JSON.stringify(argvLog)}, process.argv.slice(2).join(' ') + '\\n');
const rl = require('node:readline').createInterface({ input: process.stdin });
const say = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
rl.on('line', (line) => {
  if (!line.trim()) return;
  let text = '';
  try { text = JSON.parse(line).message.content.map((c) => c.text).join(''); } catch {}
  require('node:fs').appendFileSync(${JSON.stringify(stdinLog)}, text + '\\n');
  if (/LIMIT_NOW/.test(text)) {
    say({ type: 'result', is_error: true, result: "You've hit your session limit · resets 11am (Australia/Melbourne)", total_cost_usd: 0 });
    return;
  }
  if (/DIES_EARLY/.test(text)) { process.stderr.write('network is unreachable'); process.exit(1); }
  if (/STREAMS_THEN_DIES/.test(text)) {
    say({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Your bench was ' } } });
    setTimeout(() => process.exit(1), 150);
    return;
  }
  say({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Claude ' } } });
  say({ type: 'result', is_error: false, result: 'Claude answered.' });
});
`);
await chmod(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;

const vault = path.join(root, 'vault');
await mkdir(path.join(vault, 'Wiki'), { recursive: true });
await writeFile(path.join(vault, 'Wiki', 'Bench Press.md'), '# Bench Press\nTop set 92.5 kg x 5.\n');

import test from 'node:test';
import assert from 'node:assert/strict';

const { startAsk, plainReason } = await import('../lib/askDispatch.js');
const { getMessageJob, startGreeting, _dropAllWarm } = await import('../lib/claudeCode.js');
const { setLanePref, resetLanePref, setFallback, refreshLocalStatus, setLocalPrefs } = await import('../lib/modelPrefs.js');
const { _setHeadroomForTests } = await import('../lib/localModel.js');
const { _reset, _flush, isLocalOnlySession, sessionTurns } = await import('../lib/localAsk.js');

const seen = [];
let localReply = 'The model on this Mac says: your top set was 92.5 kg.';
let localStatus = 200; // a test that wants this Mac to fail sets 500
const stub = http.createServer((req, res) => {
  if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); return res.end('{"status":"ok"}'); }
  if (req.url === '/v1/chat/completions' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      seen.push(JSON.parse(body));
      if (localStatus !== 200) { res.statusCode = localStatus; return res.end('the runner crashed'); }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: localReply } }] }));
    });
    return;
  }
  res.statusCode = 404; res.end();
});
await new Promise((r) => stub.listen(4288, '127.0.0.1', r));

test.beforeEach(async () => {
  seen.length = 0;
  localReply = 'The model on this Mac says: your top set was 92.5 kg.';
  localStatus = 200;
  await resetLanePref();
  await setFallback({ enabled: true });
  // the 19 Oct tests were written for Claude first; the local-first tests
  // (27 Oct, at the end) switch it on themselves
  await setLocalPrefs({ first: false });
  _setHeadroomForTests(() => ({ ok: true, swapFreeMB: 8000, reason: null }));
});
test.after(async () => {
  _dropAllWarm();
  _setHeadroomForTests(null);
  stub.closeAllConnections?.();
  await new Promise((r) => stub.close(r));
  await new Promise((r) => setTimeout(r, 200)); // fire-and-forget writes (ledger, spoken log) land first
  await rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});

// every status the job showed, sampled as fast as the poll could
async function watch(jobId, ms = 20_000) {
  const statuses = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const j = getMessageJob(jobId);
    if (j) {
      if (statuses.at(-1) !== j.status) statuses.push(j.status);
      if (j.status !== 'running') return { job: j, statuses };
    }
    await new Promise((r) => setImmediate(r));
  }
  throw new Error('timed out');
}

const SPEND = path.join(dataDir, 'model-spend.json');
async function waitRows(lane, pred) {
  for (let i = 0; i < 200; i++) {
    const rows = existsSync(SPEND) ? (JSON.parse(await readFile(SPEND, 'utf8')).lanes?.[lane] || []) : [];
    if (rows.some(pred)) return rows;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`no matching ${lane} row`);
}

test('plainReason says why Claude did not answer, in his words', () => {
  assert.equal(plainReason({ limited: true }), 'Claude was at its usage limit');
  assert.equal(plainReason({ error: 'getaddrinfo ENOTFOUND api.anthropic.com' }), 'Claude could not be reached');
  assert.equal(plainReason({ error: 'the conversation process exited' }), 'Claude could not answer');
});

test('Claude answers when Claude can: the job is Claude\'s, nothing local runs', async () => {
  const jobId = startAsk(vault, { question: 'how is my bench?', context: 'ctx' });
  const { job } = await watch(jobId);
  assert.equal(job.status, 'ready', job.error);
  assert.equal(job.result.text, 'Claude answered.');
  assert.equal(job.result.provider, undefined);
  assert.equal(seen.length, 0);
  // and the session memory keeps Claude's turn, for a later stand-in
  await _flush();
  assert.equal(sessionTurns(job.result.sessionId).at(-1).provider, 'claude');
});

test('(h) a Claude job limited before any text falls back: the ORIGINAL id ends ready, local, labelled', async () => {
  const jobId = startAsk(vault, { question: 'LIMIT_NOW what was my bench top set?', context: 'ctx' });
  const { job, statuses } = await watch(jobId);
  assert.deepEqual(statuses, ['running', 'ready'], 'the poll never saw the error');
  assert.equal(job.id, jobId);
  assert.equal(job.result.provider, 'local');
  assert.equal(job.result.fallback, true);
  assert.equal(job.result.reason, 'Claude was at its usage limit');
  assert.equal(job.result.text, 'The model on this Mac says: your top set was 92.5 kg.', 'labelled by the result, no spoken lead line');
  assert.equal(job.error, null);
  assert.match(job.claudeError, /usage limit|session limit/i, 'Claude\'s own error is kept on the job');
  assert.equal(seen.length, 1, 'the local model was asked once');
  assert.match(seen[0].messages.at(-1).content, /LIMIT_NOW/);
  // both runs are on the ledger
  const rows = await waitRows('ask-nova', (r) => r.provider === 'local' && r.fallback === true);
  assert.ok(rows.some((r) => r.limited === true), 'the limited Claude turn is on the ledger too');
});

test('a Claude process that dies before any text (the network gone) falls back too', async () => {
  const jobId = startAsk(vault, { question: 'DIES_EARLY what is my squat?', context: 'ctx' });
  const { job, statuses } = await watch(jobId);
  assert.deepEqual(statuses, ['running', 'ready']);
  assert.equal(job.result.provider, 'local');
  assert.equal(job.result.fallback, true);
  assert.match(job.result.reason, /^Claude could not (be reached|answer)$/);
});

test('(i) a Claude job that already streamed text does NOT fall back', async () => {
  const jobId = startAsk(vault, { question: 'STREAMS_THEN_DIES bench?', context: 'ctx' });
  const { job } = await watch(jobId);
  assert.equal(job.status, 'error');
  assert.match(job.partial, /^Your bench was/);
  assert.equal(seen.length, 0, 'the local model was not asked');
  assert.equal(job.result, null);
});

test('(j) with the fallback off, the limit error stands', async () => {
  await setFallback({ enabled: false });
  const jobId = startAsk(vault, { question: 'LIMIT_NOW bench?', context: 'ctx' });
  const { job } = await watch(jobId);
  assert.equal(job.status, 'error');
  assert.equal(job.limited, true);
  assert.match(job.error, /limit/i);
  assert.equal(seen.length, 0);
});

test('no memory to load the model, and it is not running: the limit error stands, unchanged', async () => {
  stub.closeAllConnections?.();
  await new Promise((r) => stub.close(r));
  try {
    await refreshLocalStatus(); // the board now reads the model as not running
    _setHeadroomForTests(() => ({ ok: false, swapFreeMB: 300, reason: 'this Mac has only 300 MB of swap free' }));
    const jobId = startAsk(vault, { question: 'LIMIT_NOW bench?', context: 'ctx' });
    const { job } = await watch(jobId);
    assert.equal(job.status, 'error');
    assert.equal(job.limited, true);
    assert.match(job.error, /limit/i);
    assert.equal(job.result, null);
  } finally {
    await new Promise((r) => stub.listen(4288, '127.0.0.1', r));
    _setHeadroomForTests(() => ({ ok: true, swapFreeMB: 8000, reason: null }));
    await refreshLocalStatus();
  }
});

test('he chose the local model: Ask Nova answers on this Mac without spawning Claude; the next Claude turn opens fresh with what was said', async () => {
  await _reset({ file: true });
  await setLanePref('ask-nova', { provider: 'local' });
  const before = existsSync(argvLog) ? (await readFile(argvLog, 'utf8')).length : 0;
  const jobId = startAsk(vault, { question: 'what was my bench top set?', context: 'ctx' });
  const { job } = await watch(jobId);
  assert.equal(job.status, 'ready', job.error);
  assert.equal(job.result.provider, 'local');
  assert.equal(job.result.fallback, false);
  assert.equal(existsSync(argvLog) ? (await readFile(argvLog, 'utf8')).length : 0, before, 'Claude was never spawned');
  await _flush();
  const sid = job.result.sessionId;
  assert.equal(isLocalOnlySession(sid), true);

  // back on Claude: the local session is new to Claude, so it opens it
  // (--session-id, never --resume of an id Claude never had) with the history
  await resetLanePref('ask-nova');
  const next = startAsk(vault, { question: 'and my squat?', context: 'ctx', sessionId: sid });
  const done = await watch(next);
  assert.equal(done.job.status, 'ready', done.job.error);
  const argv = (await readFile(argvLog, 'utf8')).trim().split('\n').pop();
  assert.match(argv, new RegExp(`--session-id ${sid}`));
  assert.doesNotMatch(argv, /--resume/);
  await _flush();
  assert.equal(isLocalOnlySession(sid), false, 'Claude has it now');
});

test('(k) the greeting on the local model: one call, a local row, the job shape unchanged', async () => {
  await setLanePref('greeting', { provider: 'local' });
  localReply = 'Good morning, sir. Three drafts are waiting.';
  const jobId = startGreeting(vault, { facts: 'Local time: 07:12.\nHis Inbox holds 3 pending drafts.' });
  const { job } = await watch(jobId);
  assert.equal(job.status, 'ready', job.error);
  assert.equal(job.result.text, 'Good morning, sir. Three drafts are waiting.');
  assert.equal(job.result.provider, 'local');
  assert.match(seen[0].messages.at(-1).content, /His Inbox holds 3 pending drafts/);
  const rows = await waitRows('greeting', (r) => r.provider === 'local');
  assert.equal(rows.at(-1).usd, 0);
  assert.equal(rows.at(-1).fallback, false);
});

test('the greeting at Claude\'s limit, fallback on: said by the model on this Mac, marked as a stand-in', async () => {
  localReply = 'Evening, sir.';
  const jobId = startGreeting(vault, { facts: 'LIMIT_NOW Local time: 19:02.' });
  const { job, statuses } = await watch(jobId);
  assert.deepEqual(statuses, ['running', 'ready']);
  assert.equal(job.result.text, 'Evening, sir.');
  assert.equal(job.result.provider, 'local');
  assert.equal(job.result.fallback, true);
  assert.equal(job.error, null);
});

/* ------------------- local first, Claude as the escalation (27 Oct 2026) ------------------- */

test('local first: a local turn that fails before any text is carried to Claude on the SAME job id, labelled escalated', async () => {
  await _reset({ file: true });
  await setLocalPrefs({ first: true });
  localStatus = 500;
  const jobId = startAsk(vault, { question: 'how is my bench?', context: 'ctx' });
  const { job, statuses } = await watch(jobId);
  assert.deepEqual(statuses, ['running', 'ready'], 'the poll never saw the local error');
  assert.equal(job.id, jobId);
  assert.equal(getMessageJob(jobId), job, 'the client polls the same job');
  assert.equal(job.result.text, 'Claude answered.');
  assert.equal(job.result.provider, 'claude');
  assert.equal(job.result.escalated, true);
  assert.match(job.result.reason, /^the model on this Mac could not answer: .*500/);
  assert.equal(job.error, null);
  assert.ok(seen.length >= 1, 'this Mac was asked first');
  // the local failure and Claude's answer are both on the ledger
  const rows = await waitRows('ask-nova', (r) => r.provider === 'local' && r.error);
  assert.match(rows.find((r) => r.provider === 'local' && r.error).error, /500/);
  // Claude's turn is in the session memory, so a later local turn knows it
  for (let i = 0; i < 50 && !sessionTurns(job.result.sessionId).length; i++) await new Promise((r) => setTimeout(r, 20));
  await _flush();
  assert.equal(sessionTurns(job.result.sessionId).at(-1).provider, 'claude');
  assert.equal(isLocalOnlySession(job.result.sessionId), false);
});

test('local first: when Claude cannot answer either, the error is Claude\'s with why this Mac did not answer first', async () => {
  await setLocalPrefs({ first: true });
  localStatus = 500;
  const jobId = startAsk(vault, { question: 'LIMIT_NOW bench?', context: 'ctx' });
  const { job, statuses } = await watch(jobId);
  assert.deepEqual(statuses, ['running', 'error']);
  assert.match(job.error, /limit/i);
  assert.match(job.error, /The model on this Mac could not answer first: .*500/);
  assert.equal(job.result, null);
});

test('local first: a local answer stays local, and Claude is never spawned', async () => {
  await setLocalPrefs({ first: true });
  const before = existsSync(argvLog) ? (await readFile(argvLog, 'utf8')).length : 0;
  const jobId = startAsk(vault, { question: 'what was my bench top set?', context: 'ctx' });
  const { job } = await watch(jobId);
  assert.equal(job.status, 'ready', job.error);
  assert.equal(job.result.provider, 'local');
  assert.equal(job.result.escalated, undefined);
  assert.equal(existsSync(argvLog) ? (await readFile(argvLog, 'utf8')).length : 0, before);
});

test('local first: the greeting this Mac cannot compose is said by Claude, labelled escalated', async () => {
  await setLocalPrefs({ first: true });
  localStatus = 500;
  const jobId = startGreeting(vault, { facts: 'Local time: 07:12.' });
  const { job, statuses } = await watch(jobId);
  assert.deepEqual(statuses, ['running', 'ready']);
  assert.equal(job.result.text, 'Claude answered.');
  assert.equal(job.result.provider, 'claude');
  assert.equal(job.result.escalated, true);
  assert.match(job.result.reason, /could not answer: .*500/);
});

// 29 Oct 2026: the 4B model answered his bench-vs-machine question with "I
// cannot answer" twice; a give-up was spoken as if it were an answer
test('local first: a local reply that gives up is never spoken; Claude answers on the SAME job', async () => {
  await _reset({ file: true });
  await setLocalPrefs({ first: true });
  const kept = localReply;
  localReply = 'Your vault does not contain data comparing the Bench Press to the Machine Chest Press. I cannot answer which is better.';
  try {
    const jobId = startAsk(vault, { question: 'what was my bench top set?', context: 'ctx' });
    const { job, statuses } = await watch(jobId);
    assert.deepEqual(statuses, ['running', 'ready'], 'the poll never saw the give-up or an error');
    assert.equal(getMessageJob(jobId), job);
    assert.equal(job.result.text, 'Claude answered.');
    assert.equal(job.result.provider, 'claude');
    assert.equal(job.result.escalated, true);
    assert.equal(job.result.reason, 'the model on this Mac could not answer it');
    assert.ok(seen.length >= 1, 'this Mac was asked first');
  } finally { localReply = kept; }
});

test('local first: his correction of the last answer goes straight to Claude, labelled, and this Mac is never asked', async () => {
  await setLocalPrefs({ first: true });
  const asked = seen.length;
  const jobId = startAsk(vault, { question: "You seem to be getting confused. I'm literally just asking you a simple question.", context: 'ctx' });
  const { job } = await watch(jobId);
  assert.equal(job.status, 'ready', job.error);
  assert.equal(job.result.text, 'Claude answered.');
  assert.equal(job.result.provider, 'claude');
  assert.equal(job.result.escalated, true);
  assert.equal(job.result.reason, 'you corrected the last answer');
  assert.equal(seen.length, asked, 'the model on this Mac was not asked');
});

test('local first: a give-up after the agents answered hands Claude what they said, on the SAME job', async () => {
  await _reset({ file: true });
  await setLocalPrefs({ first: true });
  const { _setConsultDepsForTest } = await import('../lib/consult.js');
  const asked = [];
  const stand = (id) => async () => { asked.push(id); return { text: `${id}: both grow the chest about the same.` }; };
  _setConsultDepsForTest({ coach: stand('coach'), researcher: stand('researcher') });
  localReply = 'I cannot answer which is better.';
  try {
    const jobId = startAsk(vault, { question: 'Does it really matter if I did a standard barbell bench press or a machine chest press?', context: 'ctx' });
    const before = getMessageJob(jobId);
    const { job, statuses } = await watch(jobId);
    assert.deepEqual(statuses, ['running', 'ready'], 'the give-up was never shown');
    assert.deepEqual(asked.sort(), ['coach', 'researcher'], 'this Mac asked the agents itself');
    assert.equal(job, before);
    assert.equal(job.result.text, 'Claude answered.');
    assert.equal(job.result.escalated, true);
    assert.equal(job.result.reason, 'the model on this Mac could not answer it from what the agents said');
    assert.match(job.agentAnswers, /FROM THE COACH:\ncoach: both grow/);
    // Claude was handed the answers: they ride in its prompt
    const sent = (await readFile(argvLog, 'utf8')) + (await readFile(stdinLog, 'utf8'));
    assert.match(sent, /already asked the agents/);
    assert.match(sent, /researcher: both grow the chest/);
  } finally { _setConsultDepsForTest(null); }
});
