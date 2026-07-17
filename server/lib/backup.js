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
  const dest = path.join(dir, `${path.basename(fullPath)}.${stamp}.bak`);
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
