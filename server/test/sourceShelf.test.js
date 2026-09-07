// HIS SHELF, AS CONTEXT.
//
// The audit of 7 Sep 2026 found eleven agents standing inside his vault with
// Read and Grep, and not one of them ever told that `Wiki/Sources/` exists —
// so a podcast he uploaded on purpose was invisible to the Coach who most
// needed it. These tests pin the two properties that make the fix worth
// having: the block names REAL paths (a title alone cannot be opened), and it
// carries the provenance warning, because a source page records what someone
// CLAIMED, not what is true.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { shelfContext, shelfTitles, verdictOf } from '../lib/sourceShelf.js';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-shelf-'));
await mkdir(path.join(vault, 'Wiki/Sources'), { recursive: true });
await mkdir(path.join(vault, 'Raw'), { recursive: true });

await writeFile(path.join(vault, 'Wiki/Sources/Protein Timing Deep Dive.md'), `---
type: source
raw: '[[Raw/Protein Timing Deep Dive (Transcript)]]'
url: 'https://youtu.be/abc'
tags: [video]
created: '2026-09-01'
---
# Protein Timing Deep Dive

**Source:** [Protein Timing — Some Podcast](https://youtu.be/abc)
**Verdict:** Useful on total daily protein, overstated on the anabolic window.

## What this is
A long argument about protein distribution across the day.
`);
await writeFile(path.join(vault, 'Raw/Protein Timing Deep Dive (Transcript).md'), 'verbatim words');
await writeFile(path.join(vault, 'Wiki/Sources/Leading Through Change.md'), `---
type: source
tags: [video]
created: '2026-08-20'
---
# Leading Through Change

**Source:** a talk about managing a team through reorganisation.
`);

test.after(() => rm(vault, { recursive: true, force: true }));

test('the shelf block names the real page AND its transcript — a title cannot be opened', async () => {
  const out = await shelfContext(vault, { topics: 'protein timing' });
  assert.match(out, /Wiki\/Sources\/Protein Timing Deep Dive\.md/);
  assert.match(out, /Raw\/Protein Timing Deep Dive \(Transcript\)\.md/);
  assert.match(out, /2 sources in Wiki\/Sources/);
});

test("Nova's earlier verdict is carried, because it is the most useful line in the file", async () => {
  const out = await shelfContext(vault, { topics: 'protein' });
  assert.match(out, /overstated on the anabolic window/);
  assert.equal(verdictOf('**Verdict:** x y z\nmore'), 'x y z');
  assert.equal(verdictOf('no verdict here'), null);
});

test('the block always carries the provenance rule — a claim is not a fact', async () => {
  const out = await shelfContext(vault, { topics: 'anything' });
  assert.match(out, /WHAT SOMEONE CLAIMED, not what is true/);
  assert.match(out, /attribute it/i);
  assert.match(out, /never invent a source/i);
});

test('relevance ranks the shelf — the matching source comes first', async () => {
  const out = await shelfContext(vault, { topics: 'protein timing anabolic', limit: 1 });
  assert.match(out, /Protein Timing Deep Dive/);
  assert.ok(!/Leading Through Change/.test(out), 'a one-item shelf shows the RELEVANT one, not the newest');
});

test('an empty or missing shelf says nothing rather than guessing', async () => {
  const empty = await mkdtemp(path.join(tmpdir(), 'nova-shelf-empty-'));
  assert.equal(await shelfContext(empty), null);
  assert.deepEqual(await shelfTitles(empty), []);
  await rm(empty, { recursive: true, force: true });
});

test('shelfTitles gives the shape of what he has been consuming', async () => {
  const titles = await shelfTitles(vault);
  assert.equal(titles.length, 2);
  assert.ok(titles.every((t) => t.title && t.id.startsWith('Wiki/Sources/')));
});
