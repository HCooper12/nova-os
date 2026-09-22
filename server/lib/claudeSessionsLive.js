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
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, summarise, projectOf } from './claudeSessions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');

/** The CLI can be slow to answer and must never hold a request open. */
export const LIST_TIMEOUT_MS = 15_000;

/** Default runner: resolves with stdout, rejects on a non-zero exit. */
export function runCommand(file, args, { timeout = LIST_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err); else resolve(String(stdout || ''));
    });
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

/**
 * The whole picture, grouped by project. Groups are ordered by how many
 * raised hands they hold (waiting plus stuck), because the point of the
 * screen is "who is asking"; ties break to Nova's own group first and then
 * alphabetically, so the order is stable between polls.
 */
export async function sessionsNow({ execFn = runCommand, now = Date.now(), ...rest } = {}) {
  const { agents, ok } = await readAgents({ execFn, detail: true });
  const sessions = describe(agents, { now, ...rest });

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
