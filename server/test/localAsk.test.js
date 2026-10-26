// Ask Nova on the model on this Mac (lib/localAsk.js): the prompt map, the
// vault tools run by code, both tool-call forms, the round cap, the session
// memory, and the reply settling on Claude's own rails. Everything external
// is a stub: the local model is a stub OpenAI-compatible HTTP server, the
// vault a temp folder, NOVA_DATA_DIR a temp dir set BEFORE any import, and
// CLAUDE_BIN a script that fails, so nothing here can reach Claude, load the
// real model, or write his real server/data or conversation record.
import { mkdtemp, writeFile, mkdir, readFile, chmod, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

const root = await mkdtemp(path.join(tmpdir(), 'nova-localask-'));
const dataDir = path.join(root, 'data');
await mkdir(dataDir, { recursive: true });
process.env.NOVA_DATA_DIR = dataDir;
const voiceDir = path.join(root, 'voice');
await mkdir(path.join(voiceDir, 'env', 'bin'), { recursive: true });
await writeFile(path.join(voiceDir, 'env', 'bin', 'python'), '#!/bin/sh\nexit 1\n');
process.env.NOVA_VOICE_DIR = voiceDir;
process.env.NOVA_LOCAL_LLM_PORT = '4289';
process.env.NOVA_LOCAL_LLM_WAIT_MS = '1500';
process.env.NOVA_LOCAL_LLM_MODEL = 'mlx-community/Qwen3-4B-Instruct-2507-4bit';
// Pinned to the MLX backend (27 Oct 2026): this suite is about the turn
// (prompt, tool loop, settling, session memory), and its stub speaks /v1,
// where the tool-call text form and the 400 retry still live. The native
// Ollama request and reply shapes are localModel.test.js's, including a
// tool call round-tripped through readToolCalls.
process.env.NOVA_LOCAL_LLM_BACKEND = 'mlx';
process.env.NOVA_OLLAMA_NO_SPAWN = '1';
const claudeBin = path.join(root, 'claude-fails.sh');
await writeFile(claudeBin, '#!/bin/sh\necho "no Claude in this test" >&2\nexit 1\n');
await chmod(claudeBin, 0o755);
process.env.CLAUDE_BIN = claudeBin;

// the vault
const vault = path.join(root, 'vault');
await mkdir(path.join(vault, 'Wiki', 'Training'), { recursive: true });
await mkdir(path.join(vault, '.obsidian'), { recursive: true });
await writeFile(path.join(vault, '.obsidian', 'secret.md'), 'bench secret settings\n');
const benchLines = ['# Bench Press', '', 'Top set 2026-10-14: 92.5 kg x 5 at RPE 8.', 'Cue: feet planted, bar to the lower chest.'];
for (let i = 0; i < 200; i++) benchLines.push(`filler line ${i}`);
await writeFile(path.join(vault, 'Wiki', 'Training', 'Bench Press.md'), benchLines.join('\n'));
await writeFile(path.join(vault, 'Wiki', 'Training', 'Squat.md'), '# Squat\nTop set 120 kg x 3.\n');
const many = path.join(vault, 'Wiki', 'Many');
await mkdir(many, { recursive: true });
for (let i = 0; i < 30; i++) await writeFile(path.join(many, `Note ${String(i).padStart(2, '0')}.md`), `bench mention ${i}\nanother bench line ${i}\n`);
await writeFile(path.join(root, 'outside.md'), 'not his vault\n');

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  startAskLocal, buildLocalAskPrompt, vaultRead, vaultSearch, vaultList, readToolCalls, stripThink,
  recordAskTurn, sessionTurns, _reset, _flush, PROMPT_BUDGET, MAX_ROUNDS, progressLine,
} = await import('../lib/localAsk.js');
const { getMessageJob } = await import('../lib/claudeCode.js');
const { setLanePref, resetLanePref } = await import('../lib/modelPrefs.js');
const { _setHeadroomForTests } = await import('../lib/localModel.js');
const { listRecords } = await import('../lib/inboxStore.js');

// the stub local model: `reply(body, n)` decides each answer
const seen = [];
let reply = () => ({ message: { role: 'assistant', content: 'A plain answer, sir.' } });
const CLASSIFIER = '{"route":"note","confidence":"high","title":"Call the physio","reason":"a thing to remember","payload":{"body":"Call the physio on Monday"}}';
const stub = http.createServer((req, res) => {
  if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); return res.end('{"status":"ok"}'); }
  if (req.url === '/v1/chat/completions' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const b = JSON.parse(body);
      res.setHeader('Content-Type', 'application/json');
      // the capture classifier rides the same stub (inbox-classify set local)
      if (/Reply with only the JSON/.test(b.messages?.[0]?.content || '')) {
        return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: CLASSIFIER } }] }));
      }
      seen.push(b);
      const out = reply(b, seen.length);
      if (out.status) { res.statusCode = out.status; return res.end(out.body || 'refused'); }
      res.end(JSON.stringify({ choices: [{ message: out.message }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
    });
    return;
  }
  res.statusCode = 404; res.end();
});
await new Promise((r) => stub.listen(4289, '127.0.0.1', r));

test.beforeEach(async () => {
  seen.length = 0;
  await resetLanePref();
  await setLanePref('inbox-classify', { provider: 'local' });
  _setHeadroomForTests(() => ({ ok: true, swapFreeMB: 8000, reason: null }));
});
test.after(async () => {
  _setHeadroomForTests(null);
  // closeAllConnections first: a keep-alive socket holds close() open forever
  stub.closeAllConnections?.();
  await new Promise((r) => stub.close(r));
  await new Promise((r) => setTimeout(r, 200)); // fire-and-forget writes (ledger, spoken log) land first
  await rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});

async function settled(jobId, ms = 20_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const j = getMessageJob(jobId);
    if (j && j.status !== 'running') return j;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out waiting for the local job');
}

// the ledger is written fire-and-forget: wait for the rows to land
async function waitRows(lane, n) {
  const file = path.join(dataDir, 'model-spend.json');
  for (let i = 0; i < 200; i++) {
    const rows = existsSync(file) ? (JSON.parse(await readFile(file, 'utf8')).lanes?.[lane] || []) : [];
    if (rows.length >= n) return rows;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`no ${lane} rows on the ledger`);
}

const toolCall = (name, args, id = `c${Math.random().toString(36).slice(2, 7)}`) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

test('(a) a turn with no tool call answers and settles: a PROPOSE capture becomes a pending record, the text cleaned', async () => {
  reply = () => ({ message: { role: 'assistant', content: 'Drafted it, sir: say yes to keep it.\nPROPOSE {"kind":"capture","text":"Call the physio on Monday"}' } });
  const jobId = startAskLocal(vault, { question: 'remind me to call the physio', sessionId: null });
  const job = await settled(jobId);
  assert.equal(job.status, 'ready', job.error);
  assert.equal(job.result.provider, 'local');
  assert.equal(job.result.fallback, false);
  assert.equal(job.result.reason, null);
  assert.doesNotMatch(job.result.text, /PROPOSE/);
  assert.match(job.result.text, /Drafted it/);
  assert.ok(job.result.proposal?.recordId, `the proposal is on the rails: ${job.result.text}`);
  const rec = (await listRecords()).find((r) => r.id === job.result.proposal.recordId);
  assert.equal(rec.status, 'pending');
  assert.equal(rec.text, 'Call the physio on Monday');
  assert.ok(job.result.sessionId, 'a session id comes back for the client to keep');
  // the request: system prompt then his question, the tools offered
  assert.equal(seen[0].messages[0].role, 'system');
  assert.equal(seen[0].messages.at(-1).content, 'remind me to call the physio');
  assert.deepEqual(seen[0].tools.map((t) => t.function.name), ['vault_search', 'vault_read', 'vault_list']);
  // the ledger: a free local row
  const row = (await waitRows('ask-nova', 1)).at(-1);
  assert.equal(row.provider, 'local');
  assert.equal(row.usd, 0);
  assert.equal(row.model, 'local:mlx-community/Qwen3-4B-Instruct-2507-4bit');
  // never the conversation record
  assert.equal(existsSync(path.join(dataDir, 'conversation')), false);
});

test('(b) a tool_calls round trip: search, then read, run by code over the vault, capped, fed back; the answer cites the page', async () => {
  reply = (b, n) => {
    if (n === 1) return { message: { role: 'assistant', content: '', tool_calls: [toolCall('vault_search', { query: 'bench' }, 's1')] } };
    if (n === 2) return { message: { role: 'assistant', content: '', tool_calls: [toolCall('vault_read', { path: 'Wiki/Training/Bench Press.md' }, 'r1')] } };
    return { message: { role: 'assistant', content: 'Your Bench Press note says the top set was 92.5 kg for 5.' } };
  };
  const jobId = startAskLocal(vault, { question: 'what was my last bench top set?' });
  const job = await settled(jobId);
  assert.equal(job.status, 'ready', job.error);
  assert.match(job.result.text, /Bench Press note says .*92\.5 kg/);
  assert.deepEqual(job.result.lookups.map((l) => l.name), ['vault_search', 'vault_read']);
  // round 2 carried the search result as a tool message, capped at 12 hits
  const searchMsg = seen[1].messages.find((m) => m.role === 'tool' && m.tool_call_id === 's1');
  assert.ok(searchMsg, 'the search result went back as a tool message');
  const hits = searchMsg.content.split('\n');
  assert.equal(hits.length, 12, 'search is capped at 12 hits');
  assert.match(hits[0], /^Wiki\/Training\/Bench Press\.md:1: /, 'a page whose name matches comes first');
  assert.ok(hits.every((h) => /^[^:]+\.md:\d+: /.test(h)), 'every hit is path:line: text');
  assert.ok(!searchMsg.content.includes('.obsidian'), 'Obsidian\'s own folder is never searched');
  // the assistant turn that asked is echoed back with its tool_calls
  const asked = seen[1].messages.find((m) => m.role === 'assistant');
  assert.equal(asked.tool_calls[0].function.name, 'vault_search');
  // round 3 carried the page, capped at 120 lines
  const readMsg = seen[2].messages.find((m) => m.role === 'tool' && m.tool_call_id === 'r1');
  assert.match(readMsg.content, /^Wiki\/Training\/Bench Press\.md\n# Bench Press/);
  assert.match(readMsg.content, /92\.5 kg x 5/);
  assert.match(readMsg.content, /lines 1-120 of 204/);
  assert.ok(readMsg.content.split('\n').length <= 122);
});

test('(c) the <tool_call> text form parses too, and <think> is stripped', async () => {
  reply = (b, n) => {
    if (n === 1) return { message: { role: 'assistant', content: '<think>he wants the squat</think>\n<tool_call>{"name":"vault_read","arguments":{"path":"Squat"}}</tool_call>' } };
    return { message: { role: 'assistant', content: '<think>found it, 120 kg</think>Your Squat note has a top set of 120 kg for 3, sir.' } };
  };
  const job = await settled(startAskLocal(vault, { question: 'what is my squat top set' }));
  assert.equal(job.status, 'ready', job.error);
  assert.equal(job.result.text, 'Your Squat note has a top set of 120 kg for 3, sir.');
  assert.doesNotMatch(job.result.text, /think/);
  const back = seen[1].messages.find((m) => m.role === 'tool');
  assert.match(back.content, /^Wiki\/Training\/Squat\.md\n# Squat/, 'a bare page name found the page');

  // the pure parts
  const parsed = readToolCalls({ content: 'x <tool_call>{"name":"vault_search","arguments":{"query":"sleep"}}</tool_call>' });
  assert.deepEqual(parsed.calls.map((c) => [c.name, c.args.query]), [['vault_search', 'sleep']]);
  assert.equal(parsed.text, 'x');
  assert.equal(stripThink('reasoning without an opener</think>The answer.'), 'The answer.');
  assert.equal(stripThink('The answer.<think>unfinished'), 'The answer.');
});

test('a server that refuses `tools` (400) is asked again once with the tools described in the prompt', async () => {
  reply = (b, n) => {
    if (b.tools) return { status: 400, body: 'tools not supported' };
    if (n === 2) return { message: { role: 'assistant', content: '<tool_call>{"name":"vault_search","arguments":{"query":"squat"}}</tool_call>' } };
    return { message: { role: 'assistant', content: 'Your Squat note says 120 kg.' } };
  };
  const job = await settled(startAskLocal(vault, { question: 'squat?' }));
  assert.equal(job.status, 'ready', job.error);
  assert.equal(seen.length, 3);
  assert.ok(seen[0].tools, 'the first request offered tools');
  assert.equal(seen[1].tools, undefined, 'the retry did not');
  assert.match(seen[1].messages[0].content, /<tool_call>\{"name":"vault_search"/, 'the text form is in the system prompt');
  const back = seen[2].messages.at(-1);
  assert.equal(back.role, 'user');
  assert.match(back.content, /^<tool_response>\nWiki\/Training\/Squat\.md/);
});

test('(d) vault_read and vault_list outside the vault are refused', async () => {
  assert.match(await vaultRead(vault, { path: '../outside.md' }), /^Refused: .* outside his vault/);
  assert.match(await vaultRead(vault, { path: path.join(root, 'outside.md') }), /^Refused/);
  assert.match(await vaultRead(vault, { path: '.obsidian/secret.md' }), /^Refused/);
  assert.match(await vaultList(vault, { folder: '..' }), /^Refused/);
  const listed = await vaultList(vault, { folder: 'Wiki/Training' });
  assert.equal(listed, 'Bench Press.md\nSquat.md');
  const top = await vaultList(vault, {});
  assert.doesNotMatch(top, /\.obsidian/);
  // a list is capped at 60 names; the Many folder holds 30
  assert.equal((await vaultList(vault, { folder: 'Wiki/Many' })).split('\n').length, 30);
  assert.match(await vaultSearch(vault, { query: 'nothing like this anywhere' }), /^No lines/);

  // and through the model: the refusal is what goes back, the turn still answers
  reply = (b, n) => (n === 1
    ? { message: { role: 'assistant', content: '', tool_calls: [toolCall('vault_read', { path: '../../etc/passwd' }, 'x1')] } }
    : { message: { role: 'assistant', content: 'I can\'t read that, sir.' } });
  const job = await settled(startAskLocal(vault, { question: 'read /etc/passwd' }));
  assert.equal(job.status, 'ready');
  assert.match(seen[1].messages.find((m) => m.role === 'tool').content, /^Refused/);
});

test('(e) the round cap: after four lookups the model is asked for the answer, without tools', async () => {
  reply = (b) => (b.tools
    ? { message: { role: 'assistant', content: '', tool_calls: [toolCall('vault_search', { query: 'bench' })] } }
    : { message: { role: 'assistant', content: 'From what I found, the top set was 92.5 kg.' } });
  const job = await settled(startAskLocal(vault, { question: 'bench?' }));
  assert.equal(job.status, 'ready', job.error);
  assert.equal(seen.length, MAX_ROUNDS + 1);
  assert.equal(job.result.lookups.length, MAX_ROUNDS);
  const last = seen.at(-1);
  assert.equal(last.tools, undefined, 'the final request offers no tools');
  assert.match(last.messages.at(-1).content, /Answer him now/);
  assert.equal(last.messages.at(-1).role, 'user');

  // a model that still calls a tool at the end, with no words, is an honest error
  reply = () => ({ message: { role: 'assistant', content: '<tool_call>{"name":"vault_search","arguments":{"query":"x"}}</tool_call>' } });
  const stuck = await settled(startAskLocal(vault, { question: 'bench?' }));
  assert.equal(stuck.status, 'error');
  assert.match(stuck.error, /model on this Mac could not answer: it kept looking and never answered/);
});

test('progress lines are code-written and never speakable as a sentence', () => {
  const line = progressLine({ name: 'vault_search', args: { query: 'what did I bench? today, ok.' } });
  assert.match(line, /^Looking in your vault for “what did I bench today ok”…$/);
  assert.doesNotMatch(line, /[.!?](?=\s|$)/);
  assert.doesNotMatch(line, /[,;:](?=\s)/);
  assert.match(progressLine({ name: 'vault_read', args: { path: 'Wiki/Training/Bench Press.md' } }), /^Reading Bench Press in your vault…$/);
});

test('(f) session memory persists across a restart and drops a day-old session', async () => {
  await _reset({ file: true });
  reply = () => ({ message: { role: 'assistant', content: 'Your bench was 92.5 kg.' } });
  const first = await settled(startAskLocal(vault, { question: 'bench?' }));
  const sid = first.result.sessionId;
  await _flush();
  const stored = JSON.parse(await readFile(path.join(dataDir, 'local-ask-sessions.json'), 'utf8'));
  assert.equal(stored.sessions[sid].turns[0].q, 'bench?');
  assert.equal(stored.sessions[sid].localOnly, true, 'the local model opened it');

  // a restart: a fresh module instance reads the file back
  const again = await import(`../lib/localAsk.js?restart=${Date.now()}`);
  assert.equal(again.sessionTurns(sid).length, 1);
  assert.equal(again.isLocalOnlySession(sid), true);

  // the second turn carries the first in its prompt
  seen.length = 0;
  reply = () => ({ message: { role: 'assistant', content: 'Up 2.5 kg on last week.' } });
  await settled(startAskLocal(vault, { question: 'and compared to last week?', sessionId: sid }));
  assert.match(seen[0].messages[0].content, /EARLIER IN THIS CONVERSATION:\nHe: bench\?\nNova: Your bench was 92\.5 kg\./);

  // a day-old session is dropped
  await recordAskTurn('old-session', { q: 'old', a: 'old answer', provider: 'local' }, { now: Date.now() - 25 * 3600e3 });
  assert.deepEqual(sessionTurns('old-session'), []);
  // and only the last 8 turns are kept
  for (let i = 0; i < 10; i++) await recordAskTurn('long', { q: `q${i}`, a: `a${i}`, provider: 'local' });
  assert.deepEqual(sessionTurns('long').map((t) => t.q), ['q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9']);
});

test('(g) the prompt stays under 9,000 characters with a realistic today block and a long history', () => {
  const today = 'Local now: Sunday 19 October 2026, 7:42 am (AEST).\nsteps today 4,212 of a 10,000 target; HRV 61ms (2026-10-19); weight 82.4kg (last weighed 2026-10-18); logged today 38g protein of a 180g floor, 520 kcal of a 2,650 target across 2 entries; goal board: protein is the gap today; 3 drafts waiting in his Inbox';
  const history = Array.from({ length: 8 }, (_, i) => ({ q: `question ${i} `.repeat(30), a: `answer ${i} `.repeat(80) }));
  const p = buildLocalAskPrompt({ today, liveLine: 'next on the calendar: gym at 6pm', history, spoken: true, place: 'unknown' });
  assert.ok(p.length <= PROMPT_BUDGET, `prompt is ${p.length} chars`);
  assert.match(p, /^NOVA OPERATING LENS/);
  assert.match(p, /steps today 4,212/);
  assert.match(p, /ACT \{"verb":"capture\.add"/);
  assert.match(p, /ACT \{"verb":"workout\.log"/);
  assert.match(p, /ACT \{"verb":"weight\.log"/);
  assert.match(p, /ACT \{"verb":"todo\.done"/);
  assert.match(p, /PROPOSE \{"kind":"calendar"/);
  assert.match(p, /two short spoken sentences/);
  assert.match(p, /EARLIER IN THIS CONVERSATION/, 'some history still fits');
  assert.match(p, /question 7/, 'the newest turn is the one kept');
  const bare = buildLocalAskPrompt({ today });
  assert.ok(bare.length < 7000, `the prompt without history is ${bare.length} chars`);
});

test('a lane that cannot load the model fails with a plain reason, never an empty answer', async () => {
  stub.closeAllConnections?.();
  await new Promise((r) => stub.close(r));
  try {
    _setHeadroomForTests(() => ({ ok: false, swapFreeMB: 400, reason: 'this Mac has only 400 MB of swap free' }));
    const job = await settled(startAskLocal(vault, { question: 'bench?' }));
    assert.equal(job.status, 'error');
    assert.match(job.error, /^The model on this Mac could not answer: .*400 MB of swap free/);
  } finally {
    await new Promise((r) => stub.listen(4289, '127.0.0.1', r));
  }
});
