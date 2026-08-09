// Streaming contract for the conversational spawns: Coach and the Code tab
// were converted from `--output-format json` (reply exists only at process
// exit) to stream-json (text deltas land in job.partial as they generate).
// The client renders job.partial from the shared poll — so the regression
// that matters is: partial text MUST be visible while the job is still
// running, and the final result must survive the directive post-processing.
// CLAUDE_BIN is stubbed BEFORE import with a script that emits NDJSON with
// real delays, so a silent fall back to exit-time-only output fails here.
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-claude-stub-'));
const stubBin = path.join(stubDir, 'claude');
writeFileSync(stubBin, `#!/usr/bin/env node
const lines = [
  JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } } }),
  JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'sir.' } } }),
  JSON.stringify({ type: 'result', is_error: false, result: 'Hello sir.' }),
];
(async () => {
  for (const l of lines) {
    process.stdout.write(l + '\\n');
    await new Promise((r) => setTimeout(r, 180));
  }
})();
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;

import test from 'node:test';
import assert from 'node:assert/strict';

const { startAskCoach, startMessage, getMessageJob } = await import('../lib/claudeCode.js');

const waitFor = async (pred, ms = 4000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = pred();
    if (r) return r;
    await new Promise((r2) => setTimeout(r2, 25));
  }
  throw new Error('timed out waiting');
};

test('coach spawn streams: partial visible while running, final text lands', async () => {
  const jobId = startAskCoach(stubDir, { question: 'How is my bench?', context: 'ctx' });
  // partial must appear BEFORE the job completes — that is the streaming contract
  const seen = await waitFor(() => {
    const j = getMessageJob(jobId);
    return j.partial ? { partial: j.partial, status: j.status } : null;
  });
  assert.equal(seen.status, 'running');
  assert.match(seen.partial, /^Hello/);
  const done = await waitFor(() => { const j = getMessageJob(jobId); return j.status === 'ready' ? j : null; });
  assert.equal(done.result.text, 'Hello sir.');
  assert.ok(done.result.sessionId);
});

test('code-tab spawn streams: partial visible while running, final text lands', async () => {
  const jobId = startMessage(stubDir, { text: 'What does ops.js do?' });
  const seen = await waitFor(() => {
    const j = getMessageJob(jobId);
    return j.partial ? { partial: j.partial, status: j.status } : null;
  });
  assert.equal(seen.status, 'running');
  assert.match(seen.partial, /^Hello/);
  const done = await waitFor(() => { const j = getMessageJob(jobId); return j.status === 'ready' ? j : null; });
  assert.equal(done.result.text, 'Hello sir.');
  assert.ok(done.result.sessionId);
});
