// THE PROJECT KERNEL (Projects phase 1, 29 Oct 2026; design/PROJECTS-PLAN.md §0, §1, §7, §10b).
//
// A project is a folder, a vault page and a record joined by one id. This file
// is the machinery for all three and NOTHING ELSE: it imports nothing from
// Nova's prompts, lens, inbox or screens, so a second host (Wren, for Science
// Atlas) can run the same projects by passing its own `host`:
//
//   makeKernel({ name, projectsRoot, dataDir, vaultRoot, vaultDir? })
//
// Rules it keeps in code, never in a prompt:
//   - every path it touches is contained (projects.js projectDir: slug, then a
//     real-path check through symlinks);
//   - every writer calls assertWritable first, and a LINKED project (Science
//     Atlas, Wren, Nova's own repo) is refused by every one of them;
//   - LOG.md is append-only and written only by code;
//   - nothing is deleted: undo moves the folder to .undone, archive to .archive,
//     and the vault page goes only when its hash says he has not touched it;
//   - a stage move is PROPOSED (proposeStage returns it); applyStage is only
//     ever reached from his yes on a card.

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, renameSync, statSync, unlinkSync, rmdirSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { projectSlug, projectDir } from './projects.js';

export const KINDS = ['build', 'research', 'life'];
export const STAGES = ['idea', 'planning', 'active', 'paused', 'done', 'archived'];
export const ALLOWANCES = ['research', 'draft', 'code', 'test', 'commit', 'deploy'];
export const DRY_RUN_PROJECTS = 3;

// the moves Nova may propose. archived is reachable from anywhere (it is the
// one way a project leaves the list); nothing comes back from archived here.
const MOVES = {
  idea: ['planning', 'active', 'archived'],
  planning: ['active', 'paused', 'archived'],
  active: ['paused', 'done', 'archived'],
  paused: ['active', 'archived'],
  done: ['active', 'archived'],
  archived: [],
};

const ID_RE = /^[0-9a-f]{8}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const sha = (s) => createHash('sha256').update(s).digest('hex');
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stamp = (d) => `${isoDay(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

function refuse(message, code = 'project') {
  const e = new Error(message);
  e.code = code;
  return e;
}

// THE GUARD. Every writer calls this before it does anything at all.
export function assertWritable(project) {
  if (!project || typeof project !== 'object') throw refuse('no such project', 'missing');
  if (project.linked) throw refuse(`"${project.name || project.id}" is a linked project: Nova only reads about it and never writes to it`, 'linked');
  if (project.status === 'undone') throw refuse(`"${project.name}" was undone`, 'undone');
  return project;
}

// A vault folder name from his name for it: readable, and never a path.
export function vaultName(name) {
  const s = String(name || '').split(String.fromCharCode(0)).join(' ').replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim();
  if (!s || /^\.+$/.test(s)) return '';
  return s.replace(/^\.+/, '').trim();
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// A vault path the model proposed. Relative, no traversal, no oddities.
function cleanRead(p) {
  if (typeof p !== 'string') return null;
  const s = p.trim().replace(/^\.\//, '');
  if (!s || s.length > 200) return null;
  if (path.isAbsolute(s) || s.startsWith('~') || s.includes('\0') || s.includes('\\')) return null;
  if (s.split('/').some((part) => part === '..' || part === '.')) return null;
  return s;
}

/**
 * The brief, checked. Returns {ok, brief, errors}. Unknown keys are dropped,
 * strings trimmed, and no path the model wrote is trusted.
 */
export function validateBrief(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, brief: null, errors: ['the brief is not an object'] };
  const rawName = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!rawName) errors.push('name');
  else if (rawName.length > 60) errors.push('name (at most 60 characters)');
  else if (!projectSlug(rawName) || !vaultName(rawName)) errors.push('name (it has no letters or digits)');
  const kind = typeof obj.kind === 'string' ? obj.kind.trim().toLowerCase() : '';
  if (!KINDS.includes(kind)) errors.push(`kind (one of ${KINDS.join(', ')})`);
  const goal = str(obj.goal, 600);
  if (!goal) errors.push('goal');
  const done = str(obj.done, 600);
  if (!done) errors.push('done (what finished looks like)');
  let deadline = null;
  if (obj.deadline != null && obj.deadline !== '') {
    deadline = str(obj.deadline, 40);
    if (!deadline) errors.push('deadline (a date, or null)');
  }
  const phases = [];
  for (const p of Array.isArray(obj.phases) ? obj.phases.slice(0, 12) : []) {
    const name = str(p?.name, 80);
    if (!name) continue;
    phases.push({ name, what: str(p?.what, 400), first: str(p?.first, 300), done: false });
  }
  if (!phases.length) errors.push('phases (at least one)');
  const reads = [];
  for (const r of Array.isArray(obj.reads) ? obj.reads.slice(0, 30) : []) {
    const c = cleanRead(r);
    if (!c) errors.push(`reads: "${String(r).slice(0, 80)}" is not a relative vault path`);
    else if (!reads.includes(c)) reads.push(c);
  }
  const allowances = {};
  for (const k of ALLOWANCES) allowances[k] = obj.allowances?.[k] === true;
  const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : NaN);
  const limit = { discussAbove: num(obj.limit?.discussAbove), agreed: num(obj.limit?.agreed) };
  if (Number.isNaN(limit.discussAbove) || Number.isNaN(limit.agreed)) errors.push('limit (numbers or null)');
  const firstMoves = (Array.isArray(obj.firstMoves) ? obj.firstMoves : []).map((m) => str(m, 300)).filter(Boolean).slice(0, 10);
  let parent = null;
  if (obj.parent != null && obj.parent !== '') {
    if (typeof obj.parent === 'string' && ID_RE.test(obj.parent)) parent = obj.parent;
    else errors.push('parent (not a project Nova made; a linked project cannot hold sub-projects)');
  }
  if (errors.length) return { ok: false, brief: null, errors };
  return { ok: true, errors: [], brief: { name: rawName, kind, goal, done, deadline, phases, reads, allowances, limit, firstMoves, parent } };
}

export function briefHash(brief) {
  return sha(JSON.stringify(brief)).slice(0, 16);
}

export function briefMarkdown(brief, date) {
  const lines = [
    `# ${brief.name}`, '',
    `Kind: ${brief.kind}  `,
    `Brief of ${date}${brief.deadline ? ` · deadline ${brief.deadline}` : ''}`, '',
    '## Goal', '', brief.goal, '',
    '## Done looks like', '', brief.done, '',
    '## Phases', '',
    ...brief.phases.map((p, i) => `${i + 1}. **${p.name}**${p.what ? ` · ${p.what}` : ''}${p.first ? `\n   First: ${p.first}` : ''}`), '',
    '## May read', '',
    ...(brief.reads.length ? brief.reads.map((r) => `- ${r}`) : ['- (nothing beyond who he is)']), '',
    '## May do alone', '',
    ...ALLOWANCES.map((k) => `- ${k}: ${brief.allowances[k] ? 'yes' : 'asks first'}`), '',
    ...(brief.firstMoves.length ? ['## First moves', '', ...brief.firstMoves.map((m) => `- ${m}`), ''] : []),
  ];
  return lines.join('\n');
}

const yamlStr = (s) => JSON.stringify(String(s ?? ''));
export function projectPageMarkdown(rec, { created, folder }) {
  const front = [
    '---',
    'type: project',
    `id: ${rec.id}`,
    `kind: ${rec.kind}`,
    `stage: ${rec.stage}`,
    `folder: ${yamlStr(folder)}`,
    `created: ${created}`,
    'phases:',
    ...rec.phases.map((p) => `  - ${yamlStr(p.name)}`),
    'cost: 0',
    '---',
  ];
  const body = [
    '', `# ${rec.name}`, '',
    rec.goal || '', '',
    '## Phases', '',
    ...rec.phases.map((p) => `- [${p.done ? 'x' : ' '}] ${p.name}${p.what ? ` · ${p.what}` : ''}`), '',
    '## Reads', '',
    ...(rec.reads.length ? rec.reads.map((r) => `- [[${r.replace(/\.md$/, '')}]]`) : ['- (none)']), '',
    '## Decisions', '', '(none yet)', '',
  ];
  return [...front, ...body].join('\n');
}

const GITIGNORE = '.nova/\nnode_modules/\ndist/\nbuild/dist/\n.DS_Store\n';

function git(dir, args) {
  return execFileSync('git', ['-c', 'user.name=Nova', '-c', 'user.email=nova@local', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'Nova', GIT_AUTHOR_EMAIL: 'nova@local', GIT_COMMITTER_NAME: 'Nova', GIT_COMMITTER_EMAIL: 'nova@local' },
  });
}

export function makeKernel(host) {
  if (!host || !host.projectsRoot || !host.dataDir) throw new Error('a kernel needs a host with projectsRoot and dataDir');
  const hostName = host.name || 'host';
  const vaultDir = host.vaultDir || 'Projects';
  const now = () => (host.now ? host.now() : new Date());
  const recordsDir = () => path.join(host.dataDir, 'projects');
  const recordPath = (id) => {
    if (!ID_RE.test(String(id))) throw refuse('not a project id', 'missing');
    return path.join(recordsDir(), `${id}.json`);
  };

  function save(rec) {
    mkdirSync(recordsDir(), { recursive: true });
    const tmp = `${recordPath(rec.id)}.tmp`;
    writeFileSync(tmp, JSON.stringify(rec, null, 2));
    renameSync(tmp, recordPath(rec.id));
    return rec;
  }

  function getProject(id) {
    try { return JSON.parse(readFileSync(recordPath(id), 'utf8')); } catch { return null; }
  }

  function listProjects({ includeUndone = false } = {}) {
    let files = [];
    try { files = readdirSync(recordsDir()).filter((f) => /^[0-9a-f]{8}\.json$/.test(f)); } catch { return []; }
    return files.map((f) => getProject(f.slice(0, 8))).filter((r) => r && (includeUndone || r.status !== 'undone'))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  // a writer is handed a record or an id; either way the guard runs first
  const resolve = (p) => assertWritable(typeof p === 'string' ? getProject(p) : p);

  function ensureRoot() {
    mkdirSync(host.projectsRoot, { recursive: true });
    return realpathSync(host.projectsRoot);
  }

  // where a project's folder lives: <root>/<slug>, or <root>/<parent>/<slug>
  function folderFor(slug, parent) {
    const root = ensureRoot();
    if (!parent) return projectDir(slug, { root });
    const parentDir = projectDir(parent.slug, { root });
    if (!existsSync(parentDir)) throw refuse(`the parent project's folder is missing (${parent.slug})`);
    return projectDir(slug, { root: parentDir });
  }

  function pageRel(rec, parent) {
    const own = vaultName(rec.name);
    return parent
      ? `${vaultDir}/${vaultName(parent.name)}/${own}/${own}.md`
      : `${vaultDir}/${own}/${own}.md`;
  }

  // the single containment check for anything written under the vault
  function vaultFull(rel) {
    if (!host.vaultRoot) throw refuse('no vault configured for this host', 'vault');
    const root = path.resolve(host.vaultRoot);
    const full = path.resolve(root, rel);
    const prefix = path.join(root, vaultDir) + path.sep;
    if (!full.startsWith(prefix)) throw refuse(`${rel} is outside ${vaultDir}/ — refused`, 'vault');
    return full;
  }

  function defaultDryRun() {
    return listProjects().filter((p) => !p.linked && p.dryRun === false).length < DRY_RUN_PROJECTS;
  }

  function appendLog(p, line, { action = null, dryRun } = {}) {
    const rec = resolve(p);
    const file = path.join(rec.folder, 'LOG.md');
    if (!existsSync(rec.folder)) throw refuse('the project folder is missing');
    const dry = dryRun ?? rec.dryRun;
    const text = String(line || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    const entry = `- ${stamp(now())} · ${dry ? 'DRY RUN · ' : ''}${action ? `${action} · ` : ''}${text}\n`;
    appendFileSync(file, entry, 'utf8');
    return entry;
  }

  // clean create / stage / settings actions, counted from the log itself
  function cleanActions(p) {
    const rec = typeof p === 'string' ? getProject(p) : p;
    if (!rec || rec.linked) return 0;
    let log = '';
    try { log = readFileSync(path.join(rec.folder, 'LOG.md'), 'utf8'); } catch { return 0; }
    return log.split('\n').filter((l) => / · (create|stage|settings) · /.test(l) && !/FAILED/.test(l)).length;
  }

  function writeVaultPage(rec, parent) {
    assertWritable(rec);
    if (parent) assertWritable(parent);
    const rel = pageRel(rec, parent);
    const full = vaultFull(rel);
    if (existsSync(full)) throw refuse(`${rel} already exists in the vault — choose another name`, 'exists');
    const dir = path.dirname(full);
    mkdirSync(path.join(dir, 'Sources'), { recursive: true });
    mkdirSync(path.join(dir, 'Raw'), { recursive: true });
    const content = projectPageMarkdown(rec, { created: isoDay(now()), folder: rec.folder });
    writeFileSync(full, content, 'utf8');
    return { relPath: rel, hash: sha(content) };
  }

  /**
   * His yes on a brief. Folder, layout, first commit, record, vault page.
   * Returns { project, files:[{relPath,hash}] } for the inbox undo.
   */
  function createProject(input, { dryRun, withPage = true } = {}) {
    const v = validateBrief(input);
    if (!v.ok) throw refuse(`the brief is incomplete: ${v.errors.join('; ')}`, 'brief');
    const brief = v.brief;
    let parent = null;
    if (brief.parent) {
      parent = assertWritable(getProject(brief.parent));
      if (parent.parent) throw refuse('a sub-project cannot have its own sub-project (one level only)', 'depth');
    }
    const slug = projectSlug(brief.name);
    const dir = folderFor(slug, parent);
    if (existsSync(dir)) throw refuse(`there is already a folder called "${slug}" — give this project another name`, 'exists');
    const date = isoDay(now());
    const at = now().toISOString();
    const rec = {
      id: randomBytes(4).toString('hex'),
      slug, name: brief.name, kind: brief.kind, stage: 'planning',
      status: 'live', host: hostName,
      parent: parent ? parent.id : null,
      linked: false,
      folder: dir,
      goal: brief.goal, done: brief.done, deadline: brief.deadline,
      briefHash: briefHash(brief),
      allowances: brief.allowances,
      limit: brief.limit,
      quiet: { from: '22:00', to: '07:00' },
      modelOverride: null,
      dryRun: dryRun ?? defaultDryRun(),
      reads: brief.reads,
      phases: brief.phases,
      firstMoves: brief.firstMoves,
      page: null, pageHash: null,
      createdAt: at, updatedAt: at,
    };
    assertWritable(rec);

    mkdirSync(dir, { recursive: true });
    for (const d of ['research', 'deliverables', 'build', '.nova']) mkdirSync(path.join(dir, d), { recursive: true });
    for (const d of ['research', 'deliverables', 'build']) writeFileSync(path.join(dir, d, '.gitkeep'), '');
    writeFileSync(path.join(dir, 'BRIEF.md'), briefMarkdown(brief, date), 'utf8');
    writeFileSync(path.join(dir, 'LOG.md'), `# ${brief.name} · log\n\nAppend-only. Written by ${hostName}'s code, never by a model.\n\n`, 'utf8');
    writeFileSync(path.join(dir, 'DECISIONS.md'), `# ${brief.name} · decisions\n\nWhat he decided and why, in his words where he gave them.\n\n`, 'utf8');
    writeFileSync(path.join(dir, '.gitignore'), GITIGNORE, 'utf8');

    const files = [];
    if (withPage && host.vaultRoot) {
      const f = writeVaultPage(rec, parent);
      rec.page = f.relPath;
      rec.pageHash = f.hash;
      files.push(f);
    }
    save(rec);
    writeFileSync(path.join(dir, '.nova', 'project.json'), JSON.stringify(rec, null, 2));
    appendLog(rec, `project created from the brief of ${date} (${brief.kind}, ${brief.phases.length} phase${brief.phases.length === 1 ? '' : 's'})`, { action: 'create' });
    let commit = null;
    try {
      git(dir, ['init', '-q']);
      git(dir, ['add', '-A']);
      git(dir, ['commit', '-q', '-m', `chore: project created by ${hostName} from the brief of ${date}`]);
      commit = git(dir, ['rev-parse', 'HEAD']).trim();
    } catch (e) {
      appendLog(rec, `git init FAILED: ${String(e.message).split('\n')[0]}`, { action: 'git' });
    }
    rec.commit = commit;
    save(rec);
    return { project: rec, files };
  }

  function updateProject(p, patch) {
    const rec = resolve(p);
    const allowed = ['dryRun', 'allowances', 'quiet', 'modelOverride', 'limit', 'phases', 'stage'];
    const next = { ...rec };
    for (const k of allowed) if (k in (patch || {})) next[k] = patch[k];
    next.updatedAt = now().toISOString();
    save(next);
    try { writeFileSync(path.join(next.folder, '.nova', 'project.json'), JSON.stringify(next, null, 2)); } catch { /* the mirror is a convenience */ }
    return next;
  }

  // validated settings, for the settings route and the settings card
  function cleanSettings(patch) {
    const out = {};
    const errors = [];
    if (!patch || typeof patch !== 'object') return { ok: false, errors: ['no settings'] };
    if ('dryRun' in patch) {
      if (typeof patch.dryRun !== 'boolean') errors.push('dryRun');
      else out.dryRun = patch.dryRun;
    }
    if ('allowances' in patch) {
      if (!patch.allowances || typeof patch.allowances !== 'object') errors.push('allowances');
      else {
        out.allowances = {};
        for (const k of ALLOWANCES) if (k in patch.allowances) {
          if (typeof patch.allowances[k] !== 'boolean') errors.push(`allowances.${k}`);
          else out.allowances[k] = patch.allowances[k];
        }
      }
    }
    if ('quiet' in patch) {
      const q = patch.quiet;
      if (!q || !HHMM.test(q.from) || !HHMM.test(q.to)) errors.push('quiet (HH:MM to HH:MM)');
      else out.quiet = { from: q.from, to: q.to };
    }
    if ('modelOverride' in patch) {
      const m = patch.modelOverride;
      if (m === null || m === '') out.modelOverride = null;
      else if (typeof m === 'string' && /^(opus|sonnet|haiku|claude-[a-z0-9.-]{1,60})$/.test(m)) out.modelOverride = m;
      else errors.push('modelOverride');
    }
    if ('limit' in patch) {
      const l = patch.limit || {};
      const ok = (v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
      if (!ok(l.discussAbove ?? null) || !ok(l.agreed ?? null)) errors.push('limit');
      else out.limit = { discussAbove: l.discussAbove ?? null, agreed: l.agreed ?? null };
    }
    return errors.length ? { ok: false, errors } : { ok: true, settings: out, errors: [] };
  }

  function applySettings(p, patch) {
    const rec = resolve(p);
    const c = cleanSettings(patch);
    if (!c.ok) throw refuse(`bad settings: ${c.errors.join(', ')}`, 'settings');
    const merged = { ...c.settings };
    if (merged.allowances) merged.allowances = { ...rec.allowances, ...merged.allowances };
    const before = {};
    for (const k of Object.keys(merged)) before[k] = rec[k];
    const next = updateProject(rec, merged);
    appendLog(next, `settings changed: ${Object.keys(merged).join(', ')}`, { action: 'settings', dryRun: rec.dryRun });
    return { project: next, before };
  }

  // A PROPOSAL, never a move. The caller files it as a card.
  function proposeStage(p, to, reason = '') {
    const rec = typeof p === 'string' ? getProject(p) : p;
    if (!rec) return { ok: false, error: 'no such project' };
    if (rec.linked) return { ok: false, error: 'a linked project has no stages Nova can move' };
    if (!STAGES.includes(to)) return { ok: false, error: `unknown stage "${to}"` };
    if (!(MOVES[rec.stage] || []).includes(to)) return { ok: false, error: `${rec.stage} cannot move to ${to}` };
    return { ok: true, id: rec.id, from: rec.stage, to, reason: String(reason || '').slice(0, 300) };
  }

  // the page's own frontmatter, rewritten only while it is still ours
  function touchPage(rec, fields) {
    if (!rec.page || !host.vaultRoot) return rec;
    const full = vaultFull(rec.page);
    if (!existsSync(full)) return rec;
    const cur = readFileSync(full, 'utf8');
    if (sha(cur) !== rec.pageHash) return rec; // he has edited it: leave it alone
    let next = cur;
    for (const [k, v] of Object.entries(fields)) {
      const re = new RegExp(`^${k}: .*$`, 'm');
      next = re.test(next) ? next.replace(re, `${k}: ${v}`) : next.replace(/^---\n/, `---\n${k}: ${v}\n`);
    }
    writeFileSync(full, next, 'utf8');
    return { ...rec, pageHash: sha(next) };
  }

  function applyStage(p, to) {
    const rec = resolve(p);
    const prop = proposeStage(rec, to);
    if (!prop.ok) throw refuse(prop.error, 'stage');
    if (to === 'archived') return archiveProject(rec);
    let next = updateProject(rec, { stage: to });
    next = save(touchPage(next, { stage: to }));
    appendLog(next, `stage ${prop.from} → ${to}`, { action: 'stage' });
    return { project: next, from: prop.from };
  }

  function archiveProject(p) {
    const rec = resolve(p);
    if (rec.stage === 'archived') return { project: rec, from: 'archived' };
    const from = rec.stage;
    appendLog(rec, `archived (was ${from})`, { action: 'stage' });
    const root = ensureRoot();
    const archive = path.join(root, '.archive');
    mkdirSync(archive, { recursive: true });
    let dest = path.join(archive, rec.parent ? `${getProject(rec.parent)?.slug || 'parent'}--${rec.slug}` : rec.slug);
    if (existsSync(dest)) dest = `${dest}-${Date.now()}`;
    if (existsSync(rec.folder)) renameSync(rec.folder, dest);
    let next = { ...rec, stage: 'archived', folder: dest, archivedFrom: rec.folder, updatedAt: now().toISOString() };
    next = touchPage(next, { stage: 'archived', status: 'archived' });
    save(next);
    return { project: next, from };
  }

  /**
   * Undo a create. The folder goes to .undone (never deleted); the vault page
   * goes only if its hash is the one we wrote, and its empty Sources/Raw with
   * it. Returns a sentence saying what happened.
   */
  function undoCreate(p, { files = [] } = {}) {
    const rec = resolve(p);
    const said = [];
    const root = ensureRoot();
    const undone = path.join(root, '.undone');
    if (existsSync(rec.folder)) {
      mkdirSync(undone, { recursive: true });
      const dest = path.join(undone, `${rec.slug}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
      renameSync(rec.folder, dest);
      said.push(`moved the folder to ${path.relative(root, dest)}`);
    } else said.push('the folder was already gone');
    const page = rec.page || files[0]?.relPath;
    if (page && host.vaultRoot) {
      const full = vaultFull(page);
      const want = rec.pageHash || files.find((f) => f.relPath === page)?.hash;
      if (!existsSync(full)) said.push('the page was already gone');
      else if (sha(readFileSync(full, 'utf8')) !== want) said.push(`kept ${page}: it was edited after it was made`);
      else {
        unlinkSync(full);
        const dir = path.dirname(full);
        for (const d of ['Sources', 'Raw']) {
          const sub = path.join(dir, d);
          try { if (!readdirSync(sub).length) rmdirSync(sub); } catch { /* not there */ }
        }
        try { if (!readdirSync(dir).length) rmdirSync(dir); } catch { /* not empty */ }
        said.push(`removed ${page}`);
      }
    }
    save({ ...rec, status: 'undone', undoneAt: now().toISOString(), updatedAt: now().toISOString() });
    return said.join('; ');
  }

  // a read-only listing of the folder, for the project page
  function folderListing(p, { depth = 2, max = 200 } = {}) {
    const rec = typeof p === 'string' ? getProject(p) : p;
    if (!rec?.folder || !existsSync(rec.folder)) return [];
    const out = [];
    const walk = (dir, rel, d) => {
      let names = [];
      try { names = readdirSync(dir).sort(); } catch { return; }
      for (const n of names) {
        if (out.length >= max) return;
        if (n === '.git' || n === '.nova' || n === '.gitkeep' || n === 'node_modules' || n === '.DS_Store') continue;
        const full = path.join(dir, n);
        let st;
        try { st = statSync(full); } catch { continue; }
        const r = rel ? `${rel}/${n}` : n;
        out.push({ path: r, dir: st.isDirectory(), size: st.isDirectory() ? null : st.size });
        if (st.isDirectory() && d < depth) walk(full, r, d + 1);
      }
    };
    walk(rec.folder, '', 1);
    return out;
  }

  function readPage(p) {
    const rec = typeof p === 'string' ? getProject(p) : p;
    if (!rec?.page || !host.vaultRoot) return null;
    try { return readFileSync(vaultFull(rec.page), 'utf8'); } catch { return null; }
  }

  function readLog(p) {
    const rec = typeof p === 'string' ? getProject(p) : p;
    if (!rec?.folder) return '';
    try { return readFileSync(path.join(rec.folder, 'LOG.md'), 'utf8'); } catch { return ''; }
  }

  return {
    host: hostName,
    getProject, listProjects, createProject, updateProject, applySettings, cleanSettings,
    proposeStage, applyStage, archiveProject, undoCreate, appendLog, cleanActions,
    writeVaultPage, defaultDryRun, folderListing, readPage, readLog,
  };
}
