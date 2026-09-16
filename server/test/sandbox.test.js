// THE WALL AROUND THE BUILDER'S SHELL.
//
// These tests do not check that the profile SAYS the right thing — a profile
// with a typo'd path says the right thing and matches nothing, which fails
// open and is invisible. They run real commands behind the real wall and check
// the filesystem afterwards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { profileFor, sandboxed, sandboxAvailable, writablePaths, tmpFor, SANDBOX_BIN } from '../lib/sandbox.js';

const mac = sandboxAvailable();

// Run a shell command behind the wall. Returns whether it succeeded.
function behindWall(projectDir, command) {
  try {
    execFileSync(SANDBOX_BIN, ['-p', profileFor(projectDir), '/bin/sh', '-c', command], { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

test('a quote in a path cannot end the rule early', () => {
  // seatbelt profiles are s-expressions; an unescaped " would close the string
  // and change what the following characters mean
  const p = profileFor('/tmp/od"d (subpath "/")');
  assert.ok(p.includes('\\"'), 'the quote is escaped, not passed through');
  assert.ok(!/\(subpath "\/"\)\s*$/m.test(p), 'and cannot have opened a rule of its own');
});

test('the writable set stays two lines long', () => {
  const paths = writablePaths('/tmp/whatever');
  assert.equal(paths.length, 2, 'every added path is a hole — a third needs a reason');
  assert.ok(paths.some((p) => p.includes('.npm')), 'npm needs its cache or every install is cold');
  // the per-user temp tree is NOT one of them: the first draft allowed
  // os.tmpdir() wholesale, which every build and every other process shares
  assert.ok(!paths.some((p) => p.includes('var/folders') || p === realpathSync(tmpdir())), 'temp goes inside the project');
  assert.equal(tmpFor('/tmp/whatever'), '/tmp/whatever/.nova-tmp');
});

// The wall tests above build the profile themselves. This one goes through
// sandboxed() — the function the Builder actually calls — and spawns the child
// the way builder.js spawns it, so the wiring is tested and not just the rule.
test('the wall holds through the call the Builder actually makes', { skip: !mac && 'seatbelt is macOS only' }, () => {
  const proj = mkdtempSync(path.join(homedir(), '.nova-wall-wire-'));
  const probe = path.join(homedir(), '.nova-wire-escape');
  try {
    const run = sandboxed('/bin/sh', ['-c', `touch ${JSON.stringify(probe)}`], proj);
    assert.equal(run.cmd, SANDBOX_BIN);
    assert.deepEqual(run.args.slice(2, 4), ['/bin/sh', '-c'], 'the command rides after the profile, unchanged');
    assert.ok(run.env.TMPDIR.startsWith(proj), 'and temp is redirected inside the wall');
    assert.ok(existsSync(run.env.TMPDIR), 'which exists by the time the child needs it');
    const r = spawnSync(run.cmd, run.args, { env: run.env, cwd: proj });
    assert.notEqual(r.status, 0, 'the escape fails');
    assert.ok(!existsSync(probe), 'and nothing is written outside');
  } finally { rmSync(proj, { recursive: true, force: true }); rmSync(probe, { force: true }); }
});

test('the wall holds where it matters', { skip: !mac && 'seatbelt is macOS only' }, () => {
  // NOT under tmpdir: a fixture inside a writable path proves nothing. This is
  // the geometry of the real thing — sibling projects under a shared root.
  const root = mkdtempSync(path.join(homedir(), '.nova-wall-'));
  const proj = path.join(root, 'the-project');
  const sibling = path.join(root, 'another-project');
  execFileSync('/bin/mkdir', ['-p', proj, sibling]);
  writeFileSync(path.join(sibling, 'theirs.txt'), 'not yours');
  const home = homedir();
  const probe = path.join(home, '.nova-wall-test-probe');
  try {
    // it can work
    assert.ok(behindWall(proj, `echo x > ${JSON.stringify(path.join(proj, 'mine.txt'))}`), 'its own folder');
    assert.ok(existsSync(path.join(proj, 'mine.txt')));
    assert.ok(behindWall(proj, `mkdir -p ${JSON.stringify(path.join(proj, 'src/lib'))}`), 'and subfolders of it');
    // and it cannot escape — each of these is a real thing a shell could do
    assert.ok(!behindWall(proj, `touch ${JSON.stringify(probe)}`), 'his home directory');
    assert.ok(!existsSync(probe));
    assert.ok(!behindWall(proj, `echo x > ${JSON.stringify(path.join(sibling, 'theirs.txt'))}`), "another project's files");
    assert.equal(behindWall(proj, `rm -rf ${JSON.stringify(sibling)}`), false, 'deleting a sibling project');
    assert.ok(existsSync(path.join(sibling, 'theirs.txt')), 'which is still there');
    assert.ok(!behindWall(proj, `touch ${JSON.stringify(path.join(home, 'Library/LaunchAgents/nova-wall-test.plist'))}`),
      'and it cannot make itself permanent');
    // reading is not what is being contained — a builder has to read to build
    assert.ok(behindWall(proj, `cat ${JSON.stringify(path.join(sibling, 'theirs.txt'))} > /dev/null`), 'reads still work');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(probe, { force: true });
  }
});

test('a toolchain still works behind it', { skip: !mac && 'seatbelt is macOS only' }, () => {
  const proj = mkdtempSync(path.join(homedir(), '.nova-wall-node-'));
  try {
    // node writing into its own project, which is what a build does all day
    assert.ok(behindWall(proj, `cd ${JSON.stringify(proj)} && node -e "require('fs').writeFileSync('out.json','{}')"`));
    assert.ok(existsSync(path.join(proj, 'out.json')));
    // ...and the same node cannot step outside, however it is asked to
    assert.ok(!behindWall(proj, `node -e "require('fs').writeFileSync(process.env.HOME+'/.nova-node-escape','x')"`),
      'an npm postinstall script hits the same wall');
  } finally { rmSync(proj, { recursive: true, force: true }); }
});
