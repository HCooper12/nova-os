// vault.js readPage — the `sources:` frontmatter line every concept/topic
// page carries (audit 27-daily-review.md: 280 of 281 pages name one). Read
// first, written by nothing here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import os from 'node:os';
import path from 'node:path';
import { Vault } from '../lib/vault.js';

async function tempVault() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nova-vault-'));
  await mkdir(path.join(dir, 'Wiki', 'Concepts'), { recursive: true });
  return dir;
}

async function writePage(vaultDir, relPath, body) {
  const full = path.join(vaultDir, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body, 'utf8');
}

test('readPage returns sources with a wikilink title and no time when none sits on the line', async () => {
  const dir = await tempVault();
  await writePage(dir, 'Wiki/Concepts/Effort Debt.md', `---
type: concept
sources:
  - "[[Huberman 42]]"
---
# Effort Debt

Some body text.
`);
  const vault = new Vault(dir);
  const page = await vault.readPage('Wiki/Concepts/Effort Debt.md');
  assert.deepEqual(page.sources, [{ title: 'Huberman 42', time: null }]);
});

test('readPage pulls the mm:ss when one sits beside the source link', async () => {
  const dir = await tempVault();
  await writePage(dir, 'Wiki/Concepts/Sunk Cost.md', `---
type: concept
sources:
  - "[[Huberman 42]] 12:34"
---
# Sunk Cost
`);
  const vault = new Vault(dir);
  const page = await vault.readPage('Wiki/Concepts/Sunk Cost.md');
  assert.deepEqual(page.sources, [{ title: 'Huberman 42', time: '12:34' }]);
});

test('readPage returns an empty list, honestly, when the page has no sources line', async () => {
  const dir = await tempVault();
  await writePage(dir, 'Wiki/Concepts/No Source.md', `---
type: concept
---
# No Source
`);
  const vault = new Vault(dir);
  const page = await vault.readPage('Wiki/Concepts/No Source.md');
  assert.deepEqual(page.sources, []);
});

test('an inline list form of sources: is read the same as a block list', async () => {
  const dir = await tempVault();
  await writePage(dir, 'Wiki/Concepts/Inline.md', `---
type: concept
sources: ["[[A]]", "[[B]] 1:02"]
---
# Inline
`);
  const vault = new Vault(dir);
  const page = await vault.readPage('Wiki/Concepts/Inline.md');
  assert.deepEqual(page.sources, [{ title: 'A', time: null }, { title: 'B', time: '1:02' }]);
});

test('a malformed sources entry is dropped, never fabricated into a fake source', async () => {
  const dir = await tempVault();
  await writePage(dir, 'Wiki/Concepts/Bad.md', `---
type: concept
sources:
  - "not a wikilink at all"
  - "[[Good One]]"
---
# Bad
`);
  const vault = new Vault(dir);
  const page = await vault.readPage('Wiki/Concepts/Bad.md');
  assert.deepEqual(page.sources, [{ title: 'Good One', time: null }]);
});
