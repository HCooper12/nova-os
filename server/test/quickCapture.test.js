// QUICK CAPTURE WITHOUT HIS CLAUDE USAGE (18 Oct 2026, mockup 103). Temp data
// dir, temp vault and a CLI stub that fails like an exhausted account, all
// BEFORE any import: nothing here may touch his real data or spawn the CLI.
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-qc-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-qc-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';
const stub = path.join(dataDir, 'claude');
await writeFile(stub, '#!/bin/sh\necho "usage limit reached" >&2\nexit 1\n');
await chmod(stub, 0o755);
process.env.CLAUDE_BIN = stub;

import test from 'node:test';
import assert from 'node:assert/strict';

const { classifyLocal, decisionFor } = await import('../lib/captureLocal.js');
const { startCapture, rerouteRecord } = await import('../lib/inbox.js');
const { getRecord } = await import('../lib/inboxStore.js');
const { loadShoppingList } = await import('../lib/shoppingList.js');
await mkdir(path.join(vault, 'Wiki/Inbox'), { recursive: true });
test.after(async () => { await rm(dataDir, { recursive: true, force: true }); await rm(vault, { recursive: true, force: true }); });

const settle = async (id) => {
  for (let i = 0; i < 150; i++) { const r = await getRecord(id); if (r.status !== 'classifying') return r; await new Promise((s) => setTimeout(s, 20)); }
  throw new Error('never settled');
};

test('code reads what it can be sure of, and claims nothing else', async () => {
  assert.equal((await classifyLocal('toothpaste')).route, 'shopping');
  assert.deepEqual((await classifyLocal('milk and eggs')).payload.items.map((i) => i.category), ['Dairy & Eggs', 'Dairy & Eggs']);
  assert.equal((await classifyLocal('buy batteries')).route, 'shopping');
  assert.equal((await classifyLocal('call the bank about the card')).route, 'todo');
  assert.equal((await classifyLocal('email Sam the deck')).payload.items[0].category, 'work');
  const r = await classifyLocal('remind me tomorrow at 9am to stretch', new Date('2026-10-18T10:00:00'));
  assert.equal(r.route, 'reminder');
  assert.equal((await classifyLocal('idea: the drone shot opening')).route, 'idea');
  assert.equal(await classifyLocal('ate chicken and rice'), null, 'eaten is never a thing to buy');
  assert.equal(await classifyLocal('the drone shot opening for the gym video'), null);
  assert.equal(await classifyLocal('remind me to stretch'), null, 'no time, no reminder claim');
});

test('with no model, toothpaste still lands on the shopping list, filed by code', async () => {
  const rec = await startCapture(vault, { text: 'toothpaste' });
  const r = await settle(rec.id);
  assert.equal(r.status, 'filed');
  assert.equal(r.decision.by, 'code');
  assert.ok((await loadShoppingList(vault)).items.some((i) => i.name === 'toothpaste' && i.category === 'Household & Other'));
});

test('what code cannot place waits as Unsorted, never an error, and the tag moves it', async () => {
  const rec = await startCapture(vault, { text: 'Sensodyne for Mum birthday' });
  const r = await settle(rec.id);
  assert.equal(r.status, 'pending');
  assert.equal(r.decision.unsorted, true);
  const moved = await rerouteRecord(vault, rec.id, { route: 'todo' });
  assert.equal(moved.status, 'filed');
  assert.equal(moved.decision.route, 'todo');
  assert.equal(moved.decision.by, 'him');
});

test('moving a filed item takes it out of the first place', async () => {
  const rec = await startCapture(vault, { text: 'protein bars' });
  const r = await settle(rec.id);
  assert.equal(r.decision.route, 'shopping');
  await rerouteRecord(vault, rec.id, { route: 'note', detail: 'a gift idea' });
  assert.ok(!(await loadShoppingList(vault)).items.some((i) => i.name === 'protein bars'), 'it never sits in two places');
  assert.equal((await getRecord(rec.id)).decision.route, 'note');
});

test('a reminder needs a time it can read', () => {
  assert.equal(decisionFor('reminder', 'stretch', new Date('2026-10-18T10:00:00')), null);
  assert.equal(decisionFor('reminder', 'stretch', new Date('2026-10-18T10:00:00'), 'x', 'tomorrow 9am').route, 'reminder');
});

test('a reminder reads as the thing to do, not "to stretch"', async () => {
  const r = await classifyLocal('remind me tomorrow at 9am to stretch', new Date('2026-10-18T10:00:00'));
  assert.equal(r.payload.text, 'stretch');
});
