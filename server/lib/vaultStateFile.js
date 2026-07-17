import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { backupFile } from './backup.js';

// Shared cache for the single-file vault state modules (rotation, shopping
// list, workout routines, exercise library, exercise state).
//
// Why a cache at all: the vault lives on iCloud Drive, and re-reading a file
// from a long-running process shortly after writing it has been observed to
// intermittently return the stale pre-write version (an iCloud
// FileProvider/fs-caching quirk; a fresh process reads the same path fine).
// So the last state this process read or wrote stays authoritative.
//
// Why not forever (the old behavior): Obsidian edits these same files. With
// an eternal cache, a user edit made while the server is running gets
// silently clobbered by Nova's next write. So before trusting the cache we
// stat the file — an mtime this process didn't produce means an external
// edit, and the disk version wins. Two guards keep the original quirk fixed:
// the cache is trusted unconditionally for a short grace window after our own
// write (exactly the stale-read window), and a re-read that returns
// byte-identical content to our last write is recognized as that write
// surfacing late, not as an external edit.

// Env override exists for tests, which need the grace window out of the way
// to exercise external-edit detection without waiting.
const GRACE_MS = Number(process.env.NOVA_VAULT_GRACE_MS ?? 10_000);

export function createVaultStateFile({ relPath, parse, empty }) {
  let cached = null;
  let loaded = false;
  let knownMtimeMs = null; // mtime as of our last read/write (null = file absent)
  let lastWrittenRaw = null;
  let lastWriteAt = 0;

  async function mtimeOf(full) {
    try {
      return (await stat(full)).mtimeMs;
    } catch {
      return null;
    }
  }

  async function readDisk(full) {
    try {
      const raw = await readFile(full, 'utf8');
      return { raw, value: parse(raw) };
    } catch {
      return { raw: null, value: empty() };
    }
  }

  return {
    async load(vaultPath) {
      const full = path.join(vaultPath, relPath);
      if (!loaded) {
        knownMtimeMs = await mtimeOf(full);
        ({ value: cached } = await readDisk(full));
        loaded = true;
        return cached;
      }
      if (Date.now() - lastWriteAt < GRACE_MS) return cached;
      const mtime = await mtimeOf(full);
      if (mtime === knownMtimeMs) return cached;
      const { raw, value } = await readDisk(full);
      if (raw !== null && raw === lastWrittenRaw) {
        knownMtimeMs = mtime;
        return cached;
      }
      cached = value;
      knownMtimeMs = mtime;
      lastWrittenRaw = null;
      return cached;
    },

    async write(vaultPath, content, value) {
      const full = path.join(vaultPath, relPath);
      await mkdir(path.dirname(full), { recursive: true });
      await backupFile(full);
      await writeFile(full, content, 'utf8');
      cached = value;
      loaded = true;
      lastWrittenRaw = content;
      lastWriteAt = Date.now();
      knownMtimeMs = await mtimeOf(full);
    },

    // Test hook: reset module-level state between test cases.
    _reset() {
      cached = null;
      loaded = false;
      knownMtimeMs = null;
      lastWrittenRaw = null;
      lastWriteAt = 0;
    },
  };
}

// Serialize read-modify-write cycles on a shared file — concurrent updates
// would otherwise race and silently drop one of them.
export function createWriteLock() {
  let chain = Promise.resolve();
  return function withLock(fn) {
    const run = chain.catch(() => {}).then(fn);
    chain = run.catch(() => {});
    return run;
  };
}
