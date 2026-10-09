// THE CODE SCREEN'S ACTIONS ARE REAL (his words, 10 Oct 2026: "ensure that
// committing etc are all actually functional and confirm it's not just for
// show"). Every write the screen offers runs here against a TEMPORARY git
// repository made with mkdtemp, through the library and through the real
// Express router, and the result is read back from git itself. His real
// repositories and the live server are never touched: NOVA_DATA_DIR is a temp
// dir set before any import, and the claude CLI is a stub script.
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-code-actions-data-'));

// The CLI stub. In conversational mode (--input-format stream-json) it
// answers each stdin message the way the real CLI does: a tool call that
// writes a file, a text delta, then a result. In one-shot mode (the Breaker)
// it prints a JSON envelope and exits.
const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-code-actions-cli-'));
const stubBin = path.join(stubDir, 'claude');
writeFileSync(stubBin, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const say = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
if (!args.includes('--input-format')) {
  process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: 'Two things.\\n1. An empty value still clears.\\n2. Undo is lost on close.' }));
  process.exit(0);
}
const rl = require('node:readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line).message.content[0].text;
  const file = path.join(process.cwd(), 'built.txt');
  fs.writeFileSync(file, 'made by the stub\\n');
  say({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: file, content: 'made by the stub' } }] } });
  say({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Done: ' } } });
  say({ type: 'result', is_error: false, result: 'Done: ' + msg });
});
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;

const { test, after } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const lib = await import('../lib/codeChanges.js');
const { claudeCodeRouter } = await import('../routes/claudeCode.js');
const { _dropAllWarm } = await import('../lib/claudeCode.js');
const express = (await import('express')).default;

after(() => _dropAllWarm());

const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
function makeRepo() {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'nova-code-repo-')));
  g(dir, 'init', '-q', '-b', 'main');
  g(dir, 'config', 'user.email', 'test@example.invalid');
  g(dir, 'config', 'user.name', 'Nova test');
  g(dir, 'config', 'commit.gpgsign', 'false');
  writeFileSync(path.join(dir, 'a.txt'), 'one\n');
  writeFileSync(path.join(dir, 'd.txt'), 'four\n');
  writeFileSync(path.join(dir, 'e.txt'), 'five\n');
  mkdirSync(path.join(dir, 'src'));
  writeFileSync(path.join(dir, 'src', 'keep.js'), 'export const k = 1;\n');
  g(dir, 'add', '-A');
  g(dir, 'commit', '-q', '-m', 'the start');
  return dir;
}
const head = (dir) => g(dir, 'rev-parse', 'HEAD').trim();
const status = (dir) => g(dir, 'status', '--porcelain=v1', '-uall');
const inCommit = (dir, ref = 'HEAD') => g(dir, 'diff-tree', '--no-commit-id', '--name-only', '-r', ref).split('\n').filter(Boolean).sort();
function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      if (n === '.git') continue;
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) walk(p); else out[path.relative(dir, p)] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}
// a working tree with every kind of change: modified, untracked, staged by
// someone else, deleted
function dirty(dir) {
  writeFileSync(path.join(dir, 'a.txt'), 'one\nmore\n');
  writeFileSync(path.join(dir, 'b.txt'), 'brand new\n');
  writeFileSync(path.join(dir, 'c.txt'), 'untracked, not ticked\n');
  writeFileSync(path.join(dir, 'd.txt'), 'four, changed, not ticked\n');
  writeFileSync(path.join(dir, 'e.txt'), 'five, staged by another session\n');
  g(dir, 'add', 'e.txt');
}

test('commit takes ONLY the ticked files: untracked and unticked files stay uncommitted, another session\'s staged file stays staged', async () => {
  const dir = makeRepo();
  dirty(dir);
  const before = head(dir);
  const r = await lib.commitChanges('repo', null, 'Take only what was ticked', { repoRoot: dir, paths: ['a.txt', 'b.txt'] });
  assert.equal(r.files, 2);
  assert.deepEqual(inCommit(dir), ['a.txt', 'b.txt']);
  assert.equal(g(dir, 'rev-parse', 'HEAD~1').trim(), before);
  const st = status(dir);
  assert.match(st, /^\?\? c\.txt$/m, 'the untracked file he did not tick is still untracked');
  assert.match(st, /^ M d\.txt$/m, 'the modified file he did not tick is still modified');
  assert.match(st, /^M  e\.txt$/m, 'another session\'s staged file is still staged, not committed');
  assert.doesNotMatch(st, /a\.txt|b\.txt/);
  assert.equal(g(dir, 'log', '-1', '--format=%s').trim(), 'Take only what was ticked');
  assert.deepEqual([...r.leftOut].sort(), ['c.txt', 'd.txt', 'e.txt']);
});

test('a path outside the workspace, inside .git, unchanged, or not text is refused before git is touched', async () => {
  const dir = makeRepo();
  dirty(dir);
  const before = head(dir);
  const st = status(dir);
  const bad = [['../outside.txt'], ['/etc/passwd'], ['.git/config'], ['src/../../x.txt'], ['a.txt\0b'], [42], ['src/keep.js'], [], 'a.txt'];
  for (const paths of bad) {
    await assert.rejects(
      lib.commitChanges('repo', null, 'This must not land', { repoRoot: dir, paths }),
      (e) => ['path', 'paths'].includes(e.code),
      `refused: ${JSON.stringify(paths)}`,
    );
  }
  await assert.rejects(lib.shelveChanges('repo', null, { repoRoot: dir, paths: ['../../etc/hosts'] }), (e) => e.code === 'path');
  assert.equal(head(dir), before, 'nothing was committed');
  assert.equal(status(dir), st, 'the working tree did not move');
});

test('the 8-character message rule is the server\'s own, whitespace does not count', async () => {
  const dir = makeRepo();
  dirty(dir);
  const before = head(dir);
  for (const m of ['', 'short', '   seven  ', '1234567', null]) {
    await assert.rejects(lib.commitChanges('repo', null, m, { repoRoot: dir, paths: ['a.txt'] }), (e) => e.code === 'message', `refused: ${JSON.stringify(m)}`);
  }
  assert.equal(head(dir), before);
  const ok = await lib.commitChanges('repo', null, '  12345678  ', { repoRoot: dir, paths: ['a.txt'] });
  assert.equal(ok.message, '12345678');
});

test('the vault is read-only: commit, shelve, restore and undo all refuse it', async () => {
  const vault = makeRepo();
  dirty(vault);
  const before = head(vault);
  await assert.rejects(lib.commitChanges('vault', vault, 'Never commit his notes', { repoRoot: vault, paths: ['a.txt'] }), (e) => e.code === 'readonly');
  await assert.rejects(lib.shelveChanges('vault', vault, { repoRoot: vault, paths: ['a.txt'] }), (e) => e.code === 'readonly');
  await assert.rejects(lib.unshelveLatest('vault', vault, { repoRoot: vault }), (e) => e.code === 'readonly');
  await assert.rejects(lib.undoCommit('vault', vault, { repoRoot: vault, sha: before }), (e) => e.code === 'readonly');
  const sum = await lib.changeSummary('vault', vault, { repoRoot: vault });
  assert.equal(sum.readOnly, true);
  assert.equal(head(vault), before);
});

test('Undo takes back an unpushed HEAD Nova made, and the files are exactly as they were', async () => {
  const dir = makeRepo();
  dirty(dir);
  const before = head(dir);
  const st = status(dir);
  const snap = snapshot(dir);
  const r = await lib.commitChanges('repo', null, 'A commit to take back', { repoRoot: dir, paths: ['a.txt', 'b.txt'] });
  const listed = await lib.listCommits('repo', null, { repoRoot: dir });
  assert.equal(listed.commits[0].canUndo, true);
  const u = await lib.undoCommit('repo', null, { repoRoot: dir, sha: r.fullSha });
  assert.equal(u.undone, true);
  assert.equal(head(dir), before, 'HEAD is back on the commit before');
  assert.equal(status(dir), st, 'every file is back in its exact state: modified, untracked, staged');
  assert.deepEqual(snapshot(dir), snap, 'no file content moved');
  await assert.rejects(lib.undoCommit('repo', null, { repoRoot: dir, sha: r.fullSha }), (e) => e.code === 'undone', 'twice is refused');
  const after = await lib.listCommits('repo', null, { repoRoot: dir });
  assert.equal(after.commits[0].canUndo, false);
});

test('Undo refuses a commit Nova did not make, one with a commit on top, and one already pushed', async () => {
  const dir = makeRepo();
  // made by hand, not by Nova
  writeFileSync(path.join(dir, 'a.txt'), 'by hand\n');
  g(dir, 'commit', '-q', '-am', 'his own commit');
  await assert.rejects(lib.undoCommit('repo', null, { repoRoot: dir, sha: head(dir) }), (e) => e.code === 'notmine');

  // Nova's, then another commit on top
  writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  const r1 = await lib.commitChanges('repo', null, 'Nova made this one', { repoRoot: dir, paths: ['b.txt'] });
  writeFileSync(path.join(dir, 'd.txt'), 'later\n');
  g(dir, 'commit', '-q', '-am', 'a newer commit on top');
  const top = head(dir);
  await assert.rejects(lib.undoCommit('repo', null, { repoRoot: dir, sha: r1.fullSha }), (e) => e.code === 'nothead');
  assert.equal(head(dir), top, 'nothing moved');

  // Nova's, pushed to a remote
  const remote = realpathSync(mkdtempSync(path.join(tmpdir(), 'nova-code-remote-')));
  g(remote, 'init', '-q', '--bare');
  g(dir, 'remote', 'add', 'origin', remote);
  writeFileSync(path.join(dir, 'c.txt'), 'c\n');
  const r2 = await lib.commitChanges('repo', null, 'Nova made and pushed', { repoRoot: dir, paths: ['c.txt'] });
  g(dir, 'push', '-q', 'origin', 'main');
  await assert.rejects(lib.undoCommit('repo', null, { repoRoot: dir, sha: r2.fullSha }), (e) => e.code === 'pushed');
  assert.equal(head(dir), r2.fullSha);
  const listed = await lib.listCommits('repo', null, { repoRoot: dir });
  assert.equal(listed.commits.find((c) => c.sha === r2.fullSha).pushed, true);
  // a short or malformed id is refused
  await assert.rejects(lib.undoCommit('repo', null, { repoRoot: dir, sha: r2.sha }), (e) => e.code === 'sha');
});

test('Shelve and Restore round-trip the working tree exactly, by sha, through another stash on top', async () => {
  const dir = makeRepo();
  dirty(dir);
  g(dir, 'reset', '-q'); // nothing staged: the shelf holds working-tree changes
  const st = status(dir);
  const snap = snapshot(dir);
  const all = st.split('\n').filter(Boolean).map((l) => l.slice(3));
  const s = await lib.shelveChanges('repo', null, { repoRoot: dir, paths: all });
  assert.match(s.sha, /^[0-9a-f]{40}$/);
  assert.equal(status(dir), '', 'every ticked change is set aside');
  // someone else stashes on top meanwhile (the stack is shared)
  writeFileSync(path.join(dir, 'a.txt'), 'someone else\n');
  g(dir, 'stash', 'push', '-q', '-m', 'not nova');
  await assert.rejects(lib.unshelveLatest('repo', null, { repoRoot: dir }), (e) => e.code === 'notmine', 'the newest stash is not Nova\'s');
  const r = await lib.unshelveLatest('repo', null, { repoRoot: dir, sha: s.sha });
  assert.equal(r.restored, true);
  assert.equal(status(dir), st, 'the same files in the same states');
  assert.deepEqual(snapshot(dir), snap, 'byte for byte');
  assert.match(g(dir, 'stash', 'list'), /not nova/, 'the other stash is still there');
  assert.doesNotMatch(g(dir, 'stash', 'list'), /nova-shelf/, 'Nova\'s shelf was used up');
  await assert.rejects(lib.unshelveLatest('repo', null, { repoRoot: dir, sha: s.sha }), (e) => e.code === 'gone');
});

test('Shelve takes only the ticked files and leaves the rest where they are', async () => {
  const dir = makeRepo();
  dirty(dir);
  g(dir, 'reset', '-q');
  const s = await lib.shelveChanges('repo', null, { repoRoot: dir, paths: ['a.txt', 'b.txt'] });
  assert.equal(s.files, 2);
  const st = status(dir);
  assert.doesNotMatch(st, /a\.txt|b\.txt/);
  assert.match(st, /c\.txt/);
  assert.match(st, /d\.txt/);
  await lib.unshelveLatest('repo', null, { repoRoot: dir, sha: s.sha });
  assert.equal(readFileSync(path.join(dir, 'b.txt'), 'utf8'), 'brand new\n');
});

test('the review reads each file: lines, binary, untracked, and a file another session edited arrives marked', async () => {
  const dir = makeRepo();
  dirty(dir);
  writeFileSync(path.join(dir, 'pic.bin'), Buffer.from([0, 1, 2, 3, 0, 9]));
  // a fake home holding two Claude journals for this folder: the Builder's
  // own, and another session that edited d.txt after the last commit
  const home = mkdtempSync(path.join(tmpdir(), 'nova-code-home-'));
  const jdir = path.join(home, '.claude', 'projects', dir.replace(/[^A-Za-z0-9]/g, '-'));
  mkdirSync(jdir, { recursive: true });
  const builder = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const line = (file) => JSON.stringify({ type: 'assistant', timestamp: new Date(Date.now() + 1000).toISOString(), message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: path.join(dir, file) } }] } });
  writeFileSync(path.join(jdir, `${builder}.jsonl`), line('a.txt') + '\n');
  writeFileSync(path.join(jdir, `${other}.jsonl`), line('d.txt') + '\n' + JSON.stringify({ type: 'assistant', timestamp: '2001-01-01T00:00:00Z', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: path.join(dir, 'c.txt') } }] } }) + '\n');
  const sum = await lib.changeSummary('repo', null, { repoRoot: dir, sessionId: builder, home });
  const f = Object.fromEntries(sum.files.map((x) => [x.path, x]));
  assert.equal(f['a.txt'].added, 1);
  assert.equal(f['a.txt'].mine, true);
  assert.equal(f['a.txt'].other, null);
  assert.equal(f['b.txt'].untracked, true);
  assert.equal(f['b.txt'].added, 1);
  assert.deepEqual(f['d.txt'].other, { sessionId: other }, 'another session\'s journal edit marks the file');
  assert.equal(f['c.txt'].other, null, 'an edit from before the last commit does not count');
  assert.equal(f['pic.bin'].binary, true);
  assert.ok(sum.peek && sum.peek.lines.length >= 1);
  const d = await lib.fileDiff('repo', null, 'b.txt', { repoRoot: dir });
  assert.deepEqual(d.lines, ['brand new']);
  await assert.rejects(lib.fileDiff('repo', null, '../x', { repoRoot: dir }), (e) => e.code === 'path');
});

// ---------------------------------------------------------- through the router

async function serve(repoPath, vaultPath = null) {
  const app = express();
  app.use(express.json());
  app.use('/api', claudeCodeRouter({ repoPath, vaultPath }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, p, body) => {
    const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}

test('the routes: commit ticked files, refuse traversal, list, undo, shelve and restore over HTTP', async () => {
  const dir = makeRepo();
  dirty(dir);
  const { call, close } = await serve(dir);
  try {
    const before = head(dir);
    const sum = await call('GET', '/claude-code/changes?workspace=repo');
    assert.equal(sum.status, 200);
    assert.ok(sum.body.files.length >= 5);
    const bad = await call('POST', '/claude-code/commit', { workspace: 'repo', message: 'Should not land here', paths: ['../../etc/hosts'] });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'path');
    const short = await call('POST', '/claude-code/commit', { workspace: 'repo', message: 'short', paths: ['a.txt'] });
    assert.equal(short.status, 400);
    assert.equal(short.body.code, 'message');
    assert.equal(head(dir), before);
    const ok = await call('POST', '/claude-code/commit', { workspace: 'repo', message: 'Over the wire, ticked only', paths: ['b.txt'] });
    assert.equal(ok.status, 200);
    assert.deepEqual(inCommit(dir), ['b.txt']);
    const list = await call('GET', '/claude-code/commits?workspace=repo&since=0');
    assert.equal(list.body.commits[0].canUndo, true);
    const undo = await call('POST', '/claude-code/undo', { workspace: 'repo', sha: ok.body.fullSha });
    assert.equal(undo.status, 200);
    assert.equal(head(dir), before);
    g(dir, 'reset', '-q');
    const sh = await call('POST', '/claude-code/shelve', { workspace: 'repo', paths: ['a.txt', 'b.txt'] });
    assert.equal(sh.status, 200);
    assert.doesNotMatch(status(dir), /a\.txt|b\.txt/);
    const un = await call('POST', '/claude-code/unshelve', { workspace: 'repo', sha: sh.body.sha });
    assert.equal(un.status, 200);
    assert.match(status(dir), /b\.txt/);
  } finally { await close(); }
});

test('a run goes through the route to the transcript: the CLI is spawned, its words and the files it wrote come back on the job', async () => {
  const dir = makeRepo();
  const { call, close } = await serve(dir);
  try {
    const start = await call('POST', '/claude-code/message', { text: 'Make the file', workspace: 'repo', model: 'sonnet' });
    assert.equal(start.status, 200);
    let job;
    for (let i = 0; i < 200; i++) {
      job = (await call('GET', `/claude-code/message/${start.body.jobId}`)).body;
      if (job.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(job.status, 'ready', JSON.stringify(job));
    assert.equal(job.result.text, 'Done: Make the file');
    assert.match(job.result.sessionId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(job.result.files, ['built.txt']);
    assert.ok(job.result.endedAt >= job.result.startedAt);
    // the file the stub wrote is now an uncommitted change the review shows
    const sum = await call('GET', `/claude-code/changes?workspace=repo&sessionId=${job.result.sessionId}`);
    assert.ok(sum.body.files.some((f) => f.path === 'built.txt'));
    // refusals the route owns
    assert.equal((await call('POST', '/claude-code/message', { text: '', workspace: 'repo' })).status, 400);
    assert.equal((await call('POST', '/claude-code/message', { text: 'x', workspace: 'elsewhere' })).status, 400);
    assert.equal((await call('POST', '/claude-code/message', { text: 'x', workspace: 'repo', model: 'gpt-4' })).status, 400);
  } finally { await close(); }
});

test('spar sends the Breaker through the route and its findings come back on the job', async () => {
  const dir = makeRepo();
  const { call, close } = await serve(dir);
  try {
    const start = await call('POST', '/claude-code/spar', { workspace: 'repo', focus: 'the tide sheet' });
    assert.equal(start.status, 200);
    let job;
    for (let i = 0; i < 200; i++) {
      job = (await call('GET', `/claude-code/message/${start.body.jobId}`)).body;
      if (job.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(job.status, 'ready', JSON.stringify(job));
    assert.match(job.result.text, /1\. An empty value still clears/);
  } finally { await close(); }
});
