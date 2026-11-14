// Undo and discard on a pain check, through the same public functions the
// inbox routes call (13 Nov 2026). Own temp data dir and vault, set before
// any import, so nothing here touches server/data or the real vault.
process.env.TZ = 'Australia/Brisbane';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';

const root = await mkdtemp(path.join(tmpdir(), 'nova-painundo-'));
process.env.NOVA_DATA_DIR = path.join(root, 'data');
process.env.NOVA_VAULT_GRACE_MS = '0';
const vault = path.join(root, 'vault');
await mkdir(process.env.NOVA_DATA_DIR, { recursive: true });
await mkdir(path.join(vault, 'Wiki', 'Health'), { recursive: true });

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const NOW = new Date();
const daysAgo = (n) => local(new Date(NOW.getTime() - n * 86_400_000));

await writeFile(path.join(vault, 'Wiki/Health/Injury Log.md'), matter.stringify('# Injury Log\n', {
  type: 'injury-log', updated: daysAgo(20),
  injuries: [{ id: 'oldhip', area: 'Right hip', note: 'tight on lunges', severity: 'niggle', startedAt: daysAgo(20) }],
}), 'utf8');

const { raisePainChecks } = await import('../lib/painCheck.js');
const { approveRecord, discardRecord, undoRecord } = await import('../lib/inbox.js');
const { getRecord } = await import('../lib/inboxStore.js');
const { listInjuries } = await import('../lib/injuryLog.js');

const sessions = [{ date: daysAgo(2), exercises: [{ exerciseId: 'cablerow', name: 'Cable Row', pain: 'Elbow (right), on the pull', sets: [{ reps: 10 }] }] }];

test('undo of a yes on a session mention removes the entry; the same mention is not asked again', async () => {
  const before = (await listInjuries(vault)).length;
  const { raised } = await raisePainChecks(vault, { sessions, injuries: [], now: NOW });
  const ask = raised.find((r) => r.painKey);
  assert.ok(ask);
  await approveRecord(vault, ask.id);
  assert.equal((await listInjuries(vault)).length, before + 1);
  const undone = await undoRecord(vault, ask.id);
  assert.equal(undone.status, 'undone');
  assert.equal((await listInjuries(vault)).length, before, 'the entry is gone');
  const next = await raisePainChecks(vault, { sessions, injuries: [], now: NOW });
  assert.equal(next.raised.filter((r) => r.painKey === ask.painKey).length, 0, 'asked once, ever, even after undo');
});

test('a no writes nothing, and a discarded check cannot be undone', async () => {
  const other = [{ date: daysAgo(3), exercises: [{ exerciseId: 'lunge', name: 'Lunge', pain: 'Ankle (left)', sets: [{ reps: 8 }] }] }];
  const { raised } = await raisePainChecks(vault, { sessions: other, injuries: [], now: NOW });
  const ask = raised.find((r) => r.painKey);
  assert.ok(ask);
  const before = await listInjuries(vault);
  await discardRecord(ask.id);
  assert.deepEqual(await listInjuries(vault), before, 'the log is untouched');
  await assert.rejects(() => undoRecord(vault, ask.id), /only filed captures can be undone/);
  assert.equal((await getRecord(ask.id)).status, 'discarded', 'still discarded');
});

test('undo of a yes on "has it cleared up?" reopens the entry', async () => {
  const { raised } = await raisePainChecks(vault, { sessions: [], now: NOW });
  const ask = raised.find((r) => r.injuryId === 'oldhip');
  assert.ok(ask);
  await approveRecord(vault, ask.id);
  assert.ok((await listInjuries(vault)).find((i) => i.id === 'oldhip').resolvedAt);
  await undoRecord(vault, ask.id);
  assert.equal((await listInjuries(vault)).find((i) => i.id === 'oldhip').resolvedAt, undefined);
});
