// C2 — what a Claude Code session actually DID, and his call on keeping it.
//
// The Code tab could already talk to Claude and let it edit files. What was
// missing is the half that makes a terminal unnecessary: seeing the diff and
// deciding. Without it he has to open a terminal to run `git diff` — the
// exact escape hatch he asked to close.
//
// Doctrine: everything writeable is undoable. Discarding a session's work
// therefore STASHES it (recoverable with `git stash pop`, and listed back to
// him), never `checkout --` — a hard discard would be the one destructive
// button in Nova with no way back, and this session already learned what
// that costs.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAX_DIFF_CHARS = 120_000; // a wall of diff helps nobody — truncate honestly

function git(args, cwd = REPO_ROOT) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve(stdout);
    });
  });
}

// Workspace → cwd. 'repo' is Nova itself; the vault is a real git repo too
// in his setup, but it is NOT ours to commit, so it stays read-only here.
function cwdFor(workspace, vaultPath) {
  return workspace === 'vault' && vaultPath ? vaultPath : REPO_ROOT;
}

export async function changeSummary(workspace, vaultPath) {
  const cwd = cwdFor(workspace, vaultPath);
  const readOnly = cwd !== REPO_ROOT;
  const porcelain = await git(['status', '--porcelain'], cwd);
  const files = porcelain.split('\n').filter(Boolean).map((l) => ({
    status: l.slice(0, 2).trim(),
    path: l.slice(3).trim(),
  }));
  if (!files.length) return { clean: true, files: [], stat: '', diff: '', readOnly, branch: (await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)).trim() };

  const stat = await git(['diff', '--stat', 'HEAD'], cwd).catch(() => '');
  let diff = await git(['diff', 'HEAD'], cwd).catch(() => '');
  let truncated = false;
  if (diff.length > MAX_DIFF_CHARS) { diff = diff.slice(0, MAX_DIFF_CHARS); truncated = true; }
  return {
    clean: false, files, stat: stat.trim(), diff, truncated, readOnly,
    branch: (await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)).trim(),
  };
}

export async function commitChanges(workspace, vaultPath, message) {
  const cwd = cwdFor(workspace, vaultPath);
  if (cwd !== REPO_ROOT) throw new Error('the vault is read-only from here — Nova never commits your notes for you');
  const msg = String(message || '').trim();
  if (msg.length < 8) throw new Error('a commit needs a real message (8+ chars) — future-you reads these');
  const before = (await git(['status', '--porcelain'], cwd)).trim();
  if (!before) throw new Error('nothing to commit');
  await git(['add', '-A'], cwd);
  await git(['commit', '-m', msg], cwd);
  const sha = (await git(['rev-parse', '--short', 'HEAD'], cwd)).trim();
  return { sha, message: msg, files: before.split('\n').length };
}

// Undoable discard: stash (including untracked) so it is always recoverable.
export async function shelveChanges(workspace, vaultPath) {
  const cwd = cwdFor(workspace, vaultPath);
  if (cwd !== REPO_ROOT) throw new Error('the vault is read-only from here');
  const before = (await git(['status', '--porcelain'], cwd)).trim();
  if (!before) throw new Error('nothing to shelve');
  const label = `nova-shelf ${new Date().toISOString()}`;
  await git(['stash', 'push', '-u', '-m', label], cwd);
  const list = (await git(['stash', 'list'], cwd)).split('\n').filter(Boolean);
  return {
    shelved: true, label, entry: list[0] || null,
    recover: 'git stash pop — or restore it from the Code screen',
    files: before.split('\n').length,
  };
}

export async function unshelveLatest(workspace, vaultPath) {
  const cwd = cwdFor(workspace, vaultPath);
  if (cwd !== REPO_ROOT) throw new Error('the vault is read-only from here');
  const list = (await git(['stash', 'list'], cwd)).split('\n').filter(Boolean);
  const top = list[0] || '';
  if (!top.includes('nova-shelf')) throw new Error('the most recent stash was not shelved by Nova — recover it yourself so nothing of yours is clobbered');
  await git(['stash', 'pop'], cwd);
  return { restored: true, entry: top };
}
