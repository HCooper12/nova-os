import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.NOVA_DATA_DIR ||= (await import('node:fs')).mkdtempSync((await import('node:os')).tmpdir() + '/nova-ri-');
const { recentInbox } = await import('../lib/inboxStore.js');

const now = Date.parse('2026-10-14T10:00:00Z');
const day = 86_400_000;
const at = (d) => new Date(now - d * day).toISOString();

test('open records always ride the sync; settled ones for 14 days', () => {
  const items = [
    { id: 'a', status: 'pending', createdAt: at(60) },
    { id: 'b', status: 'classifying', createdAt: at(30) },
    { id: 'c', status: 'filed', createdAt: at(3), filedAt: at(3) },
    { id: 'd', status: 'filed', createdAt: at(40), filedAt: at(40) },
    { id: 'e', status: 'discarded', createdAt: at(20), updatedAt: at(20) },
    { id: 'f', status: 'undone', createdAt: at(20), updatedAt: at(2) },
  ];
  const { items: kept, olderCount } = recentInbox(items, { days: 14, now });
  assert.deepEqual(kept.map((r) => r.id), ['a', 'b', 'c', 'f']);
  assert.equal(olderCount, 2);
});

test('a record with no date is kept, never silently dropped', () => {
  const { items, olderCount } = recentInbox([{ id: 'x', status: 'filed' }], { now });
  assert.equal(items.length, 1);
  assert.equal(olderCount, 0);
});
