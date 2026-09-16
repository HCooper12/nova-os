// WHERE NOVA IS ALLOWED TO BUILD.
//
// His ask, 16 Sep, after the Claude advertisement: "build me a pixel-perfect
// website from that mockup and save it to my desktop." Nova could not, and the
// reason was deliberate — every write it makes is vault-scoped, because a
// system that can write anywhere is a system he has to supervise. The answer
// is not to widen that boundary; it is to draw a SECOND one he chose.
//
// So: one directory, named, outside the vault. Nova may create projects inside
// it and write nothing anywhere else. Not his Desktop, not his home folder —
// those hold things Nova did not make and must not touch. `NOVA_PROJECTS_DIR`
// moves it if he wants it somewhere else.
//
// The containment is enforced HERE rather than trusted to a prompt, because a
// path is the one thing a model can get wrong in a way that is expensive. It
// works in two layers, and they do different jobs:
//   - the SLUG neutralises traversal before a path exists at all. "../outside"
//     has its dots and separators stripped and becomes the project "outside".
//     Contained, not refused — there is nothing to refuse by then.
//   - `projectDir` then resolves the real path and REFUSES anything still
//     landing outside the root, which is the case a slug cannot catch: a name
//     matching an existing symlink that points elsewhere.
// A name that slugs away to nothing is refused rather than resolving to the
// root itself.

import { existsSync, mkdirSync, readdirSync, statSync, realpathSync, renameSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const PROJECTS_ROOT = () => process.env.NOVA_PROJECTS_DIR || path.join(os.homedir(), 'Nova Projects');

// Where an undone build goes. Never deleted — a build is work, and the undo
// for "you made me something I did not want" is "put it out of my way", not
// "destroy it". He can empty this himself whenever he likes.
export const UNDONE_DIR = () => path.join(PROJECTS_ROOT(), '.undone');

export function ensureProjectsRoot() {
  const root = PROJECTS_ROOT();
  mkdirSync(root, { recursive: true });
  return root;
}

// A directory name from whatever he called it. Letters, digits, spaces and
// dashes survive; everything else becomes a dash. This is not sanitising for
// safety — projectDir below does that — it is so the folder is one he can read
// in Finder.
export function projectSlug(name) {
  const s = String(name || '')
    .normalize('NFKD')
    // NFKD splits "é" into "e" + a combining acute; without dropping the mark
    // the next rule turns it into a dash and "café brûlée" becomes
    // "cafe-bru-le-e"
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/[\s_]+/g, ' ')
    .trim()
    .replace(/\s/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-|-$/g, '');
  return s.toLowerCase();
}

// THE CONTAINMENT. Returns an absolute path inside the projects root, or
// throws. Resolves through symlinks where the path already exists, so a name
// pointing at a link out of the tree cannot be used to escape it.
export function projectDir(name, { root = PROJECTS_ROOT() } = {}) {
  const slug = projectSlug(name);
  if (!slug) throw new Error('a project needs a name');
  const realRoot = existsSync(root) ? realpathSync(root) : path.resolve(root);
  const full = path.resolve(realRoot, slug);
  const check = existsSync(full) ? realpathSync(full) : full;
  if (check !== realRoot && !check.startsWith(realRoot + path.sep)) {
    throw new Error(`"${name}" resolves outside the projects directory — refused`);
  }
  if (check === realRoot) throw new Error('a project needs its own directory, not the root');
  return full;
}

// Make one, and say whether it already existed — a second build under the same
// name must not silently write into the first.
export function createProjectDir(name) {
  ensureProjectsRoot();
  const dir = projectDir(name);
  const existed = existsSync(dir);
  if (!existed) mkdirSync(dir, { recursive: true });
  return { dir, existed, slug: path.basename(dir) };
}

// What is in there, newest first, for a surface that shows him his own work.
export function listProjects() {
  const root = PROJECTS_ROOT();
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((f) => !f.startsWith('.'))
    .map((f) => {
      const full = path.join(root, f);
      let st = null;
      try { st = statSync(full); } catch { return null; }
      if (!st.isDirectory()) return null;
      let files = 0;
      try { files = readdirSync(full).filter((x) => !x.startsWith('.')).length; } catch { /* unreadable is still a project */ }
      return { name: f, dir: full, files, at: st.mtime.toISOString() };
    })
    .filter(Boolean)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

// Undo a build: move it aside, never delete it. Returns where it went.
export function undoProject(slug) {
  const dir = projectDir(slug);
  if (!existsSync(dir)) return { moved: null, reason: 'that project is already gone' };
  mkdirSync(UNDONE_DIR(), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(UNDONE_DIR(), `${path.basename(dir)}-${stamp}`);
  renameSync(dir, dest);
  return { moved: dest };
}
