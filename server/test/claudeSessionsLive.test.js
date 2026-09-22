// THE LIVE HALF, WITH FAKE HANDS. Nothing in this file opens a window, kills
// a process or shells out: `execFn`, `spawnFn` and `killFn` are all fakes, so
// the suite can assert exactly which command WOULD have been run.
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readAgents, sessionsNow, showSession, closeSession, findSession } from '../lib/claudeSessionsLive.js';

const NOW = Date.parse('2026-09-23T12:00:00Z');
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const AGENTS = [
  { sessionId: 'nova-busy', kind: 'interactive', pid: 201, status: 'busy', cwd: '/Users/h/Claude Projects/nova-os', name: 'Nova build', startedAt: NOW - 2 * HOUR },
  { sessionId: 'atlas-ask', kind: 'interactive', pid: 202, status: 'idle', cwd: '/Users/h/Claude Projects/Atomic_Hub/P3', name: 'Atlas pour', startedAt: NOW - 9 * DAY },
  { sessionId: 'atlas-stuck', kind: 'background', id: 'zz9', state: 'blocked', cwd: '/Users/h/Claude Projects/Atomic_Hub/P3', name: 'Night watch', startedAt: NOW - 3 * HOUR },
  { sessionId: 'wren-open', kind: 'interactive', pid: 203, status: 'idle', cwd: '/Users/h/Claude Projects/atlas-partner', name: 'Wren', startedAt: NOW - 9 * DAY },
];
const readLast = (cwd, id) => (id === 'wren-open' ? NOW - 3 * DAY : NOW - 30 * 60 * 1000);
const listFn = async () => JSON.stringify(AGENTS);

test('the list is empty and honest when the tool cannot be run at all', async () => {
  const boom = async () => { throw new Error('command not found: claude'); };
  assert.deepEqual(await readAgents({ execFn: boom }), []);
  const picture = await sessionsNow({ execFn: boom, now: NOW });
  assert.equal(picture.groups.length, 0);
  assert.equal(picture.error, 'Nova could not read what is running on the Mac just now.');
  assert.equal(picture.summary, picture.error, 'an unreadable list must never read as "nothing is running"');
});

test('garbage output is treated as no answer, not as a session', async () => {
  assert.deepEqual(await readAgents({ execFn: async () => 'not json at all' }), []);
  assert.deepEqual(await readAgents({ execFn: async () => '{"agents":[{"sessionId":"x"}]}' }), [{ sessionId: 'x' }]);
});

test('sessions are grouped by project, hands-raised groups first, Nova first on a tie', async () => {
  const picture = await sessionsNow({ execFn: listFn, now: NOW, readLast });
  assert.deepEqual(picture.groups.map((g) => g.project.label), ['Science Atlas', 'Nova', 'Wren']);
  assert.equal(picture.groups[0].sessions.length, 2, 'Atlas holds two raised hands and so leads');
  assert.equal(picture.groups[0].summary, '1 waiting for you, 1 stuck and needing you');
  assert.equal(picture.groups[1].summary, '1 working');
  assert.equal(picture.groups[2].summary, 'Nothing is working. 1 window left open.');
  assert.deepEqual(picture.counts, { working: 1, waiting: 1, blocked: 1, leftOpen: 1, gone: 0, projects: 3 });
  assert.equal(picture.summary, '1 working, 1 waiting for you, 1 stuck and needing you, 1 left open');
  assert.equal(picture.at, new Date(NOW).toISOString());
});

test('a session can be found again by its id, and a stale id finds nothing', async () => {
  const picture = await sessionsNow({ execFn: listFn, now: NOW, readLast });
  assert.equal(findSession(picture, 'atlas-stuck').name, 'Night watch');
  assert.equal(findSession(picture, 'no-such-session'), null);
  assert.equal(findSession(picture, undefined), null);
});

test('showing an interactive session finds its window by device and raises it', async () => {
  const spawned = [];
  const execFn = async (file, args) => {
    assert.deepEqual([file, args], ['ps', ['-o', 'tty=', '-p', '201']]);
    return 'ttys004\n';
  };
  const out = await showSession({
    session: { kind: 'interactive', pid: 201, canShow: true },
    execFn,
    spawnFn: (file, args, opts) => { spawned.push({ file, args, opts }); return { unref() {} }; },
  });
  assert.deepEqual(out, { ok: true, how: 'focused' });
  assert.equal(spawned[0].file, 'osascript');
  assert.match(spawned[0].args[1], /if tty of t is "\/dev\/ttys004" then/);
  assert.equal(spawned[0].opts.detached, true);
  assert.equal(spawned[0].opts.stdio, 'ignore');
});

test('a window that cannot be located falls back to simply opening Terminal', async () => {
  const spawned = [];
  const spawnFn = (file, args) => { spawned.push([file, args]); return { unref() {} }; };
  const out = await showSession({ session: { kind: 'interactive', pid: 201 }, execFn: async () => '??', spawnFn });
  assert.deepEqual(out, { ok: true, how: 'terminal' });
  assert.deepEqual(spawned[0], ['open', ['-a', 'Terminal']]);
});

test('showing a background session writes a double-clickable attach file and opens it', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-sessions-'));
  const spawned = [];
  const out = await showSession({
    session: { kind: 'background', shortId: 'zz9' },
    dataDir,
    spawnFn: (file, args) => { spawned.push([file, args]); return { unref() {} }; },
  });
  assert.deepEqual(out, { ok: true, how: 'attached' });
  const file = path.join(dataDir, 'open', 'attach-zz9.command');
  assert.deepEqual(spawned[0], ['open', ['-a', 'Terminal', file]]);
  assert.equal(await readFile(file, 'utf8'), '#!/bin/zsh\nexec claude attach zz9\n');
  assert.equal(((await stat(file)).mode & 0o777).toString(8), '755');
});

test('closing refuses anything still live, in a sentence he can read', async () => {
  await assert.rejects(
    () => closeSession({ session: { kind: 'interactive', pid: 1, canClose: false }, killFn: () => assert.fail('must not kill') }),
    /still live/,
  );
});

test('closing an interactive session ends the window and keeps the conversation', async () => {
  const killed = [];
  const out = await closeSession({ session: { kind: 'interactive', pid: 202, canClose: true }, killFn: (pid, sig) => killed.push([pid, sig]) });
  assert.deepEqual(out, { ok: true, how: 'closed', kept: true });
  assert.deepEqual(killed, [[202, 'SIGTERM']]);
});

test('closing a background session stops it then clears it, tolerating either already being done', async () => {
  const ran = [];
  const out = await closeSession({
    session: { kind: 'background', shortId: 'zz9', canClose: true },
    execFn: async (file, args) => { ran.push([file, ...args]); if (args[0] === 'stop') throw new Error('already stopped'); return ''; },
  });
  assert.deepEqual(out, { ok: true, how: 'cleared' });
  assert.deepEqual(ran, [['claude', 'stop', 'zz9'], ['claude', 'rm', 'zz9']]);
});
