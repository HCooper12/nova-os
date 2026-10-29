// LINKED PROJECTS (PROJECTS-PLAN §10.2, his condition 29 Oct: "only if it can
// not be damaged or interfered with"). Science Atlas, Wren and Nova's own repo
// appear on the Projects screen as projects Nova only READS about: their
// sessions, their git log, their cost. Each record carries `linked:{path}`, and
// the kernel's assertWritable refuses every writer for it.
//
// Read from the existing code workspaces (code-workspaces.json + the built-in
// `repo`), which this file never writes. The Code screen's own atlas/wren
// workspaces are unchanged by linking.

import { execFile } from 'node:child_process';
import { readWorkspaces } from './codeWorkspaces.js';
import { readSpendSync } from './modelSpend.js';

const LINKS = [
  { id: 'repo', key: 'repo', name: 'Nova', kind: 'build', parent: null },
  { id: 'atlas', key: 'atlas', name: 'Science Atlas', kind: 'build', parent: null },
  { id: 'wren', key: 'wren', name: 'Wren', kind: 'build', parent: 'atlas' },
];
export const LINKED_IDS = LINKS.map((l) => l.id);

function linkedRecord(l, dir) {
  return {
    id: l.id, slug: l.id, name: l.name, kind: l.kind, stage: 'active', status: 'live',
    parent: l.parent, linked: { path: dir }, folder: dir, workspace: l.key,
    allowances: null, limit: null, quiet: null, modelOverride: null, dryRun: false,
    reads: [], phases: [], createdAt: null, updatedAt: null,
  };
}

/** The linked three, those that exist on this Mac. Never throws. */
export async function linkedProjects({ repoRoot } = {}) {
  let ws = [];
  try { ws = await readWorkspaces(); } catch { ws = []; }
  const out = [];
  for (const l of LINKS) {
    const dir = l.key === 'repo' ? repoRoot : ws.find((w) => w.key === l.key)?.path;
    if (dir) out.push(linkedRecord(l, dir));
  }
  return out;
}

export async function linkedProject(id, opts) {
  return (await linkedProjects(opts)).find((p) => p.id === id) || null;
}

/** The last ten commits, read-only. A folder that is not a repo is an empty list. */
export function gitLog(dir, { n = 10, execFn = execFile } = {}) {
  return new Promise((resolve) => {
    execFn('git', ['log', `-${n}`, '--format=%h%x09%aI%x09%an%x09%s'], { cwd: dir, timeout: 8000 }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(String(stdout).split('\n').filter(Boolean).map((l) => {
        const [hash, at, author, ...s] = l.split('\t');
        return { hash, at, author, subject: s.join('\t') };
      }));
    });
  });
}

/** Sessions running in a folder (or under it), from a sessionsNow() picture. */
export function sessionsIn(picture, dir) {
  if (!dir || !picture?.groups) return [];
  const prefix = dir.endsWith('/') ? dir : `${dir}/`;
  return picture.groups.flatMap((g) => g.sessions || [])
    .filter((s) => s.cwd === dir || String(s.cwd || '').startsWith(prefix));
}

/** Cost from the ledger rows that carry this projectId. None do yet (phase 4). */
export function projectCost(id, { rows } = {}) {
  let list = rows;
  if (!list) {
    try { list = Object.values(readSpendSync()?.lanes || {}).flatMap((r) => (Array.isArray(r) ? r : [])); } catch { list = []; }
  }
  if (!Array.isArray(list)) list = [];
  const mine = list.filter((r) => r && r.projectId === id);
  const usd = mine.reduce((a, r) => a + (Number(r.usd) || 0), 0);
  return { usd: Math.round(usd * 100) / 100, runs: mine.length, known: mine.length > 0 };
}
