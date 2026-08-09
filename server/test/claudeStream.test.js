// Streaming + warm-pool contract for the conversational spawns (Voice,
// Coach, Code tab). All three run `--input-format stream-json` against ONE
// process per session: partials MUST be visible while a turn is running,
// the final result must survive post-processing, and a follow-up turn on
// the same session MUST reuse the live process (that reuse is the ~6s→~1s
// first-word win, measured live). CLAUDE_BIN is stubbed BEFORE import with
// a persistent stdin-driven script, so a silent fall back to one-shot
// spawn-per-turn — or to exit-time-only output — fails here.
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-claude-stub-'));
const stubBin = path.join(stubDir, 'claude');
writeFileSync(stubBin, `#!/usr/bin/env node
// Persistent conversational stub: each stdin NDJSON user message gets two
// delayed text deltas and a result; the process stays alive for the next
// turn, exactly like the real CLI in --input-format stream-json mode.
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
let n = 0;
rl.on('line', async (line) => {
  if (!line.trim()) return;
  n++;
  const turn = n;
  const say = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  say({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } } });
  await new Promise((r) => setTimeout(r, 150));
  say({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'turn ' + turn + '.' } } });
  say({ type: 'result', is_error: false, result: 'Hello turn ' + turn + '.' });
});
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;

import test from 'node:test';
import assert from 'node:assert/strict';

const { startAskCoach, startAskNova, startMessage, getMessageJob, _warmStats, _dropAllWarm } = await import('../lib/claudeCode.js');

// persistent stub processes hold their pipes open — without this teardown
// the warm pool keeps the test runner alive forever
test.after(() => _dropAllWarm());

const waitFor = async (pred, ms = 4000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = pred();
    if (r) return r;
    await new Promise((r2) => setTimeout(r2, 20));
  }
  throw new Error('timed out waiting');
};

const streamAndFinish = async (jobId) => {
  const seen = await waitFor(() => {
    const j = getMessageJob(jobId);
    return j.partial && j.status === 'running' ? { partial: j.partial } : (j.status !== 'running' ? { early: j } : null);
  });
  assert.ok(seen.partial, `partial must be visible while running (got ${JSON.stringify(seen.early || null)})`);
  assert.match(seen.partial, /^Hello/);
  return waitFor(() => { const j = getMessageJob(jobId); return j.status === 'ready' ? j : null; });
};

test('coach turn streams; follow-up turn REUSES the warm process', async () => {
  const j1 = await streamAndFinish(startAskCoach(stubDir, { question: 'How is my bench?', context: 'ctx' }));
  assert.equal(j1.result.text, 'Hello turn 1.');
  const sessionId = j1.result.sessionId;
  assert.ok(sessionId);

  const warmAfter1 = _warmStats().find((w) => w.key === `coach:${sessionId}`);
  assert.ok(warmAfter1, 'the process must stay alive after the turn');

  const j2 = await streamAndFinish(startAskCoach(stubDir, { question: 'And my squat?', context: 'ctx', sessionId }));
  assert.equal(j2.result.text, 'Hello turn 2.', 'turn 2 answered by the SAME process (its counter advanced)');
  const warmAfter2 = _warmStats().find((w) => w.key === `coach:${sessionId}`);
  assert.equal(warmAfter2.pid, warmAfter1.pid, 'same pid — no respawn, no boot cost');
});

test('voice turn streams and finishes through its post-processing', async () => {
  const done = await streamAndFinish(startAskNova(stubDir, { question: 'How did I sleep?', context: 'ctx' }));
  assert.equal(done.result.text, 'Hello turn 1.');
  assert.ok(done.result.sessionId);
});

test('code-tab turn streams; partial visible while running', async () => {
  const done = await streamAndFinish(startMessage(stubDir, { text: 'What does ops.js do?' }));
  assert.equal(done.result.text, 'Hello turn 1.');
  assert.ok(done.result.sessionId);
});
