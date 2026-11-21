import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';

// The CLI is never run here: `spawn` is a stub that plays the saved real
// output of `echo "/usage" | claude -p --output-format stream-json --verbose`
// (19 Nov 2026, CLI 2.1.326).
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mentors');
const STREAM = fs.readFileSync(path.join(FIX, 'usage-stream.jsonl'), 'utf8');

let U;
before(async () => { U = await import('../lib/claudeUsage.js'); });
beforeEach(() => { U._resetClaudeUsageForTests(); U._setClaudeUsageDepsForTest(null); });

function fakeChild(onStart) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => { child.killed = true; };
  child.written = '';
  child.ended = false;
  child.stdin = new EventEmitter();
  child.stdin.end = (s) => { child.written += s || ''; child.ended = true; };
  setImmediate(() => onStart(child));
  return child;
}

test('parseUsageStream: the saved real stream gives session 17, week 30 and one scoped entry', () => {
  const u = U.parseUsageStream(STREAM);
  assert.equal(u.session.percent, 17);
  assert.equal(u.session.resetsAt, '2026-11-19T02:09:59.618145+00:00');
  assert.equal(u.week.percent, 30);
  assert.equal(u.scoped.length, 1);
  assert.deepEqual({ ...u.scoped[0] }, { model: 'Fable', percent: 36, resetsAt: '2026-11-21T19:59:59.618309+00:00' });
  assert.ok(Date.parse(u.at));
});

test('parseUsageStream: junk, an empty string and a stream without the report are null', () => {
  assert.equal(U.parseUsageStream('not json at all\n{broken'), null);
  assert.equal(U.parseUsageStream(''), null);
  assert.equal(U.parseUsageStream(undefined), null);
  assert.equal(U.parseUsageStream('{"type":"system"}\n{"usage_report":{"rate_limits":{}}}'), null);
});

test('readClaudeUsage: writes /usage and ends stdin, then caches a good answer', async () => {
  let spawns = 0;
  let last;
  U._setClaudeUsageDepsForTest({
    spawn: (bin, args, opts) => {
      spawns += 1;
      last = { bin, args, opts };
      return fakeChild((c) => { c.stdout.emit('data', STREAM); c.emit('close', 0); });
    },
  });
  const a = await U.readClaudeUsage();
  assert.equal(a.week.percent, 30);
  const b = await U.readClaudeUsage();
  assert.equal(spawns, 1);
  assert.equal(b, a);
  assert.ok(last.args.includes('stream-json') && last.args.includes('--verbose') && last.args.includes('--strict-mcp-config'));
  assert.equal(last.opts.stdio[0], 'pipe');
  await U.readClaudeUsage({ maxAgeMs: 0 });
  assert.equal(spawns, 2);
});

test('readClaudeUsage: the child receives /usage and its stdin is ended', async () => {
  let child;
  U._setClaudeUsageDepsForTest({ spawn: () => { child = fakeChild((c) => { c.stdout.emit('data', STREAM); c.emit('close', 0); }); return child; } });
  await U.readClaudeUsage();
  assert.equal(child.written, '/usage\n');
  assert.equal(child.ended, true);
});

test('readClaudeUsage: a spawn that throws, an error event or an unreadable answer is null, never a throw, and is not cached', async () => {
  U._setClaudeUsageDepsForTest({ spawn: () => { throw new Error('ENOENT'); } });
  assert.equal(await U.readClaudeUsage(), null);
  U._setClaudeUsageDepsForTest({ spawn: () => fakeChild((c) => c.emit('error', new Error('spawn failed'))) });
  assert.equal(await U.readClaudeUsage(), null);
  U._setClaudeUsageDepsForTest({ spawn: () => fakeChild((c) => { c.stdout.emit('data', 'rubbish'); c.emit('close', 1); }) });
  assert.equal(await U.readClaudeUsage(), null);
  let spawns = 0;
  U._setClaudeUsageDepsForTest({ spawn: () => { spawns += 1; return fakeChild((c) => { c.stdout.emit('data', STREAM); c.emit('close', 0); }); } });
  assert.ok(await U.readClaudeUsage());
  assert.equal(spawns, 1);
});

test('readClaudeUsage: a CLI that never answers is killed at the timeout and returns null', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let child;
  U._setClaudeUsageDepsForTest({ spawn: () => { child = fakeChild(() => {}); return child; } });
  const p = U.readClaudeUsage();
  await new Promise((r) => setImmediate(r));
  t.mock.timers.tick(20_000);
  assert.equal(await p, null);
  assert.equal(child.killed, true);
});
