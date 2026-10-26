// The text-lane runner (lib/textLane.js): Claude or the model on this Mac,
// per lane, and the stand-in when Claude is at the account's usage limit.
// Everything external is a stub: CLAUDE_BIN is a shell script that prints a
// fixed envelope, the local model is a stub HTTP server, the memory reading
// is injected. Nothing here can spawn the real CLI, load the real model, or
// write his real server/data.
import { mkdtemp, writeFile, mkdir, readFile, chmod, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

const root = await mkdtemp(path.join(tmpdir(), 'nova-textlane-'));
const dataDir = path.join(root, 'data');
await mkdir(dataDir, { recursive: true });
process.env.NOVA_DATA_DIR = dataDir;

// the local model reads as configured: a python file exists where the venv
// would be. It is never executed: every test either has the stub server
// healthy (no boot needed) or injects no headroom (a boot is refused first).
const voiceDir = path.join(root, 'voice');
await mkdir(path.join(voiceDir, 'env', 'bin'), { recursive: true });
await writeFile(path.join(voiceDir, 'env', 'bin', 'python'), '#!/bin/sh\nexit 1\n');
process.env.NOVA_VOICE_DIR = voiceDir;
process.env.NOVA_LOCAL_LLM_PORT = '4291';
process.env.NOVA_LOCAL_LLM_WAIT_MS = '1500';
process.env.NOVA_LOCAL_LLM_MODEL = 'mlx-community/Qwen3-4B-Instruct-2507-4bit';
// this suite's stub speaks the MLX server's /v1 (the Ollama request shape is
// localModel.test.js's, plus one test below on its own stub)
process.env.NOVA_LOCAL_LLM_BACKEND = 'mlx';
process.env.NOVA_OLLAMA_NO_SPAWN = '1';

// the CLI stub: prints whatever envelope STUB_REPLY names, logs its argv
const stubBin = path.join(root, 'claude-stub.sh');
const argvLog = path.join(root, 'argv.log');
await writeFile(stubBin, `#!/bin/sh\necho "$@" >> "${argvLog}"\ncat "$STUB_REPLY"\n`);
await chmod(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;

const okReply = path.join(root, 'ok.json');
const limitReply = path.join(root, 'limit.json');
await writeFile(okReply, JSON.stringify({ type: 'result', is_error: false, result: '{"from":"claude"}', total_cost_usd: 0.002, duration_ms: 321, modelUsage: { 'claude-haiku-4-5': { outputTokens: 9 } } }));
await writeFile(limitReply, JSON.stringify({ type: 'result', is_error: true, result: "You've hit your session limit · resets 11am (Australia/Melbourne)", total_cost_usd: 0 }));

import test from 'node:test';
import assert from 'node:assert/strict';

const { runTextLane } = await import('../lib/textLane.js');
const { setLanePref, resetLanePref, setFallback, setLocalPrefs, providerFor } = await import('../lib/modelPrefs.js');
const { _setHeadroomForTests } = await import('../lib/localModel.js');
const { _flushSpend } = await import('../lib/modelSpend.js');

const SPEND = path.join(dataDir, 'model-spend.json');
const rowsFor = async (lane) => {
  if (!existsSync(SPEND)) return [];
  return JSON.parse(await readFile(SPEND, 'utf8')).lanes?.[lane] || [];
};
// the ledger is written fire-and-forget: wait for the row count to land
async function waitRows(lane, n) {
  for (let i = 0; i < 100; i++) {
    const rows = await rowsFor(lane);
    if (rows.length >= n) return rows;
    await new Promise((r) => setTimeout(r, 20));
  }
  return rowsFor(lane);
}

// the stub local model
const seen = [];
let stub = null;
async function startStub(content = '{"from":"local"}') {
  stub = http.createServer((req, res) => {
    if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); return res.end('{"status":"ok"}'); }
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        seen.push(JSON.parse(body));
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
      });
      return;
    }
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => stub.listen(4291, '127.0.0.1', r));
}
async function stopStub() {
  if (!stub) return;
  await new Promise((r) => stub.close(r));
  stub = null;
}

// the CLI calls this suite made, without the --effort probe's `--help`
// (lib/spawnBoundary.js runs it on first use, and under load its line can
// land after the call it was probing for)
const realCalls = async () => (existsSync(argvLog) ? (await readFile(argvLog, 'utf8')) : '')
  .split('\n').filter((l) => l.trim() && !/^--help\b/.test(l.trim()));

test.beforeEach(async () => {
  await _flushSpend(); // a row from the last test lands before the file is cleared
  await rm(SPEND, { force: true });
  await resetLanePref();
  await setFallback({ enabled: true });
  // the 19 Oct tests below were written for Claude first; the local-first
  // tests (27 Oct, at the end) switch it back on themselves
  await setLocalPrefs({ first: false });
  _setHeadroomForTests(() => ({ ok: true, swapFreeMB: 8000, reason: null }));
  seen.length = 0;
});
test.afterEach(async () => {
  await stopStub();
  _setHeadroomForTests(null);
});
test.after(async () => {
  await _flushSpend();
  await new Promise((r) => setTimeout(r, 100)); // the probe's and the spoken log's late writes
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => {});
});

test('(a) the Claude path reads the envelope and records a claude row', async () => {
  process.env.STUB_REPLY = okReply;
  const out = await runTextLane('inbox-classify', 'classify: buy milk');
  assert.equal(out.text, '{"from":"claude"}');
  assert.equal(out.provider, 'claude');
  assert.equal(out.fallback, false);
  assert.equal(out.model, 'haiku');
  assert.equal(out.ms, 321);
  const argv = (await realCalls()).pop();
  assert.match(argv, /--model haiku/);
  assert.match(argv, /--output-format json/);
  const rows = await waitRows('inbox-classify', 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].provider, 'claude');
  assert.equal(rows[0].fallback, false);
  assert.equal(rows[0].usd, 0.002);
});

test('(b) a lane set to the local model calls it and records a free local row', async () => {
  await startStub();
  await setLanePref('inbox-classify', { provider: 'local' });
  process.env.STUB_REPLY = okReply;
  const before = (await realCalls()).length;
  const out = await runTextLane('inbox-classify', 'classify: buy milk', { json: true, maxTokens: 300 });
  assert.equal(out.text, '{"from":"local"}');
  assert.equal(out.provider, 'local');
  assert.equal(out.fallback, false);
  assert.equal(out.model, 'mlx-community/Qwen3-4B-Instruct-2507-4bit');
  assert.equal((await realCalls()).length, before, 'Claude was never spawned');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].max_tokens, 300);
  assert.equal(seen[0].messages[0].role, 'system', 'a JSON lane tells the small model to answer in JSON only');
  assert.equal(seen[0].messages.at(-1).content, 'classify: buy milk');
  const rows = await waitRows('inbox-classify', 1);
  assert.equal(rows[0].provider, 'local');
  assert.equal(rows[0].usd, 0);
  assert.equal(rows[0].fallback, false);
  assert.equal(rows[0].model, 'local:mlx-community/Qwen3-4B-Instruct-2507-4bit');
});

test('(c) at Claude\'s limit, with the fallback on, a local lane is answered on this Mac and says so', async () => {
  await startStub();
  process.env.STUB_REPLY = limitReply;
  const out = await runTextLane('note-summary', 'summarise this');
  assert.equal(out.text, '{"from":"local"}');
  assert.equal(out.provider, 'local');
  assert.equal(out.fallback, true);
  const rows = await waitRows('note-summary', 2);
  assert.equal(rows.length, 2, 'the limited Claude run and the local stand-in are both on the ledger');
  assert.equal(rows[0].limited, true);
  assert.equal(rows[0].provider, 'claude');
  assert.equal(rows[1].provider, 'local');
  assert.equal(rows[1].fallback, true);
});

test('(d) at the limit with the fallback off, the limit error comes back unchanged', async () => {
  await startStub();
  await setFallback({ enabled: false });
  process.env.STUB_REPLY = limitReply;
  await assert.rejects(() => runTextLane('note-summary', 'summarise this'), (e) => {
    assert.equal(e.limited, true);
    assert.match(e.message, /usage limit is reached for now; it resets at 11am/);
    assert.doesNotMatch(e.message, /this Mac/);
    return true;
  });
  assert.equal(seen.length, 0, 'the local model was not asked');
});

test('(e) at the limit on a lane that cannot run locally, the limit error comes back unchanged', async () => {
  await startStub();
  process.env.STUB_REPLY = limitReply;
  await assert.rejects(() => runTextLane('health-insight', 'read my health'), (e) => {
    assert.equal(e.limited, true);
    assert.doesNotMatch(e.message, /this Mac/);
    return true;
  });
  assert.equal(seen.length, 0);
});

test('(f) at the limit with no memory to load the local model, the limit error carries why it could not stand in', async () => {
  // no stub server: the model is not loaded, so a boot would be needed
  _setHeadroomForTests(() => ({ ok: false, swapFreeMB: 460, reason: 'this Mac has only 460 MB of swap free (the local model needs 1500 MB to load without slowing everything else down)' }));
  process.env.STUB_REPLY = limitReply;
  await assert.rejects(() => runTextLane('journal-prompt', 'a question for tonight'), (e) => {
    assert.equal(e.limited, true, 'still the limit, so every lane\'s honest handling applies');
    assert.match(e.message, /usage limit is reached/);
    assert.match(e.message, /could not stand in: .*460 MB of swap free/);
    return true;
  });
});

test('a lane set to local that cannot load the model escalates to Claude, says why, and both runs are on the ledger', async () => {
  _setHeadroomForTests(() => ({ ok: false, swapFreeMB: 460, reason: 'this Mac has only 460 MB of swap free' }));
  await setLanePref('shopping-categorize', { provider: 'local' });
  process.env.STUB_REPLY = okReply;
  const out = await runTextLane('shopping-categorize', 'sort: milk');
  assert.equal(out.text, '{"from":"claude"}');
  assert.equal(out.provider, 'claude');
  assert.equal(out.escalated, true);
  assert.match(out.reason, /^the model on this Mac could not answer: .*460 MB of swap free/);
  const rows = await waitRows('shopping-categorize', 2);
  assert.equal(rows[0].provider, 'local');
  assert.ok(rows[0].error, 'the failed local run is on the ledger with its reason');
  assert.equal(rows[1].provider, 'claude');
  assert.ok(!rows[1].error);
});

test('when the escalation fails too, Claude\'s error carries why this Mac did not answer first, never an empty answer', async () => {
  _setHeadroomForTests(() => ({ ok: false, swapFreeMB: 460, reason: 'this Mac has only 460 MB of swap free' }));
  await setLanePref('shopping-categorize', { provider: 'local' });
  process.env.STUB_REPLY = limitReply;
  await assert.rejects(() => runTextLane('shopping-categorize', 'sort: milk'), (e) => {
    assert.equal(e.limited, true, 'still the limit, so every lane\'s honest handling applies');
    assert.match(e.message, /usage limit is reached/);
    assert.match(e.message, /The model on this Mac could not answer first: .*460 MB of swap free/);
    return true;
  });
});

test('a lane switched off is refused before anything runs', async () => {
  await setLanePref('calendar-command', { enabled: false });
  await assert.rejects(() => runTextLane('calendar-command', 'move gym'), (e) => e.laneOff === 'calendar-command');
});

test('a capture sorted on this Mac is labelled so on its record', async () => {
  await startStub(JSON.stringify({ route: 'note', confidence: 'high', title: 'Milk thought', reason: 'a thought', payload: { title: 'Milk', body: 'buy milk' } }));
  await setLanePref('inbox-classify', { provider: 'local' });
  const { captureForReview } = await import('../lib/inbox.js');
  const vault = path.join(root, 'vault');
  await mkdir(vault, { recursive: true });
  const record = await captureForReview(vault, { text: 'buy milk', source: 'voice' });
  assert.equal(record.provider, 'local');
  assert.equal(record.fallback, false);
  assert.equal(record.status, 'pending');
  assert.equal(record.decision.title, 'Milk thought');
});

test('Claude could not be started (no CLI, as offline-and-broken looks): a local lane stands in, with the reason on the ledger', async () => {
  await startStub();
  const had = process.env.CLAUDE_BIN;
  process.env.CLAUDE_BIN = path.join(root, 'no-such-claude');
  try {
    const out = await runTextLane('inbox-classify', 'classify: buy milk', { json: true });
    assert.equal(out.text, '{"from":"local"}');
    assert.equal(out.provider, 'local');
    assert.equal(out.fallback, true);
    assert.equal(out.reason, 'Claude could not be started');
    const rows = await waitRows('inbox-classify', 1);
    const row = rows.find((r) => r.provider === 'local');
    assert.equal(row.fallback, true);
    assert.equal(row.reason, 'Claude could not be started');
  } finally {
    process.env.CLAUDE_BIN = had;
  }
});

test('Claude died with no envelope (the network gone mid-start): a local lane stands in', async () => {
  await startStub();
  const dies = path.join(root, 'claude-dies.sh');
  await writeFile(dies, '#!/bin/sh\necho "getaddrinfo ENOTFOUND api.anthropic.com" >&2\nexit 1\n');
  await chmod(dies, 0o755);
  const had = process.env.CLAUDE_BIN;
  process.env.CLAUDE_BIN = dies;
  try {
    const out = await runTextLane('note-summary', 'summarise this');
    assert.equal(out.provider, 'local');
    assert.equal(out.fallback, true);
    assert.equal(out.reason, 'Claude could not answer');
  } finally {
    process.env.CLAUDE_BIN = had;
  }
});

test('a Claude run that produced an envelope and failed on its own terms is not covered: its error stands', async () => {
  await startStub();
  const failed = path.join(root, 'failed.json');
  await writeFile(failed, JSON.stringify({ type: 'result', is_error: true, result: 'the request was refused', total_cost_usd: 0 }));
  process.env.STUB_REPLY = failed;
  await assert.rejects(() => runTextLane('note-summary', 'summarise this'), /the request was refused/);
  assert.equal(seen.length, 0, 'the local model was not asked');
});

test('a spawn failure on a lane that cannot run locally keeps its own error', async () => {
  await startStub();
  const had = process.env.CLAUDE_BIN;
  process.env.CLAUDE_BIN = path.join(root, 'no-such-claude');
  try {
    await assert.rejects(() => runTextLane('health-insight', 'read my health'), /ENOENT/);
    assert.equal(seen.length, 0);
  } finally {
    process.env.CLAUDE_BIN = had;
  }
});

/* --------------------- local first, Claude as the escalation (27 Oct 2026) --------------------- */

// A fake CLI child for the spawnImpl seam: it answers with the envelope given.
import { EventEmitter } from 'node:events';
function fakeSpawn(envelope, calls) {
  return (bin, args) => {
    calls.push(args);
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      child.stdout.emit('data', JSON.stringify(envelope));
      child.emit('close', 0);
    });
    return child;
  };
}
const claudeEnvelope = { type: 'result', is_error: false, result: '{"from":"claude"}', total_cost_usd: 0.001, duration_ms: 200 };

test('local first by default: an untouched local lane runs on this Mac and Claude is never spawned', async () => {
  await setLocalPrefs({ first: true });
  await startStub();
  assert.equal(providerFor('inbox-classify'), 'local');
  const calls = [];
  const out = await runTextLane('inbox-classify', 'classify: buy milk', { json: true, spawnImpl: fakeSpawn(claudeEnvelope, calls) });
  assert.equal(out.provider, 'local');
  assert.equal(out.text, '{"from":"local"}');
  assert.equal(out.escalated, undefined);
  assert.equal(calls.length, 0);
});

test('local first: this Mac fails before any text (an HTTP error) and Claude answers, escalated, with a plain reason', async () => {
  await setLocalPrefs({ first: true });
  stub = http.createServer((req, res) => {
    if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); return res.end('{"status":"ok"}'); }
    res.statusCode = 500; res.end('the runner crashed');
  });
  await new Promise((r) => stub.listen(4291, '127.0.0.1', r));
  const calls = [];
  const out = await runTextLane('note-summary', 'summarise this', { spawnImpl: fakeSpawn(claudeEnvelope, calls) });
  assert.equal(calls.length, 1, 'Claude was asked once');
  assert.equal(out.provider, 'claude');
  assert.equal(out.text, '{"from":"claude"}');
  assert.equal(out.escalated, true);
  assert.match(out.reason, /^the model on this Mac could not answer: local model → 500: the runner crashed$/);
  const rows = await waitRows('note-summary', 2);
  assert.deepEqual(rows.map((r) => r.provider), ['local', 'claude']);
  assert.match(rows[0].error, /500/);
});

test('local first: an empty local answer escalates too (never an empty string to a lane)', async () => {
  await setLocalPrefs({ first: true });
  await startStub('');
  const calls = [];
  const out = await runTextLane('rewards-offer-read', 'read this email', { json: true, spawnImpl: fakeSpawn(claudeEnvelope, calls) });
  assert.equal(out.escalated, true);
  assert.match(out.reason, /returned no text/);
});

test('local first with nothing installed: Claude is spawned synchronously, before the first await (the journal prompt\'s "one call, at the tap")', async () => {
  await setLocalPrefs({ first: true });
  const had = process.env.NOVA_VOICE_DIR;
  process.env.NOVA_VOICE_DIR = path.join(root, 'no-venv-here');
  try {
    const calls = [];
    const pending = runTextLane('journal-prompt', 'a question for tonight', { json: true, spawnImpl: fakeSpawn(claudeEnvelope, calls) });
    assert.equal(calls.length, 1, 'spawned within the call, not after a tick');
    const out = await pending;
    assert.equal(out.escalated, true);
    assert.match(out.reason, /the local model is not installed/);
    const rows = await waitRows('journal-prompt', 2);
    assert.equal(rows[0].provider, 'local');
    assert.match(rows[0].error, /not installed/);
  } finally {
    process.env.NOVA_VOICE_DIR = had;
  }
});

test('local first leaves a lane he pinned to Claude on Claude, and its limit still falls back to this Mac', async () => {
  await setLocalPrefs({ first: true });
  await setLanePref('note-summary', { provider: 'claude' });
  await startStub();
  process.env.STUB_REPLY = limitReply;
  const out = await runTextLane('note-summary', 'summarise this');
  assert.equal(out.provider, 'local');
  assert.equal(out.fallback, true);
  assert.equal(out.reason, 'Claude was at its usage limit');
  assert.equal(out.escalated, undefined);
});

test('local first on the Ollama backend: the lane asks for JSON and no thinking on the native API', async () => {
  await setLocalPrefs({ first: true });
  const seenOllama = [];
  const ollama = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/tags') return res.end('{"models":[{"name":"qwen3.5:4b","size":3324173934}]}');
      if (req.url === '/api/ps') return res.end('{"models":[{"name":"qwen3.5:4b"}]}');
      if (req.url === '/api/chat') { seenOllama.push(JSON.parse(body)); return res.end(JSON.stringify({ message: { role: 'assistant', content: '{"aisle":"dairy"}' }, done: true, done_reason: 'stop' })); }
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise((r) => ollama.listen(0, '127.0.0.1', r));
  const had = { b: process.env.NOVA_LOCAL_LLM_BACKEND, u: process.env.NOVA_OLLAMA_URL, m: process.env.NOVA_LOCAL_LLM_MODEL };
  process.env.NOVA_LOCAL_LLM_BACKEND = 'ollama';
  process.env.NOVA_OLLAMA_URL = `http://127.0.0.1:${ollama.address().port}`;
  process.env.NOVA_LOCAL_LLM_MODEL = 'qwen3.5:4b';
  try {
    const { refreshOllama } = await import('../lib/localModel.js');
    await refreshOllama(); // configured: the server answered at the last reading
    const out = await runTextLane('shopping-categorize', 'sort: milk', { json: true, maxTokens: 200 });
    assert.equal(out.provider, 'local');
    assert.equal(out.text, '{"aisle":"dairy"}');
    assert.equal(seenOllama[0].think, false);
    assert.equal(seenOllama[0].format, 'json');
    assert.equal(seenOllama[0].options.num_predict, 200);
    assert.equal(seenOllama[0].messages[0].role, 'system', 'and the JSON-only system line still rides along');
  } finally {
    process.env.NOVA_LOCAL_LLM_BACKEND = had.b;
    if (had.u === undefined) delete process.env.NOVA_OLLAMA_URL; else process.env.NOVA_OLLAMA_URL = had.u;
    process.env.NOVA_LOCAL_LLM_MODEL = had.m;
    ollama.closeAllConnections();
    await new Promise((r) => ollama.close(r));
    const { refreshOllama } = await import('../lib/localModel.js');
    await refreshOllama();
  }
});
