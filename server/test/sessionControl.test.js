// Controlling Claude Code sessions from Nova (13 Oct 2026). Every command is
// faked: this suite never starts, messages or kills a real session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { messageSession, startSession, stopSession, sessionConversation } from '../lib/claudeSessionsLive.js';

const SID = '02adffd1-95ce-4ca6-8ac3-7ff9ab4bd09e';
const recorder = (outputs = {}) => {
  const calls = [];
  const execFn = async (file, args, opts) => {
    calls.push({ args, cwd: opts?.cwd });
    if (args[0] === '--bg') return outputs.bg ?? 'backgrounded · 02adffd1 · probe\n';
    return '';
  };
  return { calls, execFn };
};

test('messaging a background session stops it, then resumes THE SAME id (never a fork)', async () => {
  const { calls, execFn } = recorder();
  const r = await messageSession({ session: { kind: 'background', state: 'waiting', shortId: '02adffd1', sessionId: SID, cwd: '/repo' }, text: 'carry on', execFn });
  assert.deepEqual(calls.map((c) => c.args[0]), ['stop', '--bg']);
  assert.deepEqual(calls[1].args, ['--bg', '--resume', SID, 'carry on']);
  assert.equal(calls[1].cwd, '/repo');
  assert.equal(r.how, 'continued');
});

test('a session mid-task is refused, and nothing is run', async () => {
  const { calls, execFn } = recorder();
  await assert.rejects(messageSession({ session: { kind: 'background', state: 'working', sessionId: SID, cwd: '/r' }, text: 'x', execFn }), /middle of something/);
  assert.equal(calls.length, 0);
});

test('an idle terminal session: the window is closed first, then it continues in the background', async () => {
  const { calls, execFn } = recorder();
  let alive = true; const killed = [];
  const r = await messageSession({
    session: { kind: 'interactive', state: 'waiting', pid: 3071, sessionId: SID, cwd: '/repo' }, text: 'go',
    execFn, killFn: (pid, sig) => { killed.push([pid, sig]); alive = false; }, isAlive: () => alive,
  });
  assert.deepEqual(killed, [[3071, 'SIGTERM']]);
  assert.equal(r.how, 'moved');
  assert.equal(calls[0].args[1], '--resume');
});

test('a window that will not close is left alone and nothing is sent', async () => {
  const { calls, execFn } = recorder();
  await assert.rejects(messageSession({
    session: { kind: 'interactive', state: 'waiting', pid: 9, sessionId: SID, cwd: '/r' }, text: 'go',
    execFn, killFn: () => {}, isAlive: () => true, waitMs: 50,
  }), /would not close/);
  assert.equal(calls.length, 0);
});

test('when the CLI forks a copy anyway, Nova says so', async () => {
  const { execFn } = recorder({ bg: 'note: session 02adffd1 is already running in the background, so this started a copy as 63490047.\nbackgrounded · 63490047\n' });
  const r = await messageSession({ session: { kind: 'background', state: 'waiting', shortId: '02adffd1', sessionId: SID, cwd: '/r' }, text: 'x', execFn });
  assert.equal(r.how, 'copied');
  assert.equal(r.id, '63490047');
});

test('start reads the new id; an empty ask or a CLI refusal is an error, not a fake success', async () => {
  const { calls, execFn } = recorder();
  const r = await startSession({ cwd: '/repo', text: 'add a pre-workout slot', name: 'From Nova', execFn });
  assert.equal(r.id, '02adffd1');
  assert.deepEqual(calls[0].args, ['--bg', '--name', 'From Nova', 'add a pre-workout slot']);
  await assert.rejects(startSession({ cwd: '/repo', text: '  ', execFn }), /Say what/);
  await assert.rejects(startSession({ cwd: '/repo', text: 'x', execFn: async () => 'Workspace not trusted. Run claude once…' }), /not trusted/);
});

test('stop is for background sessions only', async () => {
  const { calls, execFn } = recorder();
  await stopSession({ session: { kind: 'background', shortId: '02adffd1', sessionId: SID }, execFn });
  assert.deepEqual(calls[0].args, ['stop', '02adffd1']);
  await assert.rejects(stopSession({ session: { kind: 'interactive', sessionId: SID }, execFn }), /terminal window/);
});

test('the conversation is his words and its replies, not tool traffic or reminders', () => {
  const lines = [
    { type: 'user', timestamp: 't1', message: { content: 'Add a pre-workout option' } },
    { type: 'assistant', timestamp: 't2', message: { content: [{ type: 'tool_use', name: 'Read' }] } },
    { type: 'user', timestamp: 't3', message: { content: [{ type: 'tool_result', content: 'file text' }] } },
    { type: 'user', timestamp: 't4', isMeta: true, message: { content: 'caveat' } },
    { type: 'assistant', timestamp: 't5', message: { content: [{ type: 'text', text: 'Done. <system-reminder>x</system-reminder>' }] } },
  ].map((l) => JSON.stringify(l)).join('\n');
  const turns = sessionConversation({ session: { sessionId: SID, cwd: '/r' }, readText: () => lines });
  assert.deepEqual(turns.map((t) => [t.who, t.text]), [['you', 'Add a pre-workout option'], ['claude', 'Done.']]);
});
