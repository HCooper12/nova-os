import test from 'node:test';
import assert from 'node:assert/strict';
import { drainItems, keyOf, makeOutboxItem, idemSafe, newIdempotencyKey } from '../../src/outbox.js';
import {
  foodDayWithQueued, shoppingWithQueued, inboxWithQueued, todosWithQueued, journalWithQueued,
  historyWithQueued, queuedPatch, isQueuedId, queuedItemId, localDay,
} from '../../src/outboxOverlay.js';

// Offline mode (2 Nov 2026): the Outbox replays in order, stops at the first
// sign the Mac is still away, carries one key per write, and what waits in
// it stays visible in the list it belongs to.

const offline = () => new TypeError('Offline. Requires Mac connection.');
const sink = () => {
  const log = { sent: [], failed: [], keys: [] };
  return {
    log,
    opts: {
      send: (key, run) => { log.keys.push(key); return run(); },
      onSent: (i) => log.sent.push(i.id),
      onFailed: (i, e) => log.failed.push([i.id, e.message]),
    },
  };
};

test('drains in the order he made them, each under its own key', async () => {
  const a = makeOutboxItem('food', 'apple', { name: 'apple' });
  const b = makeOutboxItem('capture', 'toothpaste', { text: 'toothpaste' });
  const seen = [];
  const { log, opts } = sink();
  const r = await drainItems([a, b], { food: async (p) => seen.push(p.name), capture: async (p) => seen.push(p.text) }, opts);
  assert.deepEqual(seen, ['apple', 'toothpaste']);
  assert.deepEqual(log.sent, [a.id, b.id]);
  assert.deepEqual(log.keys, [a.key, b.key]);
  assert.notEqual(a.key, b.key);
  assert.deepEqual(r, { sent: 2, stopped: false });
});

test('a connectivity failure stops the drain with the rest still queued, in order', async () => {
  const items = ['one', 'two', 'three'].map((n) => makeOutboxItem('todo', n, { text: n }));
  const { log, opts } = sink();
  let calls = 0;
  const r = await drainItems(items, { todo: async () => { calls++; if (calls === 2) throw offline(); } }, opts);
  assert.deepEqual(log.sent, [items[0].id]);
  assert.equal(calls, 2, 'nothing after the failure was tried');
  assert.deepEqual(r, { sent: 1, stopped: true });
});

test('a server rejection marks that one failed and the drain goes on', async () => {
  const items = ['bad', 'good'].map((n) => makeOutboxItem('food', n, { name: n }));
  const { log, opts } = sink();
  const no = Object.assign(new Error('name is required'), { status: 400 });
  await drainItems(items, { food: async (p) => { if (p.name === 'bad') throw no; } }, opts);
  assert.deepEqual(log.failed, [[items[0].id, 'name is required']]);
  assert.deepEqual(log.sent, [items[1].id]);
});

test('failed items are skipped; an item from before keys existed replays under a stable key', async () => {
  const old = { id: 'abc12345', kind: 'food', payload: {}, status: 'queued' };
  const failed = { ...makeOutboxItem('food', 'x', {}), status: 'failed' };
  const { log, opts } = sink();
  await drainItems([failed, old], { food: async () => {} }, opts);
  assert.deepEqual(log.keys, ['outbox-abc12345']);
  assert.equal(keyOf(old), keyOf(old));
});

test('keys are header-safe; a session clientKey is cleaned, never refused', () => {
  assert.match(newIdempotencyKey('food'), /^[A-Za-z0-9._:-]{8,80}$/);
  assert.equal(idemSafe('session-10bf64e1-1793575206618'), 'session-10bf64e1-1793575206618');
  assert.equal(idemSafe('session-a b/c-1'), 'session-abc-1');
  assert.equal(idemSafe('x'), null);
});

// ---- the overlay ----
const q = (kind, payload, extra = {}) => ({ ...makeOutboxItem(kind, kind, payload), queuedAt: '2026-11-02T00:30:00.000Z', ...extra });

test('a meal logged offline is on its day, marked, and counted', () => {
  const item = q('food', { name: 'Apple', macros: { p: 1, c: 25, f: 0, kcal: 104 }, source: 'manual', date: '2026-11-02' });
  const day = { date: '2026-11-02', entries: [{ id: 'e1', name: 'Oats', macros: { p: 10, c: 50, f: 5, kcal: 300 } }] };
  const out = foodDayWithQueued(day, [item]);
  assert.equal(out.entries.length, 2);
  const row = out.entries[1];
  assert.ok(isQueuedId(row.id) && row.queued && row.pending);
  assert.equal(queuedItemId(row.id), item.id);
  assert.equal(out.entries.reduce((n, e) => n + e.macros.kcal, 0), 404);
  // another day does not get it
  assert.equal(foodDayWithQueued({ date: '2026-11-01', entries: [] }, [item]).entries.length, 0);
});

test('applying twice adds nothing; a landed or discarded item leaves the list', () => {
  const item = q('food', { name: 'Apple', macros: { p: 1, c: 1, f: 1, kcal: 10 }, date: '2026-11-02' });
  const day = { date: '2026-11-02', entries: [] };
  const once = foodDayWithQueued(day, [item]);
  assert.equal(foodDayWithQueued(once, [item]).entries.length, 1);
  assert.equal(foodDayWithQueued(once, []).entries.length, 0);
  assert.equal(foodDayWithQueued(once, [{ ...item, status: 'failed' }]).entries.length, 0);
  assert.equal(foodDayWithQueued(day, []), day, 'unchanged object when nothing waits');
});

test('a payload with no date belongs to the local day it was queued', () => {
  const at = new Date(2026, 10, 2, 9, 30).toISOString();
  const item = q('food', { name: 'x', macros: { p: 0, c: 0, f: 0, kcal: 0 } }, { queuedAt: at });
  assert.equal(foodDayWithQueued({ date: localDay(new Date(at)), entries: [] }, [item]).entries.length, 1);
});

test('shopping, capture, to-do and journal lines are drawn back in, marked', () => {
  const ob = [
    q('shopping', { items: [{ name: 'toothpaste', source: null }, { name: 'floss', source: null }] }),
    q('capture', { text: 'call mum', mode: 'auto-high', source: 'text' }),
    q('todo', { text: 'book physio' }),
    q('journal', { text: 'a quiet line', tag: 'own' }),
  ];
  const list = shoppingWithQueued({ items: [{ id: 's1', name: 'milk' }] }, ob);
  assert.deepEqual(list.items.map((i) => [i.name, !!i.queued]), [['milk', false], ['toothpaste', true], ['floss', true]]);
  const inbox = inboxWithQueued({ items: [{ id: 'r1', text: 'old' }] }, ob);
  assert.equal(inbox.items[0].text, 'call mum');
  assert.ok(inbox.items[0].queued && inbox.items[0].pendingLocally);
  const todos = todosWithQueued({ items: [{ raw: '- [ ] a', text: 'a' }, { raw: '__pending__1__book physio', text: 'book physio', pending: true }] }, ob);
  assert.deepEqual(todos.items.map((t) => t.text), ['a', 'book physio'], 'the optimistic row is replaced, not doubled');
  const days = journalWithQueued([{ date: '2026-11-01', sections: [{ text: 'y' }] }], ob);
  const line = days.flatMap((d) => d.sections).find((x) => x.queued);
  assert.equal(line.text, 'a quiet line');
  assert.equal(line.author, 'hayden');
  assert.equal(journalWithQueued(days, []).flatMap((d) => d.sections).some((x) => x.queued), false);
});

test('a session finished offline joins the history, filtered by routine', () => {
  const item = q('session', { payload: { routineId: 'r1', routineName: 'Push', exercises: [{ exerciseId: 'b', name: 'Bench', sets: [{ weight: 60, reps: 8 }] }], clientKey: 'session-r1-1' } });
  const hist = [{ id: 's1', date: '2026-10-30', routineId: 'r1', exercises: [] }];
  const out = historyWithQueued(hist, [item], 'r1');
  assert.equal(out.length, 2);
  assert.ok(out[0].queued);
  assert.equal(historyWithQueued(hist, [item], 'other').length, 1);
});

test('queuedPatch returns only the slices that change', () => {
  const st = { outbox: [], liveFoodLog: { date: '2026-11-02', entries: [] }, liveShoppingList: { items: [] } };
  assert.deepEqual(queuedPatch(st), {});
  st.outbox = [q('shopping', { items: [{ name: 'x' }] })];
  assert.deepEqual(Object.keys(queuedPatch(st)), ['liveShoppingList']);
});
