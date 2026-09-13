// THE CORPSE THAT READ AS ALIVE — its own file, because the rule can only be
// proven by really spawning a process, and a spawn leaves module state (an
// in-flight boot, a live handle) that would make sibling tests order-dependent.
// node:test gives each file its own process, which is the isolation this needs.
//
// His 13 Sep: the sidecar was killed by a signal at 06:57 and Nova had no voice
// until 20:13. A signal-killed child leaves `exitCode === null` — the same
// value a RUNNING child has — so the old respawn test (`exitCode !== null`)
// read the corpse as alive, never restarted it, and polled it for the full
// three minutes before giving up. Every reply after that did the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Nothing listens here: the stand-in never becomes healthy, so the only thing
// under test is which processes get started, and when.
process.env.NOVA_TTS_PORT = '4296';

// The stand-in sidecar: it starts, it says which process it is, and it stays up
// until something kills it. That is every property this rule turns on.
const SCRATCH = mkdtempSync(path.join(os.tmpdir(), 'nova-respawn-'));
mkdirSync(path.join(SCRATCH, 'env', 'bin'), { recursive: true });
const FAKE_PY = path.join(SCRATCH, 'env', 'bin', 'python');
writeFileSync(FAKE_PY, '#!/bin/sh\necho $$ >> "$NOVA_TEST_BOOTLOG"\nsleep 30\n');
chmodSync(FAKE_PY, 0o755);
process.env.NOVA_VOICE_DIR = SCRATCH;

const LOG = path.join(SCRATCH, 'boots.log');
process.env.NOVA_TEST_BOOTLOG = LOG;

const { localReady } = await import('../lib/ttsLocal.js');

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const bootPids = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map(Number) : []);
async function until(fn, ms, label) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

test('a signal-killed sidecar is not mistaken for a running one — the next call spawns a fresh one', async () => {
  assert.equal(await localReady(), false, 'nothing is answering, and it starts a boot in the background');
  await until(() => bootPids().length === 1, 15000, 'the first sidecar to start');
  const [first] = bootPids();
  assert.ok(alive(first), 'the stand-in is up');

  process.kill(first, 'SIGTERM'); // exactly how the real one died: a signal, not an exit
  await until(() => !alive(first), 15000, 'the first sidecar to die');

  // The old code sat here forever: exitCode is null on a signal, so the corpse
  // read as alive and a replacement was never started.
  await until(async () => { await localReady(); return bootPids().length >= 2; }, 20000, 'a replacement sidecar');
  const pids = bootPids();
  assert.notEqual(pids[1], first, 'a NEW process, not the dead handle polled again');

  for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
});
