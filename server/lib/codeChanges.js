// C2 — what a Claude Code session actually DID, and his call on keeping it.
//
// The Code tab could already talk to Claude and let it edit files. What was
// missing is the half that makes a terminal unnecessary: seeing the diff and
// deciding. Without it he has to open a terminal to run `git diff` — the
// exact escape hatch he asked to close.
//
// Doctrine: everything writeable is undoable. Discarding a session's work
// therefore STASHES it (recoverable, and listed back to him), never
// `checkout --` — a hard discard would be the one destructive button in Nova
// with no way back.
//
// ROUND 3 (10 Oct 2026, mockup 89; his words: "ensure that committing etc
// are all actually functional and confirm it's not just for show"):
//   - Commit takes ONLY the files he ticked. It used to run `git add -A`,
//     which swept in another session's half-written files (the shared-index
//     hazard his concurrent-sessions notes name). Every path is checked here:
//     inside the workspace, outside .git, and one of the files git says is
//     changed right now. Anything else is refused before git is touched.
//   - A file another Claude session edited (read from that session's own
//     journal under ~/.claude/projects, after the last commit) is marked, so
//     the screen can bring it in unticked and say why.
//   - Undo takes a commit back while it is still HEAD, was made by Nova, and
//     is on no remote: `git reset --soft HEAD~1`, then the paths it committed
//     are unstaged again, so the files are exactly as they were before.
//   - Shelve takes the ticked files too, and Restore finds its own stash by
//     its sha (the stash stack is shared with every other session), never by
//     position.
//
// Every function takes `repoRoot`, so the tests run against a temporary git
// repo made with mkdtemp and never touch his real repositories.
//
// ROUND 4 (10 Oct 2026, his three calls):
//   - Science Atlas and Wren are workspaces too, named in one file under
//     server data (lib/codeWorkspaces.js). Every guard below holds in each:
//     a ticked path is checked against THAT folder, and a file another
//     session's journal edited arrives unticked there as here. The journals
//     of the folders above a workspace are read too, because his Atlas
//     sessions run one level up, in P3_Draft3.
//   - A commit is a record on the inbox rails (kind `code-commit`, with
//     `undoData`), and Undo goes through the rails' own undo path, from this
//     screen or from the Inbox alike. The old code-commits.json is folded in
//     once and set aside.
//   - Reads never take git's optional index lock (GIT_OPTIONAL_LOCKS=0), so
//     looking at a folder another session is working in never writes to it.

import { execFile } from 'node:child_process';
import { readFile, rename, readdir, stat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const COMMITS_FILE = () => path.join(dataRoot(), 'code-commits.json');
export const COMMIT_KIND = 'code-commit';

export const MESSAGE_MIN = 8;
const MAX_PATHS = 2000;
const PEEK_LINES = 3;
const FILE_DIFF_LINES = 400;
const UNTRACKED_READ_MAX = 4 * 1024 * 1024;
const ANCESTOR_LEVELS = 2;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

function git(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      // a path is always a path: `*`, `:` and `!` in a file name are never
      // read as a pattern that could match other files
      // and a read never refreshes the index behind another session's back
      env: { ...process.env, GIT_LITERAL_PATHSPECS: '1', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve(stdout);
    });
  });
}

// A refusal he can read, with a code the route turns into a 400.
function refuse(message, code = 'refused') {
  const e = new Error(message);
  e.code = code;
  return e;
}

// Workspace → cwd. 'repo' is Nova itself; the vault is a real git repo too
// in his setup, but it is NOT ours to commit, so it stays read-only here.
// Any other key is a folder named in server/data/code-workspaces.json, and
// it must be the top of its own repository: a folder inside some larger
// repo would let a commit reach files outside the workspace he chose.
export async function where(workspace, vaultPath, repoRoot = REPO_ROOT) {
  const { resolveWorkspace } = await import('./codeWorkspaces.js');
  const w = await resolveWorkspace(workspace, { repoRoot, vaultPath });
  if (w.key !== 'repo' && w.key !== 'vault') {
    let top = '';
    try { top = (await git(['rev-parse', '--show-toplevel'], w.cwd)).trim(); } catch { throw refuse(`${w.title} is not a git repository at ${w.cwd}`, 'workspace'); }
    const [a, b] = await Promise.all([realpath(top).catch(() => top), realpath(w.cwd).catch(() => w.cwd)]);
    if (a !== b) throw refuse(`${w.title} is a folder inside another repository, so Nova will not commit there`, 'workspace');
  }
  return w;
}

// ------------------------------------------------------------- reading git

// `git status --porcelain -z -uall`: every changed file one by one (an
// untracked folder is listed file by file), NUL-separated so a name with a
// space, a quote or a newline arrives exactly as it is on disk.
export async function statusEntries(cwd) {
  const out = await git(['status', '--porcelain=v1', '-z', '-uall'], cwd);
  const toks = out.split('\0');
  const entries = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!t || t.length < 4) continue;
    const x = t[0], y = t[1];
    const p = t.slice(3);
    const e = { x, y, status: (x + y).trim(), path: p };
    if (x === 'R' || x === 'C') { e.from = toks[i + 1]; i++; }
    entries.push(e);
  }
  return entries;
}

async function headInfo(cwd) {
  try {
    const out = (await git(['log', '-1', '--format=%H%x00%ct'], cwd)).trim();
    const [sha, ct] = out.split('\0');
    return { sha, at: Number(ct) * 1000 };
  } catch { return null; }
}

// lines added and removed per tracked file, against HEAD
async function numstat(cwd, hasHead) {
  const map = new Map();
  let out = '';
  try { out = await git(['diff', '--numstat', '-z', hasHead ? 'HEAD' : '--cached'], cwd); } catch { return map; }
  const toks = out.split('\0');
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!t) continue;
    const m = t.match(/^(-|\d+)\t(-|\d+)\t(.*)$/s);
    if (!m) continue;
    let p = m[3];
    if (p === '') { p = toks[i + 2]; i += 2; } // a rename: "a\tr\t\0old\0new"
    const binary = m[1] === '-';
    map.set(p, { added: binary ? 0 : Number(m[1]), removed: binary ? 0 : Number(m[2]), binary });
  }
  return map;
}

// An untracked file has no diff; its lines are all added. Binary is a NUL
// in the first 8 KB, the same test git uses.
async function untrackedLines(file) {
  let fh;
  try {
    fh = await open(file, 'r');
    const { size } = await fh.stat();
    const buf = Buffer.alloc(Math.min(size, UNTRACKED_READ_MAX));
    await fh.read(buf, 0, buf.length, 0);
    if (buf.subarray(0, 8192).includes(0)) return { added: 0, removed: 0, binary: true };
    const text = buf.toString('utf8');
    if (!text) return { added: 0, removed: 0, binary: false };
    const n = (text.match(/\n/g) || []).length + (text.endsWith('\n') ? 0 : 1);
    return { added: n, removed: 0, binary: false, approx: size > UNTRACKED_READ_MAX };
  } catch {
    return { added: 0, removed: 0, binary: false };
  } finally { await fh?.close().catch(() => {}); }
}

// The CLI names a project's journal folder by flattening the working
// directory (the same rule as claudeSessions.js projectSlug).
const slug = (cwd) => String(cwd || '').replace(/[^A-Za-z0-9]/g, '-');

async function readTail(file, bytes) {
  const fh = await open(file, 'r');
  try {
    const { size } = await fh.stat();
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    await fh.read(buf, 0, buf.length, start);
    return buf.toString('utf8');
  } finally { await fh.close(); }
}

/**
 * WHO ELSE TOUCHED THESE FILES. Reads the journals Claude Code keeps for
 * every session in this folder and collects the files each one edited
 * (Edit, Write, MultiEdit, NotebookEdit) after `since` (the last commit).
 * Returns Map(relPath -> Set(sessionId)). Read-only over the CLI's own files;
 * a journal that cannot be read is simply not counted, never guessed at.
 * A file changed by hand or by a shell command leaves no journal entry, so
 * it is never called another session's: that claim needs a record.
 */
export async function sessionEdits(cwd, { since = 0, home = os.homedir(), maxFiles = 60, tailBytes = 8 * 1024 * 1024 } = {}) {
  const out = new Map();
  const roots = new Set([cwd]);
  try { roots.add(await realpath(cwd)); } catch { /* keep the given path */ }
  // WHICH JOURNALS. The folder's own, the two folders above it, and every
  // folder beside it: his Atlas redesign sessions run in a SIBLING folder
  // ("Atomic_Hub_P3_Draft 3", next to Atlas_Progress_Map) and edit files in
  // here by full path, so reading only this folder's journals would call
  // their files his (found on the real Mac, 10 Oct 2026). Never the home
  // folder or above. The newest journals since the last commit are read,
  // at most `maxFiles` of them across every folder, so the cost is bounded.
  const projectsDir = path.join(home, '.claude', 'projects');
  const wanted = new Set();
  const besides = new Set();
  for (const r of roots) {
    wanted.add(slug(r));
    let p = r;
    for (let i = 0; i < ANCESTOR_LEVELS; i++) {
      const up = path.dirname(p);
      if (up === p || up === os.homedir() || up.length < 2) break;
      wanted.add(slug(up));
      if (i === 0) besides.add(slug(up) + '-');
      p = up;
    }
  }
  let all = [];
  try { all = await readdir(projectsDir); } catch { all = []; }
  const dirs = all.filter((d) => wanted.has(d) || [...besides].some((b) => d.startsWith(b))).map((d) => path.join(projectsDir, d));
  const withTime = [];
  for (const dir of dirs) {
    let entries = [];
    try { entries = await readdir(dir); } catch { continue; }
    for (const n of entries.filter((e) => e.endsWith('.jsonl'))) {
      try { const s = await stat(path.join(dir, n)); if (s.mtimeMs >= since) withTime.push({ dir, n, t: s.mtimeMs }); } catch { /* gone */ }
    }
    // a session's subagents journal in a folder named for it
    // (<id>/subagents/*.jsonl); what they edit is that session's work, so it
    // carries its id
    for (const id of entries.filter((e) => /^[0-9a-f-]{36}$/i.test(e))) {
      const sub = path.join(dir, id, 'subagents');
      let subs = [];
      try { subs = (await readdir(sub)).filter((x) => x.endsWith('.jsonl')); } catch { subs = []; }
      for (const x of subs) {
        try { const s = await stat(path.join(sub, x)); if (s.mtimeMs >= since) withTime.push({ dir: sub, n: x, id, t: s.mtimeMs }); } catch { /* gone */ }
      }
    }
  }
  withTime.sort((a, b) => b.t - a.t);
  const marks = [...roots].map((r) => path.basename(r));
  {
    for (const { dir: jdir, n, id } of withTime.slice(0, maxFiles)) {
      const sessionId = id || n.slice(0, -'.jsonl'.length);
      let text = '';
      try { text = await readTail(path.join(jdir, n), tailBytes); } catch { continue; }
      for (const line of text.split('\n')) {
        if (!line.includes('"tool_use"') || !marks.some((m) => line.includes(m))) continue;
        let j; try { j = JSON.parse(line); } catch { continue; }
        if (j.type !== 'assistant' || !Array.isArray(j.message?.content)) continue;
        const at = Date.parse(j.timestamp || '');
        if (Number.isFinite(at) && at < since) continue;
        for (const c of j.message.content) {
          if (c?.type !== 'tool_use' || !EDIT_TOOLS.has(c.name)) continue;
          const fp = c.input?.file_path || c.input?.notebook_path;
          if (typeof fp !== 'string') continue;
          for (const r of roots) {
            const rel = path.relative(r, fp);
            if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
              const key = rel.split(path.sep).join('/');
              if (!out.has(key)) out.set(key, new Set());
              out.get(key).add(sessionId);
              break;
            }
          }
        }
      }
    }
  }
  return out;
}

// the first lines a file adds, for the peek under the review's first file
async function filePeek(cwd, entry, hasHead, maxLines = PEEK_LINES) {
  try {
    let added = [];
    if (entry.status === '??') {
      const buf = await readFile(path.join(cwd, entry.path));
      if (buf.subarray(0, 8192).includes(0)) return null;
      added = buf.toString('utf8').split('\n');
      if (added.length && added[added.length - 1] === '') added.pop();
    } else {
      const d = await git(['diff', hasHead ? 'HEAD' : '--cached', '--', entry.path], cwd);
      added = d.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
    }
    return { path: entry.path, lines: added.slice(0, maxLines), more: Math.max(0, added.length - maxLines) };
  } catch { return null; }
}

/** The changes in a workspace, file by file, drawn by the review. */
export async function changeSummary(workspace, vaultPath, { repoRoot = REPO_ROOT, sessionId = null, home = os.homedir() } = {}) {
  const { cwd, readOnly } = await where(workspace, vaultPath, repoRoot);
  const head = await headInfo(cwd);
  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd).catch(() => 'main')).trim();
  const entries = await statusEntries(cwd);
  if (!entries.length) return { clean: true, files: [], totals: { added: 0, removed: 0 }, readOnly, branch, head, peek: null };

  const counts = await numstat(cwd, !!head);
  const edits = readOnly ? new Map() : await sessionEdits(cwd, { since: head?.at || 0, home });
  const files = [];
  for (const e of entries) {
    let c = counts.get(e.path);
    if (!c && e.status === '??') c = await untrackedLines(path.join(cwd, e.path));
    c = c || { added: 0, removed: 0, binary: false };
    const who = edits.get(e.path);
    const others = who ? [...who].filter((id) => id !== sessionId) : [];
    const slash = e.path.lastIndexOf('/');
    files.push({
      path: e.path,
      from: e.from || null,
      name: e.path.slice(slash + 1),
      dir: slash >= 0 ? e.path.slice(0, slash + 1) : '',
      status: e.status,
      untracked: e.status === '??',
      deleted: e.x === 'D' || e.y === 'D',
      added: c.added, removed: c.removed, binary: !!c.binary,
      // another Claude session's journal edited this file after the last
      // commit: it arrives unticked and the screen says why
      other: others.length ? { sessionId: others[0] } : null,
      mine: !!(sessionId && who && who.has(sessionId)),
    });
  }
  const totals = files.reduce((a, f) => ({ added: a.added + f.added, removed: a.removed + f.removed }), { added: 0, removed: 0 });
  const first = files.find((f) => !f.other && !f.binary && !f.deleted);
  const peek = first ? await filePeek(cwd, first, !!head) : null;
  return { clean: false, files, totals, readOnly, branch, head, peek };
}

/** One file's own diff (or an untracked file's lines), for "Show all". */
export async function fileDiff(workspace, vaultPath, file, { repoRoot = REPO_ROOT } = {}) {
  const { cwd } = await where(workspace, vaultPath, repoRoot);
  const rel = safeRel(cwd, file);
  const entries = await statusEntries(cwd);
  const e = entries.find((x) => x.path === rel);
  if (!e) throw refuse(`${rel} has no uncommitted change`);
  const head = await headInfo(cwd);
  const p = await filePeek(cwd, e, !!head, FILE_DIFF_LINES);
  if (!p) return { path: rel, lines: [], more: 0, binary: true };
  return p;
}

// ------------------------------------------------------------- the checks

/**
 * A path he ticked, checked before git sees it: a non-empty string, no NUL,
 * relative, inside the workspace once normalised, and never inside .git.
 * Returns the normalised relative path with forward slashes.
 */
export function safeRel(root, p) {
  if (typeof p !== 'string' || !p || p.includes('\0')) throw refuse('a file path is missing or not text', 'path');
  if (p.length > 4096) throw refuse('a file path is longer than any file on disk', 'path');
  if (path.isAbsolute(p)) throw refuse(`${p.slice(0, 120)} is not inside the workspace`, 'path');
  const abs = path.resolve(root, p);
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw refuse(`${p.slice(0, 120)} is not inside the workspace`, 'path');
  const norm = rel.split(path.sep).join('/');
  if (norm === '.git' || norm.startsWith('.git/')) throw refuse('Nova never touches the .git folder itself', 'path');
  return norm;
}

// the ticked paths, each one checked against what git says is changed now
async function checkedPaths(cwd, paths) {
  if (!Array.isArray(paths) || !paths.length) throw refuse('tick at least one file', 'paths');
  if (paths.length > MAX_PATHS) throw refuse(`more than ${MAX_PATHS} files at once`, 'paths');
  const rels = [...new Set(paths.map((p) => safeRel(cwd, p)))];
  const entries = await statusEntries(cwd);
  const byPath = new Map(entries.map((e) => [e.path, e]));
  const take = new Set();
  for (const r of rels) {
    const e = byPath.get(r);
    if (!e) throw refuse(`${r.slice(0, 160)} has no uncommitted change, so there is nothing of it to take`, 'path');
    take.add(r);
    if (e.from) take.add(e.from); // a rename carries its old name with it
  }
  return { take: [...take], entries };
}

export function messageOk(message) {
  const msg = String(message || '').trim();
  if (msg.length < MESSAGE_MIN) throw refuse(`a commit needs a real message, ${MESSAGE_MIN} characters or more; future-you reads these`, 'message');
  return msg;
}

// ------------------------------------------------------------- the record

// A COMMIT RIDES THE INBOX RAILS (his call 3, 10 Oct 2026: "move the undo
// records if you think it's worth it"). Nova's rule is that everything
// writeable is undoable through one door: a record with a kind, a status and
// undoData. Until today a commit's way back lived in a file of its own,
// code-commits.json, which the Inbox, the fleet and the Org Map could not
// see, so "what did I change today" had two answers. Now a commit files a
// `code-commit` record (status filed, undoData {sha, parent, workspace,
// root, paths}) and Undo is the rails' own undoRecord, whose undoFiling
// calls revertNovaCommit below. The guards live there, so the Inbox's Undo
// and this screen's are the same act with the same refusals.

const SHA_RE = /^[0-9a-f]{40}$/;
const store = () => import('./inboxStore.js');

async function commitRecords() {
  const { listRecords } = await store();
  return (await listRecords()).filter((r) => r.kind === COMMIT_KIND && r.undoData && SHA_RE.test(r.undoData.sha || ''));
}

function commitRecord({ sha, short, parent, workspace, root, title, branch, paths, message, at = Date.now(), undone = false }) {
  const iso = new Date(at).toISOString();
  const text = `Committed ${short} in ${title} · ${paths.length} file${paths.length === 1 ? '' : 's'}: “${message.length > 140 ? message.slice(0, 138).trimEnd() + '…' : message}”`;
  return {
    id: randomUUID().slice(0, 8),
    kind: COMMIT_KIND,
    text,
    source: 'code',
    mode: 'auto',
    status: undone ? 'undone' : 'filed',
    createdAt: iso,
    filedAt: iso,
    auto: false,
    destination: `${title}${branch ? ` · ${branch}` : ''}, not pushed`,
    undoData: { kind: COMMIT_KIND, sha, short, parent: parent || null, workspace, root, paths },
    decision: {
      route: COMMIT_KIND,
      confidence: 'high',
      title: text,
      reason: 'His own commit on the Code screen, of the files he ticked. Undo takes it back while it is unpushed and still the newest commit.',
      payload: { sha, short, workspace, message, files: paths.length },
    },
    ...(undone ? { undoneAt: iso, undoSummary: 'taken back before the rails held commits' } : {}),
  };
}

// THE OLD FILE, FOLDED IN ONCE. Every entry of code-commits.json becomes a
// record unless one with the same sha and folder is already there, and the
// file is renamed aside (code-commits.migrated.json), so a second run finds
// nothing to do and a restored file can never make a duplicate.
let migration = null;
export function migrateCommitsFile() {
  if (!migration) migration = migrateNow().catch((e) => { migration = null; throw e; });
  return migration;
}
export function _resetCommitMigration() { migration = null; }

async function migrateNow() {
  let list;
  try { list = JSON.parse(await readFile(COMMITS_FILE(), 'utf8')); } catch { return { migrated: 0, skipped: 0 }; }
  if (!Array.isArray(list)) list = [];
  const { createRecord } = await store();
  const have = new Set((await commitRecords()).map((r) => `${r.undoData.root}\0${r.undoData.sha}`));
  let migrated = 0, skipped = 0;
  for (const e of list) {
    if (!e || !SHA_RE.test(e.sha || '') || typeof e.root !== 'string') { skipped++; continue; }
    const k = `${e.root}\0${e.sha}`;
    if (have.has(k)) { skipped++; continue; }
    have.add(k);
    await createRecord(commitRecord({
      sha: e.sha, short: e.short || e.sha.slice(0, 7), parent: null,
      workspace: e.workspace || 'repo', root: e.root,
      title: e.workspace && e.workspace !== 'repo' ? e.workspace : 'Nova OS',
      branch: null, paths: Array.isArray(e.paths) ? e.paths : [], message: String(e.message || ''),
      at: Number(e.at) || Date.now(), undone: !!e.undone,
    }));
    migrated++;
  }
  await rename(COMMITS_FILE(), path.join(dataRoot(), 'code-commits.migrated.json'));
  return { migrated, skipped };
}

async function onRemote(cwd, sha) {
  const out = await git(['for-each-ref', '--contains', sha, '--format=%(refname)', 'refs/remotes'], cwd).catch(() => '');
  return out.split('\n').filter(Boolean);
}

// ------------------------------------------------------------- the writes

/** Commit exactly the ticked files. Nothing else in the repo moves. */
export async function commitChanges(workspace, vaultPath, message, { repoRoot = REPO_ROOT, paths } = {}) {
  const w = await where(workspace, vaultPath, repoRoot);
  const { cwd, readOnly } = w;
  if (readOnly) throw refuse('the vault is read-only from here; Nova never commits your notes for you', 'readonly');
  const msg = messageOk(message);
  const { take } = await checkedPaths(cwd, paths);
  await migrateCommitsFile().catch(() => {});
  const before = await headInfo(cwd);
  await git(['add', '-A', '--', ...take], cwd);
  // --only: the commit holds these paths and nothing else already in the
  // shared index (another session's staged work stays staged, untouched)
  await git(['commit', '--only', '-m', msg, '--', ...take], cwd);
  const head = await headInfo(cwd);
  const short = (await git(['rev-parse', '--short', 'HEAD'], cwd)).trim();
  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd).catch(() => '')).trim();
  const left = (await statusEntries(cwd)).map((e) => e.path);
  const { createRecord } = await store();
  const record = await createRecord(commitRecord({
    sha: head.sha, short, parent: before?.sha || null, workspace: w.key, root: cwd, title: w.title, branch, paths: take, message: msg,
  }));
  return { sha: short, fullSha: head.sha, message: msg, files: take.length, paths: take, leftOut: left, pushed: false, recordId: record.id };
}

/**
 * THE GUARDS, called by the rails' undoFiling for a `code-commit` record
 * (lib/inbox.js), so the Inbox's Undo and the Code screen's are one act.
 * Take a commit back only while it is safe to: it is still HEAD, its parent
 * is the one it was made on, and no remote has it. The work is kept: a soft
 * reset, then the paths it committed are unstaged, so the files are back
 * exactly as before. Returns the rails' human summary.
 */
export async function revertNovaCommit(undo) {
  const sha = undo?.sha;
  const cwd = undo?.root;
  if (typeof sha !== 'string' || !SHA_RE.test(sha)) throw refuse('which commit? a full commit id is needed', 'sha');
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) throw refuse('the record does not say which folder the commit is in', 'workspace');
  const head = await headInfo(cwd);
  if (!head) throw refuse('that folder is not a repository Nova can read any more; the commit stays', 'workspace');
  if (head.sha !== sha) throw refuse('a newer commit sits on top of it now, so Undo would take that too; it stays', 'nothead');
  const remotes = await onRemote(cwd, sha);
  if (remotes.length) throw refuse('it is pushed already, so taking it back here would rewrite shared history; it stays', 'pushed');
  let parent = '';
  try { parent = (await git(['rev-parse', '--verify', '--quiet', `${sha}^`], cwd)).trim(); } catch { throw refuse('it is the first commit in the repository, so there is nothing to go back to', 'root'); }
  if (undo.parent && parent !== undo.parent) throw refuse('its history was rewritten since Nova made it, so Undo would not land where it should; it stays', 'nothead');
  const names = (await git(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', sha], cwd)).split('\0').filter(Boolean);
  await git(['reset', '--soft', 'HEAD~1'], cwd);
  if (names.length) await git(['reset', '-q', 'HEAD', '--', ...names], cwd);
  const short = undo.short || sha.slice(0, 7);
  return `took back ${short}; ${names.length === 1 ? 'its file is' : `its ${names.length} files are`} uncommitted again, exactly as before`;
}

/**
 * Undo from the Code screen: find Nova's own record of this commit in this
 * folder, then hand it to the rails. A commit with no record (made by hand,
 * or by another session) is not Nova's to take back.
 */
export async function undoCommit(workspace, vaultPath, { repoRoot = REPO_ROOT, sha } = {}) {
  const { cwd, readOnly } = await where(workspace, vaultPath, repoRoot);
  if (readOnly) throw refuse('the vault is read-only from here', 'readonly');
  if (typeof sha !== 'string' || !SHA_RE.test(sha)) throw refuse('which commit? a full commit id is needed', 'sha');
  await migrateCommitsFile().catch(() => {});
  const recs = (await commitRecords()).filter((r) => r.undoData.sha === sha && r.undoData.root === cwd);
  const rec = recs.find((r) => r.status === 'filed') || recs[0];
  if (!rec) throw refuse('Nova did not make that commit, so it will not take it back', 'notmine');
  if (rec.status === 'undone') throw refuse('that commit was already taken back', 'undone');
  if (rec.status !== 'filed') throw refuse('that commit is not one Undo can reach', 'undone');
  const names = (await git(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', sha], cwd).catch(() => '')).split('\0').filter(Boolean);
  const { undoRecord } = await import('./inbox.js');
  await undoRecord(vaultPath, rec.id);
  return { undone: true, sha: rec.undoData.short || sha.slice(0, 7), files: names.length, paths: names, recordId: rec.id };
}

/**
 * Today's commits Nova made, each with whether Undo can still reach it.
 * `workspace: 'all'` reads every folder the screen knows, each commit
 * carrying its workspace key.
 */
export async function listCommits(workspace, vaultPath, { repoRoot = REPO_ROOT, since = 0 } = {}) {
  await migrateCommitsFile().catch(() => {});
  let places;
  if (workspace === 'all') {
    const { listWorkspaces } = await import('./codeWorkspaces.js');
    places = [];
    for (const w of await listWorkspaces({ vaultPath })) {
      if (w.readOnly) continue;
      try { places.push(await where(w.key, vaultPath, repoRoot)); } catch { /* a folder that is not there lists nothing */ }
    }
  } else {
    places = [await where(workspace, vaultPath, repoRoot)];
  }
  const all = await commitRecords();
  const out = [];
  for (const p of places) {
    const head = await headInfo(p.cwd);
    const mine = all.filter((r) => r.undoData.root === p.cwd && Date.parse(r.createdAt) >= since);
    for (const r of mine) {
      const u = r.undoData;
      const undone = r.status !== 'filed';
      const pushed = (await onRemote(p.cwd, u.sha)).length > 0;
      out.push({
        sha: u.sha, short: u.short || u.sha.slice(0, 7), at: Date.parse(r.createdAt), files: (u.paths || []).length,
        message: r.decision?.payload?.message || '', undone, workspace: p.key, recordId: r.id,
        pushed, head: head?.sha === u.sha,
        canUndo: !undone && !pushed && head?.sha === u.sha,
      });
    }
  }
  out.sort((a, b) => b.at - a.at);
  return { commits: out };
}

// Undoable discard: stash (including untracked) so it is always recoverable.
export async function shelveChanges(workspace, vaultPath, { repoRoot = REPO_ROOT, paths } = {}) {
  const { cwd, readOnly } = await where(workspace, vaultPath, repoRoot);
  if (readOnly) throw refuse('the vault is read-only from here', 'readonly');
  const before = await statusEntries(cwd);
  if (!before.length) throw refuse('nothing to shelve', 'clean');
  const label = `nova-shelf ${new Date().toISOString()} ${randomUUID().slice(0, 6)}`;
  let take = null;
  if (paths !== undefined) take = (await checkedPaths(cwd, paths)).take;
  await git(['stash', 'push', '-u', '-m', label, ...(take ? ['--', ...take] : [])], cwd);
  const entry = (await stashList(cwd)).find((s) => s.subject.endsWith(label));
  return {
    shelved: true, label, sha: entry?.sha || null,
    recover: 'restore it from the Code screen',
    files: take ? take.length : before.length,
    paths: take || before.map((e) => e.path),
  };
}

async function stashList(cwd) {
  const out = await git(['stash', 'list', '--format=%H%x00%gs'], cwd).catch(() => '');
  return out.split('\n').filter(Boolean).map((l, i) => { const [sha, subject] = l.split('\0'); return { i, sha, subject: subject || '' }; });
}

/** Bring a shelf back. By sha when given (the stack is shared), else the newest, and only Nova's own. */
export async function unshelveLatest(workspace, vaultPath, { repoRoot = REPO_ROOT, sha } = {}) {
  const { cwd, readOnly } = await where(workspace, vaultPath, repoRoot);
  if (readOnly) throw refuse('the vault is read-only from here', 'readonly');
  if (sha !== undefined && sha !== null && (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha))) throw refuse('which shelf? a full id is needed', 'sha');
  const list = await stashList(cwd);
  const entry = sha ? list.find((s) => s.sha === sha) : list[0];
  if (!entry) throw refuse(sha ? 'that shelf is not there any more; it may have been restored already' : 'there is nothing shelved', 'gone');
  if (!entry.subject.includes('nova-shelf')) throw refuse('that stash was not shelved by Nova; recover it yourself so nothing of yours is clobbered', 'notmine');
  await git(['stash', 'apply', entry.sha], cwd);
  const now = await stashList(cwd);
  const still = now.find((s) => s.sha === entry.sha);
  if (still) await git(['stash', 'drop', `stash@{${still.i}}`], cwd);
  return { restored: true, entry: entry.subject, sha: entry.sha };
}
