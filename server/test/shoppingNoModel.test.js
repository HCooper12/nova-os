// THE SHOPPING LIST WITHOUT HIS CLAUDE USAGE (18 Oct 2026). His report: "I
// can't add items unless my Claude usage is active". A stub CLI that fails
// like an exhausted account must cost nothing: the item lands, in the aisle
// code knows. NOVA_DATA_DIR and CLAUDE_BIN are set BEFORE any import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'nova-shop-'));
process.env.NOVA_DATA_DIR = path.join(dir, 'data');
const stub = path.join(dir, 'claude');
writeFileSync(stub, '#!/bin/sh\necho "Claude usage limit reached" >&2\nexit 1\n');
chmodSync(stub, 0o755);
process.env.CLAUDE_BIN = stub;
const vault = path.join(dir, 'vault');
mkdirSync(path.join(vault, 'Wiki/Health'), { recursive: true });

const { startAddItems, getAddItemsJob, loadShoppingList } = await import('../lib/shoppingList.js');
const { guessCategory } = await import('../lib/shoppingCategory.js');

const settle = async (id) => { for (let i = 0; i < 100; i++) { const j = getAddItemsJob(id); if (j.status !== 'running') return j; await new Promise((r) => setTimeout(r, 20)); } throw new Error('job never settled'); };

test('with the model out of usage, every item still lands, filed by code', async () => {
  const job = await settle(startAddItems(vault, [{ name: 'toothpaste' }, { name: '1kg chicken breast' }, { name: 'Greek yoghurt' }, { name: 'zxqv thing' }]));
  assert.equal(job.status, 'ready', job.error || '');
  const { items } = await loadShoppingList(vault);
  const by = Object.fromEntries(items.map((i) => [i.name, i]));
  assert.equal(by.toothpaste.category, 'Household & Other');
  assert.equal(by['chicken breast'].category, 'Meat & Protein');
  assert.equal(by['chicken breast'].amount, '1kg', 'the amount is never lost');
  assert.equal(by['Greek yoghurt'].category, 'Dairy & Eggs');
  assert.ok(by['zxqv thing'], 'an item code cannot place is still added');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal((await loadShoppingList(vault)).items.length, 4, 'the failed model call removed nothing');
});

test('the last food word decides, and his own past filing beats the table', () => {
  assert.equal(guessCategory('peanut butter').category, 'Pantry & Seasonings');
  assert.equal(guessCategory('chicken stock').category, 'Pantry & Seasonings');
  assert.equal(guessCategory('frozen peas').category, 'Frozen');
  assert.equal(guessCategory('Bananas').category, 'Produce');
  assert.equal(guessCategory('creatine', { creatine: 'Pantry & Seasonings' }).category, 'Pantry & Seasonings');
  assert.equal(guessCategory('creatine').sure, false);
});
