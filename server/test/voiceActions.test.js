// Voice-confirmed actions: a PROPOSE line becomes a PENDING record on the
// rails — nothing writes until approval, unknowns fail honestly at propose
// time, and the rotation-variant filer round-trips through undo.
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-voiceact-'));
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-voiceact-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPE_FILE } from './fixtures.js';

await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
await writeFile(path.join(vault, 'Wiki/Health/Meal Prep Recipe Collection.md'), RECIPE_FILE);

const { createVoiceProposal } = await import('../lib/voiceActions.js');
const { addRecipe, addAlternate, loadRecipes } = await import('../lib/recipes.js');
const { loadRotation, setRotationSlot } = await import('../lib/rotation.js');
const { approveRecord, undoRecord } = await import('../lib/inbox.js');
const { getRecord } = await import('../lib/inboxStore.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
  await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true });
});

test('unknown kinds and empty payloads are honest errors, no record created', async () => {
  await assert.rejects(() => createVoiceProposal(vault, 'q', { kind: 'wire-money' }), /unknown proposal kind/);
  await assert.rejects(() => createVoiceProposal(vault, 'q', { kind: 'capture', text: '  ' }), /nothing to file/);
  await assert.rejects(() => createVoiceProposal(vault, 'q', { kind: 'calendar', command: '' }), /needs a command/);
});

test('routine-edit proposals reuse the Coach validator — unknown routine fails honestly', async () => {
  await assert.rejects(
    () => createVoiceProposal(vault, 'swap it', { kind: 'routine-edit', action: 'swap', routine: 'No Such Day', remove: 'X', add: 'Y' }),
    /routine/i,
  );
});

test('rotation-variant: spoken names resolve against today, then file + undo round-trip', async () => {
  await addRecipe(vault, { name: 'Works Burger', category: 'CORE DAILY MEALS', macros: { p: 54, c: 60, f: 30, kcal: 725 }, ingredients: ['brioche bun', 'beef patty'], method: ['grill'] });
  await addAlternate(vault, 'Works Burger', { label: 'White bread, no avocado', macros: { p: 52, c: 48, f: 18, kcal: 580 }, ingredients: ['white bread', 'beef patty'], method: ['grill'] });
  let rs = await loadRecipes(vault);
  await setRotationSlot(vault, rs, 'lunch', rs.find((r) => r.name === 'Works Burger').id);

  // unknowns fail at PROPOSE time — before any record exists
  await assert.rejects(() => createVoiceProposal(vault, 'q', { kind: 'rotation-variant', slot: 'dinner', variant: 'x' }), /isn't a rotation slot with a recipe today/);
  await assert.rejects(() => createVoiceProposal(vault, 'q', { kind: 'rotation-variant', slot: 'lunch', variant: 'Gluten Free' }), /no alternate called/);

  // a ci partial name match resolves to the real alternate
  const out = await createVoiceProposal(vault, 'white bread today please', { kind: 'rotation-variant', slot: 'lunch', variant: 'white bread' });
  assert.match(out.title, /White bread, no avocado/);

  // NOTHING changed yet — the record is pending, the rotation untouched
  const record = await getRecord(out.recordId);
  assert.equal(record.status, 'pending');
  rs = await loadRecipes(vault);
  let rot = await loadRotation(vault, rs);
  assert.equal(rot.slots.lunch.variant, null, 'proposing writes nothing');

  // approve = the variant applies for today only
  await approveRecord(vault, out.recordId);
  rot = await loadRotation(vault, rs);
  assert.equal(rot.slots.lunch.variant, 'White bread, no avocado');
  assert.equal(rot.slots.lunch.macros.kcal, 580);
  assert.equal(rs.find((r) => r.name === 'Works Burger').macros.kcal, 725, 'stored recipe untouched');

  // undo restores the exact prior state
  await undoRecord(vault, out.recordId);
  rot = await loadRotation(vault, rs);
  assert.equal(rot.slots.lunch.variant, null, 'undo cleared the variant');
});

test('clearing a variant is a proposal too, with a symmetric undo', async () => {
  const rs = await loadRecipes(vault);
  const { setSlotVariant } = await import('../lib/rotation.js');
  await setSlotVariant(vault, rs, 'lunch', 'white-bread-no-avocado');

  const out = await createVoiceProposal(vault, 'back to normal', { kind: 'rotation-variant', slot: 'lunch' });
  assert.match(out.title, /as written/);
  await approveRecord(vault, out.recordId);
  let rot = await loadRotation(vault, rs);
  assert.equal(rot.slots.lunch.variant, null);

  await undoRecord(vault, out.recordId);
  rot = await loadRotation(vault, rs);
  assert.equal(rot.slots.lunch.variant, 'White bread, no avocado', 'undo restored the prior variant');
});
