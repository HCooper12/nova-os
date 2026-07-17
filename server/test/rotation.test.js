process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { loadRotation, setRotationSlot, setSlotConsumed } = await import('../lib/rotation.js');

// One temp vault for the whole file — rotation keeps module-level cache, so
// tests build on each other's state the same way the running server does.
const vault = await mkdtemp(path.join(tmpdir(), 'nova-rotation-'));
test.after(async () => {
  await rm(vault, { recursive: true, force: true });
});

const RECIPES = [
  { id: 'burrito-bowl', name: 'Burrito Bowl', macros: { p: 42, c: 55, f: 18, kcal: 560 } },
  { id: 'yogurt', name: 'YoPro Yogurt', macros: { p: 20, c: 6, f: 1, kcal: 115 } },
];

test('empty vault yields empty rotation', async () => {
  const rotation = await loadRotation(vault, RECIPES);
  assert.equal(rotation.slots.lunch, null);
  assert.deepEqual(rotation.totals, { p: 0, c: 0, f: 0, kcal: 0 });
});

test('setting a slot persists to the vault file and resolves macros', async () => {
  const rotation = await setRotationSlot(vault, RECIPES, 'lunch', 'burrito-bowl');
  assert.equal(rotation.slots.lunch.name, 'Burrito Bowl');
  assert.equal(rotation.totals.kcal, 560);

  const raw = await readFile(path.join(vault, 'Wiki/Health/Daily Rotation.md'), 'utf8');
  assert.match(raw, /lunch: burrito-bowl/);
  assert.match(raw, /\*\*Lunch:\*\* Burrito Bowl/);
});

test('marking consumed counts toward consumedTotals today', async () => {
  const rotation = await setSlotConsumed(vault, RECIPES, 'lunch', true);
  assert.equal(rotation.slots.lunch.consumed, true);
  assert.equal(rotation.consumedTotals.kcal, 560);
});

test('swapping a slot clears its consumed mark', async () => {
  const rotation = await setRotationSlot(vault, RECIPES, 'lunch', 'yogurt');
  assert.equal(rotation.slots.lunch.name, 'YoPro Yogurt');
  assert.equal(rotation.slots.lunch.consumed, false);
  assert.equal(rotation.consumedTotals.kcal, 0);
});

test('invalid slot and unknown recipe are rejected', async () => {
  await assert.rejects(setRotationSlot(vault, RECIPES, 'brunch', 'yogurt'), /invalid slot/);
  await assert.rejects(setRotationSlot(vault, RECIPES, 'lunch', 'ghost'), /unknown recipe id/);
});
