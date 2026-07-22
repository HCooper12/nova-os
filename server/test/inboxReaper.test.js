// A1 from the July 2026 sweep: stuck records were unkillable and blocked the
// day's loops. Orphaned 'classifying' records (server restart mid-compose) get
// reaped to error at boot, and error records can be discarded.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-reaper-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-reaper-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { createRecord, getRecord, reapOrphanedClassifying, _resetInboxStore } = await import('../lib/inboxStore.js');
const { discardRecord } = await import('../lib/inbox.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('reaper flips orphaned classifying records to a discardable error; pending untouched', async () => {
  await createRecord({ id: 'orphan01', kind: 'review', text: 'stuck review', source: 'nova', mode: 'draft', status: 'classifying', createdAt: new Date().toISOString() });
  await createRecord({ id: 'waiting1', text: 'a real pending capture', source: 'text', mode: 'review-all', status: 'pending', createdAt: new Date().toISOString(), decision: { route: 'note', confidence: 'high', title: 'x', reason: '', payload: { title: 'x', body: 'y' } } });

  const { reaped } = await reapOrphanedClassifying();
  assert.equal(reaped, 1, 'exactly the classifying orphan is reaped');

  const orphan = await getRecord('orphan01');
  assert.equal(orphan.status, 'error');
  assert.match(orphan.error, /server restarted/i, 'the error says what actually happened');
  assert.equal((await getRecord('waiting1')).status, 'pending', 'pending records are not touched');

  // the flipped record now has an exit — error records are discardable (they
  // used to be terminal: no endpoint accepted them, and they accumulated forever)
  const discarded = await discardRecord('orphan01');
  assert.equal(discarded.status, 'discarded');

  // …but a filed record still can't be discarded (the guard only widened to error)
  await createRecord({ id: 'filed001', text: 'done thing', source: 'text', mode: 'review-all', status: 'filed', createdAt: new Date().toISOString() });
  await assert.rejects(() => discardRecord('filed001'), /pending or errored/);

  // idempotent when nothing is stuck
  assert.deepEqual(await reapOrphanedClassifying(), { reaped: 0 });
});
