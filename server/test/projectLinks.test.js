// LINKED PROJECTS: Science Atlas, Wren and Nova are read about, never written.
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = mkdtempSync(path.join(tmpdir(), 'nova-links-'));
process.env.NOVA_DATA_DIR = path.join(base, 'data');
mkdirSync(process.env.NOVA_DATA_DIR, { recursive: true });
const atlasDir = path.join(base, 'atlas');
const wrenDir = path.join(base, 'wren');
mkdirSync(atlasDir); mkdirSync(wrenDir);
writeFileSync(path.join(process.env.NOVA_DATA_DIR, 'code-workspaces.json'), JSON.stringify({ workspaces: [
  { key: 'atlas', title: 'Science Atlas', path: atlasDir },
  { key: 'wren', title: 'Wren', path: wrenDir, parent: 'atlas' },
] }));

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const { linkedProjects, sessionsIn, projectCost } = await import('../lib/projectLinks.js');
const { makeKernel } = await import('../lib/projectKernel.js');

test('the linked three come from the code workspaces, Wren under Science Atlas', async () => {
  const list = await linkedProjects({ repoRoot: path.join(base, 'repo') });
  assert.deepEqual(list.map((p) => [p.id, p.name, p.parent]), [['repo', 'Nova', null], ['atlas', 'Science Atlas', null], ['wren', 'Wren', 'atlas']]);
  assert.equal(list[1].linked.path, atlasDir);
});

test('every kernel writer refuses a linked project, and nothing lands in its folder', async () => {
  const k = makeKernel({ name: 'Nova', projectsRoot: path.join(base, 'P'), dataDir: path.join(base, 'kd'), vaultRoot: path.join(base, 'v') });
  for (const p of await linkedProjects({ repoRoot: path.join(base, 'repo') })) {
    const writers = {
      updateProject: () => k.updateProject(p, { dryRun: true }),
      applySettings: () => k.applySettings(p, { dryRun: true }),
      applyStage: () => k.applyStage(p, 'paused'),
      archiveProject: () => k.archiveProject(p),
      undoCreate: () => k.undoCreate(p),
      appendLog: () => k.appendLog(p, 'x'),
      writeVaultPage: () => k.writeVaultPage(p),
    };
    for (const [n, fn] of Object.entries(writers)) assert.throws(fn, /linked/, `${p.id} ${n}`);
  }
  // a sub-project under a linked parent is refused too (record lookup fails or guard throws)
  assert.throws(() => k.createProject({ name: 'X', kind: 'build', goal: 'g', done: 'd', phases: [{ name: 'a' }], parent: 'atlas' }), /parent/);
  assert.equal(readdirSync(atlasDir).length, 0);
  assert.equal(readdirSync(wrenDir).length, 0);
});

test('sessions are matched by folder, and cost is honest about being unknown', () => {
  const picture = { groups: [{ sessions: [{ cwd: atlasDir, id: 1 }, { cwd: `${atlasDir}/sub`, id: 2 }, { cwd: `${atlasDir}-other`, id: 3 }] }] };
  assert.deepEqual(sessionsIn(picture, atlasDir).map((s) => s.id), [1, 2]);
  assert.deepEqual(projectCost('atlas', { rows: [{ usd: 1 }] }), { usd: 0, runs: 0, known: false });
  assert.deepEqual(projectCost('atlas', { rows: [{ usd: 1.234, projectId: 'atlas' }] }), { usd: 1.23, runs: 1, known: true });
});
