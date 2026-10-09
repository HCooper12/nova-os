// WHERE THE CODE SCREEN WORKS (10 Oct 2026, his call: "Connect Science Atlas
// and Wren for commits"). Nova OS and the Vault are built in: Nova OS is this
// repository, and the Vault is read-only from here, always. Every other place
// the Builder works and Nova commits is named in ONE file under server data,
// `code-workspaces.json`, so a folder is never hard-coded in five places and
// moving one is an edit he can make himself:
//
//   { "workspaces": [
//       { "key": "atlas", "title": "Science Atlas", "path": "/…/Atlas_Progress_Map" },
//       { "key": "wren", "title": "Wren", "path": "/…/atlas-partner", "parent": "atlas" } ] }
//
// `parent` is how the screen nests Wren under Science Atlas: Wren is the
// Atlas's assistant (his words, 9 Oct), a related project, not a duplicate.
//
// Reading never writes. The file is seeded once, at the server's boot, with
// the two folders he named; a test points its own temporary data folder at
// temporary repositories and never sees his real ones.
//
// Wren's own rule ("never writes the repo") binds Wren the PROGRAM at its
// runtime. Committing HIS ticked changes in that folder from this screen is
// his act, through the same guards as Nova OS.

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
export const WORKSPACES_FILE = () => path.join(dataRoot(), 'code-workspaces.json');

// the two keys the server owns itself; a config entry can never take them
export const BUILT_IN = ['repo', 'vault'];
const KEY_RE = /^[a-z][a-z0-9-]{0,31}$/;

const PROJECTS_DIR = () => path.join(os.homedir(), 'Desktop', 'Files', 'Claude Projects');
export const DEFAULT_WORKSPACES = () => [
  { key: 'atlas', title: 'Science Atlas', path: path.join(PROJECTS_DIR(), 'Atomic_Hub', 'P3_Draft3', 'Atlas_Progress_Map') },
  { key: 'wren', title: 'Wren', path: path.join(PROJECTS_DIR(), 'atlas-partner'), parent: 'atlas' },
];

function refuse(message, code = 'workspace') {
  const e = new Error(message);
  e.code = code;
  return e;
}

/**
 * The entries that are usable, in order: a short lowercase key that is not
 * built in, a title, an absolute folder. A bad entry is dropped, never
 * guessed at; a parent that names no entry is dropped with it.
 */
export function cleanWorkspaces(list) {
  const out = [];
  const seen = new Set(BUILT_IN);
  for (const w of Array.isArray(list) ? list : []) {
    if (!w || typeof w !== 'object') continue;
    const key = typeof w.key === 'string' ? w.key.trim() : '';
    const dir = typeof w.path === 'string' ? w.path.trim() : '';
    if (!KEY_RE.test(key) || seen.has(key)) continue;
    if (!dir || !path.isAbsolute(dir) || dir.includes('\0')) continue;
    seen.add(key);
    out.push({
      key,
      title: typeof w.title === 'string' && w.title.trim() ? w.title.trim().slice(0, 60) : key,
      path: path.resolve(dir),
      parent: typeof w.parent === 'string' && w.parent.trim() ? w.parent.trim() : null,
    });
  }
  const keys = new Set(out.map((w) => w.key));
  return out.map((w) => (w.parent && !keys.has(w.parent) ? { ...w, parent: null } : w));
}

/** The configured workspaces. No file is an honest empty list: only Nova OS and the Vault. */
export async function readWorkspaces() {
  let raw;
  try { raw = await readFile(WORKSPACES_FILE(), 'utf8'); } catch { return []; }
  try {
    const j = JSON.parse(raw);
    return cleanWorkspaces(Array.isArray(j) ? j : j?.workspaces);
  } catch { return []; }
}

/** Boot only: write the file with his two folders when there is none. Never overwrites. */
export async function seedWorkspaces(defaults = DEFAULT_WORKSPACES()) {
  try { await readFile(WORKSPACES_FILE()); return { seeded: false }; } catch { /* none yet */ }
  await mkdir(dataRoot(), { recursive: true });
  const tmp = WORKSPACES_FILE() + '.tmp';
  await writeFile(tmp, JSON.stringify({ workspaces: defaults }, null, 2) + '\n');
  await rename(tmp, WORKSPACES_FILE());
  return { seeded: true };
}

/**
 * A workspace key to the folder git and the Builder run in. `repo` is Nova
 * OS (the caller's repoRoot, so a test can point it at a temporary repo),
 * `vault` is read-only, and anything else must be named in the file.
 */
export async function resolveWorkspace(key, { repoRoot, vaultPath } = {}) {
  if (key === 'repo' || key === undefined || key === null || key === '') {
    return { key: 'repo', cwd: repoRoot, readOnly: false, title: 'Nova OS', parent: null };
  }
  if (key === 'vault') {
    if (!vaultPath) throw refuse('the vault folder is not configured on this Mac');
    return { key: 'vault', cwd: vaultPath, readOnly: true, title: 'Vault', parent: null };
  }
  if (typeof key !== 'string' || !KEY_RE.test(key)) throw refuse('that is not a workspace Nova knows');
  const w = (await readWorkspaces()).find((x) => x.key === key);
  if (!w) throw refuse(`${key} is not connected on this Mac; it is named in server/data/code-workspaces.json`);
  return { key: w.key, cwd: w.path, readOnly: false, title: w.title, parent: w.parent };
}

/** Every place the screen can read, for the client: built-ins first, then the file's. */
export async function listWorkspaces({ vaultPath } = {}) {
  const extra = await readWorkspaces();
  return [
    { key: 'repo', title: 'Nova OS', parent: null, readOnly: false },
    ...(vaultPath ? [{ key: 'vault', title: 'Vault', parent: null, readOnly: true }] : []),
    ...extra.map((w) => ({ key: w.key, title: w.title, parent: w.parent, readOnly: false })),
  ];
}
