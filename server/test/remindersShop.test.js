// ONE LIST, TWO DOORS (server/lib/remindersShop.js): the sync pass between
// Nova's shopping list and the Reminders list Siri calls Shopping, against
// a fake Reminders and a fake vault. No EventKit, no vault, no Inbox.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-remshop-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const R = await import('../lib/remindersShop.js');

let n = 0;
function world({ items = [], reminders = [] } = {}) {
  const w = { items: items.map((i) => ({ checked: false, qty: 1, ...i })), rem: reminders.map((r) => ({ notes: '', done: false, ...r })), records: [] };
  w.deps = {
    readReminders: async () => w.rem.map((r) => ({ ...r })),
    applyReminders: async (ops) => ops.map((o) => {
      if (o.op === 'add') { const r = { id: `r${(n += 1)}`, title: o.title, notes: o.notes || '', done: !!o.done }; w.rem.push(r); return { ok: true, item: r }; }
      const r = w.rem.find((x) => x.id === o.id);
      if (!r) return { ok: false, error: 'not on the list' };
      if (o.op === 'set') { Object.assign(r, { title: o.title, notes: o.notes, done: o.done }); return { ok: true, item: r }; }
      w.rem = w.rem.filter((x) => x.id !== o.id);
      return { ok: true };
    }),
    loadItems: async () => w.items.map((i) => ({ ...i })),
    toggle: async (id, checked) => { w.items.find((i) => i.id === id).checked = checked; },
    fileFromReminders: async (title) => { const id = `i${(n += 1)}`; w.items.push({ id, name: title, checked: false, qty: 1, source: 'reminders' }); w.records.push({ title, kind: 'add' }); return { ids: [id] }; },
    removeFromReminders: async (ids, title) => { const removed = w.items.filter((i) => ids.includes(i.id)); w.items = w.items.filter((i) => !ids.includes(i.id)); w.records.push({ title, kind: 'remove', removed }); return { removed }; },
    now: () => new Date('2026-10-19T00:00:00Z'),
  };
  w.pass = async () => R.syncPass(w.deps, await R.loadSyncStore());
  return w;
}
const fresh = async () => rm(path.join(process.env.NOVA_DATA_DIR, 'reminders-shop.json'), { force: true });

test('a recipe line reads in Reminders as he would say it, the recipe in the notes', () => {
  const L = R.linesOf([{ id: 'a', name: 'Weet-Bix', amount: '10', qty: 1, source: 'Milky Bar Weet-Bix Slice' }]).get('weet bix');
  assert.equal(L.title, '10 Weet-Bix');
  assert.equal(L.notes, 'for Milky Bar Weet-Bix Slice');
  const two = R.linesOf([{ id: 'a', name: 'blueberries', amount: '100g', source: 'Smoothie' }, { id: 'b', name: 'Blueberries', amount: '50g', source: 'Oats' }]).get('blueberry');
  assert.equal(two.title, '150 g blueberries');
  assert.equal(two.notes, '100 g for Smoothie\n50 g for Oats');
  assert.equal(R.keyOfTitle('150 g blueberries'), 'blueberry');
  assert.equal(R.keyOfTitle('100g + 50g blueberries'), 'blueberry', 'an old title still links');
  assert.equal(R.keyOfTitle('Milk'), 'milk');
});

test('each meal says its own amount, a ticked item no longer counts, prep words stay out (his screenshot, 15 Nov)', () => {
  const L = R.linesOf([
    { id: 'a', name: 'extra lean beef mince', amount: '750 g', source: 'Pizza Bowls' },
    { id: 'b', name: 'extra lean beef mince', amount: '400g', source: 'Muffin' },
    { id: 'c', name: 'iceberg lettuce', amount: '150g', checked: true, source: 'Burger' },
    { id: 'd', name: 'iceberg lettuce', amount: '150g', source: 'Burger' },
    { id: 'e', name: 'lean beef patties (5 patties, cooked, drained), 1 patty per bowl, chopped', amount: '1kg', source: 'Burger' },
    { id: 'f', name: 'lean beef patties (5 patties, cooked, drained), 1 patty per bowl, chopped', amount: '1kg', source: 'Burger' },
    { id: 'g', name: 'oats', amount: '1 cup', source: 'A' },
    { id: 'h', name: 'oats', amount: '40g', source: 'B' },
  ]);
  const mince = [...L.values()].find((l) => /mince/.test(l.title));
  assert.equal(mince.title, '1.15 kg extra lean beef mince');
  assert.equal(mince.notes, '750 g for Pizza Bowls\n400 g for Muffin');
  const lettuce = [...L.values()].find((l) => /lettuce/.test(l.title));
  assert.equal(lettuce.title, '150 g iceberg lettuce', 'the ticked 150 g is bought');
  assert.equal(lettuce.done, false);
  const patties = [...L.values()].find((l) => /patties/.test(l.title));
  assert.equal(patties.title, '2 kg lean beef patties');
  assert.equal(patties.notes, '1 kg × 2 for Burger', 'the same meal twice says so');
  const oats = [...L.values()].find((l) => /oats/.test(l.title));
  assert.equal(oats.title, '1 cup + 40g oats', 'units that do not add stay as written');
  assert.equal(oats.notes, '1 cup for A\n40 g for B');
  const done = R.linesOf([{ id: 'x', name: 'milk', amount: '1l', checked: true, source: 'S' }, { id: 'y', name: 'milk', amount: '1l', checked: true, source: 'S' }]).get('milk');
  assert.equal(done.title, '2 l milk', 'a finished line keeps its whole amount');
});

test('the first pass deletes nothing: links by name, and each side gets what it was missing', async () => {
  await fresh();
  const w = world({
    items: [{ id: 'a', name: 'Weet-Bix', amount: '10' }, { id: 'b', name: 'milk' }],
    reminders: [{ id: 'x', title: 'Milk' }, { id: 'y', title: 'Dish soap' }],
  });
  const rep = await w.pass();
  assert.deepEqual(rep.imported, ['Dish soap']);
  assert.ok(w.items.some((i) => i.name === 'Dish soap'), 'Siri\'s add is on Nova\'s list');
  assert.ok(w.rem.some((r) => r.title === '10 Weet-Bix'), 'Nova\'s line is in Reminders');
  assert.equal(w.rem.filter((r) => /milk/i.test(r.title)).length, 1, 'milk linked, not doubled');
  assert.equal(w.rem.length, 3);
  // and a second pass with nothing changed changes nothing
  const again = await w.pass();
  assert.deepEqual([again.added, again.updated, again.imported.length, again.removedInReminders, again.removedInNova.length], [0, 0, 0, 0, 0]);
});

test('a tick in Reminders ticks the line in Nova, and the other way', async () => {
  await fresh();
  const w = world({ items: [{ id: 'a', name: 'eggs' }, { id: 'b', name: 'bread' }] });
  await w.pass();
  w.rem.find((r) => r.title === 'eggs').done = true;
  const rep = await w.pass();
  assert.equal(rep.tickedInNova, 1);
  assert.equal(w.items.find((i) => i.id === 'a').checked, true);
  w.items.find((i) => i.id === 'b').checked = true;
  await w.pass();
  assert.equal(w.rem.find((r) => r.title === 'bread').done, true);
  // un-ticked in Reminders comes back too
  w.rem.find((r) => r.title === 'eggs').done = false;
  await w.pass();
  assert.equal(w.items.find((i) => i.id === 'a').checked, false);
});

test('ticked on both sides differently in one pass: the vault wins', async () => {
  await fresh();
  const w = world({ items: [{ id: 'a', name: 'eggs' }] });
  await w.pass();
  w.rem[0].done = true;
  w.items[0].checked = false; // unchanged in Nova… then changed:
  const s = await R.loadSyncStore();
  s.map.egg.nDone = true; // the base says Nova had it ticked, so Nova's untick is a change
  const rep = await R.syncPass(w.deps, s);
  assert.equal(rep.tickedInNova, 0);
  assert.equal(w.rem[0].done, false, 'Reminders follows the vault');
});

test('deleted in Reminders leaves Nova with an Undo record; removed in Nova removes the reminder', async () => {
  await fresh();
  const w = world({ items: [{ id: 'a', name: 'eggs' }, { id: 'b', name: 'bread' }, { id: 'c', name: 'tea' }, { id: 'd', name: 'rice' }] });
  await w.pass();
  w.rem = w.rem.filter((r) => r.title !== 'eggs');
  const rep = await w.pass();
  assert.deepEqual(rep.removedInNova, ['eggs']);
  assert.equal(w.records.at(-1).kind, 'remove');
  assert.equal(w.records.at(-1).removed[0].id, 'a', 'the record carries the item for its Undo');
  w.items = w.items.filter((i) => i.name !== 'bread');
  const rep2 = await w.pass();
  assert.equal(rep2.removedInReminders, 1);
  assert.ok(!w.rem.some((r) => r.title === 'bread'));
});

test('THE GUARD: a read where most linked reminders vanished deletes nothing anywhere', async () => {
  await fresh();
  const w = world({ items: ['eggs', 'bread', 'tea', 'rice', 'milk', 'oats'].map((name, i) => ({ id: `n${i}`, name })) });
  await w.pass();
  const kept = w.rem;
  w.rem = []; // an empty read
  const rep = await w.pass();
  assert.match(rep.guarded, /nothing was deleted/);
  assert.equal(w.items.length, 6, 'not one line left Nova');
  w.rem = kept;
  w.items = []; // and an empty vault read
  const rep2 = await w.pass();
  assert.match(rep2.guarded, /nothing was deleted/);
  assert.equal(w.rem.length, 6, 'not one reminder removed');
});

test('a second "milk" from Siri folds into the line; its reminder goes, the line\'s stays', async () => {
  await fresh();
  const w = world({ items: [{ id: 'a', name: 'milk', amount: '2L' }] });
  await w.pass();
  w.rem.push({ id: 'siri1', title: 'Milk', notes: '', done: false });
  await w.pass();
  assert.equal(w.items.filter((i) => /milk/i.test(i.name)).length, 2);
  await w.pass();
  assert.equal(w.rem.filter((r) => /milk/i.test(r.title)).length, 1);
});

test('an old ticked reminder is not a new thing to buy', async () => {
  await fresh();
  const w = world({ reminders: [{ id: 'old', title: 'Batteries', done: true }] });
  const rep = await w.pass();
  assert.deepEqual(rep.imported, []);
  assert.equal(w.items.length, 0);
});
