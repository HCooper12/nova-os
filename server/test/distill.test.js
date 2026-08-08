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
