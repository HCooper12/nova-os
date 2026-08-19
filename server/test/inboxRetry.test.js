// Retry for errored inbox records. A stub CLAUDE_BIN stands in for the real
// CLI so the full re-run round-trip (error → classifying → pending) is
// exercised: the stub answers as the classifier or the researcher depending
// on which prompt it receives.
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-retry-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-retry-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

const stub = path.join(dataDir, 'claude-stub.js');
const decision = { route: 'note', confidence: 'low', title: 'Stub Note', reason: 'stub', payload: { title: 'Stub Note', body: 'stub body' } };
const brief = { title: 'Stub Brief', body: 'Summary line [1].\n\n## Sources\n[1] Example — https://example.com' };
await writeFile(stub, `#!/usr/bin/env node
const i = process.argv.indexOf('-p');
const prompt = i >= 0 ? process.argv[i + 1] : '';
const payload = prompt.includes("Nova's Researcher") ? ${JSON.stringify(JSON.stringify(brief))} : ${JSON.stringify(JSON.stringify(decision))};
console.log(JSON.stringify({ result: payload }));
`, 'utf8');
await chmod(stub, 0o755);
process.env.CLAUDE_BIN = stub;

import test from 'node:test';
import assert from 'node:assert/strict';

const { retryRecord } = await import('../lib/inbox.js');
const { createRecord, getRecord } = await import('../lib/inboxStore.js');

test.after(async () => {
  // The store's writes are fire-and-forget past the last assertion — a
  // trailing persist can land WHILE rm walks the tree, and macOS then
  // throws ENOTEMPTY and fails the whole file (the suite's only flake,
  // 2-of-3 runs on 18 Aug). Let stragglers settle, then retry; a tmpdir
  // the OS will reap anyway is never worth a red suite.
  await new Promise((res) => setTimeout(res, 250));
  for (const dir of [dataDir, vault]) {
    for (let i = 0; i < 4; i++) {
      try { await rm(dir, { recursive: true, force: true }); break; }
      catch { await new Promise((res) => setTimeout(res, 200)); }
    }
  }
});

// 20s, not 5: this waits on a spawned classifier process, and the suite
// runs in parallel with others doing the same — a busy machine, not a
// broken retry, is what failed here. The assertions are unchanged.
async function waitForSettle(id, timeoutMs = 20_000) {
  const start = Date.now();
  for (;;) {
    const r = await getRecord(id);
    if (r.status !== 'classifying') return r;
    if (Date.now() - start > timeoutMs) throw new Error(`record ${id} never settled (still ${r.status})`);
    await new Promise((res) => setTimeout(res, 50));
  }
}

test('retry rejects records that are not in error', async () => {
  await createRecord({ id: 'ret-pend', text: 'a pending thought', source: 'text', mode: 'auto-high', status: 'pending', createdAt: new Date().toISOString() });
  await assert.rejects(() => retryRecord(vault, 'ret-pend'), /only errored records/);
});

test('retry rejects scheduled-agent kinds with a discard hint', async () => {
  await createRecord({ id: 'ret-rev', kind: 'review', text: 'Daily Review — old', source: 'nova', mode: 'draft', status: 'error', error: 'boom', createdAt: new Date().toISOString() });
  await assert.rejects(() => retryRecord(vault, 'ret-rev'), /re-runs on its own schedule/);
  const r = await getRecord('ret-rev');
  assert.equal(r.status, 'error'); // untouched — discard stays the exit
});

test('an errored capture re-runs in place and lands pending with a decision', async () => {
  await createRecord({ id: 'ret-cap', text: 'remember to stretch daily', source: 'text', mode: 'review-all', status: 'error', error: 'claude exited with code 1', createdAt: new Date().toISOString() });
  const kicked = await retryRecord(vault, 'ret-cap');
  assert.equal(kicked.status, 'classifying');
  assert.equal(kicked.error, null);
  const settled = await waitForSettle('ret-cap');
  assert.equal(settled.status, 'pending');
  assert.equal(settled.decision.route, 'note');
  assert.equal(settled.decision.title, 'Stub Note');
});

test('an errored research record re-runs its question in place', async () => {
  await createRecord({ id: 'ret-res', kind: 'research', text: 'Research: does creatine timing matter?', source: 'researcher', mode: 'draft', status: 'error', error: 'ENOTFOUND', createdAt: new Date().toISOString() });
  const kicked = await retryRecord(vault, 'ret-res');
  assert.equal(kicked.status, 'classifying');
  const settled = await waitForSettle('ret-res');
  assert.equal(settled.status, 'pending'); // web content never files itself
  assert.equal(settled.decision.title, 'Stub Brief');
  assert.match(settled.decision.payload.body, /\[1\]/); // citations survived normalizeResearch
});
