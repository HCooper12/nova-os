// THE PROJECT KERNEL: a project is a folder, a vault page and a record joined
// by one id, and every rule of the no-mistakes bar (PROJECTS-PLAN §7) is code.
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, symlinkSync, readdirSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const base = mkdtempSync(path.join(tmpdir(), 'nova-kernel-'));
process.env.NOVA_DATA_DIR = path.join(base, 'data');
process.env.NOVA_PROJECTS_DIR = path.join(base, 'projects-env');

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const { makeKernel, validateBrief, assertWritable } = await import('../lib/projectKernel.js');

let host;
function fresh() {
  rmSync(path.join(base, 'h'), { recursive: true, force: true });
  host = {
    name: 'Nova',
    projectsRoot: path.join(base, 'h', 'Projects'),
    dataDir: path.join(base, 'h', 'data'),
    vaultRoot: path.join(base, 'h', 'vault'),
  };
  mkdirSync(host.vaultRoot, { recursive: true });
  return makeKernel(host);
}

const brief = (over = {}) => ({
  name: 'Room redesign', kind: 'life', goal: 'A calmer bedroom', done: 'Furniture chosen and ordered',
  deadline: null, phases: [{ name: 'Measure', what: 'the room', first: 'tape measure' }, { name: 'Choose' }],
  reads: ['Wiki/Home.md'], allowances: { research: true }, limit: {}, firstMoves: ['find three videos'], ...over,
});

test('validateBrief: a good brief passes, trimmed, with unknown keys dropped', () => {
  const v = validateBrief({ ...brief({ name: '  Room redesign  ' }), sneaky: 'x', path: '/etc' });
  assert.equal(v.ok, true, v.errors.join());
  assert.equal(v.brief.name, 'Room redesign');
  assert.equal('sneaky' in v.brief, false);
  assert.equal('path' in v.brief, false);
  assert.equal(v.brief.allowances.research, true);
  assert.equal(v.brief.allowances.deploy, false);
});

test('validateBrief: missing phase, bad kind, .. in reads and a 200-char name are refused', () => {
  assert.match(validateBrief(brief({ phases: [] })).errors.join(), /phases/);
  assert.match(validateBrief(brief({ kind: 'party' })).errors.join(), /kind/);
  assert.match(validateBrief(brief({ reads: ['../secrets.md'] })).errors.join(), /reads/);
  assert.match(validateBrief(brief({ reads: ['/Users/x/vault/a.md'] })).errors.join(), /reads/);
  assert.match(validateBrief(brief({ reads: ['Wiki/../../x'] })).errors.join(), /reads/);
  assert.match(validateBrief(brief({ name: 'x'.repeat(200) })).errors.join(), /name/);
  assert.equal(validateBrief(null).ok, false);
});

test('create: the folder layout, the first commit, the record and the vault page', () => {
  const k = fresh();
  const { project, files } = k.createProject(brief());
  assert.match(project.id, /^[0-9a-f]{8}$/);
  assert.equal(project.slug, 'room-redesign');
  for (const f of ['BRIEF.md', 'LOG.md', 'DECISIONS.md', 'research', 'deliverables', 'build', '.nova', '.gitignore']) {
    assert.ok(existsSync(path.join(project.folder, f)), f);
  }
  const msg = execFileSync('git', ['log', '-1', '--format=%an <%ae>|%s'], { cwd: project.folder, encoding: 'utf8' }).trim();
  assert.match(msg, /^Nova <nova@local>\|chore: project created by Nova from the brief of \d{4}-\d{2}-\d{2}$/);
  assert.equal(files[0].relPath, 'Projects/Room redesign/Room redesign.md');
  const page = readFileSync(path.join(host.vaultRoot, files[0].relPath), 'utf8');
  assert.match(page, /^---\ntype: project\nid: [0-9a-f]{8}\nkind: life\nstage: planning\n/);
  assert.match(page, /cost: 0/);
  assert.ok(existsSync(path.join(host.vaultRoot, 'Projects/Room redesign/Sources')));
  assert.ok(existsSync(path.join(host.vaultRoot, 'Projects/Room redesign/Raw')));
  assert.equal(k.listProjects().length, 1);
  assert.equal(k.getProject(project.id).name, 'Room redesign');
  assert.throws(() => k.createProject(brief()), /already/);
});

test('undo: the folder goes to .undone, the unchanged page is removed, and the record says undone', () => {
  const k = fresh();
  const { project, files } = k.createProject(brief());
  const said = k.undoCreate(project.id, { files });
  assert.match(said, /\.undone/);
  assert.equal(existsSync(project.folder), false);
  assert.equal(readdirSync(path.join(host.projectsRoot, '.undone')).length, 1);
  assert.equal(existsSync(path.join(host.vaultRoot, files[0].relPath)), false);
  assert.equal(k.listProjects().length, 0);
  assert.equal(k.getProject(project.id).status, 'undone');
});

test('undo keeps a page he edited', () => {
  const k = fresh();
  const { project, files } = k.createProject(brief());
  appendFileSync(path.join(host.vaultRoot, files[0].relPath), '\nmy own note\n');
  const said = k.undoCreate(project.id, { files });
  assert.match(said, /kept/);
  assert.ok(existsSync(path.join(host.vaultRoot, files[0].relPath)));
});

test('archive moves the folder to .archive and the stage to archived', () => {
  const k = fresh();
  const { project } = k.createProject(brief());
  const { project: a } = k.archiveProject(project.id);
  assert.equal(a.stage, 'archived');
  assert.ok(existsSync(path.join(host.projectsRoot, '.archive', 'room-redesign')));
  assert.equal(existsSync(project.folder), false);
  assert.match(readFileSync(path.join(host.vaultRoot, a.page), 'utf8'), /stage: archived/);
});

test('stages are proposed, never applied by a proposal', () => {
  const k = fresh();
  const { project } = k.createProject(brief());
  const p = k.proposeStage(project.id, 'active');
  assert.equal(p.ok, true);
  assert.equal(k.getProject(project.id).stage, 'planning');
  assert.equal(k.proposeStage(project.id, 'done').ok, false);
  assert.equal(k.proposeStage(project.id, 'flying').ok, false);
  k.applyStage(project.id, 'active');
  assert.equal(k.getProject(project.id).stage, 'active');
});

test('containment: a slug with .. stays inside, a symlink out is refused', () => {
  const k = fresh();
  const { project } = k.createProject(brief({ name: '../../escape' }));
  assert.ok(project.folder.startsWith(path.join(host.projectsRoot) + path.sep) || project.folder.includes(`${path.sep}Projects${path.sep}`));
  assert.ok(!project.folder.includes('..'));
  const outside = mkdtempSync(path.join(tmpdir(), 'nova-out-'));
  try { symlinkSync(outside, path.join(host.projectsRoot, 'hatch')); } catch { return; }
  assert.throws(() => k.createProject(brief({ name: 'hatch' })), /outside|already/);
  assert.equal(readdirSync(outside).length, 0);
});

test('a linked project is refused by every writer', () => {
  const k = fresh();
  const linked = { id: 'atlas', name: 'Science Atlas', linked: { path: '/x' } };
  assert.throws(() => assertWritable(linked), /linked/);
  for (const [name, fn] of [
    ['updateProject', () => k.updateProject(linked, { dryRun: false })],
    ['applySettings', () => k.applySettings(linked, { dryRun: false })],
    ['applyStage', () => k.applyStage(linked, 'active')],
    ['archiveProject', () => k.archiveProject(linked)],
    ['undoCreate', () => k.undoCreate(linked)],
    ['appendLog', () => k.appendLog(linked, 'x')],
    ['writeVaultPage', () => k.writeVaultPage(linked)],
  ]) assert.throws(fn, /linked/, name);
  assert.equal(k.proposeStage(linked, 'active').ok, false);
});

test('sub-projects nest one level and no deeper', () => {
  const k = fresh();
  const { project: parent } = k.createProject(brief({ name: 'House' }));
  const { project: child, files } = k.createProject(brief({ name: 'Bedroom', parent: parent.id }));
  assert.equal(child.folder, path.join(parent.folder, 'bedroom'));
  assert.equal(files[0].relPath, 'Projects/House/Bedroom/Bedroom.md');
  assert.throws(() => k.createProject(brief({ name: 'Wardrobe', parent: child.id })), /one level/);
});

test('LOG.md is append-only', () => {
  const k = fresh();
  const { project } = k.createProject(brief());
  const before = readFileSync(path.join(project.folder, 'LOG.md'), 'utf8');
  k.appendLog(project.id, 'second line', { action: 'note' });
  k.applySettings(project.id, { quiet: { from: '23:00', to: '06:00' } });
  const after = readFileSync(path.join(project.folder, 'LOG.md'), 'utf8');
  assert.ok(after.startsWith(before));
  assert.match(after, /second line/);
  assert.match(after, /DRY RUN · settings · /);
});

test('dry-run is on for new projects until three have it lifted', () => {
  const k = fresh();
  for (const n of ['A1', 'B2', 'C3']) {
    const { project } = k.createProject(brief({ name: n }));
    assert.equal(project.dryRun, true, n);
    k.applySettings(project.id, { dryRun: false });
  }
  assert.equal(k.createProject(brief({ name: 'D4' })).project.dryRun, false);
});

test('settings are validated', () => {
  const k = fresh();
  const { project } = k.createProject(brief());
  assert.throws(() => k.applySettings(project.id, { quiet: { from: '25:00', to: '07:00' } }), /quiet/);
  assert.throws(() => k.applySettings(project.id, { modelOverride: 'rm -rf' }), /modelOverride/);
  writeFileSync(path.join(base, 'noop'), '');
});
