// THE BUILDER'S WORK IS CHECKED BY CODE, NOT BY ITS OWN SAY-SO (13 Oct 2026).
//
// 12 Oct: asked for a pre-workout slot, the Builder edited six files and
// reported done. It could not run anything (Bash was switched off), its new
// test wiped the state the next tests build on, 4 of 8 failed, and four
// readers of the slot names were never touched. His instruction: "It should
// perform exactly like Claude Code does and double check its work to find,
// pressure test and improve any failures or missing parts or mistakes."
//
// So after every Builder turn that changed files, Nova itself runs the
// project's own gates (lint, build, the tests) and hands any failure straight
// back to the Builder (claudeCode.js startBuild). This file is the deterministic
// half: which gates a workspace has, running them, telling a failure the
// change CAUSED from one that was already there, and the receipt.

import { spawn, execFile } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// launchd hands the server a bare PATH; npm and node live here on this Mac
const PATH = [path.dirname(process.execPath), '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || ''].join(':');
const TAIL = 3500;
const scriptsOf = (dir) => {
  try { return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts || {}; } catch { return {}; }
};

/** The checks a workspace carries: its own package.json scripts, nothing invented. */
export function gatesFor(cwd) {
  const gates = [];
  const root = scriptsOf(cwd);
  if (root.lint) gates.push({ id: 'lint', name: 'Lint', cmd: 'npm', args: ['run', 'lint'], cwd, timeoutMs: 5 * 60_000 });
  if (root.build) gates.push({ id: 'build', name: 'Build', cmd: 'npm', args: ['run', 'build'], cwd, timeoutMs: 10 * 60_000 });
  if (root.test) gates.push({ id: 'test', name: 'Tests', cmd: 'npm', args: ['test'], cwd, timeoutMs: 15 * 60_000, tests: true });
  const server = path.join(cwd, 'server');
  if (scriptsOf(server).test) gates.push({ id: 'server-test', name: 'Server tests', cmd: 'npm', args: ['test'], cwd: server, timeoutMs: 15 * 60_000, tests: true });
  // Nova's own phone-layout guard (CLAUDE.md: run before every commit)
  if (existsSync(path.join(cwd, 'scripts', 'guard-cupertino.mjs'))) {
    gates.push({ id: 'guard', name: 'Phone layout guard', cmd: process.execPath, args: ['scripts/guard-cupertino.mjs'], cwd, timeoutMs: 5 * 60_000 });
  }
  return gates;
}

export function runCommand(cmd, args, { cwd, timeoutMs = 10 * 60_000, env } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    let out = '';
    const child = spawn(cmd, args, { cwd, env: { ...process.env, PATH, CI: '1', FORCE_COLOR: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const keep = (d) => { out += d; if (out.length > 400_000) out = out.slice(-200_000); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => { try { child.kill('SIGTERM'); } catch { /* gone */ } out += `\n[Nova stopped this after ${Math.round(timeoutMs / 60000)} minutes]`; }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out: `${out}\n${e.message}`, ms: Date.now() - started }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, ms: Date.now() - started }); });
  });
}

/** node --test failures, as "file:line" and file, from its own report. */
export function failingTests(out) {
  const at = [...String(out).matchAll(/test at (\S+?\.test\.[cm]?js):(\d+):\d+/g)].map((m) => ({ file: m[1], line: Number(m[2]) }));
  const seen = new Set();
  return at.filter((t) => { const k = `${t.file}:${t.line}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
const counts = (out) => {
  const n = (k) => { const m = String(out).match(new RegExp(`^ℹ ${k} (\\d+)`, 'm')); return m ? Number(m[1]) : null; };
  return { total: n('tests'), pass: n('pass'), fail: n('fail') };
};

/**
 * WAS IT ALREADY BROKEN? A failing test file is re-run on the last commit, in
 * a throwaway worktree (node_modules linked from his checkout), so a test that
 * failed before the Builder touched anything is reported, not handed back as
 * the Builder's fault (two exerciseAtlas tests have failed on main since
 * before 12 Oct). Returns the set of files that ALSO fail on HEAD.
 */
export async function failingOnHead(repoCwd, testCwd, files, { run = runCommand } = {}) {
  const already = new Set();
  if (!files.length) return already;
  const rel = path.relative(repoCwd, testCwd);
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'nova-gate-head-'));
  const wt = path.join(tmp, 'head');
  try {
    const add = await run('git', ['worktree', 'add', '--detach', wt, 'HEAD'], { cwd: repoCwd, timeoutMs: 60_000 });
    if (add.code !== 0) return already;
    for (const nm of ['node_modules', path.join(rel, 'node_modules')]) {
      const from = path.join(repoCwd, nm);
      if (existsSync(from) && !existsSync(path.join(wt, nm))) { try { symlinkSync(from, path.join(wt, nm)); } catch { /* best effort */ } }
    }
    for (const file of files) {
      if (!existsSync(path.join(wt, rel, file))) continue; // a test the Builder added cannot have failed before
      const r = await run(process.execPath, ['--test', file], { cwd: path.join(wt, rel), timeoutMs: 5 * 60_000, env: { NOVA_DATA_DIR: path.join(tmp, 'data') } });
      if (r.code !== 0) already.add(file);
    }
  } finally {
    await run('git', ['worktree', 'remove', '--force', wt], { cwd: repoCwd, timeoutMs: 60_000 });
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
  }
  return already;
}

/**
 * Run every gate. A failure is `caused` unless every failing test in it also
 * fails on HEAD. `onStage` narrates for the Code screen.
 */
export async function runGates(cwd, { gates = gatesFor(cwd), onStage = () => {}, run = runCommand, headCheck = failingOnHead } = {}) {
  const results = [];
  for (const g of gates) {
    onStage(`Checking: ${g.name.toLowerCase()}`);
    const r = await run(g.cmd, g.args, { cwd: g.cwd, timeoutMs: g.timeoutMs });
    const res = { id: g.id, name: g.name, ok: r.code === 0, ms: r.ms, tail: String(r.out).slice(-TAIL), caused: r.code !== 0 };
    if (g.tests) {
      res.counts = counts(r.out);
      if (!res.ok) {
        const failing = failingTests(r.out);
        res.failing = failing;
        if (failing.length) {
          onStage(`Checking whether ${failing.length === 1 ? 'that failure was' : 'those failures were'} there before`);
          const before = await headCheck(cwd, g.cwd, [...new Set(failing.map((f) => f.file))], { run });
          res.preExisting = failing.filter((f) => before.has(f.file));
          res.caused = failing.some((f) => !before.has(f.file));
        }
      }
    }
    results.push(res);
  }
  return results;
}

export const causedFailures = (results) => results.filter((r) => !r.ok && r.caused);

/** What the Builder is told when its change fails a check. */
export function failureBrief(results, round, maxRounds) {
  const bad = causedFailures(results);
  const lines = [`Nova ran this project's checks on your change (round ${round} of ${maxRounds}). These failed:`];
  for (const r of bad) {
    lines.push('', `## ${r.name}`);
    if (r.failing?.length) {
      const mine = r.failing.filter((f) => !(r.preExisting || []).some((p) => p.file === f.file && p.line === f.line));
      lines.push(`Failing tests: ${mine.map((f) => `${f.file}:${f.line}`).join(', ')}`);
    }
    lines.push('Last of its output:', '```', r.tail.slice(-2500), '```');
  }
  lines.push('', 'Find the cause and fix it. Change a test only when it asserts the old behaviour he asked you to change, and say so. Run the failing checks yourself before you answer, then say exactly what you changed.');
  return lines.join('\n');
}

const secs = (ms) => (ms >= 60_000 ? `${Math.round(ms / 6000) / 10} min` : `${Math.round(ms / 1000)} s`);

/** The receipt, written by code: what Nova actually ran and what it found. */
export function receipt({ results, rounds, breaker, skipped }) {
  if (skipped) return `**Checked by Nova:** ${skipped}`;
  const parts = (results || []).map((r) => {
    if (r.counts && r.counts.total != null) {
      const pre = r.preExisting?.length ? `; ${r.preExisting.length} failing before this change too` : '';
      return `${r.name} ${r.counts.pass}/${r.counts.total}${pre} ${r.ok || !r.caused ? '✓' : '✗'}`;
    }
    return `${r.name} ${r.ok ? '✓' : '✗'}`;
  });
  const out = [`**Checked by Nova:** ${parts.join(' · ')}`];
  if (rounds) out.push(`${rounds} fix round${rounds === 1 ? '' : 's'} after a failed check.`);
  if (breaker) out.push(breaker);
  const still = causedFailures(results || []);
  if (still.length) out.push(`**Still failing:** ${still.map((r) => r.name).join(', ')}. Do not commit this yet.`);
  return out.join('\n');
}

/** Files changed in the working tree, for "did this turn change anything". */
export function changedFiles(cwd) {
  return new Promise((resolve) => {
    execFile('git', ['status', '--porcelain', '-z', '-uall'], { cwd, env: { ...process.env, PATH }, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve(null);
      resolve(String(out).split('\0').filter(Boolean).map((l) => l.slice(3)).sort());
    });
  });
}

/** The working tree's diff against HEAD, bounded, for the Breaker. */
export function diffText(cwd, max = 40_000) {
  return new Promise((resolve) => {
    execFile('git', ['diff', 'HEAD'], { cwd, env: { ...process.env, PATH }, maxBuffer: 16 * 1024 * 1024 }, (err, out) => {
      const d = err ? '' : String(out);
      resolve(d.length > max ? `${d.slice(0, max)}\n[diff cut at ${max} characters; read the files for the rest]` : d);
    });
  });
}

export { secs };
