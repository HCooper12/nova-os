import { mkdir, copyFile, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

// How many snapshots to keep per file. Old backups accumulate forever
// otherwise — the rotation file alone gets several writes a day.
const KEEP_PER_FILE = 20;

// Vault files aren't under version control — snapshot before any write-back
// so a bad insert can be recovered by hand.
export async function backupFile(fullPath) {
  if (!existsSync(fullPath)) return null;
  const dir = path.join(path.dirname(fullPath), '.nova-backups');
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // Two snapshots of one file inside the same millisecond (a restore that
  // snapshots first, right after an explicit backup — the time-machine test
  // does exactly this) used to share a name, and the second silently
  // overwrote the first. The undo then put back the wrong version. A
  // suffix keeps every snapshot its own file; the sort order is unchanged.
  let dest = path.join(dir, `${path.basename(fullPath)}.${stamp}.bak`);
  for (let n = 1; existsSync(dest); n++) dest = path.join(dir, `${path.basename(fullPath)}.${stamp}-${n}.bak`);
  await copyFile(fullPath, dest);
  await pruneBackups(dir, path.basename(fullPath)).catch(() => {});
  return dest;
}

// Keep the newest KEEP_PER_FILE snapshots of one file; delete the rest. The
// ISO timestamp in the name sorts lexicographically, so no stat calls needed.
async function pruneBackups(dir, baseName) {
  const prefix = `${baseName}.`;
  const mine = (await readdir(dir))
    .filter((f) => f.startsWith(prefix) && f.endsWith('.bak'))
    .sort();
  const excess = mine.slice(0, Math.max(0, mine.length - KEEP_PER_FILE));
  for (const f of excess) await unlink(path.join(dir, f));
}
