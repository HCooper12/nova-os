import { mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Vault files aren't under version control — snapshot before any write-back
// so a bad insert can be recovered by hand.
export async function backupFile(fullPath) {
  if (!existsSync(fullPath)) return null;
  const dir = path.join(path.dirname(fullPath), '.nova-backups');
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `${path.basename(fullPath)}.${stamp}.bak`);
  await copyFile(fullPath, dest);
  return dest;
}
