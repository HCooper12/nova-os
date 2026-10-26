// THE BUILDER'S OWN CHECKOUT (27 Oct 2026, his yes to "let Nova ship his own
// changes").
//
// His working tree carries other sessions' uncommitted work. A ship must hold
// ONLY the Builder's change, so a ship-mode Builder job never runs in his
// tree: it gets a fresh git worktree of origin/main under <repo>/.nova-ship/
// <id> on its own branch nova/ship-<id>, and that worktree is removed when
// the card is shipped, discarded, or 14 days old. Code only; no model.

import path from 'node:path';
import { existsSync, symlinkSync, readdirSync, statSync } from 'node:fs';
import { runCommand } from './builderGate.js';

export const SHIP_DIR = '.nova-ship';
export const SHIP_MAX_AGE_MS = 14 * 24 * 3600e3;
export const branchFor = (id) => `nova/ship-${id}`;
export const worktreeFor = (repoRoot, id) => path.join(repoRoot, SHIP_DIR, id);
const ID_RE = /^[a-z0-9-]{4,40}$/;

const git = (exec, cwd, args, timeoutMs = 120_000) => exec('git', args, { cwd, timeoutMs });

/**
 * Fetch, then `git worktree add <repo>/.nova-ship/<id> -b nova/ship-<id> origin/main`.
 * node_modules are linked from his checkout so the gates can run (they are
 * ignored by .gitignore, so they never reach a commit).
 */
export async function createShipWorktree(id, { repoRoot, exec = runCommand } = {}) {
  if (!ID_RE.test(String(id))) throw new Error('a ship worktree needs a plain id');
  const fetched = await git(exec, repoRoot, ['fetch', 'origin', 'main']);
  if (fetched.code !== 0) throw new Error(`could not fetch origin: ${String(fetched.out).trim().slice(-300)}`);
  const cwd = worktreeFor(repoRoot, id);
  const branch = branchFor(id);
  const add = await git(exec, repoRoot, ['worktree', 'add', cwd, '-b', branch, 'origin/main']);
  if (add.code !== 0) throw new Error(`could not make the Builder's worktree: ${String(add.out).trim().slice(-300)}`);
  const head = await git(exec, cwd, ['rev-parse', 'HEAD']);
  for (const nm of ['node_modules', path.join('server', 'node_modules')]) {
    const from = path.join(repoRoot, nm);
    const to = path.join(cwd, nm);
    if (existsSync(from) && existsSync(path.dirname(to)) && !existsSync(to)) {
      try { symlinkSync(from, to); } catch { /* the gates will say so */ }
    }
  }
  return { cwd, branch, baseSha: String(head.out).trim() };
}

/** Remove the worktree and its branch. Never touches his own tree. */
export async function removeShipWorktree(id, { repoRoot, exec = runCommand } = {}) {
  if (!ID_RE.test(String(id))) return { removed: false };
  const cwd = worktreeFor(repoRoot, id);
  const r = await git(exec, repoRoot, ['worktree', 'remove', '--force', cwd]);
  await git(exec, repoRoot, ['worktree', 'prune']);
  await git(exec, repoRoot, ['branch', '-D', branchFor(id)]);
  return { removed: r.code === 0 || !existsSync(cwd) };
}

/** Any ship worktree older than 14 days goes, whatever its card says. */
export async function sweepShipWorktrees({ repoRoot, exec = runCommand, now = Date.now() } = {}) {
  const dir = path.join(repoRoot, SHIP_DIR);
  if (!existsSync(dir)) return { swept: 0 };
  let swept = 0;
  for (const name of readdirSync(dir)) {
    let age = 0;
    try { age = now - statSync(path.join(dir, name)).mtimeMs; } catch { continue; }
    if (age > SHIP_MAX_AGE_MS) {
      const r = await removeShipWorktree(name, { repoRoot, exec });
      if (r.removed) swept += 1;
    }
  }
  return { swept };
}
