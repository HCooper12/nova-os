// WHAT IS RUNNING ON THIS MAC — the live half of the sessions feature.
//
// `claudeSessions.js` is the shared judgement (copied byte for byte from
// Wren; a test proves it). It is pure. This file is everything that has to
// touch the machine: asking the CLI for its session list, grouping the
// result by project, bringing a window to the front, and closing one.
//
// EVERYTHING THAT REACHES THE MACHINE IS INJECTABLE. `execFn`, `spawnFn` and
// `killFn` all default to the real thing and are replaced by fakes in the
// tests, so the suite never opens a window and never kills a process.
//
// Honest degradation: if the CLI is not on PATH, or its output is not what
// we expect, the answer is an empty list and a plain sentence — never a
// guess at what might be running.
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { describe, summarise, projectOf, transcriptPath } from './claudeSessions.js';
import { lastAssistantQuote } from './sessionQuote.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');

/** The CLI can be slow to answer and must never hold a request open. */
export const LIST_TIMEOUT_MS = 15_000;

/** Default runner: resolves with stdout, rejects on a non-zero exit. */
export function runCommand(file, args, { timeout = LIST_TIMEOUT_MS, cwd, both = false } = {}) {
  return new Promise((resolve, reject) => {
    // stdin closed: the CLI otherwise waits on an open pipe
    const child = execFile(file, args, { timeout, cwd, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      // the CLI's own sentence ("Workspace not trusted…") is the error he sees
      if (err) { if (stderr || stdout) err.message = String(stderr || stdout).trim().split('\n')[0] || err.message; reject(err); }
      else resolve(both ? `${stdout || ''}\n${stderr || ''}` : String(stdout || ''));
    });
    child.stdin?.end();
  });
}

/**
 * Every session the CLI knows about. An empty list on ANY failure: no
 * `claude` on PATH, a non-zero exit, a timeout, output that is not JSON, or
 * JSON that is not a list. The caller distinguishes "nothing running" from
 * "could not look" by asking twice; this function never invents a session.
 */
export async function readAgents({ execFn = runCommand, detail = false } = {}) {
  let agents = [];
  let ok = false;
  try {
    const out = await execFn('claude', ['agents', '--json'], { timeout: LIST_TIMEOUT_MS });
    const parsed = JSON.parse(out);
    if (Array.isArray(parsed)) { agents = parsed; ok = true; }
    else if (Array.isArray(parsed?.agents)) { agents = parsed.agents; ok = true; }
  } catch {
    agents = [];
    ok = false;
  }
  // `detail` exists so the screen can tell "nothing is running" apart from
  // "Nova could not look". An empty list from a failed look is not news that
  // the Mac is quiet, and saying so would be fiction.
  return detail ? { agents, ok } : agents;
}

const NOVA_KEY = 'nova-os';

// a journal that cannot be read is no quote, never a failed picture
function safeQuote(read, cwd, id) {
  try { return read(cwd, id) || null; } catch { return null; }
}

/**
 * The whole picture, grouped by project. Groups are ordered by how many
 * raised hands they hold (waiting plus stuck), because the point of the
 * screen is "who is asking"; ties break to Nova's own group first and then
 * alphabetically, so the order is stable between polls.
 */
export async function sessionsNow({ execFn = runCommand, now = Date.now(), readQuote, ...rest } = {}) {
  const { agents, ok } = await readAgents({ execFn, detail: true });
  // quietMs: how long since anyone spoke in it, as a number, so the Code
  // screen can draw it against the 12 hours after which a session counts as
  // left open (null when the journal has no message to measure from)
  // quote: what a waiting or stuck session last said, one scrubbed line
  // (lib/sessionQuote.js), so Needs you can say WHAT it wants, not only that
  // it wants him. Only for a raised hand; null when its journal has no words.
  const home = rest.home || os.homedir();
  const quoteOf = readQuote || ((cwd, id) => lastAssistantQuote(transcriptPath(cwd, id, home)));
  const sessions = describe(agents, { now, ...rest })
    .map((s) => ({
      ...s,
      quietMs: s.lastAt != null ? Math.max(0, now - s.lastAt) : null,
      quote: s.state === 'waiting' || s.state === 'blocked' ? safeQuote(quoteOf, s.cwd, s.sessionId) : null,
    }));

  const byKey = new Map();
  for (const s of sessions) {
    const p = s.project || projectOf(s.cwd);
    if (!byKey.has(p.key)) byKey.set(p.key, { project: p, sessions: [] });
    byKey.get(p.key).sessions.push(s);
  }
  const hands = (list) => list.filter((s) => s.state === 'waiting' || s.state === 'blocked').length;
  const groups = [...byKey.values()]
    .map((g) => ({ project: g.project, summary: summarise(g.sessions), sessions: g.sessions }))
    .sort((a, b) => {
      const d = hands(b.sessions) - hands(a.sessions);
      if (d) return d;
      const an = a.project.key === NOVA_KEY, bn = b.project.key === NOVA_KEY;
      if (an !== bn) return an ? -1 : 1;
      return String(a.project.label).localeCompare(String(b.project.label));
    });

  const n = (state) => sessions.filter((s) => s.state === state).length;
  return {
    at: new Date(now).toISOString(),
    summary: ok ? summarise(sessions) : 'Nova could not read what is running on the Mac just now.',
    ...(ok ? {} : { error: 'Nova could not read what is running on the Mac just now.' }),
    groups,
    counts: {
      working: n('working'), waiting: n('waiting'), blocked: n('blocked'),
      leftOpen: n('left-open'), gone: n('gone'), projects: groups.length,
    },
  };
}

// The AppleScript that finds the window a session is actually living in.
// Terminal names every tab's device, and `ps` tells us which device the
// session's process is attached to, so the two can be matched exactly rather
// than guessing at the frontmost window.
function focusScript(tty) {
  const dev = `/dev/${tty}`;
  return [
    'tell application "Terminal"',
    '  activate',
    '  repeat with w in windows',
    '    repeat with t in tabs of w',
    `      if tty of t is "${dev}" then`,
    '        set selected of t to true',
    '        set frontmost of w to true',
    '        return',
    '      end if',
    '    end repeat',
    '  end repeat',
    'end tell',
  ].join('\n');
}

function detach(spawnFn, file, args) {
  const child = spawnFn(file, args, { detached: true, stdio: 'ignore' });
  if (child && typeof child.unref === 'function') child.unref();
  return child;
}

/**
 * Put the session in front of him. An interactive one is a real Terminal
 * tab, so it gets found by device and raised. A background one has no
 * window at all, so a tiny double-clickable file is written that attaches to
 * it, and Terminal opens that. Every failure falls back to simply opening
 * Terminal, which is still closer to the session than doing nothing.
 */
export async function showSession({ session, spawnFn = spawn, execFn = runCommand, dataDir = dataRoot() } = {}) {
  if (!session) throw new Error('There is no session to open.');
  if (session.kind === 'background') {
    const short = String(session.shortId || session.sessionId || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!short) return openTerminal(spawnFn);
    try {
      const dir = path.join(dataDir, 'open');
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, `attach-${short}.command`);
      await writeFile(file, `#!/bin/zsh\nexec claude attach ${short}\n`, 'utf8');
      await chmod(file, 0o755);
      detach(spawnFn, 'open', ['-a', 'Terminal', file]);
      return { ok: true, how: 'attached' };
    } catch {
      return openTerminal(spawnFn);
    }
  }
  const pid = Number(session.pid);
  if (!Number.isFinite(pid) || pid <= 0) return openTerminal(spawnFn);
  let tty = '';
  try {
    tty = String(await execFn('ps', ['-o', 'tty=', '-p', String(pid)], { timeout: 5000 })).trim();
  } catch {
    tty = '';
  }
  if (!tty || tty === '??') return openTerminal(spawnFn);
  try {
    detach(spawnFn, 'osascript', ['-e', focusScript(tty)]);
    return { ok: true, how: 'focused' };
  } catch {
    return openTerminal(spawnFn);
  }
}

function openTerminal(spawnFn) {
  try { detach(spawnFn, 'open', ['-a', 'Terminal']); } catch { /* nothing left to try */ }
  return { ok: true, how: 'terminal' };
}

/**
 * Close a window he has finished with. Only ever a session the judgement
 * already marked closable (left open, or finished and unreachable) — a
 * working or waiting session is refused, because closing one of those would
 * throw away work in progress.
 *
 * An interactive session is only its window: the conversation stays in the
 * CLI's journal, and `claude --resume` reopens it. A background one has no
 * window, so it is stopped and then cleared from the list.
 */
export async function closeSession({ session, killFn = process.kill.bind(process), execFn = runCommand } = {}) {
  if (!session) throw new Error('There is no session to close.');
  if (!session.canClose) {
    throw new Error('That one is still live, so Nova will not close it. Only a window left open or one that has already finished can be closed.');
  }
  if (session.kind === 'background') {
    const short = String(session.shortId || session.sessionId || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (short) {
      try { await execFn('claude', ['stop', short], { timeout: 10_000 }); } catch { /* already stopped */ }
      try { await execFn('claude', ['rm', short], { timeout: 10_000 }); } catch { /* already gone */ }
    }
    // SAY WHAT ACTUALLY HAPPENED. When the CLI's background service is not there, both commands
    // are swallowed and the session stays on the list; "cleared" would then be fiction. Look
    // again before claiming anything (honest degradation, never fiction).
    let still = false;
    try {
      const list = JSON.parse(await execFn('claude', ['agents', '--json'], { timeout: LIST_TIMEOUT_MS }) || '[]');
      still = Array.isArray(list) && list.some((a) => (short && a.id === short) || a.sessionId === session.sessionId);
    } catch { /* could not look: claim nothing either way */ }
    if (still) return { ok: false, how: 'kept', error: 'Claude Code could not clear it, so it stays listed as finished. Nothing else is affected.' };
    return { ok: true, how: 'cleared' };
  }
  const pid = Number(session.pid);
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('Nova cannot find that window any more, so there is nothing to close.');
  killFn(pid, 'SIGTERM');
  return { ok: true, how: 'closed', kept: true };
}

/** Find one session in a freshly read picture. Null when it is no longer there. */
export function findSession(picture, sessionId) {
  if (!sessionId) return null;
  for (const g of picture?.groups || []) {
    for (const s of g.sessions) if (s.sessionId === sessionId) return s;
  }
  return null;
}

// ─── CONTROL FROM NOVA (13 Oct 2026, his ask) ────────────────────────────────
// "I should also be able to control these Claude Code sessions through nova."
// Four verbs, each the CLI's own, each measured on this Mac before it was
// written (a throwaway haiku session, 13 Oct):
//   read     the session's own journal, the last turns in words
//   message  `claude stop` then `claude --bg --resume <id> <text>` continues
//            THE SAME session under the same id. Without the stop the CLI
//            forks a copy (even a finished background session counts as
//            running), which would split his conversation in two.
//   start    `claude --bg --name <name> <text>` in a trusted workspace (the
//            CLI itself refuses an untrusted folder)
//   stop     `claude stop <id>` for a background session
// A terminal session can be messaged only while it is idle: its window is
// closed first (the conversation is kept, as Close already does) and the
// session continues in the background. Never while it is working: that would
// throw away a turn in progress.

const SAY_MAX = 8000;
const cleanId = (v) => String(v || '').replace(/[^A-Za-z0-9_-]/g, '');

/** The last `limit` turns of a session, in words: his messages and its replies. */
export function sessionConversation({ session, home = os.homedir(), limit = 12, readText } = {}) {
  if (!session?.sessionId || !session?.cwd) return [];
  let text = '';
  try {
    const file = transcriptPath(session.cwd, session.sessionId, home);
    if (readText) text = readText(file);
    else {
      const size = fs.statSync(file).size;
      const fd = fs.openSync(file, 'r');
      try {
        const start = Math.max(0, size - 3_000_000);
        const buf = Buffer.alloc(size - start);
        fs.readSync(fd, buf, 0, buf.length, start);
        text = buf.toString('utf8');
      } finally { fs.closeSync(fd); }
    }
  } catch { return []; }
  const turns = [];
  for (const line of String(text).split('\n')) {
    let j; try { j = JSON.parse(line); } catch { continue; }
    if ((j.type !== 'user' && j.type !== 'assistant') || j.isMeta || j.isSidechain) continue;
    const c = j.message?.content;
    // a user entry carrying tool results is the machine talking, not him
    const words = typeof c === 'string' ? c
      : Array.isArray(c) ? c.filter((b) => b?.type === 'text').map((b) => b.text).join('\n') : '';
    const clean = String(words)
      .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
      .replace(/<(command|local-command)[\w-]*>[\s\S]*?<\/\1[\w-]*>/g, '')
      .trim();
    if (!clean) continue;
    turns.push({ who: j.type === 'user' ? 'you' : 'claude', text: clean.slice(0, 4000), at: j.timestamp || null });
  }
  return turns.slice(-limit);
}

function backgroundedId(out) {
  const m = String(out || '').match(/backgrounded\s*·\s*([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Start a new background session in `cwd` with his words as its first message. */
export async function startSession({ cwd, text, name, execFn = runCommand } = {}) {
  const say = String(text || '').trim().slice(0, SAY_MAX);
  if (!say) throw new Error('Say what the session should do.');
  if (!cwd) throw new Error('Pick a workspace first.');
  const args = ['--bg'];
  const label = String(name || '').replace(/[\r\n]/g, ' ').trim().slice(0, 60);
  if (label) args.push('--name', label);
  args.push(say);
  const out = await execFn('claude', args, { timeout: 30_000, cwd, both: true });
  const id = backgroundedId(out);
  if (!id) throw new Error(String(out || '').trim().split('\n')[0] || 'Claude Code did not start it.');
  return { ok: true, id };
}

/**
 * Send his words to an existing session, continuing the same conversation.
 * Refuses one that is mid-task, because continuing it would mean killing the
 * turn it is on.
 */
export async function messageSession({ session, text, execFn = runCommand, killFn = process.kill.bind(process), isAlive = pidAlive, waitMs = 6000 } = {}) {
  if (!session) throw new Error('That session is not running any more.');
  const say = String(text || '').trim().slice(0, SAY_MAX);
  if (!say) throw new Error('Say something to send.');
  if (session.state === 'working') {
    throw new Error('It is in the middle of something. Wait for it to finish, or stop it first.');
  }
  let how = 'continued';
  if (session.kind === 'background') {
    const short = cleanId(session.shortId || session.sessionId);
    try { await execFn('claude', ['stop', short], { timeout: 15_000 }); } catch { /* already stopped */ }
  } else {
    // a terminal window, idle: close the window, keep the conversation
    const pid = Number(session.pid);
    if (Number.isFinite(pid) && pid > 0 && isAlive(pid)) {
      killFn(pid, 'SIGTERM');
      const until = Date.now() + waitMs;
      while (isAlive(pid) && Date.now() < until) await new Promise((r) => setTimeout(r, 200));
      if (isAlive(pid)) throw new Error('Its terminal window would not close, so Nova left it alone. Nothing was sent.');
    }
    how = 'moved';
  }
  const out = await execFn('claude', ['--bg', '--resume', session.sessionId, say], { timeout: 30_000, cwd: session.cwd, both: true });
  const id = backgroundedId(out);
  if (!id) throw new Error(String(out || '').trim().split('\n')[0] || 'Claude Code did not take the message.');
  // the CLI says so when it had to fork instead of continue; never hide that
  const copied = /started a copy/i.test(String(out));
  return { ok: true, id, how: copied ? 'copied' : how };
}

/** Stop a background session mid-task. Its conversation is kept. */
export async function stopSession({ session, execFn = runCommand } = {}) {
  if (!session) throw new Error('That session is not running any more.');
  if (session.kind !== 'background') {
    throw new Error('That one is in a terminal window on the Mac. Nova only stops sessions it runs in the background.');
  }
  await execFn('claude', ['stop', cleanId(session.shortId || session.sessionId)], { timeout: 15_000 });
  return { ok: true, how: 'stopped' };
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
