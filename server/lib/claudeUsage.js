import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { boundaryArgs } from './spawnBoundary.js';

// HOW MUCH OF HIS CLAUDE PLAN IS USED (Mentors, 21 Nov 2026). Free: the CLI's
// own `/usage` command is answered locally, no model turn, $0 (verified 19 Nov
// 2026 on CLI 2.1.326). Run the way a shell does
//   echo "/usage" | claude -p --output-format stream-json --verbose
// it prints one assistant object whose `usage_report.rate_limits.limits[]`
// carries the session and weekly percentages. Until now Nova only noticed the
// limit once it was hit (modelSpend.js usageLimitNotice); the estimate gate and
// the queue can read the real number first.
//
// This is NOT a model lane: `/usage` is answered by the CLI itself with no
// turn, so it carries no --model or --effort, records nothing on the spend
// ledger (it spends nothing) and its 20 s kill guards a probe, not a working
// job (like lib/modelWatch.js and the `--help` probe in spawnBoundary.js).
//
// It NEVER throws. A CLI that will not start, a timeout, or an answer in a
// shape this does not know all return null, and the caller shows "usage not
// known" rather than a guess.

const CLAUDE_BIN = () => process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const TIMEOUT_MS = 20_000;

let deps = null;
export function _setClaudeUsageDepsForTest(d) { deps = d || null; }
const D = () => ({ spawn, now: () => Date.now(), ...(deps || {}) });

// One answer is kept for `maxAgeMs`; two callers at once share one spawn.
let cache = null;     // { at: ms, value }
let inflight = null;
export function _resetClaudeUsageForTests() { cache = null; inflight = null; }

const slot = (l) => ({ percent: typeof l.percent === 'number' ? l.percent : null, resetsAt: l.resets_at || null });

// Reads the stream (one JSON object per line, anything else ignored) and
// returns the usage in the shape the screens use, or null when no line carries
// the report.
export function parseUsageStream(text, { at = new Date().toISOString() } = {}) {
  let limits = null;
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    let o;
    try { o = JSON.parse(t); } catch { continue; }
    const l = o?.usage_report?.rate_limits?.limits;
    if (Array.isArray(l)) { limits = l; break; }
  }
  if (!limits) return null;
  const out = { at, session: null, week: null, scoped: [] };
  for (const l of limits) {
    if (!l || typeof l !== 'object') continue;
    if (l.kind === 'session') out.session = slot(l);
    else if (l.kind === 'weekly_all') out.week = slot(l);
    else if (l.kind === 'weekly_scoped') out.scoped.push({ model: l.scope?.model?.display_name || null, ...slot(l) });
  }
  return out;
}

function runOnce() {
  const d = D();
  return new Promise((resolve) => {
    let child;
    let done = false;
    let stdout = '';
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      try { child?.kill('SIGKILL'); } catch { /* already gone */ }
      finish(null);
    }, TIMEOUT_MS);
    try {
      // stdin carries the slash command and is then ENDED: an open pipe makes
      // the CLI wait for more input (test/spawnStdin.test.js)
      child = d.spawn(CLAUDE_BIN(), [
        '-p',
        '--output-format', 'stream-json',
        '--verbose',
        ...boundaryArgs(''),
        '--no-session-persistence',
      ], { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
      child.stdout?.on('data', (c) => { stdout += c; });
      child.on('error', () => finish(null));
      child.on('close', () => finish(parseUsageStream(stdout, { at: new Date(d.now()).toISOString() })));
      child.stdin?.on('error', () => {});
      child.stdin?.end('/usage\n');
    } catch {
      finish(null);
    }
  });
}

export async function readClaudeUsage({ maxAgeMs = 5 * 60_000 } = {}) {
  try {
    const d = D();
    if (cache && d.now() - cache.at < maxAgeMs) return cache.value;
    if (!inflight) {
      inflight = runOnce().then((value) => {
        if (value) cache = { at: d.now(), value };
        return value;
      }).finally(() => { inflight = null; });
    }
    return await inflight;
  } catch {
    return null;
  }
}
