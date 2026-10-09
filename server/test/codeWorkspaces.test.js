// SCIENCE ATLAS AND WREN ARE WORKSPACES, AND A COMMIT RIDES THE RAILS (his
// calls 1 and 3, 10 Oct 2026). Everything here runs against TEMPORARY git
// repositories made with mkdtemp, named in a temporary data folder's
// code-workspaces.json. His real Atlas_Progress_Map and atlas-partner are
// never touched: NOVA_DATA_DIR is set before any import, and the config the
// server would seed at boot is never written here.
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, realpathSync, chmodSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DATA = mkdtempSync(path.join(tmpdir(), 'nova-code-ws-data-'));
process.env.NOVA_DATA_DIR = DATA;

// the CLI stub: one conversational turn writes built.txt in its cwd
const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-code-ws-cli-'));
const stubBin = path.join(stubDir, 'claude');
writeFileSync(stubBin, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const say = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
const rl = require('node:readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  const file = path.join(process.cwd(), 'built.txt');
  fs.writeFileSync(file, 'made by the stub\\n');
  say({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: file, content: 'x' } }] } });
  say({ type: 'result', is_error: false, result: 'Done in ' + path.basename(process.cwd()) });
});
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;

const { test, after } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const lib = await import('../lib/codeChanges.js');
const ws = await import('../lib/codeWorkspaces.js');
const inbox = await import('../lib/inbox.js');
const { listRecords } = await import('../lib/inboxStore.js');
const { claudeCodeRouter } = await import('../routes/claudeCode.js');
const { _dropAllWarm } = await import('../lib/claudeCode.js');
const express = (await import('express')).default;

after(() => _dropAllWarm());

const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  g(dir, 'init', '-q', '-b', 'main');
  g(dir, 'config', 'user.email', 'test@example.invalid');
  g(dir, 'config', 'user.name', 'Nova test');
  g(dir, 'config', 'commit.gpgsign', 'false');
  writeFileSync(path.join(dir, 'a.txt'), 'one\n');
  writeFileSync(path.join(dir, 'other.txt'), 'theirs\n');
  g(dir, 'add', '-A');
  g(dir, 'commit', '-q', '-m', 'the start');
  return dir;
}
const head = (dir) => g(dir, 'rev-parse', 'HEAD').trim();
const status = (dir) => g(dir, 'status', '--porcelain=v1', '-uall');
const inCommit = (dir, ref = 'HEAD') => g(dir, 'diff-tree', '--no-commit-id', '--name-only', '-r', ref).split('\n').filter(Boolean).sort();

// The layout his Mac has: Science Atlas is a repo one level BELOW the folder
// its sessions run in (P3_Draft3), and Wren is a repo of its own.
const ROOT = realpathSync(mkdtempSync(path.join(tmpdir(), 'nova-code-ws-')));
const P3 = path.join(ROOT, 'Atomic_Hub', 'P3_Draft3');
const ATLAS = initRepo(path.join(P3, 'Atlas_Progress_Map'));
const WREN = initRepo(path.join(ROOT, 'atlas-partner'));
const NOVA = initRepo(path.join(ROOT, 'nova-os'));
// a folder INSIDE a repo, which must never be a workspace
mkdirSync(path.join(WREN, 'lib'), { recursive: true });
writeFileSync(path.join(DATA, 'code-workspaces.json'), JSON.stringify({
  workspaces: [
    { key: 'atlas', title: 'Science Atlas', path: ATLAS },
    { key: 'wren', title: 'Wren', path: WREN, parent: 'atlas' },
    { key: 'inner', title: 'Inside Wren', path: path.join(WREN, 'lib') },
    { key: 'repo', title: 'Not allowed', path: ATLAS },
    { key: 'Bad Key', title: 'Not allowed', path: ATLAS },
    { key: 'rel', title: 'Not allowed', path: 'relative/folder' },
  ],
}));

test('the config names Science Atlas and Wren, nests Wren, and drops entries that are not usable', async () => {
  const list = await ws.readWorkspaces();
  assert.deepEqual(list.map((w) => w.key), ['atlas', 'wren', 'inner']);
  assert.equal(list.find((w) => w.key === 'wren').parent, 'atlas');
  const all = await ws.listWorkspaces({ vaultPath: '/nowhere' });
  assert.deepEqual(all.map((w) => w.key), ['repo', 'vault', 'atlas', 'wren', 'inner']);
  assert.equal(all.find((w) => w.key === 'vault').readOnly, true);
  await assert.rejects(ws.resolveWorkspace('elsewhere', {}), (e) => e.code === 'workspace');
  await assert.rejects(ws.resolveWorkspace('../atlas', {}), (e) => e.code === 'workspace');
  // the boot seed never overwrites a file that is there
  assert.deepEqual(await ws.seedWorkspaces([{ key: 'x', path: '/x' }]), { seeded: false });
  assert.equal((await ws.readWorkspaces()).length, 3);
});

test('a commit in Science Atlas takes only his ticked files; another session\'s file, edited from the folder above, arrives unticked and stays', async () => {
  writeFileSync(path.join(ATLAS, 'a.txt'), 'one\nhis change\n');
  writeFileSync(path.join(ATLAS, 'new.md'), 'a new page\n');
  writeFileSync(path.join(ATLAS, 'other.txt'), 'theirs, mid-redesign\n');
  writeFileSync(path.join(ATLAS, 'REDESIGN-BRIEF.md'), 'another session\'s untracked brief\n');
  // a session running in P3_Draft3 (one level up) edited two files in here
  const home = mkdtempSync(path.join(tmpdir(), 'nova-code-ws-home-'));
  const jdir = path.join(home, '.claude', 'projects', P3.replace(/[^A-Za-z0-9]/g, '-'));
  mkdirSync(jdir, { recursive: true });
  const other = '33333333-3333-4333-8333-333333333333';
  const edit = (f, name = 'Edit') => JSON.stringify({ type: 'assistant', timestamp: new Date(Date.now() + 1000).toISOString(), message: { content: [{ type: 'tool_use', name, input: { file_path: path.join(ATLAS, f) } }] } });
  writeFileSync(path.join(jdir, `${other}.jsonl`), edit('other.txt') + '\n' + edit('REDESIGN-BRIEF.md', 'Write') + '\n');

  const sum = await lib.changeSummary('atlas', null, { repoRoot: NOVA, home });
  const f = Object.fromEntries(sum.files.map((x) => [x.path, x]));
  assert.equal(sum.readOnly, false);
  assert.deepEqual(f['other.txt'].other, { sessionId: other }, 'a session one folder up still counts');
  assert.deepEqual(f['REDESIGN-BRIEF.md'].other, { sessionId: other });
  assert.equal(f['a.txt'].other, null);

  const novaBefore = head(NOVA);
  const before = head(ATLAS);
  const r = await lib.commitChanges('atlas', null, 'Atlas: his page and his change', { repoRoot: NOVA, paths: ['a.txt', 'new.md'] });
  assert.deepEqual(inCommit(ATLAS), ['a.txt', 'new.md']);
  assert.equal(g(ATLAS, 'rev-parse', 'HEAD~1').trim(), before);
  const st = status(ATLAS);
  assert.match(st, /^ M other\.txt$/m, 'the other session\'s edit is still uncommitted');
  assert.match(st, /^\?\? REDESIGN-BRIEF\.md$/m, 'its untracked brief is still untracked');
  assert.deepEqual([...r.leftOut].sort(), ['REDESIGN-BRIEF.md', 'other.txt']);
  assert.equal(head(NOVA), novaBefore, 'Nova OS did not move');
  assert.equal(head(WREN), g(WREN, 'rev-parse', 'HEAD').trim());

  // the commit is a record on the rails, in Science Atlas
  const rec = (await listRecords()).find((x) => x.id === r.recordId);
  assert.equal(rec.kind, 'code-commit');
  assert.equal(rec.status, 'filed');
  assert.equal(rec.undoData.kind, 'code-commit');
  assert.equal(rec.undoData.sha, r.fullSha);
  assert.equal(rec.undoData.parent, before);
  assert.equal(rec.undoData.workspace, 'atlas');
  assert.equal(rec.undoData.root, ATLAS);
  assert.match(rec.text, /in Science Atlas/);
  // tidy for the next test: take it back through the screen's door
  await lib.undoCommit('atlas', null, { repoRoot: NOVA, sha: r.fullSha });
  assert.equal(head(ATLAS), before);
  g(ATLAS, 'checkout', '-q', '--', 'a.txt', 'other.txt');
  g(ATLAS, 'clean', '-fq');
});

test('path guards hold per workspace: no path into another workspace, outside, or into .git; no folder inside another repo', async () => {
  writeFileSync(path.join(WREN, 'a.txt'), 'one\nwren change\n');
  writeFileSync(path.join(ATLAS, 'a.txt'), 'one\natlas change\n');
  const wrenBefore = head(WREN), atlasBefore = head(ATLAS);
  const wrenSt = status(WREN), atlasSt = status(ATLAS);
  const bad = [
    ['../atlas-partner/a.txt'], [path.join(WREN, 'a.txt')], ['../../../atlas-partner/a.txt'],
    ['.git/config'], ['../outside.txt'], ['src/../../a.txt'], ['other.txt'], [],
  ];
  for (const paths of bad) {
    await assert.rejects(lib.commitChanges('atlas', null, 'Must not land in Atlas', { repoRoot: NOVA, paths }), (e) => ['path', 'paths'].includes(e.code), `atlas refused ${JSON.stringify(paths)}`);
    await assert.rejects(lib.shelveChanges('wren', null, { repoRoot: NOVA, paths: paths.length ? paths.map((p) => p.replace('atlas-partner', 'Atomic_Hub')) : paths }), (e) => ['path', 'paths'].includes(e.code), `wren refused ${JSON.stringify(paths)}`);
  }
  await assert.rejects(lib.fileDiff('wren', null, '../nova-os/a.txt', { repoRoot: NOVA }), (e) => e.code === 'path');
  await assert.rejects(lib.changeSummary('inner', null, { repoRoot: NOVA }), (e) => e.code === 'workspace', 'a folder inside Wren is not a workspace');
  await assert.rejects(lib.commitChanges('inner', null, 'Must not land in Wren', { repoRoot: NOVA, paths: ['a.txt'] }), (e) => e.code === 'workspace');
  await assert.rejects(lib.commitChanges('elsewhere', null, 'Must not land anywhere', { repoRoot: NOVA, paths: ['a.txt'] }), (e) => e.code === 'workspace');
  assert.equal(head(WREN), wrenBefore);
  assert.equal(head(ATLAS), atlasBefore);
  assert.equal(status(WREN), wrenSt);
  assert.equal(status(ATLAS), atlasSt);
  g(WREN, 'checkout', '-q', '--', 'a.txt');
  g(ATLAS, 'checkout', '-q', '--', 'a.txt');
});

test('Shelve and Restore work in Wren by the shelf\'s own sha', async () => {
  writeFileSync(path.join(WREN, 'a.txt'), 'one\nshelved\n');
  writeFileSync(path.join(WREN, 'b.txt'), 'kept out\n');
  const s = await lib.shelveChanges('wren', null, { repoRoot: NOVA, paths: ['a.txt'] });
  assert.doesNotMatch(status(WREN), /a\.txt/);
  assert.match(status(WREN), /b\.txt/);
  await lib.unshelveLatest('wren', null, { repoRoot: NOVA, sha: s.sha });
  assert.equal(readFileSync(path.join(WREN, 'a.txt'), 'utf8'), 'one\nshelved\n');
  g(WREN, 'checkout', '-q', '--', 'a.txt');
  g(WREN, 'clean', '-fq');
});

test('Undo goes through the rails from either door, and refuses a pushed commit, a foreign HEAD and a commit with one on top', async () => {
  // 1. the Inbox's own door takes back Nova's unpushed HEAD in Wren
  writeFileSync(path.join(WREN, 'a.txt'), 'one\nby Nova\n');
  const before = head(WREN);
  const r = await lib.commitChanges('wren', null, 'Wren: a change to take back', { repoRoot: NOVA, paths: ['a.txt'] });
  const listed = await lib.listCommits('all', null, { repoRoot: NOVA });
  const mine = listed.commits.find((c) => c.sha === r.fullSha);
  assert.equal(mine.workspace, 'wren');
  assert.equal(mine.canUndo, true);
  const undone = await inbox.undoRecord(null, r.recordId);
  assert.equal(undone.status, 'undone');
  assert.match(undone.undoSummary, /took back/);
  assert.equal(head(WREN), before, 'HEAD is back on the commit before');
  assert.match(status(WREN), /^ M a\.txt$/m, 'the change is uncommitted again, as it was');
  await assert.rejects(lib.undoCommit('wren', null, { repoRoot: NOVA, sha: r.fullSha }), (e) => e.code === 'undone');
  await assert.rejects(inbox.undoRecord(null, r.recordId), /only filed/);
  assert.equal((await lib.listCommits('wren', null, { repoRoot: NOVA })).commits.find((c) => c.sha === r.fullSha).undone, true);

  // 2. a foreign HEAD: made by hand, so no record, so not Nova's
  g(WREN, 'commit', '-q', '-am', 'his own commit, by hand');
  await assert.rejects(lib.undoCommit('wren', null, { repoRoot: NOVA, sha: head(WREN) }), (e) => e.code === 'notmine');

  // 3. Nova's, then a commit on top: refused at both doors, nothing moves
  writeFileSync(path.join(WREN, 'b.txt'), 'b\n');
  const r1 = await lib.commitChanges('wren', null, 'Nova made this one', { repoRoot: NOVA, paths: ['b.txt'] });
  writeFileSync(path.join(WREN, 'c.txt'), 'c\n');
  g(WREN, 'add', 'c.txt');
  g(WREN, 'commit', '-q', '-m', 'a newer commit on top');
  const top = head(WREN);
  await assert.rejects(lib.undoCommit('wren', null, { repoRoot: NOVA, sha: r1.fullSha }), (e) => e.code === 'nothead');
  await assert.rejects(inbox.undoRecord(null, r1.recordId), (e) => e.code === 'nothead');
  assert.equal(head(WREN), top);
  assert.equal((await listRecords()).find((x) => x.id === r1.recordId).status, 'filed', 'a refused undo leaves the record filed');

  // 4. Nova's, pushed: refused at both doors
  const remote = realpathSync(mkdtempSync(path.join(tmpdir(), 'nova-code-ws-remote-')));
  g(remote, 'init', '-q', '--bare');
  g(WREN, 'remote', 'add', 'origin', remote);
  writeFileSync(path.join(WREN, 'd.txt'), 'd\n');
  const r2 = await lib.commitChanges('wren', null, 'Nova made and he pushed', { repoRoot: NOVA, paths: ['d.txt'] });
  g(WREN, 'push', '-q', 'origin', 'main');
  await assert.rejects(lib.undoCommit('wren', null, { repoRoot: NOVA, sha: r2.fullSha }), (e) => e.code === 'pushed');
  await assert.rejects(inbox.undoRecord(null, r2.recordId), (e) => e.code === 'pushed');
  assert.equal(head(WREN), r2.fullSha);
  // and a Wren commit can never be taken back from Science Atlas
  await assert.rejects(lib.undoCommit('atlas', null, { repoRoot: NOVA, sha: r2.fullSha }), (e) => e.code === 'notmine');
});

test('the old code-commits.json is folded onto the rails once: idempotent, set aside, never duplicated', async () => {
  const rows = (await listRecords()).filter((r) => r.kind === 'code-commit');
  const existing = rows[0];
  const shaA = 'a'.repeat(40), shaB = 'b'.repeat(40);
  const file = path.join(DATA, 'code-commits.json');
  const legacy = [
    { sha: shaA, short: 'aaaaaaa', at: Date.now() - 3600_000, workspace: 'repo', root: NOVA, paths: ['x.js', 'y.js'], message: 'An old commit, still filed', undone: false },
    { sha: shaB, short: 'bbbbbbb', at: Date.now() - 7200_000, workspace: 'repo', root: NOVA, paths: ['z.js'], message: 'An old commit, taken back', undone: true },
    // already on the rails: must not be added twice
    { sha: existing.undoData.sha, short: existing.undoData.short, at: Date.now(), workspace: existing.undoData.workspace, root: existing.undoData.root, paths: existing.undoData.paths, message: 'dup', undone: false },
    { sha: 'not-a-sha', root: NOVA },
  ];
  writeFileSync(file, JSON.stringify(legacy));
  copyFileSync(file, file + '.keep');
  lib._resetCommitMigration();
  const first = await lib.migrateCommitsFile();
  assert.deepEqual(first, { migrated: 2, skipped: 2 });
  assert.equal(existsSync(file), false, 'the old file is set aside');
  assert.equal(existsSync(path.join(DATA, 'code-commits.migrated.json')), true);
  const after1 = (await listRecords()).filter((r) => r.kind === 'code-commit');
  assert.equal(after1.length, rows.length + 2);
  const a = after1.find((r) => r.undoData.sha === shaA);
  const b = after1.find((r) => r.undoData.sha === shaB);
  assert.equal(a.status, 'filed');
  assert.equal(b.status, 'undone');
  assert.deepEqual(a.undoData.paths, ['x.js', 'y.js']);
  assert.equal(a.decision.payload.message, 'An old commit, still filed');

  // again: nothing to do
  lib._resetCommitMigration();
  assert.deepEqual(await lib.migrateCommitsFile(), { migrated: 0, skipped: 0 });
  // the same file put back (a restore from a backup): still no duplicates
  copyFileSync(file + '.keep', file);
  lib._resetCommitMigration();
  assert.deepEqual(await lib.migrateCommitsFile(), { migrated: 0, skipped: 4 });
  assert.equal((await listRecords()).filter((r) => r.kind === 'code-commit').length, rows.length + 2);
  // a migrated commit that is not HEAD cannot be taken back
  await assert.rejects(lib.undoCommit('repo', null, { repoRoot: NOVA, sha: shaA }), (e) => e.code === 'nothead');
});

// ---------------------------------------------------------- through the router

async function serve() {
  const app = express();
  app.use(express.json());
  app.use('/api', claudeCodeRouter({ repoPath: NOVA, vaultPath: null }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, p, body) => {
    const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}

test('the routes: the workspaces list, a run whose cwd is Wren, changes and a commit in Science Atlas, an unknown workspace refused', async () => {
  const { call, close } = await serve();
  try {
    const list = await call('GET', '/claude-code/workspaces');
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.workspaces.map((w) => w.key), ['repo', 'atlas', 'wren', 'inner']);
    assert.equal(list.body.workspaces.find((w) => w.key === 'wren').parent, 'atlas');

    const start = await call('POST', '/claude-code/message', { text: 'Make the file', workspace: 'wren', model: 'sonnet' });
    assert.equal(start.status, 200);
    let job;
    for (let i = 0; i < 200; i++) {
      job = (await call('GET', `/claude-code/message/${start.body.jobId}`)).body;
      if (job.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(job.status, 'ready', JSON.stringify(job));
    assert.equal(job.result.text, 'Done in atlas-partner', 'the Builder ran with its cwd in Wren');
    assert.equal(existsSync(path.join(WREN, 'built.txt')), true);
    assert.equal(existsSync(path.join(NOVA, 'built.txt')), false);
    const wrenSum = await call('GET', '/claude-code/changes?workspace=wren');
    assert.ok(wrenSum.body.files.some((f) => f.path === 'built.txt'));

    writeFileSync(path.join(ATLAS, 'route.md'), 'over the wire\n');
    const atlasSum = await call('GET', '/claude-code/changes?workspace=atlas');
    assert.equal(atlasSum.status, 200);
    assert.ok(atlasSum.body.files.some((f) => f.path === 'route.md'));
    const ok = await call('POST', '/claude-code/commit', { workspace: 'atlas', message: 'Atlas over the wire', paths: ['route.md'] });
    assert.equal(ok.status, 200);
    assert.deepEqual(inCommit(ATLAS), ['route.md']);
    const all = await call('GET', '/claude-code/commits?workspace=all&since=0');
    assert.ok(all.body.commits.some((c) => c.sha === ok.body.fullSha && c.workspace === 'atlas' && c.canUndo));
    const undo = await call('POST', '/claude-code/undo', { workspace: 'atlas', sha: ok.body.fullSha });
    assert.equal(undo.status, 200);

    for (const [m, p, b] of [
      ['GET', '/claude-code/changes?workspace=elsewhere'],
      ['POST', '/claude-code/commit', { workspace: 'elsewhere', message: 'Not anywhere at all', paths: ['a.txt'] }],
      ['POST', '/claude-code/message', { text: 'x', workspace: 'elsewhere' }],
      ['POST', '/claude-code/spar', { workspace: 'inner2' }],
      ['GET', '/claude-code/changes?workspace=inner'],
    ]) {
      const r = await call(m, p, b);
      assert.equal(r.status, 400, `${m} ${p} ${JSON.stringify(b || {})}`);
    }
  } finally { await close(); }
});
