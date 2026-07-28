// The Stash — vault-backed categorised links. Round-trips through the real
// file format; the format regex is a shared contract with Obsidian edits.
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-stash-'));
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-stash-data-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { loadStash, addStashItem, removeStashItem, parseStash, STASH_REL } = await import('../lib/stash.js');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
});

test('adding creates the file, the category, and a well-formed line', async () => {
  const out = await addStashItem(vault, { category: 'Skincare', name: 'CeraVe Foaming Cleanser', url: 'https://example.com/cerave', note: 'restock monthly' });
  assert.equal(out.categories.length, 1);
  assert.equal(out.categories[0].name, 'Skincare');
  assert.deepEqual(
    { name: out.categories[0].items[0].name, url: out.categories[0].items[0].url, note: out.categories[0].items[0].note },
    { name: 'CeraVe Foaming Cleanser', url: 'https://example.com/cerave', note: 'restock monthly' }
  );
  const raw = await readFile(path.join(vault, STASH_REL), 'utf8');
  assert.ok(raw.includes('- [CeraVe Foaming Cleanser](https://example.com/cerave) — restock monthly'));
});

test('second category appends; items land under THEIR section', async () => {
  await addStashItem(vault, { category: 'Reading', name: 'Protein timing paper', url: 'https://example.com/paper' });
  const out = await addStashItem(vault, { category: 'Skincare', name: 'La Roche-Posay SPF', url: 'https://example.com/spf' });
  const skincare = out.categories.find((c) => c.name === 'Skincare');
  const reading = out.categories.find((c) => c.name === 'Reading');
  assert.equal(skincare.items.length, 2, 'new skincare item joined its own section');
  assert.equal(reading.items.length, 1);
  assert.equal(skincare.items[1].name, 'La Roche-Posay SPF');
});

test('remove strips exactly one item by its raw line; missing line says so', async () => {
  const before = await loadStash(vault);
  const target = before.categories.find((c) => c.name === 'Skincare').items[0];
  const out = await removeStashItem(vault, target.raw);
  assert.equal(out.categories.find((c) => c.name === 'Skincare').items.length, 1);
  await assert.rejects(removeStashItem(vault, target.raw), /no longer there/);
});

test('rejects junk: no category, no name, non-http url', async () => {
  await assert.rejects(addStashItem(vault, { category: '', name: 'x', url: 'https://a.b' }), /category/);
  await assert.rejects(addStashItem(vault, { category: 'X', name: ' ', url: 'https://a.b' }), /name/);
  await assert.rejects(addStashItem(vault, { category: 'X', name: 'x', url: 'javascript:alert(1)' }), /url/);
});

test('parse tolerates hand-edited files — stray text, brackets in names', () => {
  const parsed = parseStash(`# Stash\nsome preamble\n\n## Gear\nnot an item line\n- [Backpack (v2)](https://example.com/bag) — big\n- malformed link line\n- [NoNote](https://example.com/x)\n`);
  assert.equal(parsed.categories[0].items.length, 2);
  assert.equal(parsed.categories[0].items[0].name, 'Backpack (v2)');
  assert.equal(parsed.categories[0].items[1].note, null);
});
