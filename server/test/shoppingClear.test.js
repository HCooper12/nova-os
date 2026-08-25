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

const { addItemsDirect, clearAll, restoreItems, loadShoppingList, toggleItem, setItemQty, normalizeQty, MAX_QTY } =
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

// QUANTITIES. "Add the protein yoghurt but make it seven" is one decision in
// a shop, not a note stapled to the item.
test('a new item is one of a thing unless he says otherwise', async () => {
  await clearAll(vault).catch(() => {});
  const [a] = await addItemsDirect(vault, [{ name: 'Pauls protein yoghurt' }]);
  assert.equal(a.qty, 1, 'no stated quantity means one, never undefined');
});

test('quantity can be set, and survives a reload', async () => {
  await clearAll(vault).catch(() => {});
  const [a] = await addItemsDirect(vault, [{ name: 'Pauls protein yoghurt' }]);
  await setItemQty(vault, a.id, 7);
  const items = (await loadShoppingList(vault)).items;
  assert.equal(items.find((i) => i.id === a.id).qty, 7);
});

test('quantity is clamped to something a shop can honour', () => {
  assert.equal(normalizeQty(0), 1, 'zero of a thing is not on a list');
  assert.equal(normalizeQty(-4), 1);
  assert.equal(normalizeQty(2.7), 2, 'whole items only');
  assert.equal(normalizeQty('7'), 7);
  assert.equal(normalizeQty(9999), MAX_QTY, 'a slipped keypress cannot ask for thousands');
  assert.equal(normalizeQty(undefined), 1);
  assert.equal(normalizeQty('nonsense'), 1);
});

test('setting a quantity on a missing item is an error, not a silent no-op', async () => {
  await assert.rejects(() => setItemQty(vault, 'nope', 3), /item not found/);
});

test('the vault file shows the count a person would read', async () => {
  const { readFile } = await import('node:fs/promises');
  await clearAll(vault).catch(() => {});
  const [a] = await addItemsDirect(vault, [{ name: 'Pauls protein yoghurt', category: 'Dairy & Eggs' }]);
  await setItemQty(vault, a.id, 7);
  const raw = await readFile(path.join(vault, 'Wiki/Health/Shopping List.md'), 'utf8');
  assert.match(raw, /7 × Pauls protein yoghurt/, 'Obsidian shows "7 ×", not a hidden field');
  await setItemQty(vault, a.id, 1);
  const single = await readFile(path.join(vault, 'Wiki/Health/Shopping List.md'), 'utf8');
  assert.doesNotMatch(single, /1 × /, 'one of a thing needs no number in front of it');
});

test('an undo restores quantities too', async () => {
  await clearAll(vault).catch(() => {});
  const [a] = await addItemsDirect(vault, [{ name: 'yoghurt' }]);
  await setItemQty(vault, a.id, 7);
  const cleared = await clearAll(vault);
  await restoreItems(vault, cleared);
  assert.equal((await loadShoppingList(vault)).items[0].qty, 7);
});

// AMOUNTS FROM A RECIPE. He added the Chicken Caesar and the chicken arrived
// as bare "chicken breast" — the 1kg had been tidied away by the model that
// categorises names. The amount is now split off BEFORE the model sees it.
test('splitAmount handles the shapes his real recipes actually use', async () => {
  const { splitAmount } = await import('../lib/shoppingList.js');
  const cases = [
    ['1kg raw chicken breast (Nuttab or Woolworths RSPCA)', '1kg', 'raw chicken breast (Nuttab or Woolworths RSPCA)'],
    ['400g pasta (Mafalde Forte or any short pasta shape)', '400g', 'pasta (Mafalde Forte or any short pasta shape)'],
    ['10 slices Wonder white bread', '10 slices', 'Wonder white bread'],
    ['2 whole eggs', '2', 'whole eggs'],
    ['1 x 250g microwave rice pouch', '1 x 250g', 'microwave rice pouch'],
    ['1 tbsp BBQ sauce', '1 tbsp', 'BBQ sauce'],
    ['1 1/4 cups caramelised brown onion (about 5 onions worth)', '1 1/4 cups', 'caramelised brown onion (about 5 onions worth)'],
  ];
  for (const [input, amount, name] of cases) {
    assert.deepEqual(splitAmount(input), { amount, name }, input);
  }
});

test('splitAmount never invents an amount, and never eats the whole item', async () => {
  const { splitAmount } = await import('../lib/shoppingList.js');
  for (const s of ['Milk', 'Fresh spring onion + sliced red chilli to top', 'Soy sauce + oyster sauce (3 tbsp combined)']) {
    assert.deepEqual(splitAmount(s), { amount: null, name: s }, s);
  }
  // a bare amount IS the item — there is nothing left to buy without it
  assert.deepEqual(splitAmount('500g'), { amount: null, name: '500g' });
  assert.deepEqual(splitAmount('3 kg'), { amount: null, name: '3 kg' });
  assert.deepEqual(splitAmount(''), { amount: null, name: '' });
  assert.deepEqual(splitAmount(undefined), { amount: null, name: '' });
});

test('adding a recipe ingredient keeps its amount all the way to the list', async () => {
  await clearAll(vault).catch(() => {});
  const added = await addItemsDirect(vault, [{ name: '1kg raw chicken breast', source: 'Chicken Caesar Pasta' }]);
  assert.equal(added[0].amount, '1kg', 'the weight survives the add');
  assert.equal(added[0].name, 'raw chicken breast');
  const { readFile } = await import('node:fs/promises');
  const raw = await readFile(path.join(vault, 'Wiki/Health/Shopping List.md'), 'utf8');
  assert.match(raw, /1kg raw chicken breast/, 'and it reads correctly in Obsidian');
});

test('an amount survives a clear and undo', async () => {
  await clearAll(vault).catch(() => {});
  await addItemsDirect(vault, [{ name: '400g pasta' }]);
  const cleared = await clearAll(vault);
  await restoreItems(vault, cleared);
  assert.equal((await loadShoppingList(vault)).items[0].amount, '400g');
});
