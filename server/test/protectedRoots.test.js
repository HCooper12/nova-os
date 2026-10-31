// HIS RULE, 1 Nov 2026: Nova never writes to Science Atlas, its Mission Control
// or Wren. By folder, at the lowest spawn sites, symlinks included.
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = mkdtempSync(path.join(tmpdir(), 'nova-protected-'));
const atlas = path.join(base, 'Atomic_Hub', 'P3_Draft3', 'Atlas_Progress_Map');
const wren = path.join(base, 'atlas-partner');
const other = path.join(base, 'somewhere-else');
for (const d of [atlas, wren, other]) mkdirSync(d, { recursive: true });
symlinkSync(atlas, path.join(base, 'link-to-atlas'));
process.env.NOVA_DATA_DIR = path.join(base, 'data');
process.env.NOVA_PROTECTED_ROOTS = [path.join(base, 'Atomic_Hub'), wren].join(':');
process.env.TELEGRAM_BOT_TOKEN = '';

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const { isProtectedPath, assertNotProtected, protectedRoots } = await import('../lib/protectedRoots.js');

test('the real Atlas, Mission Control and Wren folders are protected by default', () => {
  delete process.env.NOVA_PROTECTED_ROOTS;
  const roots = protectedRoots().join('\n');
  assert.match(roots, /Projects\/Atomic_Hub/);
  assert.match(roots, /Projects\/atlas-partner/);
  process.env.NOVA_PROTECTED_ROOTS = [path.join(base, 'Atomic_Hub'), wren].join(':');
});

test('a folder is protected when it is, or is inside, a protected root, symlinks resolved', () => {
  assert.equal(isProtectedPath(atlas), true);
  assert.equal(isProtectedPath(path.join(atlas, 'tools')), true);
  assert.equal(isProtectedPath(wren), true);
  assert.equal(isProtectedPath(path.join(base, 'link-to-atlas')), true);
  assert.equal(isProtectedPath(other), false);
  assert.equal(isProtectedPath(path.join(base, 'atlas-partner-notes')), false);
  assert.equal(isProtectedPath(''), false);
});

test('assertNotProtected throws a plain error with a code', () => {
  assert.throws(() => assertNotProtected(wren, 'start a session there'), (e) => e.code === 'protected' && /never writes/.test(e.message));
  assert.doesNotThrow(() => assertNotProtected(other));
});

test('a background session cannot be started in a protected folder', async () => {
  const { startSession } = await import('../lib/claudeSessionsLive.js');
  let ran = false;
  await assert.rejects(startSession({ cwd: atlas, text: 'hello', execFn: async () => { ran = true; return ''; } }), /never writes/);
  assert.equal(ran, false);
});

test('the Builder in a protected folder gets no Edit, no Write and no shell, whatever was asked', async () => {
  const { toolBoundaryFor } = await import('../lib/claudeCode.js');
  for (const readOnly of [false, true]) {
    const b = toolBoundaryFor(atlas, readOnly);
    assert.equal(b.locked, true);
    assert.equal(b.allowed, 'Read Grep Glob');
    for (const tool of ['Edit', 'Write', 'Bash', 'NotebookEdit']) assert.ok(b.disallowed.split(',').includes(tool), `${tool} must be blocked`);
  }
  // anywhere else keeps its lane: the Builder can edit, the vault lane cannot shell
  const free = toolBoundaryFor(other, false);
  assert.equal(free.locked, false);
  assert.ok(free.allowed.includes('Edit') && free.allowed.includes('Bash'));
  assert.ok(toolBoundaryFor(other, true).allowed.includes('Edit'), 'the vault lane is unchanged');
});

test('a project cannot be registered as a workspace inside a protected folder, nor created there', async () => {
  const { addProjectWorkspace } = await import('../lib/codeWorkspaces.js');
  await assert.rejects(addProjectWorkspace({ slug: 'x', title: 'x', path: path.join(atlas, 'build') }), /never writes/);
  const { makeKernel } = await import('../lib/projectKernel.js');
  const k = makeKernel({ name: 'T', projectsRoot: wren, dataDir: path.join(base, 'kdata'), vaultRoot: null, isProtected: isProtectedPath });
  assert.throws(() => k.createProject({ name: 'Nope', kind: 'life', goal: 'g', done: 'd', deadline: null, phases: [{ name: 'a', what: 'b', first: 'c' }], reads: [], allowances: {}, limit: {}, firstMoves: [] }), /never writes/);
});
