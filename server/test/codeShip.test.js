// NOVA SHIPS HIS OWN CHANGES (27 Oct 2026) — the ship pipeline end to end,
// against a THROWAWAY git setup: a bare repo as origin, a clone as his main
// tree, the Builder's worktree, a fake gh and a fake served site. Nothing here
// touches the real repo, the real origin, the server or his conversation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const ROOT = mkdtempSync(path.join(tmpdir(), 'nova-ship-test-'));
process.env.NOVA_DATA_DIR = path.join(ROOT, 'data');
mkdirSync(process.env.NOVA_DATA_DIR, { recursive: true });
Object.assign(process.env, {
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@example.com',
});

const { createShipWorktree, worktreeFor } = await import('../lib/shipWorktree.js');
const { fileShipCard, shipRecord, revertShip, commitMessage } = await import('../lib/codeShip.js');
const { getRecord } = await import('../lib/inboxStore.js');
const { approveRecord } = await import('../lib/inbox.js');

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (dir, rel, text) => { mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); writeFileSync(path.join(dir, rel), text); };

// ---- the fake site: index → entry chunk → lazy chunk
const site = { chunk: 'export const x = "nothing new here";' };
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/api/health') { res.writeHead(200); return res.end('{"ok":true}'); }
  if (u === '/nova-os/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<script type="module" src="/nova-os/assets/index-a1.js"></script>'); }
  if (u === '/nova-os/assets/index-a1.js') { res.writeHead(200); return res.end('const l=()=>import("./Lazy-b2.js");'); }
  if (u === '/nova-os/assets/Lazy-b2.js') { res.writeHead(200); return res.end(site.chunk); }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => { server.close(); rmSync(ROOT, { recursive: true, force: true }); });

let n = 0;
function setup() {
  n += 1;
  const dir = path.join(ROOT, `s${n}`);
  mkdirSync(dir, { recursive: true });
  const origin = path.join(dir, 'origin.git');
  sh(dir, 'init', '--bare', '-b', 'main', origin);
  const seed = path.join(dir, 'seed');
  sh(dir, 'clone', origin, seed);
  sh(seed, 'checkout', '-b', 'main');
  write(seed, '.gitignore', 'node_modules\n.nova-ship/\n');
  write(seed, 'src/app.js', "export const greeting = 'hello from before';\n");
  write(seed, 'server/route.js', "export const route = 'old route';\n");
  write(seed, 'README', 'one\n');
  sh(seed, 'add', '-A'); sh(seed, 'commit', '-m', 'seed'); sh(seed, 'push', 'origin', 'main');
  const main = path.join(dir, 'main');
  sh(dir, 'clone', origin, main);
  const other = path.join(dir, 'other');
  sh(dir, 'clone', origin, other);
  return { dir, origin, main, other };
}

function fakes(env, { conclusion = 'success', gates = 'pass' } = {}) {
  const calls = { reload: 0, gh: 0 };
  const deps = {
    repoRoot: env.main,
    siteUrl: `${BASE}/nova-os/`,
    healthUrl: `${BASE}/api/health`,
    deployWaitMs: 300, liveWaitMs: 150, pollMs: 10,
    gh: async () => { calls.gh += 1; return { code: 0, out: JSON.stringify([{ databaseId: 1, status: 'completed', conclusion, url: 'https://example.invalid/run/1', workflowName: 'Deploy' }]) }; },
    reload: async () => { calls.reload += 1; return { code: 0, out: 'reloaded' }; },
    runGates: async () => (gates === 'pass'
      ? [{ id: 'lint', name: 'Lint', ok: true }, { id: 'server-test', name: 'Server tests', ok: true, counts: { pass: 3, total: 3 } }]
      : [{ id: 'lint', name: 'Lint', ok: false, caused: true }]),
  };
  return { deps, calls };
}

const okJob = (text = 'Made the greeting say hello from the Builder') => ({
  id: 'job1', status: 'ready',
  result: { text, checked: { results: [{ id: 'lint', name: 'Lint', ok: true }, { id: 'build', name: 'Build', ok: true }], breaker: 'Breaker: read the change against your ask and found nothing to fix.' } },
});

async function card(env, deps, change, job = okJob()) {
  const shipId = `t${n}${Math.random().toString(36).slice(2, 6)}`;
  const wt = await createShipWorktree(shipId, { repoRoot: env.main });
  for (const [rel, text] of Object.entries(change)) write(wt.cwd, rel, text);
  const rec = await fileShipCard({ shipId, cwd: wt.cwd, branch: wt.branch, baseSha: wt.baseSha, brief: 'make the greeting friendlier', job }, deps);
  return { rec, wt, shipId };
}

const originMain = (env) => sh(env.origin, 'rev-parse', 'main');
const originFile = (env, rel) => sh(env.origin, 'show', `main:${rel}`);
const UNIQUE = 'hello from the Builder, shipped';

test('happy path: commit, push lands on origin, run green, string seen live, steps recorded', async () => {
  const env = setup();
  const { deps } = fakes(env);
  site.chunk = `export const g="${UNIQUE}";`;
  const { rec, wt } = await card(env, deps, { 'src/app.js': `export const greeting = '${UNIQUE}';\n` });
  assert.equal(rec.status, 'pending');
  assert.equal(rec.kind, 'code-ship');
  assert.deepEqual(rec.decision.payload.files, [{ path: 'src/app.js', added: 1, removed: 1 }]);
  assert.equal(rec.decision.payload.gates.lint.ok, true);
  const out = await shipRecord(rec.id, deps);
  assert.equal(out.ok, true, out.destination);
  assert.match(out.destination, /^Shipped [0-9a-f]{7}: live \(seen in the served bundle\)$/);
  assert.equal(originMain(env), out.sha);
  assert.match(originFile(env, 'src/app.js'), /shipped/);
  const msg = sh(env.origin, 'log', '-1', '--format=%B', 'main');
  assert.match(msg, /^feat: made the greeting/);
  assert.match(msg, new RegExp(`Built by Nova's Builder on his approval \\(record ${rec.id}\\)`));
  assert.doesNotMatch(msg, /Co-Authored-By/);
  const r = await getRecord(rec.id);
  assert.deepEqual(r.shipSteps.map((s) => [s.step, s.state]), [
    ['verify', 'done'], ['commit', 'done'], ['rebase', 'done'], ['gates', 'done'], ['push', 'done'], ['deploy', 'done'], ['live', 'done'],
  ]);
  assert.equal(existsSync(wt.cwd), false, 'the worktree is removed once shipped');
});

test('origin moved: the change is rebased onto it, then shipped', async () => {
  const env = setup();
  const { deps } = fakes(env);
  site.chunk = `x="${UNIQUE}"`;
  const { rec } = await card(env, deps, { 'src/app.js': `export const greeting = '${UNIQUE}';\n` });
  write(env.other, 'README', 'two\n'); sh(env.other, 'commit', '-am', 'someone else'); sh(env.other, 'push', 'origin', 'main');
  const out = await shipRecord(rec.id, deps);
  assert.equal(out.ok, true, out.destination);
  assert.equal(originFile(env, 'README'), 'two');
  assert.match(originFile(env, 'src/app.js'), /shipped/);
  const r = await getRecord(rec.id);
  assert.match(r.shipSteps.find((s) => s.step === 'rebase').detail, /rebased onto it/);
});

test('rebase conflict: stops, nothing pushed', async () => {
  const env = setup();
  const { deps } = fakes(env);
  const { rec } = await card(env, deps, { 'src/app.js': `export const greeting = '${UNIQUE}';\n` });
  write(env.other, 'src/app.js', "export const greeting = 'a different line entirely';\n"); sh(env.other, 'commit', '-am', 'clash'); sh(env.other, 'push', 'origin', 'main');
  const before = originMain(env);
  const out = await shipRecord(rec.id, deps);
  assert.equal(out.ok, false);
  assert.equal(out.stoppedAt, 'rebase');
  assert.equal(out.undo, null);
  assert.match(out.destination, /Nothing was pushed/);
  assert.equal(originMain(env), before);
});

test('gates fail on the re-run: stops, nothing pushed', async () => {
  const env = setup();
  const { deps } = fakes(env, { gates: 'fail' });
  const { rec } = await card(env, deps, { 'src/app.js': `export const greeting = '${UNIQUE}';\n` });
  const before = originMain(env);
  const out = await shipRecord(rec.id, deps);
  assert.equal(out.stoppedAt, 'gates');
  assert.equal(originMain(env), before);
});

test('push rejected: stops and says why', async () => {
  const env = setup();
  const { deps } = fakes(env);
  const { rec } = await card(env, deps, { 'src/app.js': `export const greeting = '${UNIQUE}';\n` });
  const hook = path.join(env.origin, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\necho "protected branch" >&2\nexit 1\n'); chmodSync(hook, 0o755);
  const before = originMain(env);
  const out = await shipRecord(rec.id, deps);
  assert.equal(out.stoppedAt, 'push');
  assert.equal(out.undo, null);
  assert.match(out.destination, /origin refused the push/);
  assert.equal(originMain(env), before);
});

test('run red: stops at the deploy, the commit is on main and Undo is offered', async () => {
  const env = setup();
  const { deps } = fakes(env, { conclusion: 'failure' });
  const { rec } = await card(env, deps, { 'src/app.js': `export const greeting = '${UNIQUE}';\n` });
  const out = await shipRecord(rec.id, deps);
  assert.equal(out.ok, false);
  assert.equal(out.stoppedAt, 'deploy');
  assert.equal(originMain(env), out.sha);
  assert.equal(out.undo.sha, out.sha);
  assert.match(out.destination, /Undo reverts it/);
});

test('the string never appears: "deployed but not seen live yet", never "live"', async () => {
  const env = setup();
  const { deps } = fakes(env);
  site.chunk = 'nothing to see';
  const { rec } = await card(env, deps, { 'src/app.js': `export const greeting = '${UNIQUE}';\n` });
  const out = await shipRecord(rec.id, deps);
  assert.match(out.destination, /deployed but not seen live yet/);
  assert.doesNotMatch(out.destination, /: live/);
  const r = await getRecord(rec.id);
  assert.equal(r.shipSteps.find((s) => s.step === 'live').state, 'stopped');
});

test('server change, main tree has an unrelated uncommitted file: pull fast-forwards, reload called, health checked', async () => {
  const env = setup();
  const { deps, calls } = fakes(env);
  write(env.main, 'scratch-notes.txt', 'another session\n');
  write(env.main, 'README', 'his own edit\n');
  const { rec } = await card(env, deps, { 'server/route.js': "export const route = 'new route';\n" });
  const out = await shipRecord(rec.id, deps);
  assert.equal(out.ok, true, out.destination);
  assert.equal(calls.reload, 1);
  assert.equal(readFileSync(path.join(env.main, 'server/route.js'), 'utf8'), "export const route = 'new route';\n");
  assert.equal(readFileSync(path.join(env.main, 'README'), 'utf8'), 'his own edit\n', 'his uncommitted edit is untouched');
  assert.match(out.destination, /server reloaded/);
  const r = await getRecord(rec.id);
  assert.equal(r.shipSteps.find((s) => s.step === 'live').state, 'skipped');
  assert.equal(r.shipSteps.find((s) => s.step === 'reload').state, 'done');
});

test('main tree has a conflicting uncommitted change: pull refused, reload NOT called, recorded', async () => {
  const env = setup();
  const { deps, calls } = fakes(env);
  write(env.main, 'server/route.js', "export const route = 'his half-done edit';\n");
  const { rec } = await card(env, deps, { 'server/route.js': "export const route = 'new route';\n" });
  const out = await shipRecord(rec.id, deps);
  assert.equal(calls.reload, 0);
  assert.match(out.destination, /server not reloaded: .*manual pull/);
  assert.equal(readFileSync(path.join(env.main, 'server/route.js'), 'utf8'), "export const route = 'his half-done edit';\n");
  const r = await getRecord(rec.id);
  assert.equal(r.shipSteps.find((s) => s.step === 'reload').state, 'stopped');
});

test('Undo: a revert is pushed to origin, and the deploy and bundle are checked', async () => {
  const env = setup();
  const { deps } = fakes(env);
  site.chunk = `x="${UNIQUE}"`;
  const { rec } = await card(env, deps, { 'src/app.js': `export const greeting = '${UNIQUE}';\n` });
  const out = await shipRecord(rec.id, deps);
  assert.equal(out.ok, true);
  site.chunk = 'x="hello from before"';
  const { summary, finish } = await revertShip(out.undo, deps);
  assert.match(summary, /^Reverted [0-9a-f]{7} with [0-9a-f]{7} on main/);
  await finish;
  assert.equal(originFile(env, 'src/app.js'), "export const greeting = 'hello from before';");
  assert.match(sh(env.origin, 'log', '-1', '--format=%s', 'main'), /^Revert/);
  assert.equal(sh(env.origin, 'rev-parse', 'main~1'), out.sha, 'a revert on top, history kept, no force-push');
  const r = await getRecord(rec.id);
  assert.deepEqual(r.undoSteps.map((s) => [s.step, s.state]), [['revert', 'done'], ['deploy', 'done'], ['live', 'done']]);
});

test('a job whose checks still fail files an informational record that cannot be approved', async () => {
  const env = setup();
  const { deps } = fakes(env);
  const job = { id: 'j2', status: 'ready', result: { text: 'Tried', checked: { results: [{ id: 'lint', name: 'Lint', ok: false, caused: true }], rounds: 3 } } };
  const { rec } = await card(env, deps, { 'src/app.js': "export const greeting = 'broken';\n" }, job);
  assert.equal(rec.status, 'error');
  assert.equal(rec.shipApprovable, false);
  assert.match(rec.error, /Lint/);
  await assert.rejects(() => approveRecord(path.join(ROOT, 'vault'), rec.id), /pending|cannot be shipped/);
});

test('a job that changed nothing says so and leaves no worktree', async () => {
  const env = setup();
  const { deps } = fakes(env);
  const { rec, wt } = await card(env, deps, {}, okJob());
  assert.equal(rec.status, 'error');
  assert.match(rec.error, /without changing any file/);
  assert.equal(existsSync(wt.cwd), false);
});

test('the commit message is Nova\'s: a type, the summary, the record trailer', () => {
  assert.equal(commitMessage('Fix the timer reset.', 'abc12345'), "fix: fix the timer reset\n\nBuilt by Nova's Builder on his approval (record abc12345)");
  assert.match(commitMessage('Added a steps tile', 'x1'), /^feat: added a steps tile/);
  assert.equal(worktreeFor('/r', 'ab12').endsWith(path.join('.nova-ship', 'ab12')), true);
});

test('a reload that never came stops after 20 minutes and says so, instead of "reloading" forever', async () => {
  const { createRecord } = await import('../lib/inboxStore.js');
  const { expireStuckReloads, RELOAD_LIMIT_MS } = await import('../lib/codeShip.js');
  const t0 = Date.parse('2026-10-27T01:00:00Z');
  await createRecord({ id: 'stuck01', kind: 'code-ship', status: 'filed', createdAt: new Date(t0).toISOString(),
    destination: 'Shipped abc1234: live (seen in the served bundle), server reloading',
    shipSteps: [{ step: 'reload', ok: null, state: 'running', detail: 'reloading', at: new Date(t0).toISOString() }],
    pendingReloadCheck: { field: 'shipSteps', at: new Date(t0).toISOString(), pid: process.pid } });
  await expireStuckReloads({ now: () => t0 + RELOAD_LIMIT_MS - 1000 });
  assert.equal((await getRecord('stuck01')).shipSteps.at(-1).state, 'running', 'not yet');
  await expireStuckReloads({ now: () => t0 + RELOAD_LIMIT_MS + 1000 });
  const r = await getRecord('stuck01');
  assert.equal(r.shipSteps.at(-1).state, 'stopped');
  assert.match(r.shipSteps.at(-1).detail, /did not reload within 20 minutes/);
  assert.equal(r.pendingReloadCheck, null);
  assert.match(r.destination, /server not reloaded yet/);
});
