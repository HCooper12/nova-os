// EVERY DOOR CLOSES IT (second-brain audit #2). The reader is tested in
// correctionsStick.test.js; this walks the real routes, because a door that
// forgets the call is the bug that started this. A stub CLI, temp data and a
// temp vault, set before any import: no model runs and nothing real is touched.
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-doors-stub-'));
const stubBin = path.join(stubDir, 'claude');
writeFileSync(stubBin, `#!/usr/bin/env node
const argv = process.argv.slice(2);
const out = 'A plain answer.';
if (argv.includes('--input-format')) {
  const rl = require('node:readline').createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    process.stdout.write(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: out }] } }) + '\\n');
    process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: out }) + '\\n');
  });
} else {
  process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: out }));
}
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-doors-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';
process.env.NOVA_COACH_CADENCE = 'off';
delete process.env.ELEVENLABS_API_KEY;
delete process.env.NOVA_TTS_LOCAL;
delete process.env.VAULT_PATH;

const vault = mkdtempSync(path.join(tmpdir(), 'nova-doors-vault-'));
mkdirSync(path.join(vault, 'Wiki', 'Health'), { recursive: true });

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { voiceRouter } = await import('../routes/voice.js');
const { inboxRouter } = await import('../routes/inbox.js');
const { leaderRouter } = await import('../routes/leader.js');
const { _dropAllWarm } = await import('../lib/claudeCode.js');
const { addInjury, listInjuries, _reset } = await import('../lib/injuryLog.js');
const { _resetPendingAsk } = await import('../lib/concernClose.js');
const { rm } = await import('node:fs/promises');

function serve() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', voiceRouter(vault));
  app.use('/api', inboxRouter(vault));
  app.use('/api', leaderRouter(vault));
  return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
}
const post = async (server, route, body) => {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return JSON.parse((await res.text()).trim());
};
const open = async () => {
  _reset();
  _resetPendingAsk();
  await rm(path.join(vault, 'Wiki/Health/Injury Log.md'), { force: true });
  _reset();
  await addInjury(vault, { area: 'Shoulder', note: 'Lateral raises paused pending a physio assessment.', severity: 'moderate' });
};
const closed = async () => (await listInjuries(vault)).every((i) => i.resolvedAt);

const LONG = 'No, I have not gone to the physio. Ignore anything that is currently relating to my shoulder, as my shoulder is okay at the moment, so we can close that concern. What should I eat tonight to hit my protein?';

// the answer watchers and warm processes these turns start hold the loop open;
// process.exit() with no code keeps the runner's own exit code
test.after(() => { _dropAllWarm(); setTimeout(() => process.exit(), 500).unref(); });

test('the voice chat: said alone it is answered in one line, no model, with the receipt the client already reads', async () => {
  await open();
  const server = await serve();
  try {
    const out = await post(server, '/ask', { question: 'my shoulder is fine' });
    assert.equal(out.text, "Closed Shoulder in your Injury Log. Say undo if that's wrong.");
    assert.equal(out.reflex, true);
    assert.ok(out.acted.recordId);
    assert.ok(!out.jobId, 'no model was asked');
    assert.ok(await closed());
  } finally { server.close(); }
});

test('the voice chat: inside a longer turn it closes, and the question still reaches the model', async () => {
  await open();
  const server = await serve();
  try {
    const out = await post(server, '/ask', { question: LONG });
    assert.ok(out.jobId, JSON.stringify(out));
    assert.ok(await closed());
  } finally { server.close(); }
});

test('Siri: said alone, and inside a longer turn', async () => {
  await open();
  const server = await serve();
  try {
    const out = await post(server, '/ask/sync', { question: 'the pain in my shoulder is gone' });
    assert.match(out.text, /^Closed Shoulder/);
    assert.ok(await closed());
    await open();
    const longer = await post(server, '/ask/sync', { question: LONG });
    assert.ok(longer.text, JSON.stringify(longer));
    assert.ok(await closed());
  } finally { server.close(); }
});

test('Quick Capture: the box closes it instead of filing a note about it', async () => {
  await open();
  const server = await serve();
  try {
    const out = await post(server, '/inbox/capture', { text: 'my shoulder is okay' });
    assert.equal(out.kind, 'act');
    assert.equal(out.status, 'filed');
    assert.ok(await closed());
  } finally { server.close(); }
});

test('the Leader chat: closes it, and the Leader still answers', async () => {
  await open();
  const server = await serve();
  try {
    const out = await post(server, '/leader/chat', { question: 'ignore my shoulder, it is not a shoulder injury' });
    assert.ok(out.jobId, JSON.stringify(out));
    assert.ok(await closed());
  } finally { server.close(); }
});

test('an ordinary question through the door closes nothing and still runs', async () => {
  await open();
  const server = await serve();
  try {
    const out = await post(server, '/ask', { question: 'What should I eat tonight to hit my protein floor?' });
    assert.ok(out.jobId || out.text, JSON.stringify(out));
    assert.equal((await listInjuries(vault)).filter((i) => i.resolvedAt).length, 0);
  } finally { server.close(); }
});
