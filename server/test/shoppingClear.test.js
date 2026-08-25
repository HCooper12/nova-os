// Clearing the whole shopping list. Emptying a list by ticking twenty things
// off one at a time is bookkeeping, not shopping — but a wipe is the most
// destructive thing this file does, so it has to be undoable.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-shop-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { addItemsDirect, clearAll, restoreItems, loadShoppingList, toggleItem } =
  await import('../lib/shoppingList.js');

test.after(async () => { await rm(vault, { recursive: true, force: true }); });

async function seed() {
  await mkdir(path.join(vault, 'Wiki/Inbox'), { recursive: true }).catch(() => {});
  await clearAll(vault).catch(() => {});
  return addItemsDirect(vault, [
    { name: 'Pauls protein yoghurt', category: 'Household & Other' },
    { name: 'chicken thighs', category: 'Household & Other' },
    { name: 'rice', category: 'Household & Other' },
  ]);
}

test('clear: empties the list in one action and hands back everything it removed', async () => {
  await seed();
  const cleared = await clearAll(vault);
  assert.equal(cleared.length, 3, 'the caller gets the whole list back to undo with');
  const { items } = await loadShoppingList(vault);
  assert.equal(items.length, 0);
});

test('clear: takes checked and unchecked alike — that is the point', async () => {
  const added = await seed();
  await toggleItem(vault, added[0].id, true); // one ticked off, two not
  const cleared = await clearAll(vault);
  assert.equal(cleared.length, 3, 'he should not have to tick everything first');
  assert.equal((await loadShoppingList(vault)).items.length, 0);
});

test('clear on an empty list is a no-op, not an error', async () => {
  await seed();
  await clearAll(vault);
  const again = await clearAll(vault);
  assert.deepEqual(again, []);
});

test('undo: restores the exact list, ids and checked state included', async () => {
  const added = await seed();
  await toggleItem(vault, added[1].id, true);
  const before = (await loadShoppingList(vault)).items;
  const cleared = await clearAll(vault);
  await restoreItems(vault, cleared);
  const after = (await loadShoppingList(vault)).items;
  assert.equal(after.length, before.length);
  assert.deepEqual(
    after.map((i) => [i.id, i.name, i.category, i.checked]).sort(),
    before.map((i) => [i.id, i.name, i.category, i.checked]).sort(),
    'an undo returns the list he had, not a reconstruction of it',
  );
});

test('undo twice is harmless — no duplicated items', async () => {
  await seed();
  const cleared = await clearAll(vault);
  await restoreItems(vault, cleared);
  await restoreItems(vault, cleared);
  const { items } = await loadShoppingList(vault);
  assert.equal(items.length, 3, 'a double-tapped undo must not double the list');
  assert.equal(new Set(items.map((i) => i.id)).size, 3);
});

test('undo merges rather than replaces — anything added since survives', async () => {
  await seed();
  const cleared = await clearAll(vault);
  await addItemsDirect(vault, [{ name: 'milk', category: 'Household & Other' }]);
  await restoreItems(vault, cleared);
  const names = (await loadShoppingList(vault)).items.map((i) => i.name);
  assert.ok(names.includes('milk'), 'an item added after the clear is not wiped by the undo');
  assert.equal(names.length, 4);
});

test('restore refuses an empty payload rather than silently doing nothing', async () => {
  await assert.rejects(() => restoreItems(vault, []), /nothing to restore/);
  await assert.rejects(() => restoreItems(vault, [{ name: '   ' }]), /nothing to restore/);
});

test('a whole item with no ingredients is an ordinary list entry', async () => {
  // his Pauls protein yoghurt: not a recipe, just a thing to buy
  await clearAll(vault).catch(() => {});
  const added = await addItemsDirect(vault, [{ name: 'Pauls protein yoghurt', source: 'Pauls Protein Yoghurt' }]);
  assert.equal(added.length, 1);
  assert.equal(added[0].name, 'Pauls protein yoghurt');
  assert.equal((await loadShoppingList(vault)).items.length, 1);
});
