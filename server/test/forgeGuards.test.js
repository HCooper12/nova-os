// The Forge's guards and hygiene — the decision layer only (the build spawn
// is the CLI's). Temp data dir BEFORE imports.
import { mkdtemp, mkdir, writeFile, rm, utimes, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; // never URL.pathname — the repo path has a space

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-forge-data-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_FORGE_DIR = await mkdtemp(path.join(tmpdir(), 'nova-forge-root-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { duplicateRunning, pruneForge } = await import('../lib/forge.js');
const { repoFocus } = await import('../lib/claudeCode.js');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); await rm(process.env.NOVA_FORGE_DIR, { recursive: true, force: true }); });

test('duplicateRunning: the same prompt, however spaced or cased, is the same build; a different one is not', () => {
  const running = [{ job: { id: 'a', prompt: 'Build a retro Snake game in one HTML file' } }, { job: { id: 'b', prompt: 'Make a pomodoro timer' } }];
  assert.equal(duplicateRunning(running, '  build a RETRO snake game   in one html file ').id, 'a');
  assert.equal(duplicateRunning(running, 'Build a tetris game'), null);
  assert.equal(duplicateRunning([], 'anything'), null);
});

test('pruneForge keeps the newest receipts (with their proofs) and drops artifact dirs past the age limit', async () => {
  const jobsDir = await mkdtemp(path.join(tmpdir(), 'nova-forge-jobs-'));
  const root = await mkdtemp(path.join(tmpdir(), 'nova-forge-artifacts-'));
  const now = Date.now();
  for (let i = 0; i < 5; i++) {
    const id = `job0000${i}`;
    await writeFile(path.join(jobsDir, `${id}.json`), '{}', 'utf8');
    await writeFile(path.join(jobsDir, `${id}.png`), 'png', 'utf8');
    const t = new Date(now - i * 86_400_000);
    await utimes(path.join(jobsDir, `${id}.json`), t, t);
  }
  await mkdir(path.join(root, 'old-build-aaaaaaaa'));
  await utimes(path.join(root, 'old-build-aaaaaaaa'), new Date(now - 40 * 86_400_000), new Date(now - 40 * 86_400_000));
  await mkdir(path.join(root, 'new-build-bbbbbbbb'));
  const r = await pruneForge({ keepJobs: 3, artifactDays: 30, now, jobsDir, forgeRoot: root });
  assert.deepEqual(r, { receipts: 2, artifacts: 1 });
  const left = (await readdir(jobsDir)).sort();
  assert.deepEqual(left, ['job00000.json', 'job00000.png', 'job00001.json', 'job00001.png', 'job00002.json', 'job00002.png'], 'the three newest, proofs included');
  assert.equal(existsSync(path.join(root, 'old-build-aaaaaaaa')), false);
  assert.equal(existsSync(path.join(root, 'new-build-bbbbbbbb')), true);
  await rm(jobsDir, { recursive: true, force: true }); await rm(root, { recursive: true, force: true });
});

test('repoFocus: the repository names its own newest work; a plain folder says nothing', async () => {
  const plain = await mkdtemp(path.join(tmpdir(), 'nova-not-a-repo-'));
  assert.equal(repoFocus(plain), '');
  assert.equal(repoFocus(null), '');
  await rm(plain, { recursive: true, force: true });
  const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const focus = repoFocus(here);
  assert.match(focus, /^Last commit: ".+"\./m, 'this repo has a last commit');
  assert.match(focus, /Uncommitted changes \(git diff --stat HEAD\)|No uncommitted changes/);
});
