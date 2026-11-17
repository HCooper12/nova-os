// K1 search that reads the note (mockup 117). Temp data dir AND temp vault
// BEFORE any server lib is imported: without NOVA_DATA_DIR these tests would
// read his live recall-vectors.json.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-recallnotes-vault-'));
const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-recallnotes-data-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import matter from 'gray-matter';

const { searchNotes, searchVault, _resetRecallCache } = await import('../lib/recall.js');

await mkdir(path.join(vault, 'Wiki/Concepts'), { recursive: true });
await mkdir(path.join(vault, 'Raw'), { recursive: true });
const page = (name, body, extra = {}, dir = 'Wiki/Concepts') => writeFile(
  path.join(vault, dir, `${name}.md`),
  matter.stringify(`# ${name}\n\n${body}\n`, { type: 'concept', created: '2026-10-12', updated: '2026-10-12', ...extra }), 'utf8');

// SAMPLE TEXT ONLY: the repo is public.
await page('Effort Debt', 'Skipped effort does not vanish.\n\nEvery hour you skip gets added to the bill, and the bill carries interest until it is paid.');
await page('Scattered', 'The bill came late in the month.\n\nNobody talks about what a loan carries as interest on a good day.');
await page('Long Line', `${'Preamble words go on and on for a while. '.repeat(8)}The bill carries interest, quietly, every week. ${'And then the sentence keeps going after it. '.repeat(8)}`, { updated: '2026-09-01' });
await page('Transcript Dump', 'the bill carries interest said the host.', { type: 'raw' }, 'Raw');

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
});

test('a row leads with the matching line and the phrase position points at the phrase', async () => {
  _resetRecallCache();
  const r = await searchNotes(vault, 'bill carries interest', { half: 'words' });
  const row = r.words.results.find((x) => x.title === 'Effort Debt');
  assert.ok(row, 'the note holding the phrase is an exact hit');
  assert.match(row.line, /bill carries interest/);
  assert.equal(row.marks.length, 1);
  const [a, b] = row.marks[0];
  assert.equal(row.line.slice(a, b).toLowerCase(), 'bill carries interest');
  assert.equal(row.literal, true);
  assert.equal(row.date, '2026-10-12');
  assert.equal(row.para, 1, 'which paragraph, so the note can open at the line');
});

test('a long line is windowed around the phrase and the marks still land on it', async () => {
  const r = await searchNotes(vault, 'bill carries interest', { half: 'words' });
  const row = r.words.results.find((x) => x.title === 'Long Line');
  assert.ok(row.line.length < 220);
  assert.ok(row.line.startsWith('…'));
  const [a, b] = row.marks[0];
  assert.equal(row.line.slice(a, b).toLowerCase(), 'bill carries interest');
});

test('words scattered across different lines are NOT an exact hit', async () => {
  const r = await searchNotes(vault, 'bill carries interest', { half: 'words' });
  assert.ok(!r.words.results.some((x) => x.title === 'Scattered'));
});

test('a phrase that is in no note returns no exact row, ever', async () => {
  const r = await searchNotes(vault, 'a lantern for the walk', { half: 'words' });
  assert.deepEqual(r.words.results, []);
  const stop = await searchNotes(vault, 'the of and', { half: 'both' });
  assert.deepEqual(stop.words.results, []);
});

test('a literal phrase outranks loose words, and a transcript does not lead', async () => {
  const r = await searchNotes(vault, 'bill carries interest', { half: 'words' });
  assert.equal(r.words.results.length, 3);
  assert.ok(r.words.results.every((x) => x.literal));
  assert.notEqual(r.words.results[0].type, 'raw');
});

test('meaning is down with no vectors: say so, return nothing, never invent', async () => {
  _resetRecallCache();
  const r = await searchNotes(vault, 'bill carries interest', { half: 'meaning' });
  assert.equal(r.meaning.state, 'no-index');
  assert.deepEqual(r.meaning.results, []);
  assert.equal(r.words, undefined, 'the meaning half does not carry the words rows');
});

test('both halves: words rows come ahead and carry their own timings and the total', async () => {
  const r = await searchNotes(vault, 'bill carries interest');
  assert.ok(r.words.results.length > 0);
  assert.equal(typeof r.words.ms, 'number');
  assert.equal(typeof r.meaning.ms, 'number');
  assert.equal(r.total, 4);
  assert.equal(r.meaning.state, 'no-index');
});

test('a meaning hit never repeats an exact row, and wears no marks', async () => {
  // a fake vector index for this vault: the sentence page is "close" to everything
  const { packVec } = await import('../lib/embeddings.js');
  const vec = packVec(Float32Array.from([1, 0, 0]));
  const pages = {};
  for (const id of ['Wiki/Concepts/Effort Debt', 'Wiki/Concepts/Scattered']) pages[id] = { hash: 'x', chunks: [vec] };
  const { INDEX_VERSION, EMBED_MODEL } = await import('../lib/embeddings.js');
  await writeFile(path.join(dataDir, 'recall-vectors.json'), JSON.stringify({ version: INDEX_VERSION, model: EMBED_MODEL, vault, pages }));
  _resetRecallCache();
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ embeddings: [[1, 0, 0]] }), text: async () => '' });
  try {
    const r = await searchNotes(vault, 'bill carries interest');
    assert.equal(r.meaning.state, 'ok');
    const ids = new Set(r.words.results.map((x) => x.id));
    assert.ok(r.meaning.results.every((x) => !ids.has(x.id)));
    const scattered = r.meaning.results.find((x) => x.title === 'Scattered');
    assert.ok(scattered, 'a page the words half did not file can join by meaning');
    assert.equal(scattered.marks, undefined);
    assert.equal(typeof scattered.similarity, 'number');
  } finally { globalThis.fetch = orig; }
});

test('an embedder that is not answering is reported as down, with the words intact', async () => {
  _resetRecallCache();
  const orig = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('connect ECONNREFUSED'); };
  try {
    const r = await searchNotes(vault, 'bill carries interest');
    assert.equal(r.meaning.state, 'embedder-down');
    assert.deepEqual(r.meaning.results, []);
    assert.ok(r.words.results.length > 0);
  } finally { globalThis.fetch = orig; }
});

test('searchVault still returns what every existing caller reads', async () => {
  _resetRecallCache();
  const hits = await searchVault(vault, 'bill carries interest', { limit: 6, semantic: false });
  assert.ok(Array.isArray(hits));
  for (const h of hits) {
    assert.deepEqual(Object.keys(h).filter((k) => !['similarity'].includes(k)).sort(), ['id', 'score', 'snippet', 'title', 'type']);
  }
  const withText = await searchVault(vault, 'bill', { semantic: false, withText: true });
  assert.ok(withText.every((h) => typeof h.text === 'string'));
  assert.deepEqual(await searchVault(vault, 'the of and'), []);
});

test('more notes than are returned say so (the sheet shows "40+", never a count it did not get)', async () => {
  const d = await mkdtemp(path.join(tmpdir(), 'nova-recallnotes-many-'));
  await mkdir(path.join(d, 'Wiki/Concepts'), { recursive: true });
  for (let i = 0; i < 6; i++) {
    await writeFile(path.join(d, 'Wiki/Concepts', `Many ${i}.md`), matter.stringify(`# Many ${i}\n\nThe lantern burns on for note ${i}.\n`, { type: 'concept', updated: `2026-10-0${i + 1}` }), 'utf8');
  }
  _resetRecallCache();
  const r = await searchNotes(d, 'lantern burns', { half: 'words', wordsLimit: 4 });
  assert.equal(r.words.results.length, 4);
  assert.equal(r.words.more, true);
  const all = await searchNotes(d, 'lantern burns', { half: 'words' });
  assert.equal(all.words.more, false);
  await rm(d, { recursive: true, force: true });
  _resetRecallCache();
});

test('words spread wider than a row: the window holds as many of them as fit, every mark lands on a word', async () => {
  const { exactLine } = await import('../lib/recall.js');
  const filler = 'word '.repeat(70);
  const p = { title: 'T', bullets: [], paragraphs: [`Alpha opens it. ${filler}then beta and gamma sit together at the end.`] };
  const hit = exactLine(p, ['alpha', 'beta', 'gamma'], 'alpha beta gamma');
  assert.ok(hit.line.length <= 140);
  const marked = hit.marks.map(([a, b]) => hit.line.slice(a, b).toLowerCase());
  assert.deepEqual(marked, ['beta', 'gamma']);
});
