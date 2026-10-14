// THE ACK ON THE WIRE (15 Oct 2026). /api/ask hands back, with the job id of a
// model turn, an ack composed from his own words (lib/acks.js), records it in
// today's ledger, and puts it in the local voice before the client asks; a
// short ask gets none. The job poll carries ONE code-written stage line while
// a slow agent (the Researcher) is being asked, and nothing otherwise.
//
// No real model runs: CLAUDE_BIN is a stub, NOVA_DATA_DIR a temp dir, both
// set BEFORE import.
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-askack-stub-'));
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
const dataDir = mkdtempSync(path.join(tmpdir(), 'nova-askack-data-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';
delete process.env.ELEVENLABS_API_KEY;
delete process.env.NOVA_TTS_LOCAL;

const vault = mkdtempSync(path.join(tmpdir(), 'nova-askack-vault-'));
mkdirSync(path.join(vault, 'Wiki', 'Health'), { recursive: true });

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { voiceRouter, ackForTurn } = await import('../routes/voice.js');
const { _dropAllWarm } = await import('../lib/claudeCode.js');
const { stageLineOf } = await import('../lib/handsFree.js');

function serve() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', voiceRouter(vault));
  return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
}
const post = async (server, route, body) => {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return JSON.parse((await res.text()).trim());
};

test.after(() => { _dropAllWarm(); });

test('/api/ask: a model turn comes back with his noun said back; a short one with none', async () => {
  const server = await serve();
  try {
    const long = await post(server, '/ask', { question: 'Can you check the calibration of my targeting matrix?' });
    assert.ok(long.jobId, 'a model turn');
    assert.ok(long.ack, `an ack came with it: ${JSON.stringify(long)}`);
    assert.equal(typeof long.ack.id, 'string');
    assert.equal(long.ack.text, 'Checking the calibration.', 'his verb and his noun, said back');
    const ledger = JSON.parse(readFileSync(path.join(dataDir, 'voice', 'acks.json'), 'utf8'));
    assert.deepEqual(ledger.used, [long.ack.id], 'recorded in today\'s ledger');
    assert.deepEqual(ledger.texts, [long.ack.text]);

    const short = await post(server, '/ask', { question: 'why though' });
    assert.ok(short.jobId || short.text, 'answered');
    assert.ok(!('ack' in short), `no ack for a short ask: ${JSON.stringify(short)}`);
  } finally {
    server.close();
  }
});

test('the ack is put in the LOCAL voice at once, in the voice the client will ask for; never on ElevenLabs', async () => {
  const made = [];
  const deps = (engine) => ({
    engine: () => engine,
    nextAck: async () => ({ id: 'ask.check', text: 'Checking your sleep this week.', topic: 'your sleep this week' }),
    synthesize: async (text, voiceId) => { made.push([text, voiceId]); return Buffer.from('mp3'); },
  });
  const a = await ackForTurn({ question: 'q', lane: 'ask', voiceId: 'bm_george-jarvis' }, deps('local'));
  assert.deepEqual(a, { id: 'ask.check', text: 'Checking your sleep this week.' });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(made, [['Checking your sleep this week.', 'bm_george-jarvis']]);
  made.length = 0;
  await ackForTurn({ question: 'q', lane: 'ask' }, deps('local'));
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(made, [['Checking your sleep this week.', undefined]], 'no voice sent = the engine default, as /api/tts treats it');
  made.length = 0;
  await ackForTurn({ question: 'q', lane: 'ask' }, deps('elevenlabs'));
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(made, [], 'no paid round trip for a line the client fetches anyway');
  // a failing composer is no ack, never a failed ask
  assert.equal(await ackForTurn({ question: 'q' }, { nextAck: async () => { throw new Error('disk'); } }), null);
});

test('the stage line: said only while a slow agent is still being asked', () => {
  assert.equal(stageLineOf(null), null);
  assert.equal(stageLineOf([{ agent: 'coach', state: 'asking' }]), null, 'the Coach is not slow');
  assert.deepEqual(stageLineOf([{ agent: 'researcher', state: 'asking' }, { agent: 'coach', state: 'asking' }]), { line: 'Asking the Researcher.', agent: 'researcher' });
  assert.equal(stageLineOf([{ agent: 'researcher', state: 'answered' }]), null, 'answered: nothing more to say');
});

test('no test wrote into his live data', () => {
  assert.ok(existsSync(path.join(dataDir, 'voice', 'acks.json')));
});
