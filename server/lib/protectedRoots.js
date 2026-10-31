// THE THREE FOLDERS NOVA NEVER WRITES TO (his standing rule, 1 Nov 2026):
// Science Atlas (the repo and its Mission Control, Atlas_Progress_Map) and
// Wren. Decided by FOLDER, not by workspace name, and checked at the lowest
// spawn sites, so no route, plan step, ship build or project job can reach
// them by another door. NOVA_PROTECTED_ROOTS (colon-separated) adds roots; a
// test uses it. Nothing here imports Nova: Wren's copy can be byte-identical.
import { realpathSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const protectedRoots = () => {
  const home = os.homedir();
  const defaults = [
    path.join(home, 'Projects', 'Atomic_Hub'),
    path.join(home, 'Projects', 'atlas-partner'),
    // where they lived before 21 Oct, in case a stale path comes back
    path.join(home, 'Desktop', 'Files', 'Claude Projects', 'Atomic_Hub'),
    path.join(home, 'Desktop', 'Files', 'Claude Projects', 'atlas-partner'),
  ];
  const extra = String(process.env.NOVA_PROTECTED_ROOTS || '').split(':').filter(Boolean);
  return [...defaults, ...extra].map((r) => path.resolve(r));
};

const real = (p) => { try { return realpathSync(p); } catch { return path.resolve(p); } };

/** True when `p` is, or is inside, a protected folder. Symlinks are resolved. */
export function isProtectedPath(p) {
  if (!p) return false;
  const target = real(String(p));
  const targetLexical = path.resolve(String(p));
  return protectedRoots().some((root) => {
    const r = real(root);
    return [target, targetLexical].some((t) => t === r || t.startsWith(r + path.sep) || t === root || t.startsWith(root + path.sep));
  });
}

export function assertNotProtected(p, what = 'write there') {
  if (isProtectedPath(p)) {
    const e = new Error(`Nova never writes to Science Atlas, its Mission Control or Wren, so it cannot ${what}.`);
    e.code = 'protected';
    throw e;
  }
}
