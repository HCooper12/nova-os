// The visual Library's contract: a faithful, DERIVED view over the vault.
// It writes nothing, it invents nothing, and what it says a source is
// connected to must come from real wikilinks — the shelf can never disagree
// with the second brain it represents.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildLibrary, buildLibraryItem, classifyKind } from '../lib/library.js';
import { Vault } from '../lib/vault.js';

async function seedVault() {
  const dir = await mkdtemp(path.join(tmpdir(), 'library-'));
  const w = (rel, text) => writeFile(path.join(dir, rel), text, 'utf8');
  await mkdir(path.join(dir, 'Wiki', 'Sources'), { recursive: true });
  await mkdir(path.join(dir, 'Wiki', 'Concepts'), { recursive: true });
  await mkdir(path.join(dir, 'Raw'), { recursive: true });
  await w('Wiki/Sources/Atomic Habits.md', `---
title: "Atomic Habits"
author: James Clear
type: book
provenance: researched
tags: [habits]
created: 2026-08-20
updated: 2026-08-21
raw: "[[Original - abc123]]"
---

# Atomic Habits

Small habits compound. See [[Habit Formation]] and [[Identity-Based Habits]].
`);
  await w('Wiki/Sources/Huberman on Habits.md', `---
title: Huberman on Habits
uploader: Andrew Huberman
url: https://youtube.com/watch?v=abc
provenance: read
updated: 2026-08-22
---

# Huberman on Habits

Covers [[Habit Formation]] from the neuroscience side.
`);
  await w('Wiki/Sources/Some Article.md', `---
title: Some Article
---

Body with no links at all.

Second paragraph.
`);
  await w('Wiki/Concepts/Habit Formation.md', `---
title: Habit Formation
type: concept
---

Loops. Mentioned by [[Atomic Habits]].
`);
  await w('Wiki/Concepts/Identity-Based Habits.md', `---
title: Identity-Based Habits
type: concept
---

Identity first.
`);
  await w('Raw/Original - abc123.md', 'Research dossier…\n' + 'x'.repeat(500));
  return dir;
}

test('classifyKind: frontmatter wins, then URL shape, then honest article default', () => {
  assert.equal(classifyKind({ type: 'book' }), 'book');
  assert.equal(classifyKind({ url: 'https://youtube.com/watch?v=1' }), 'video');
  assert.equal(classifyKind({ url: 'https://open.spotify.com/episode/xyz' }), 'podcast');
  assert.equal(classifyKind({ url: 'https://example.com/essay' }), 'article');
  assert.equal(classifyKind({}), 'article');
});

test('the shelf: every Source appears, typed, with resolved concepts only', async () => {
  const dir = await seedVault();
  try {
    const items = await buildLibrary(dir, new Vault(dir));
    assert.equal(items.length, 3);
    const book = items.find((i) => i.title === 'Atomic Habits');
    assert.equal(book.kind, 'book');
    assert.equal(book.provenance, 'researched');
    assert.equal(book.author, 'James Clear');
    assert.equal(book.raw, 'Original - abc123');
    // both links resolve to real Concept pages
    assert.deepEqual([...book.concepts].sort(), ['Habit Formation', 'Identity-Based Habits']);
    const video = items.find((i) => i.title === 'Huberman on Habits');
    assert.equal(video.kind, 'video');
    assert.equal(video.author, 'Andrew Huberman');
    // newest first — the video (22nd) shelves before the book (21st)
    assert.ok(items.indexOf(video) < items.indexOf(book));
    // a plain article with no links still shows, honestly bare
    const article = items.find((i) => i.title === 'Some Article');
    assert.equal(article.kind, 'article');
    assert.deepEqual(article.concepts, []);
    assert.match(article.excerpt, /Body with no links/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the detail: linked pages grouped by type, related sources share real concepts', async () => {
  const dir = await seedVault();
  try {
    const d = await buildLibraryItem(dir, new Vault(dir), 'Wiki/Sources/Atomic Habits');
    assert.equal(d.item.title, 'Atomic Habits');
    assert.deepEqual(d.linked.concept.map((c) => c.title).sort(), ['Habit Formation', 'Identity-Based Habits']);
    // the video shares Habit Formation — that IS the "connected" row
    assert.equal(d.related.length, 1);
    assert.equal(d.related[0].title, 'Huberman on Habits');
    assert.deepEqual(d.related[0].shared, ['Habit Formation']);
    // the concept page links back — an echo
    assert.ok(d.backlinkPages.some((p) => p.title === 'Habit Formation'));
    // the raw original is measured, never inlined whole
    assert.equal(d.raw.id, 'Raw/Original - abc123');
    assert.ok(d.raw.chars > 400);
    assert.ok(d.raw.excerpt.length <= 400);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the detail refuses ids outside Wiki/Sources — no path escapes', async () => {
  const dir = await seedVault();
  try {
    const vault = new Vault(dir);
    await assert.rejects(() => buildLibraryItem(dir, vault, '../server/.env'));
    await assert.rejects(() => buildLibraryItem(dir, vault, 'Wiki/Sources/../../Raw/Original - abc123'));
    await assert.rejects(() => buildLibraryItem(dir, vault, 'Raw/Original - abc123'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('an empty or missing Sources dir is an empty shelf, not an error', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'library-empty-'));
  try {
    await mkdir(path.join(dir, 'Wiki'), { recursive: true });
    assert.deepEqual(await buildLibrary(dir, new Vault(dir)), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the weave rules carry the right provenance for each path', async () => {
  const { bookWeaveRules } = await import('../lib/librarian.js');
  const researched = bookWeaveRules({ title: 'X', author: 'Y' }, false);
  const read = bookWeaveRules({ title: 'X', author: 'Y' }, true);
  assert.match(researched, /provenance: researched/);
  assert.match(researched, /has NOT read this book/);
  assert.match(read, /provenance: read/);
  assert.match(read, /no concept is lost/);
  // a researched weave must never claim read, and vice versa
  assert.ok(!researched.includes('provenance: read'));
  assert.ok(!read.includes('provenance: researched'));
});
