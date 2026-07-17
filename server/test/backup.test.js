import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { backupFile } from '../lib/backup.js';

test('backupFile snapshots the file and prunes old backups to 20', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-backup-'));
  try {
    const target = path.join(dir, 'Notes.md');
    await writeFile(target, 'current content', 'utf8');

    // Pre-seed 25 fake old backups (lexicographically older stamps), plus a
    // different file's backups that must not be touched by pruning.
    const backupsDir = path.join(dir, '.nova-backups');
    await mkdir(backupsDir, { recursive: true });
    for (let i = 0; i < 25; i++) {
      const stamp = `2020-01-${String(i + 1).padStart(2, '0')}T00-00-00-000Z`;
      await writeFile(path.join(backupsDir, `Notes.md.${stamp}.bak`), `old ${i}`, 'utf8');
    }
    await writeFile(path.join(backupsDir, 'Other.md.2020-01-01T00-00-00-000Z.bak'), 'other', 'utf8');

    const dest = await backupFile(target);
    assert.ok(dest.endsWith('.bak'));

    const remaining = (await readdir(backupsDir)).filter((f) => f.startsWith('Notes.md.'));
    assert.equal(remaining.length, 20);
    // The newest backup (the one just written) survived the prune
    assert.ok(remaining.includes(path.basename(dest)));
    // Other file's backups untouched
    const other = (await readdir(backupsDir)).filter((f) => f.startsWith('Other.md.'));
    assert.equal(other.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('backupFile returns null when the target does not exist yet', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-backup-'));
  try {
    assert.equal(await backupFile(path.join(dir, 'Missing.md')), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
