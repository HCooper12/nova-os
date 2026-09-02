// The distiller — candidate selection, prompt contract, and the apply/undo
// machinery with its drift refusal (the vault-writer rules' identity check).
// The model pass itself is not exercised; jobs are fabricated on disk.
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-distill-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-distill-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { findCandidates, buildDistillPrompt, applyDistillJob, undoDistillJob } = await import('../lib/distill.js');
const { fileDecision, undoFiling } = await import('../lib/inbox.js');

await mkdir(path.join(vault, 'Wiki/Inbox'), { recursive: true });
await mkdir(path.join(vault, 'Wiki/Studio/Ideas'), { recursive: true });

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('candidates: unlinked capture pages only — linked, tiny, and To-Do excluded', async () => {
  await writeFile(path.join(vault, 'Wiki/Inbox/Orphan Note.md'), '# Orphan Note\n\nA real thought about progressive overload and recovery windows.', 'utf8');
  await writeFile(path.join(vault, 'Wiki/Inbox/Linked Note.md'), '# Linked\n\nAlready cites [[Training Principles]].', 'utf8');
  await writeFile(path.join(vault, 'Wiki/Inbox/To-Do.md'), '- [ ] not a capture', 'utf8');
  await writeFile(path.join(vault, 'Wiki/Inbox/Tiny.md'), 'meh', 'utf8');
  await writeFile(path.join(vault, 'Wiki/Studio/Ideas/Video Idea.md'), '# Video Idea\n\nThe taste library concept as a short — hook, beats, close.', 'utf8');

  const c = await findCandidates(vault);
  const paths = c.map((x) => x.relPath).sort();
  assert.deepEqual(paths, ['Wiki/Inbox/Orphan Note.md', 'Wiki/Studio/Ideas/Video Idea.md']);
});

test('prompt: staged-copy framing, hard rules, leave-alone honesty', () => {
  const p = buildDistillPrompt([{ relPath: 'Wiki/Inbox/Orphan Note.md' }]);
  assert.match(p, /STAGED COPY/);
  assert.match(p, /never delete content/);
  assert.match(p, /pages that actually exist/);
  assert.match(p, /LEFT ALONE/);
  assert.match(p, /Wiki\/Inbox\/Orphan Note\.md/);
});

test('apply: writes changes with drift refusal; the rails route applies and undoes', async () => {
  // fabricate a ready job on disk, exactly as runDistillation persists it
  const orphanPath = path.join(vault, 'Wiki/Inbox/Orphan Note.md');
  const prior = await readFile(orphanPath, 'utf8');
  const job = {
    id: 'testjob1', at: new Date().toISOString(), status: 'ready', summary: 'linked one page',
    changes: [
      { path: 'Wiki/Inbox/Orphan Note.md', kind: 'updated', prior, content: prior + '\n\nRelated: [[Training Principles]]\n' },
      { path: 'Wiki/Training Principles.md', kind: 'new', prior: null, content: '# Training Principles\n\n- [[Orphan Note]]\n' },
    ],
  };
  await mkdir(path.join(dataDir, 'distill'), { recursive: true });
  await writeFile(path.join(dataDir, 'distill', 'testjob1.json'), JSON.stringify(job), 'utf8');

  // the rails route applies it
  const { destination, undo } = await fileDecision(vault, { route: 'distill-apply', confidence: 'high', title: 'x', reason: 'x', payload: { jobId: 'testjob1', paths: job.changes.map((c) => c.path) } });
  assert.match(destination, /2 files updated/);
  assert.match(await readFile(orphanPath, 'utf8'), /\[\[Training Principles\]\]/);
  assert.ok(existsSync(path.join(vault, 'Wiki/Training Principles.md')));

  // a second apply refuses (already applied)
  await assert.rejects(() => applyDistillJob(vault, 'testjob1'), /already applied/);

  // undo restores the prior text and removes the created file
  const note = await undoFiling(vault, undo);
  assert.match(note, /restored 2 files/);
  assert.equal(await readFile(orphanPath, 'utf8'), prior);
  assert.ok(!existsSync(path.join(vault, 'Wiki/Training Principles.md')));
});

test('drift refusal: a vault edit after the diff blocks the whole apply', async () => {
  const orphanPath = path.join(vault, 'Wiki/Inbox/Orphan Note.md');
  const prior = await readFile(orphanPath, 'utf8');
  const job = {
    id: 'testjob2', at: new Date().toISOString(), status: 'ready', summary: 'x',
    changes: [{ path: 'Wiki/Inbox/Orphan Note.md', kind: 'updated', prior, content: prior + '\nlink' }],
  };
  await writeFile(path.join(dataDir, 'distill', 'testjob2.json'), JSON.stringify(job), 'utf8');
  // he edits the page in Obsidian after the diff was computed
  await writeFile(orphanPath, prior + '\n\nHis own newer edit.', 'utf8');
  await assert.rejects(() => applyDistillJob(vault, 'testjob2'), /vault moved under this draft/);
  // and nothing was written
  assert.match(await readFile(orphanPath, 'utf8'), /His own newer edit/);
});

// ---- truth in copy: the comment said oldest-first; the code sorted by name --
test('candidates come oldest first by file time, so a late-alphabet capture cannot starve', async () => {
  const { utimes } = await import('node:fs/promises');
  const old = path.join(vault, 'Wiki/Inbox/Zebra Thought.md');
  const young = path.join(vault, 'Wiki/Inbox/Alpha Thought.md');
  await writeFile(old, '# Zebra\n\nAn old capture about cadence and recovery windows.', 'utf8');
  await writeFile(young, '# Alpha\n\nA brand-new capture about the taste library.', 'utf8');
  const monthAgo = new Date(Date.now() - 30 * 86400e3);
  await utimes(old, monthAgo, monthAgo);
  const picked = await findCandidates(vault, { cap: 1 });
  assert.equal(picked[0].relPath, 'Wiki/Inbox/Zebra Thought.md', 'the OLDEST orphan is woven first, not the first by name');
  await rm(old); await rm(young);
});

test('settled distillation jobs are pruned after 30 days on the next apply — the old message spoke of a pruner that did not exist', async () => {
  const old = new Date(Date.now() - 40 * 86400e3).toISOString();
  await writeFile(path.join(dataDir, 'distill', 'oldjob01.json'), JSON.stringify({ id: 'oldjob01', at: old, appliedAt: old, status: 'applied', summary: 'x', changes: [] }), 'utf8');
  await writeFile(path.join(dataDir, 'distill', 'oldjob02.json'), JSON.stringify({ id: 'oldjob02', at: old, undoneAt: old, status: 'undone', summary: 'x', changes: [] }), 'utf8');
  await writeFile(path.join(dataDir, 'distill', 'freshjob.json'), JSON.stringify({ id: 'freshjob', at: new Date().toISOString(), appliedAt: new Date().toISOString(), status: 'applied', summary: 'x', changes: [] }), 'utf8');
  // a ready job whose apply triggers the sweep
  const target = path.join(vault, 'Wiki/Inbox/Sweep Trigger.md');
  await writeFile(target, '# trigger\n', 'utf8');
  await writeFile(path.join(dataDir, 'distill', 'sweep001.json'), JSON.stringify({ id: 'sweep001', at: new Date().toISOString(), status: 'ready', summary: 'x', changes: [{ path: 'Wiki/Inbox/Sweep Trigger.md', kind: 'updated', prior: '# trigger\n', content: '# trigger\n\n[[Link]]\n' }] }), 'utf8');
  await applyDistillJob(vault, 'sweep001');
  assert.ok(!existsSync(path.join(dataDir, 'distill', 'oldjob01.json')), 'a 40-day-old applied job is pruned');
  assert.ok(!existsSync(path.join(dataDir, 'distill', 'oldjob02.json')), 'a 40-day-old undone job is pruned');
  assert.ok(existsSync(path.join(dataDir, 'distill', 'freshjob.json')), 'a fresh applied job is kept');
  await assert.rejects(() => undoDistillJob(vault, 'oldjob01'), /keeps its undo for 30 days/);
  await assert.rejects(() => applyDistillJob(vault, 'nope0000'), /file is gone — run distillation again/);
});

// ---- [26] plans 1 + 2: the leave-alone memory, and a cap that is said ----
test('leftAloneRecently: a recent job\'s candidate that was not changed is remembered; changed, old, or errored ones are not', async () => {
  const { leftAloneRecently, findCandidateSet, LEAVE_ALONE_WEEKS } = await import('../lib/distill.js');
  const now = new Date('2026-09-03T12:00:00');
  const jobs = [
    { id: 'j1', at: '2026-08-30T12:00:00', status: 'ready', candidates: ['Wiki/Inbox/A.md', 'Wiki/Inbox/B.md'], changes: [{ path: 'Wiki/Inbox/A.md' }, { path: 'Wiki/log.md' }] },
    { id: 'j2', at: '2026-07-01T12:00:00', status: 'applied', candidates: ['Wiki/Inbox/C.md'], changes: [] }, // too old
    { id: 'j3', at: '2026-09-01T12:00:00', status: 'error', candidates: ['Wiki/Inbox/D.md'], changes: [] }, // never ran
    { id: 'legacy', at: '2026-09-01T12:00:00', status: 'applied', changes: [{ path: 'Wiki/Inbox/E.md' }] }, // no candidate list on record
  ];
  assert.equal(LEAVE_ALONE_WEEKS, 4);
  assert.deepEqual([...leftAloneRecently(jobs, now)], ['Wiki/Inbox/B.md'], 'B was read and left alone last week');
  assert.deepEqual([...leftAloneRecently(jobs, new Date('2026-10-15T12:00:00'))], [], 'after the window it re-enters');
  // the set: skip is honoured and the true total survives the cap
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-distill-set-'));
  await mkdir(path.join(dir, 'Wiki/Inbox'), { recursive: true });
  for (const n of ['One', 'Two', 'Three']) await writeFile(path.join(dir, 'Wiki/Inbox', `${n}.md`), `# ${n}\n\nA capture with enough words to be worth weaving into the graph today.\n`, 'utf8');
  const set = await findCandidateSet(dir, { cap: 1, skip: new Set(['Wiki/Inbox/One.md']) });
  assert.equal(set.total, 2, 'three orphans, one left alone recently');
  assert.equal(set.skipped, 1);
  assert.equal(set.list.length, 1, 'the cap still bites…');
  assert.ok(set.list[0].relPath !== 'Wiki/Inbox/One.md', '…but never on the left-alone page');
  await rm(dir, { recursive: true, force: true });
});
