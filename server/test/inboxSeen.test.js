// THE THIRD VERB (23 Sep 2026): seen is "looked at, not decided". A seen
// record stays pending — it still waits for his call — it just stops being
// new. Pinned: only pending records take it, it is reversible, and the Home
// line counts new separately without changing what "waiting" means.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-seen-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { setSeen } = await import('../lib/inbox.js');
const { createRecord, getRecord, _resetInboxStore } = await import('../lib/inboxStore.js');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

test('a pending record takes seenAt, stays pending, and gives it back', async () => {
  _resetInboxStore();
  const r = await createRecord({ id: 'seen-1', text: 'try the org map', status: 'pending', kind: null, createdAt: '2026-09-23T00:00:00.000Z' });
  const seen = await setSeen(r.id, true, { now: Date.parse('2026-09-23T01:00:00Z') });
  assert.equal(seen.status, 'pending', 'seen is not a decision');
  assert.equal(seen.seenAt, '2026-09-23T01:00:00.000Z');
  const back = await setSeen(r.id, false);
  assert.equal(back.seenAt, null);
  assert.equal((await getRecord(r.id)).status, 'pending');
});

test('only a pending record can be seen; a filed or missing one refuses', async () => {
  _resetInboxStore();
  const filed = await createRecord({ id: 'seen-2', text: 'x', status: 'filed', createdAt: '2026-09-23T00:00:00.000Z' });
  await assert.rejects(() => setSeen(filed.id), /only a pending record/);
  await assert.rejects(() => setSeen('nope'), /not found/);
});
