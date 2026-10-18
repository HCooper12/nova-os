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
const { setLanePref, resetLanePref, setFallback } = await import('../lib/modelPrefs.js');
const { _setHeadroomForTests } = await import('../lib/localModel.js');

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

test.beforeEach(async () => {
  await rm(SPEND, { force: true });
  await resetLanePref();
  await setFallback({ enabled: true });
  _setHeadroomForTests(() => ({ ok: true, swapFreeMB: 8000, reason: null }));
  seen.length = 0;
});
test.afterEach(async () => {
  await stopStub();
  _setHeadroomForTests(null);
});
test.after(() => rm(root, { recursive: true, force: true }));

test('(a) the Claude path reads the envelope and records a claude row', async () => {
  process.env.STUB_REPLY = okReply;
  const out = await runTextLane('inbox-classify', 'classify: buy milk');
  assert.equal(out.text, '{"from":"claude"}');
  assert.equal(out.provider, 'claude');
  assert.equal(out.fallback, false);
  assert.equal(out.model, 'haiku');
  assert.equal(out.ms, 321);
  const argv = (await readFile(argvLog, 'utf8')).trim().split('\n').pop();
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
  const before = existsSync(argvLog) ? (await readFile(argvLog, 'utf8')).length : 0;
  const out = await runTextLane('inbox-classify', 'classify: buy milk', { json: true, maxTokens: 300 });
  assert.equal(out.text, '{"from":"local"}');
  assert.equal(out.provider, 'local');
  assert.equal(out.fallback, false);
  assert.equal(out.model, 'mlx-community/Qwen3-4B-Instruct-2507-4bit');
  assert.equal(existsSync(argvLog) ? (await readFile(argvLog, 'utf8')).length : 0, before, 'Claude was never spawned');
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

test('a lane set to local fails with a plain reason when the model cannot load, never an empty answer', async () => {
  _setHeadroomForTests(() => ({ ok: false, swapFreeMB: 460, reason: 'this Mac has only 460 MB of swap free' }));
  await setLanePref('shopping-categorize', { provider: 'local' });
  await assert.rejects(() => runTextLane('shopping-categorize', 'sort: milk'), /local model could not answer: .*460 MB of swap free/);
  const rows = await waitRows('shopping-categorize', 1);
  assert.equal(rows[0].provider, 'local');
  assert.ok(rows[0].error, 'the failed local run is on the ledger with its reason');
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
