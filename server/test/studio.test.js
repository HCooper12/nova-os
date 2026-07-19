// Studio pipeline — temp dirs BEFORE imports (ESM hoisting).
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-studio-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-studio-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';
delete process.env.TODOIST_TOKEN;

import test from 'node:test';
import assert from 'node:assert/strict';
import matter from 'gray-matter';

const { normalizeDecision, fileDecision, undoFiling } = await import('../lib/inbox.js');
const { setIdeaStatus, IDEA_STATUSES } = await import('../lib/studio.js');
const { runCompost } = await import('../lib/compost.js');

await mkdir(path.join(vault, 'Wiki'), { recursive: true });

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('idea route: normalize, file as a seed page, undo deletes it', async () => {
  const decision = normalizeDecision({
    route: 'idea', confidence: 'high', title: 'Second Brain Video', reason: 'content idea',
    payload: { title: 'The Second Brain OS', hook: 'Your notes app should work while you sleep', format: 'long' },
  });
  assert.equal(decision.payload.format, 'long');

  const { destination, undo } = await fileDecision(vault, decision);
  assert.match(destination, /Studio — The Second Brain OS \(seed, long\)/);
  const full = path.join(vault, 'Wiki/Studio/Ideas/The Second Brain OS.md');
  assert.ok(existsSync(full));
  const { data } = matter(await readFile(full, 'utf8'));
  assert.equal(data.type, 'idea');
  assert.equal(data.status, 'seed');

  // unknown format falls back; missing hook is refused
  assert.equal(normalizeDecision({ route: 'idea', payload: { title: 'X', hook: 'h', format: 'weird' } }).payload.format, 'short');
  assert.throws(() => normalizeDecision({ route: 'idea', payload: { title: 'X' } }), /incomplete idea/);

  const undoSummary = await undoFiling(vault, undo);
  assert.match(undoSummary, /deleted/);
  assert.ok(!existsSync(full));
});

test('status pipeline: one-tap frontmatter moves; outline appends and unappends', async () => {
  const decision = normalizeDecision({
    route: 'idea', payload: { title: 'Morning Systems', hook: 'A morning that runs itself', format: 'short' },
  });
  await fileDecision(vault, decision);
  const relPath = 'Wiki/Studio/Ideas/Morning Systems.md';
  const id = relPath.replace(/\.md$/, '');

  assert.deepEqual(IDEA_STATUSES, ['seed', 'outlining', 'scripting', 'shipped']);
  const moved = await setIdeaStatus(vault, id, 'outlining');
  assert.equal(moved.status, 'outlining');
  assert.equal(matter(await readFile(path.join(vault, relPath), 'utf8')).data.status, 'outlining');
  await assert.rejects(() => setIdeaStatus(vault, id, 'nonsense'), /status must be one of/);

  // outline approval appends a dated section; undo strips exactly it
  const { destination, undo } = await fileDecision(vault, {
    route: 'idea-outline', confidence: 'high', title: 'Outline — Morning Systems', reason: 'draft',
    payload: { relPath, text: '- Hook: wake up to a plan\n- Beat 1: the capture\n\nDrawn from: nothing related in the vault yet' },
  });
  assert.match(destination, /Outline appended/);
  let raw = await readFile(path.join(vault, relPath), 'utf8');
  assert.match(raw, /## Outline \(drafted \d{4}-\d{2}-\d{2}\)/);
  assert.match(raw, /Beat 1: the capture/);

  const undoSummary = await undoFiling(vault, undo);
  assert.match(undoSummary, /removed the appended outline/);
  raw = await readFile(path.join(vault, relPath), 'utf8');
  assert.doesNotMatch(raw, /## Outline/);
  assert.equal(matter(raw).data.status, 'outlining', 'status untouched by outline undo');
});

test('compost: month-old seeds get an archive proposal; fresh ones and non-seeds do not', async () => {
  const dir = path.join(vault, 'Wiki/Studio/Ideas');
  await writeFile(path.join(dir, 'Dusty Seed.md'),
    matter.stringify('# Dusty Seed\n\n**Hook:** old\n', { type: 'idea', status: 'seed', format: 'short', created: '2026-05-01', updated: '2026-05-01' }), 'utf8');
  await writeFile(path.join(dir, 'Shipped One.md'),
    matter.stringify('# Shipped One\n\n**Hook:** done\n', { type: 'idea', status: 'shipped', format: 'short', created: '2026-05-01', updated: '2026-05-01' }), 'utf8');

  const { proposals } = await runCompost(vault);
  const seeds = proposals.filter((p) => p.type === 'stale-seed');
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].title, 'Dusty Seed');
  // ideas are never "orphans" — they have their own lifecycle
  assert.ok(!proposals.some((p) => p.type === 'orphan' && /Seed|Morning Systems|Shipped/.test(p.title)));

  const { acceptProposal } = await import('../lib/compost.js');
  const { record } = await acceptProposal(vault, seeds[0].id);
  assert.ok(existsSync(path.join(vault, 'Wiki/Studio/Ideas/Archive/Dusty Seed.md')));
  const undoSummary = await undoFiling(vault, record.undoData);
  assert.match(undoSummary, /moved/);
  assert.ok(existsSync(path.join(dir, 'Dusty Seed.md')));
});
