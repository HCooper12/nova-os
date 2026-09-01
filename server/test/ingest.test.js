// URL-only ingest: the transcript header handed to the vault pass is composed
// in code from the watch toolchain's own metadata — never model prose.
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Temp data dir BEFORE import — job persistence must never touch server/data.
const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-ingest-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { composeFetchedTranscript, videoIdOf, findExistingVideoPages, diffTrees, getJob, approveJob, discardJob } = await import('../lib/ingest.js');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

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

test('a ready job survives a restart: served from disk, approvable — and its receipt and undo ride the rails', async () => {
  // fabricate what persistJob writes — the process that computed it is gone
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-ingest-vault-'));
  try {
    await mkdir(path.join(dataDir, 'ingest'), { recursive: true });
    const job = {
      id: 'deadb33f', status: 'ready', summary: 'wove 2 pages', cost: 6.11, error: null,
      vaultPath: vault, workDir: path.join(dataDir, 'gone-workdir'), createdAt: new Date().toISOString(),
      changes: [
        { path: 'Wiki/Concepts/Restart Survivor.md', kind: 'new', content: '---\ntype: concept\n---\n\nsurvived\n' },
        { path: 'Wiki/index.md', kind: 'updated', content: '# Index\n- new link\n' },
      ],
    };
    await writeFile(path.join(dataDir, 'ingest', 'deadb33f.json'), JSON.stringify(job), 'utf8');
    await mkdir(path.join(vault, 'Wiki'), { recursive: true });
    await writeFile(path.join(vault, 'Wiki/index.md'), '# Index\n', 'utf8');

    const seen = await getJob('deadb33f');
    assert.equal(seen.status, 'ready', 'a restart does not lose a ready diff');
    assert.equal(seen.changes.length, 2);
    assert.equal(seen.cost, 6.11);

    // this job was staged by an older server — no priors — and must still land
    const result = await approveJob('deadb33f');
    assert.equal(result.applied, 2);
    assert.match(await readFile(path.join(vault, 'Wiki/Concepts/Restart Survivor.md'), 'utf8'), /survived/);
    assert.match(await readFile(path.join(vault, 'Wiki/index.md'), 'utf8'), /new link/);
    // the job file PERSISTS as the undo's memory; it reports applied, never a stale ready
    assert.ok(existsSync(path.join(dataDir, 'ingest', 'deadb33f.json')), 'applied job file kept for undo');
    assert.equal((await getJob('deadb33f')).status, 'applied');
    await assert.rejects(() => approveJob('deadb33f'), /already applied/);

    // the receipt: rule 2, no exceptions
    const { listRecords } = await import('../lib/inboxStore.js');
    const receipt = (await listRecords()).find((r) => r.kind === 'ingest' && r.decision?.payload?.jobId === 'deadb33f');
    assert.ok(receipt, 'a receipt rides the rails');
    assert.equal(receipt.status, 'filed');
    assert.equal(receipt.id, result.recordId);
    assert.deepEqual(receipt.undoData, { route: 'ingest-apply', jobId: 'deadb33f' });
    assert.match(receipt.destination, /2 files written/);

    // undo through the rails: the created page goes, the index gets its prior back verbatim
    const { undoFiling } = await import('../lib/inbox.js');
    const note = await undoFiling(vault, receipt.undoData);
    assert.match(note, /restored 2 files/);
    assert.ok(!existsSync(path.join(vault, 'Wiki/Concepts/Restart Survivor.md')), 'created page removed');
    assert.equal(await readFile(path.join(vault, 'Wiki/index.md'), 'utf8'), '# Index\n', 'prior back byte-exact');
    assert.equal((await getJob('deadb33f')).status, 'undone');
    await assert.rejects(() => undoFiling(vault, receipt.undoData), /only an applied weave/);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test('a weave refuses to land on a page edited since its diff — and writes nothing', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-ingest-vault-'));
  try {
    await mkdir(path.join(dataDir, 'ingest'), { recursive: true });
    await mkdir(path.join(vault, 'Wiki'), { recursive: true });
    await writeFile(path.join(vault, 'Wiki/index.md'), '# Index\n', 'utf8');
    const job = {
      id: 'd41f7001', status: 'ready', summary: 'x', cost: 1, error: null, vaultPath: vault, createdAt: new Date().toISOString(),
      changes: [
        { path: 'Wiki/Concepts/Never.md', kind: 'new', prior: null, content: 'never lands\n' },
        { path: 'Wiki/index.md', kind: 'updated', prior: '# Index\n', content: '# Index\n- woven\n' },
      ],
    };
    await writeFile(path.join(dataDir, 'ingest', 'd41f7001.json'), JSON.stringify(job), 'utf8');
    // he edits the index in Obsidian while the weave waits for review
    await writeFile(path.join(vault, 'Wiki/index.md'), '# Index\n- his own line\n', 'utf8');
    await assert.rejects(() => approveJob('d41f7001'), /vault moved under this weave \(Wiki\/index\.md changed since the diff\) — discard it and run the ingest again/);
    assert.ok(!existsSync(path.join(vault, 'Wiki/Concepts/Never.md')), 'the first file was not written either');
    assert.equal(await readFile(path.join(vault, 'Wiki/index.md'), 'utf8'), '# Index\n- his own line\n', 'his edit stands');
    assert.equal((await getJob('d41f7001')).status, 'ready', 'the job stays reviewable');
    await discardJob('d41f7001');
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test('settled job files are pruned after 30 days on the next approval, and never before', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-ingest-vault-'));
  try {
    await mkdir(path.join(dataDir, 'ingest'), { recursive: true });
    const old = new Date(Date.now() - 40 * 86400e3).toISOString();
    await writeFile(path.join(dataDir, 'ingest', 'o1d00001.json'), JSON.stringify({ id: 'o1d00001', status: 'applied', appliedAt: old, createdAt: old, changes: [], vaultPath: vault }), 'utf8');
    await writeFile(path.join(dataDir, 'ingest', 'o1d00002.json'), JSON.stringify({ id: 'o1d00002', status: 'undone', undoneAt: old, createdAt: old, changes: [], vaultPath: vault }), 'utf8');
    await writeFile(path.join(dataDir, 'ingest', 'f4e50001.json'), JSON.stringify({ id: 'f4e50001', status: 'applied', appliedAt: new Date().toISOString(), createdAt: new Date().toISOString(), changes: [], vaultPath: vault }), 'utf8');
    await writeFile(path.join(dataDir, 'ingest', 'a0000001.json'), JSON.stringify({
      id: 'a0000001', status: 'ready', summary: 'tiny', cost: 0.1, error: null, vaultPath: vault, createdAt: new Date().toISOString(),
      changes: [{ path: 'Wiki/Tiny.md', kind: 'new', prior: null, content: 'tiny\n' }],
    }), 'utf8');
    await approveJob('a0000001');
    assert.ok(!existsSync(path.join(dataDir, 'ingest', 'o1d00001.json')), 'a 40-day-old applied job is pruned');
    assert.ok(!existsSync(path.join(dataDir, 'ingest', 'o1d00002.json')), 'a 40-day-old undone job is pruned');
    assert.ok(existsSync(path.join(dataDir, 'ingest', 'f4e50001.json')), 'a fresh applied job is kept');
    assert.ok(existsSync(path.join(dataDir, 'ingest', 'a0000001.json')), 'the one just applied is kept');
    // and undoing a pruned weave says so, instead of pretending
    const { undoFiling } = await import('../lib/inbox.js');
    await assert.rejects(() => undoFiling(vault, { route: 'ingest-apply', jobId: 'o1d00001' }), /job file is gone .* 30 days/);
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test('a mid-flight job found only on disk reports the restart honestly, and discard cleans it up', async () => {
  await mkdir(path.join(dataDir, 'ingest'), { recursive: true });
  await writeFile(path.join(dataDir, 'ingest', 'cafe0001.json'),
    JSON.stringify({ id: 'cafe0001', status: 'running', summary: '', cost: 0, changes: [], error: null, vaultPath: '/nowhere', createdAt: new Date().toISOString() }), 'utf8');

  const seen = await getJob('cafe0001');
  assert.equal(seen.status, 'error', 'a dead mid-flight job must not spin forever');
  assert.match(seen.error, /server restarted mid-job/);

  await assert.rejects(() => approveJob('cafe0001'), /not ready/, 'a lost mid-flight job is never appliable');
  await discardJob('cafe0001');
  assert.ok(!existsSync(path.join(dataDir, 'ingest', 'cafe0001.json')));
  assert.equal(await getJob('cafe0001'), null);
});

test('getJob: unknown id is null; a path-shaped id never reaches the filesystem', async () => {
  assert.equal(await getJob('ffffffff'), null);
  assert.equal(await getJob('../../etc/passwd'), null, 'ids are uuid slices — traversal input is rejected before any read');
});

test('composeFetchedTranscript: a digest body is labeled as notes, never passed off as the transcript', () => {
  const text = composeFetchedTranscript({ transcript: 'full '.repeat(10), duration: '4:08:55' }, 'https://youtu.be/x', '## Part 1 of 4\nnotes');
  assert.match(text, /condensed timestamped notes/);
  assert.match(text, /verbatim transcript is stored separately/);
  assert.match(text, /## Part 1 of 4/);
  assert.doesNotMatch(text, /full full/, 'digest body replaces the raw transcript');
});
