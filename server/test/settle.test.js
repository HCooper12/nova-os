// The settle watchdog: a child that never exits is stopped, and the reason
// lands on stderr where every lane already reads its failure text. A child
// that settles in time is never touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { settleWatchdog } from '../lib/settle.js';

const settle = (child) => new Promise((resolve) => {
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code, signal) => resolve({ code, signal, stderr }));
});

test('a child that never exits is stopped, and the honest reason is on stderr for the site to read', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  const w = settleWatchdog(child, { label: 'the test lane', minutes: 0.02 }); // 1.2s
  const { code, signal, stderr } = await settle(child);
  assert.equal(w.timedOut, true);
  assert.notEqual(code, 0);
  assert.ok(signal === 'SIGTERM' || signal === 'SIGKILL', `stopped by signal, got ${signal}`);
  assert.match(stderr, /the test lane did not settle within 0\.02 minutes — stopped; nothing was written to the vault\. Retry when ready\./);
  // the site's own composition `stderr.trim() || \`claude exited with code ${code}\`` now says the truth
  assert.equal(stderr.trim() || `claude exited with code ${code}`, w.message);
});

test('a child that settles in time is untouched and the timer is cleared', async () => {
  const child = spawn(process.execPath, ['-e', 'process.stdout.write("ok")']);
  const w = settleWatchdog(child, { label: 'quick', minutes: 1 });
  const { code, stderr } = await settle(child);
  assert.equal(code, 0);
  assert.equal(w.timedOut, false);
  assert.equal(stderr, '');
});
