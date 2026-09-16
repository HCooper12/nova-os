// WHERE NOVA IS ALLOWED TO BUILD. One directory, outside the vault, that he
// chose — and a containment enforced in code rather than trusted to a prompt,
// because a path is the one thing a model can get wrong expensively.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, symlinkSync, realpathSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = mkdtempSync(path.join(tmpdir(), 'nova-projects-'));
process.env.NOVA_PROJECTS_DIR = root;
const { projectDir, projectSlug, createProjectDir, listProjects, undoProject, PROJECTS_ROOT } = await import('../lib/projects.js');

test('a name becomes a folder he can read in Finder', () => {
  assert.equal(projectSlug('Design Mockup Site'), 'design-mockup-site');
  assert.equal(projectSlug('  My   Site!! (v2) '), 'my-site-v2');
  assert.equal(projectSlug('café brûlée'), 'cafe-brulee');
  assert.equal(projectSlug(''), '');
});

test('nothing escapes the projects root — that is the whole point of it', () => {
  const realRoot = realpathSync(PROJECTS_ROOT());
  // traversal is NEUTRALISED, not thrown: the slug strips the dots and
  // separators before a path is ever built, so "../outside" becomes the
  // project "outside" — contained, which is the property that matters
  for (const bad of ['../outside', '../../etc/passwd', '/etc/passwd']) {
    const dir = projectDir(bad);
    assert.ok(dir.startsWith(realRoot + path.sep), `must stay inside the root: ${bad} → ${dir}`);
    assert.ok(!dir.includes('..'), bad);
  }
  // and a name that slugs to nothing is refused rather than landing on the root
  for (const empty of ['..', '../', './..', '///', '   ', '']) {
    assert.throws(() => projectDir(empty), /needs a name/, `must refuse: ${JSON.stringify(empty)}`);
  }
});

test('a symlink pointing out of the tree cannot be used as a project', () => {
  const outside = mkdtempSync(path.join(tmpdir(), 'nova-outside-'));
  const linkName = 'escape-hatch';
  try { symlinkSync(outside, path.join(root, linkName)); } catch { return; } // no symlink perms — skip
  assert.throws(() => projectDir(linkName), /resolves outside/);
});

test('a real name lands inside, and a second build under the same name says so', () => {
  const a = createProjectDir('Design Mockup Site');
  assert.equal(a.existed, false);
  assert.equal(path.dirname(a.dir), realpathSync(PROJECTS_ROOT()));
  assert.ok(existsSync(a.dir));
  const b = createProjectDir('Design Mockup Site');
  assert.equal(b.existed, true, 'a second build must not silently write into the first');
  assert.equal(b.dir, a.dir);
});

test('listing shows his own work, newest first, and ignores the hidden undo tray', () => {
  const p = createProjectDir('Strategy Report');
  writeFileSync(path.join(p.dir, 'index.html'), '<!doctype html>');
  mkdirSync(path.join(root, '.undone'), { recursive: true });
  const list = listProjects();
  assert.ok(list.some((x) => x.name === 'strategy-report' && x.files === 1));
  assert.ok(!list.some((x) => x.name.startsWith('.')), 'the undo tray is not a project');
});

test('undo moves a build aside — it never deletes his work', () => {
  const p = createProjectDir('Throwaway');
  writeFileSync(path.join(p.dir, 'a.txt'), 'something Nova made');
  const { moved } = undoProject('Throwaway');
  assert.ok(moved && moved.includes('.undone'), 'moved into the tray');
  assert.ok(existsSync(path.join(moved, 'a.txt')), 'and the work still exists');
  assert.ok(!existsSync(p.dir));
  assert.equal(undoProject('Throwaway').moved, null, 'undoing twice is honest, not an error');
});

// THE BUILDER — the lane that uses this directory. Its limits are the point,
// so they are pinned: no shell, its own folder, and a receipt either way.
test('the builder is offered to the planner, priced, and on the model board', async () => {
  const { CAPABILITIES, describeForPlanner } = await import('../lib/capabilities.js');
  const { modelFor, laneEnabled } = await import('../lib/modelPrefs.js');
  assert.equal(CAPABILITIES.build.delegable, true, 'the whole point is that a plan can reach it');
  assert.equal(CAPABILITIES.build.produces, 'build');
  assert.equal(CAPABILITIES.build.costUsd, 5);
  assert.match(describeForPlanner(), /^- build \(Builder\)/m);
  // modelFor THROWS on an unregistered lane — an unpinned spawn would inherit
  // the account's ambient default, which has cost him money before
  assert.equal(modelFor('build'), 'opus');
  assert.equal(laneEnabled('build'), true);
});

// THE SHELL, AND THE CONDITION ON IT. He asked for one on 16 Sep; the lane was
// built without because an allow-list around Bash is decoration. It now has a
// real shell and a real wall, and the contract is that neither ships alone.
test('the builder gets a shell only where the kernel can contain it', async () => {
  const { buildPrompt, buildInvocation, BUILD_BUDGET_USD } = await import('../lib/builder.js');
  const { sandboxAvailable, SANDBOX_BIN, TMP_SUBDIR } = await import('../lib/sandbox.js');
  assert.equal(BUILD_BUDGET_USD, 5);

  const dir = mkdtempSync(path.join(tmpdir(), 'nova-build-'));
  const run = buildInvocation('build me a landing page', 'landing-page', dir, 'haiku');
  assert.equal(run.shell, sandboxAvailable(), 'the shell follows the wall, never the other way round');

  if (run.shell) {
    // the CLI is not spawned directly — sandbox-exec is, and the CLI rides behind it
    assert.equal(run.cmd, SANDBOX_BIN);
    assert.equal(run.args[0], '-p');
    assert.match(run.args[1], /\(deny file-write\*\)/, 'the profile denies writes by default');
    assert.ok(run.args[1].includes(realpathSync(dir)), 'and re-allows exactly this project');
    assert.ok(run.args.includes('Read,Write,Edit,Glob,Grep,Bash'), 'Bash is allowed to the CLI');
    assert.ok(run.env.TMPDIR.endsWith(TMP_SUBDIR), 'temp is redirected inside the wall');
    assert.ok(run.env.TMPDIR.startsWith(dir), 'which is inside this project');
  } else {
    assert.ok(run.args.includes('Read,Write,Edit,Glob,Grep'), 'no wall, no shell');
    assert.ok(!run.args.some((a) => String(a).includes('Bash')));
  }

  const withShell = buildPrompt('build me a landing page', 'landing-page', { shell: true });
  assert.match(withShell, /run the tests, and FIX WHAT THEY TELL YOU/);
  assert.match(withShell, /enforced by the\s+operating system/, 'a refused write is expected, not a puzzle to solve');
  const without = buildPrompt('build me a landing page', 'landing-page');
  assert.match(without, /NO shell on this machine/);
  for (const p of [withShell, without]) {
    assert.match(p, /Everything you\s+make goes in here/);
    assert.match(p, /anything you could not do or had to assume/, 'it must say what it could not do');
  }
});

test('a build is undoable, and every record kind it files is visible to the fleet', async () => {
  const { KIND_AGENT } = await import('../lib/fleetContext.js');
  assert.equal(KIND_AGENT.build, 'Builder');
  const inbox = readFileSync(new URL('../lib/inbox.js', import.meta.url), 'utf8');
  assert.match(inbox, /undo\.route === 'build'/, 'undo has a route');
  const src = readFileSync(new URL('../lib/builder.js', import.meta.url), 'utf8');
  assert.match(src, /undoData: \{ route: 'build', slug \}/);
  assert.match(src, /A build always leaves a receipt, finished or not/, 'a failed build he walked away from still reports');
});
