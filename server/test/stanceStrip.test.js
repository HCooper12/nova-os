// A STANCE NEVER LEAVES THE GLASS: the server's half of the strip audit for
// "red when Nova pushes back" (4 Oct 2026; the client's half and the rules
// are in stance.test.js).
//
// `VIS {"stance":"contest"}` is a directive for the screen. It must never be
// spoken, shown as words, filed, sent or stored. Every path below takes a
// model reply that carries one, through the real code, and checks what comes
// out the far end: no "VIS", no "stance", no JSON. Each test also proves the
// stance really was in what the model wrote, so a pass is never vacuous.
//
// No real model runs: CLAUDE_BIN is a stub that answers with the stance
// reply. NOVA_DATA_DIR and the vault are temp dirs, all set BEFORE import:
// tests without their own data dir once wrote fake rows into his live
// conversation record. Telegram's API is stubbed in-process: no request ever
// leaves the machine.
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const RAW = [
  'VIS {"kind":"key","label":"THE ASK","caption":"a sixth training day"}',
  'I hear you on adding a sixth day.',
  'VIS {"stance":"contest"}',
  'I would not add it this block.',
  'Your sleep has averaged six hours, and recovery is the limit.',
].join('\n');
const CONTEST = 'I would not add it this block.';
const DOC_RAW = [
  'I have put the reasoning in a document.',
  '<<<ARTIFACT {"title":"Why not a sixth day","kind":"doc","summary":"the case against, this block"}',
  '# Why not a sixth day',
  'VIS {"stance":"contest"}',
  'I would not add it this block.',
  'Six hours of sleep is the limit.',
  'ARTIFACT>>>',
  'VIS {"stance":"contest"}',
  'I would not add it yet.',
].join('\n');

const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-stance-stub-'));
const stubBin = path.join(stubDir, 'claude');
writeFileSync(stubBin, `#!/usr/bin/env node
// The model, stubbed: every answer pushes back. The reply is chosen from the
// words in the message (the consulted Coach's prompt carries Nova's question
// too, so its own marker is checked first).
const RAW = ${JSON.stringify(RAW)};
const DOC = ${JSON.stringify(DOC_RAW)};
const reply = (text) => {
  if (/The agents you consulted have answered/.test(text)) return RAW;
  if (/PUSHBACK_COACH/.test(text)) return RAW;
  if (/PUSHBACK_CONSULT/.test(text)) return 'Let me ask the Coach.\\nCONSULT {"asks":[{"agent":"coach","question":"PUSHBACK_COACH should he add a sixth training day?"}]}';
  if (/PUSHBACK_DOC/.test(text)) return DOC;
  return RAW;
};
const argv = process.argv.slice(2);
if (argv.includes('--input-format')) {
  const rl = require('node:readline').createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let text = '';
    try { text = JSON.parse(line).message.content.map((c) => c.text).join(''); } catch {}
    const out = reply(text);
    process.stdout.write(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: out }] } }) + '\\n');
    process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: out }) + '\\n');
  });
} else {
  const prompt = argv[argv.indexOf('-p') + 1] || '';
  process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: reply(prompt) }));
}
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-stance-strip-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

const vault = mkdtempSync(path.join(tmpdir(), 'nova-stance-strip-vault-'));
mkdirSync(path.join(vault, 'Wiki', 'Health'), { recursive: true });

// TELEGRAM, IN-PROCESS: api.telegram.org never sees a request from this file.
// Anything else (the local Siri server below) goes through untouched.
const realFetch = globalThis.fetch;
const telegram = { sent: [], delivered: false };
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (!u.startsWith('https://api.telegram.org/')) return realFetch(url, init);
  const method = u.slice(u.lastIndexOf('/') + 1);
  const body = init?.body ? JSON.parse(init.body) : {};
  let result = true;
  if (method === 'getUpdates') {
    if (!telegram.delivered) {
      telegram.delivered = true;
      result = [{ update_id: 1, message: { message_id: 1, chat: { id: 4242 }, text: 'PUSHBACK_TELEGRAM what do you think about a sixth training day' } }];
    } else {
      await new Promise((r) => setTimeout(r, 40));
      result = [];
    }
  } else if (method === 'sendMessage') {
    telegram.sent.push(body);
    result = { message_id: telegram.sent.length };
  }
  return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'content-type': 'application/json' } });
};

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { startAskNova, startAskCoach, startAskLeader, getMessageJob, _dropAllWarm } = await import('../lib/claudeCode.js');
const { voiceRouter } = await import('../routes/voice.js');
const { readTurns, appendTurns, recentConversationBlock } = await import('../lib/conversationLog.js');
const { latePush } = await import('../lib/handsFree.js');
const { startTelegramBridge } = await import('../lib/telegram.js');
const { pendingTurns } = await import('../../src/conversationSync.js');
const { parseVisualStream } = await import('../../src/visualBeats.js');
const { streamShown } = await import('../../src/artifactClient.js');

test.after(() => { _dropAllWarm(); });

function assertClean(s, where) {
  const t = String(s ?? '');
  assert.doesNotMatch(t, /VIS/, `${where}: the directive word leaked: ${JSON.stringify(t)}`);
  assert.doesNotMatch(t, /stance|contest/i, `${where}: the stance leaked: ${JSON.stringify(t)}`);
  assert.doesNotMatch(t, /[{}]|"\w+":/, `${where}: JSON leaked: ${JSON.stringify(t)}`);
}
const waitFor = async (pred, ms = 30_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await pred();
    if (r) return r;
    await new Promise((r2) => setTimeout(r2, 25));
  }
  throw new Error('timed out waiting');
};
const settled = (jobId) => waitFor(() => { const j = getMessageJob(jobId); return j && j.status !== 'running' ? j : null; });
const ready = async (jobId) => {
  const j = await settled(jobId);
  assert.equal(j.status, 'ready', j.error || 'the job failed');
  return j;
};
// the stance really was in what the model wrote
const wroteStance = (job) => assert.match(String(job.partial || ''), /VIS \{"stance":"contest"\}/, 'the model\'s own words carried the stance');

let askJob = null;

test('STRIP · Ask Nova: the stance reaches the job, and the answer he is given is clean (claudeCode.js warm turn)', async () => {
  askJob = await ready(startAskNova(vault, { question: 'PUSHBACK_ASK what do you think about a sixth training day', context: 'ctx' }));
  wroteStance(askJob);
  assertClean(askJob.result.text, 'Ask Nova result');
  assert.ok(askJob.result.text.includes(CONTEST), askJob.result.text);
});

test('STRIP · the Coach and the Leader: their answers are clean (the same warm-turn strip)', async () => {
  const coach = await ready(startAskCoach(vault, { question: 'PUSHBACK_ASK should I add a sixth day', context: 'ctx' }));
  wroteStance(coach);
  assertClean(coach.result.text, 'Coach result');
  assert.ok(coach.result.text.includes(CONTEST));
  const leader = await ready(startAskLeader(vault, { question: 'PUSHBACK_ASK should I raise it in front of the team', context: 'ctx' }));
  wroteStance(leader);
  assertClean(leader.result.text, 'Leader result');
  assert.ok(leader.result.text.includes(CONTEST));
});

test('STRIP · a consulted answer: clean in the reply, in what Nova is handed, and in the roster the record keeps', async () => {
  // a consulted turn attaches no glass, so the warm-turn strip does not run:
  // finishConsulted strips it itself (stripDirectives over parseVisualStream)
  const direct = await ready(startAskNova(vault, { question: 'PUSHBACK_ASK q', context: 'ctx', consulted: { by: 'coach', question: 'q', chain: ['coach'] } }));
  wroteStance(direct);
  assertClean(direct.result.text, 'consulted Nova');
  // Nova asks the Coach; the Coach's consulted answer pushes back too
  const job = await ready(startAskNova(vault, { question: 'PUSHBACK_CONSULT should I add a sixth training day', context: 'ctx' }));
  assert.ok(Array.isArray(job.result.consult) && job.result.consult.length === 1, JSON.stringify(job.result.consult));
  const asked = job.result.consult[0];
  assert.equal(asked.agent, 'coach');
  assert.equal(asked.ok, true, asked.error);
  assertClean(asked.answer, 'the Coach\'s answer on the roster');
  assert.ok(asked.answer.includes(CONTEST));
  assertClean(job.result.text, 'the synthesis');
  assert.ok(job.result.text.includes(CONTEST));
});

test('STRIP · Siri and the Shortcuts: the reply spoken back and the rows written to the record are clean', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', voiceRouter(vault));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  // a spoken conversation already open, so the ask resumes it (no context
  // assembly), as consultSiriCards.test.js does
  const { takeSpokenSession } = await import('../lib/spokenSession.js');
  takeSpokenSession();
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/ask/sync`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'PUSHBACK_SIRI what do you think about a sixth training day' }),
    });
    const body = JSON.parse((await res.text()).trim());
    assert.equal(body.error, undefined, body.text);
    assertClean(body.text, 'what Siri says');
    assert.ok(body.text.includes(CONTEST), body.text);
    const rows = await waitFor(async () => {
      const got = await readTurns({ limit: 100 });
      return got.some((r) => r.via === 'siri' && r.who === 'nova') ? got : null;
    });
    const siri = rows.filter((r) => r.via === 'siri');
    assert.ok(siri.some((r) => r.who === 'you') && siri.some((r) => r.who === 'nova'));
    for (const r of siri) assertClean(r.text, `record row (${r.who})`);
  } finally {
    server.close();
  }
});

test('STRIP · Telegram: the message sent to his phone is clean', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'stance-test-token';
  process.env.TELEGRAM_CHAT_ID = '4242';
  const stop = startTelegramBridge(vault);
  try {
    const sent = await waitFor(() => telegram.sent.find((m) => String(m.text || '').includes('sixth') || String(m.text || '').includes(CONTEST)), 60_000);
    assert.equal(String(sent.chat_id), '4242');
    assertClean(sent.text, 'Telegram message');
    assert.ok(sent.text.includes(CONTEST), sent.text);
    for (const m of telegram.sent) assertClean(m.text, 'every Telegram message');
  } finally {
    stop?.();
    await new Promise((r) => setTimeout(r, 150)); // let the poll loop see it stop
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  }
});

test('STRIP · notifications: the late-answer push carries clean words', () => {
  assert.ok(askJob, 'the Ask Nova job ran');
  const note = latePush(askJob, askJob.id);
  assertClean(note.title, 'push title');
  assertClean(note.body, 'push body');
  assert.equal(note.body, 'I hear you on adding a sixth day.');
});

test('STRIP · documents saved from a reply: the filed document holds no stance line, and neither does the reply', async () => {
  const job = await ready(startAskNova(vault, { question: 'PUSHBACK_DOC put the case against a sixth day in a document', context: 'ctx' }));
  wroteStance(job);
  assertClean(job.result.text.replace(/\[\[artifact:[a-z0-9-]+\]\]/g, ''), 'the reply around the document');
  assert.equal(job.result.artifacts.length, 1);
  const file = readFileSync(path.join(vault, job.result.artifacts[0].path), 'utf8');
  const body = file.slice(file.indexOf('\n---', 3) + 4);
  assertClean(body, 'the filed document');
  assert.ok(body.includes(CONTEST), body);
});

test('STRIP · the chat mirror and the record: only settled lines go up, and they are clean; Nova reads back clean', async () => {
  assert.ok(askJob);
  // while it streams, the line holds what the client's parser left
  const streaming = parseVisualStream(streamShown(askJob.partial)).text;
  assertClean(streaming, 'the streaming line');
  const T = Date.now();
  const chat = [
    { at: T, who: 'you', text: 'What do you think about a sixth training day?' },
    { at: T + 1, who: 'nova', text: streaming, streaming: true },
  ];
  assert.deepEqual(pendingTurns(chat, {}, { dev: 'stancedev' }).map((r) => r.who), ['you'], 'a streaming line is never mirrored');
  // settled: the job's own text, exactly as App commits it
  const settledChat = [chat[0], { at: T + 1, who: 'nova', text: askJob.result.text }];
  const rows = pendingTurns(settledChat, {}, { dev: 'stancedev' });
  for (const r of rows) assertClean(r.text, 'mirrored row');
  await appendTurns(rows);
  const back = (await readTurns({ limit: 200 })).filter((r) => String(r.id).startsWith('stancedev'));
  assert.equal(back.length, 2);
  for (const r of back) assertClean(r.text, 'record row');
  const block = await recentConversationBlock();
  assertClean(block.slice(block.indexOf('\n')), 'Nova\'s read-back of the record');
});
