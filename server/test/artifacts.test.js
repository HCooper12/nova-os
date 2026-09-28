// THE DOCUMENTS, filed (28 Sep 2026). His ask: a chat answer he can open,
// keep and come back to, and "organised somewhere neatly ... such as the
// Obsidian vault." src/artifactBlocks.js is the shared format; this suite
// covers the store — server/lib/artifacts.js.
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// his live server/data and his real vault must never see these rows: set
// before any lib import
const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-artifacts-data-'));
const vaultDir = await mkdtemp(path.join(tmpdir(), 'nova-artifacts-vault-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';
import matter from 'gray-matter';
import {
  fileArtifacts, listArtifacts, getArtifact, setPinned, trashArtifact, restoreArtifact,
  recentArtifactsContext, ARTIFACT_CONTRACT,
} from '../lib/artifacts.js';
import { OPEN, CLOSE } from '../../src/artifactBlocks.js';

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vaultDir, { recursive: true, force: true });
});

const todayMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

test('filing a doc writes it under Outputs/Nova/<month>/ with correct frontmatter and untouched body', async () => {
  const reply = [
    'Here is your plan.',
    `${OPEN} {"title":"Four-day upper/lower plan","kind":"doc","summary":"Two upper, two lower, 50 min each"}`,
    '# Four-day plan',
    '| Day | Session |',
    '|---|---|',
    '| Mon | Upper A |',
    CLOSE,
    'Say the word if you want it adjusted.',
  ].join('\n');

  const { text, artifacts } = await fileArtifacts(vaultDir, reply, { agent: 'coach', question: 'give me a four-day plan' });
  assert.equal(artifacts.length, 1);
  const meta = artifacts[0];
  assert.match(meta.id, /^[0-9a-f]{8}$/);
  assert.equal(meta.kind, 'doc');
  assert.equal(meta.agent, 'coach');
  assert.equal(meta.title, 'Four-day upper/lower plan');
  assert.equal(meta.summary, 'Two upper, two lower, 50 min each');
  assert.equal(meta.pinned, false);
  assert.equal(meta.revises, null);
  assert.equal(meta.question, 'give me a four-day plan');
  assert.ok(meta.words > 0);
  // the slash in the title is stripped from the FILENAME, never from the frontmatter title
  assert.doesNotMatch(meta.path, /upper\/lower/);
  assert.match(meta.path, new RegExp(`^Outputs/Nova/${todayMonth()}/.*Four-day upper lower plan\\.md$`));
  assert.match(text, /\[\[artifact:[0-9a-f]{8}\]\]/);
  assert.doesNotMatch(text, /new-0/);
  assert.doesNotMatch(text, /\| Mon \| Upper A \|/, 'the table body never leaks into the chat text');

  const full = path.join(vaultDir, meta.path);
  const raw = await readFile(full, 'utf8');
  const parsed = matter(raw);
  assert.equal(parsed.data.type, 'nova-artifact');
  assert.equal(parsed.data.id, meta.id);
  assert.equal(parsed.data.kind, 'doc');
  assert.deepEqual(parsed.data.tags, []);
  assert.match(parsed.content, /^# Four-day plan/);
  assert.match(parsed.content, /\| Mon \| Upper A \|/);
});

test('filing an html document fences it on disk and getArtifact unwraps it', async () => {
  const page = '<!doctype html>\n<html><body>Tap to log a set</body></html>';
  const reply = `${OPEN} {"title":"Set Tracker","kind":"html","summary":"tap to log a set"}\n\`\`\`html\n${page}\n\`\`\`\n${CLOSE}`;
  const { artifacts } = await fileArtifacts(vaultDir, reply, { agent: 'nova' });
  assert.equal(artifacts.length, 1);
  const meta = artifacts[0];
  assert.equal(meta.kind, 'html');

  const full = path.join(vaultDir, meta.path);
  const raw = await readFile(full, 'utf8');
  assert.match(matter(raw).content, /^```html\n<!doctype html>/, 'fenced on disk, so Obsidian shows it as code');

  const got = await getArtifact(vaultDir, meta.id);
  assert.equal(got.body, page, 'unwrapped for a reader');
  assert.doesNotMatch(got.body, /```/);
});

test('an unknown [[artifact:id]] token is dropped, a known one is kept, and revises follows the same rule', async () => {
  const { artifacts: [known] } = await fileArtifacts(vaultDir, `${OPEN} {"title":"Base Doc"}\nbody\n${CLOSE}`, { agent: 'nova' });

  const reply = [
    'Before.',
    `[[artifact:${known.id}]]`,
    '[[artifact:deadbeef]]',
    'After.',
  ].join('\n');
  const { text, artifacts } = await fileArtifacts(vaultDir, reply, { agent: 'nova' });
  assert.match(text, new RegExp(`\\[\\[artifact:${known.id}\\]\\]`));
  assert.doesNotMatch(text, /deadbeef/);
  assert.match(text, /Before\./);
  assert.match(text, /After\./);
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].id, known.id);

  // revises: an existing id is kept in the frontmatter, an unknown one is dropped
  const revising = `${OPEN} {"title":"Revision","revises":"${known.id}"}\nnew body\n${CLOSE}`;
  const { artifacts: [revised] } = await fileArtifacts(vaultDir, revising, { agent: 'nova' });
  assert.equal(revised.revises, known.id);

  const badRevise = `${OPEN} {"title":"Orphan revision","revises":"nosuchid1"}\nbody\n${CLOSE}`;
  const { artifacts: [orphan] } = await fileArtifacts(vaultDir, badRevise, { agent: 'nova' });
  assert.equal(orphan.revises, null);
});

test('two documents filed the same day with the same title collide onto " (2)"', async () => {
  const reply = `${OPEN} {"title":"Weekly Debrief"}\nfirst\n${CLOSE}`;
  const { artifacts: [first] } = await fileArtifacts(vaultDir, reply, { agent: 'coach' });
  const { artifacts: [second] } = await fileArtifacts(vaultDir, reply, { agent: 'coach' });
  assert.notEqual(first.id, second.id);
  assert.doesNotMatch(first.path, /\(2\)/);
  assert.match(second.path, /\(2\)\.md$/);
});

test('a Coach-shaped reply proves the document is extracted before any PROPOSE parser runs', async () => {
  const reply = [
    "Here's the review.",
    `${OPEN} {"title":"Push Day Review","kind":"doc","summary":"one review"}`,
    '# Push Day Review',
    'PROPOSE {"action":"move","exercise":"Rope Overhead Tricep Extension","from":"Upper Body","to":"Push","reason":"frees your Upper day"}',
    CLOSE,
  ].join('\n');
  const { text, artifacts } = await fileArtifacts(vaultDir, reply, { agent: 'coach', question: 'review my push day' });
  assert.doesNotMatch(text, /PROPOSE/, 'a PROPOSE line inside a document body must never reach the chat text a card parser sees');
  const got = await getArtifact(vaultDir, artifacts[0].id);
  assert.match(got.body, /PROPOSE \{"action":"move"/, 'but it is preserved in the filed document itself');
});

test('list, search and filter', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-artifacts-list-'));
  try {
    await fileArtifacts(dir, `${OPEN} {"title":"Sleep Report","kind":"doc","summary":"how he slept","tags":["sleep","health"]}\nbody\n${CLOSE}`, { agent: 'nova' });
    await fileArtifacts(dir, `${OPEN} {"title":"Push Program","kind":"doc","summary":"training plan"}\nbody\n${CLOSE}`, { agent: 'coach' });
    await fileArtifacts(dir, `${OPEN} {"title":"Calculator","kind":"html","summary":"a tool"}\n\`\`\`html\n<p>x</p>\n\`\`\`\n${CLOSE}`, { agent: 'leader' });

    const all = await listArtifacts(dir);
    assert.equal(all.total, 3);
    assert.equal(all.items.length, 3);

    const byAgent = await listArtifacts(dir, { agent: 'coach' });
    assert.equal(byAgent.total, 1);
    assert.equal(byAgent.items[0].title, 'Push Program');

    const byKind = await listArtifacts(dir, { kind: 'html' });
    assert.equal(byKind.total, 1);
    assert.equal(byKind.items[0].title, 'Calculator');

    const byTag = await listArtifacts(dir, { q: 'sleep' });
    assert.equal(byTag.total, 1);
    assert.equal(byTag.items[0].title, 'Sleep Report');

    const bySummary = await listArtifacts(dir, { q: 'training plan' });
    assert.equal(bySummary.total, 1);

    const byTitleCaseInsensitive = await listArtifacts(dir, { q: 'CALCULATOR' });
    assert.equal(byTitleCaseInsensitive.total, 1);

    const none = await listArtifacts(dir, { q: 'nonexistent-xyz' });
    assert.equal(none.total, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('pin, then trash, then restore', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-artifacts-lifecycle-'));
  try {
    const { artifacts: [meta] } = await fileArtifacts(dir, `${OPEN} {"title":"A Report"}\nbody\n${CLOSE}`, { agent: 'nova' });

    const pinned = await setPinned(dir, meta.id, true);
    assert.equal(pinned.pinned, true);
    assert.equal((await listArtifacts(dir, { pinned: true })).total, 1);
    assert.equal((await listArtifacts(dir, { pinned: false })).total, 0);

    const unpinned = await setPinned(dir, meta.id, false);
    assert.equal(unpinned.pinned, false);

    const trashed = await trashArtifact(dir, meta.id);
    assert.ok(trashed);
    assert.equal(await getArtifact(dir, meta.id), null, 'a trashed document is gone from normal reads');
    assert.equal((await listArtifacts(dir)).total, 0);

    const restored = await restoreArtifact(dir, meta.id);
    assert.ok(restored);
    const back = await getArtifact(dir, meta.id);
    assert.ok(back);
    assert.equal(back.title, 'A Report');
    assert.equal((await listArtifacts(dir)).total, 1);

    // a trash/restore of an id that doesn't exist is an honest null, not a throw
    assert.equal(await trashArtifact(dir, 'nosuchid1'), null);
    assert.equal(await restoreArtifact(dir, 'nosuchid1'), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('recentArtifactsContext: empty vault says nothing, a filed one lines up as a readable ledger', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-artifacts-context-'));
  try {
    assert.equal(await recentArtifactsContext(dir), '');

    const { artifacts: [meta] } = await fileArtifacts(dir, `${OPEN} {"title":"Weekly Debrief","kind":"doc"}\nbody\n${CLOSE}`, { agent: 'coach' });
    const ctx = await recentArtifactsContext(dir);
    assert.match(ctx, /^DOCUMENTS ALREADY FILED/);
    assert.match(ctx, new RegExp(`\\[${meta.id}\\] Weekly Debrief \\(coach, \\d{4}-\\d{2}-\\d{2}\\) — Outputs/Nova/`));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('ARTIFACT_CONTRACT names the exact markers artifactBlocks.js parses, and its own section', () => {
  assert.ok(ARTIFACT_CONTRACT.includes(OPEN));
  assert.ok(ARTIFACT_CONTRACT.includes(CLOSE));
  assert.match(ARTIFACT_CONTRACT, /^THE DOCUMENTS/);
  assert.match(ARTIFACT_CONTRACT, /\[\[artifact:<id>\]\]/);
  assert.match(ARTIFACT_CONTRACT, /"revises":"<id>"/);
});

test('a filing failure keeps the rest of the reply and leaves an honest one-line note', async () => {
  // an html body so thin it collapses to nothing after the fence is stripped
  // is still a VALID document — so force a real failure another way: a
  // title so degenerate every character is stripped is still handled by the
  // safe-title fallback, so instead prove the contract with a directly
  // unwritable path: an id collision cannot happen (ids are random), so we
  // exercise the guarantee at the unit that owns it — writeArtifactFile
  // throwing is caught per block and swapped for a plain note, never a lost reply.
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-artifacts-fail-'));
  try {
    // Outputs/Nova itself replaced by a FILE (not a directory) forces every
    // mkdir/write under it to fail, so this exercises the real error path.
    const { writeFile: wf, mkdir: mk } = await import('node:fs/promises');
    await mk(dir, { recursive: true });
    await wf(path.join(dir, 'Outputs'), ''); // a plain file named Outputs blocks mkdir('Outputs/Nova/...')
    const reply = `Before.\n${OPEN} {"title":"Will Fail"}\nbody\n${CLOSE}\nAfter.`;
    const { text, artifacts } = await fileArtifacts(dir, reply, { agent: 'nova' });
    assert.equal(artifacts.length, 0);
    assert.match(text, /Before\./);
    assert.match(text, /After\./);
    assert.match(text, /a document could not be saved: Will Fail/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
