// URL-only ingest: the transcript header handed to the vault pass is composed
// in code from the watch toolchain's own metadata — never model prose.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const { composeFetchedTranscript, videoIdOf, findExistingVideoPages, diffTrees } = await import('../lib/ingest.js');

test('composeFetchedTranscript: full metadata header, source line, timestamped body', () => {
  const text = composeFetchedTranscript({
    title: 'Deep Work Podcast #12', uploader: 'Cal Channel', duration: '1:02:11',
    transcriptSource: 'captions', transcript: '[00:01] welcome back',
  }, 'https://youtu.be/x');
  assert.match(text, /^Deep Work Podcast #12 — Cal Channel \(1:02:11\)\n/);
  assert.match(text, /Source: https:\/\/youtu\.be\/x/);
  assert.match(text, /via captions/);
  assert.match(text, /\[00:01\] welcome back$/);
});

test('composeFetchedTranscript: missing metadata degrades to the URL, never to blanks', () => {
  const text = composeFetchedTranscript({ transcript: 'body' }, 'https://youtu.be/x');
  assert.match(text, /^https:\/\/youtu\.be\/x\n/, 'title falls back to the URL');
  assert.doesNotMatch(text, /undefined|null/);
  assert.match(text, /via captions/, 'unknown transcript source falls back honestly');
});

test('videoIdOf: the same video in every URL shape resolves to one id', () => {
  const id = '-AdkwqkE20M';
  assert.equal(videoIdOf(`https://youtu.be/${id}?si=6XfTCDjvzLnSBDkI`), id, 'share link with tracking tail');
  assert.equal(videoIdOf(`https://www.youtube.com/watch?v=${id}`), id);
  assert.equal(videoIdOf(`https://www.youtube.com/watch?t=90&v=${id}`), id, 'v= not first');
  assert.equal(videoIdOf(`https://www.youtube.com/embed/${id}`), id);
  assert.equal(videoIdOf('https://example.com/article'), null, 'non-video URL has no id');
});

test('findExistingVideoPages: finds the prior Source page and Raw transcript by id, not URL string', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-ingest-vault-'));
  try {
    await mkdir(path.join(vault, 'Wiki/Sources'), { recursive: true });
    await mkdir(path.join(vault, 'Raw'), { recursive: true });
    await writeFile(path.join(vault, 'Wiki/Sources/33 Brutal Truths.md'), "---\ntype: source\nurl: 'https://youtu.be/-AdkwqkE20M'\n---\n\nnotes\n");
    await writeFile(path.join(vault, 'Raw/33 Brutal Truths (Transcript).md'), 'Source URL: https://youtu.be/-AdkwqkE20M\n\n[00:01] hi\n');
    await writeFile(path.join(vault, 'Wiki/Sources/Unrelated.md'), '---\ntype: source\n---\n\nother\n');

    // he re-submits with the ?si= tail — a raw string compare would miss it
    const hit = await findExistingVideoPages(vault, 'https://youtu.be/-AdkwqkE20M?si=xyz');
    assert.deepEqual(hit.pages, ['Wiki/Sources/33 Brutal Truths.md']);
    assert.equal(hit.transcriptRel, 'Raw/33 Brutal Truths (Transcript).md');

    const miss = await findExistingVideoPages(vault, 'https://youtu.be/neverSeenId');
    assert.deepEqual(miss.pages, []);
    assert.equal(miss.transcriptRel, null);
    assert.deepEqual((await findExistingVideoPages(vault, 'not a url')).pages, [], 'no id, no guess');
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test('diffTrees: an existing Raw file reads as updated, and an identical rewrite is no change at all', async () => {
  const original = await mkdtemp(path.join(tmpdir(), 'nova-diff-orig-'));
  const staging = await mkdtemp(path.join(tmpdir(), 'nova-diff-stage-'));
  try {
    for (const root of [original, staging]) {
      await mkdir(path.join(root, 'Wiki'), { recursive: true });
      await mkdir(path.join(root, 'Raw'), { recursive: true });
    }
    await writeFile(path.join(original, 'Raw/Transcript.md'), 'verbatim\n');
    await writeFile(path.join(staging, 'Raw/Transcript.md'), 'verbatim\n');
    assert.deepEqual(diffTrees(original, staging), [], 'an untouched existing transcript is not a change');

    await writeFile(path.join(staging, 'Raw/Transcript.md'), 'verbatim + more\n');
    const [change] = diffTrees(original, staging);
    assert.equal(change.kind, 'updated', 'an existing Raw file must never be labeled new');
    assert.equal(change.path, 'Raw/Transcript.md');

    await writeFile(path.join(staging, 'Raw/Brand New.md'), 'fresh\n');
    assert.ok(diffTrees(original, staging).some((c) => c.path === 'Raw/Brand New.md' && c.kind === 'new'));
  } finally {
    await rm(original, { recursive: true, force: true });
    await rm(staging, { recursive: true, force: true });
  }
});

test('composeFetchedTranscript: a digest body is labeled as notes, never passed off as the transcript', () => {
  const text = composeFetchedTranscript({ transcript: 'full '.repeat(10), duration: '4:08:55' }, 'https://youtu.be/x', '## Part 1 of 4\nnotes');
  assert.match(text, /condensed timestamped notes/);
  assert.match(text, /verbatim transcript is stored separately/);
  assert.match(text, /## Part 1 of 4/);
  assert.doesNotMatch(text, /full full/, 'digest body replaces the raw transcript');
});
