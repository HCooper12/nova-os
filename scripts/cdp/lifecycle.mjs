// Shared process-lifecycle helpers for the headless-Chrome instruments
// (shot.mjs, probe.mjs, rec.mjs). Built after the 18 Oct 2026 incident:
// two headless Chromes launched by these tools kept running for days,
// burning ~5 of the Mac's 10 cores — one because shot.mjs had no overall
// timeout and waited forever for a dev server that had already been shut
// down mid-shot, the other because its node process had simply died and
// left Chrome orphaned. This module gives every instrument:
//   - a hard overall deadline (installDeadline)
//   - a Chrome that is always killable as a group and always dies with
//     the script (launchManagedChrome / killGroup / registerCleanup)
//   - a sweep that reaps anything a PREVIOUS run orphaned (sweepOrphans),
//     driven by the pure, testable decision in orphanDirs
//   - a fast, clear failure when the target page can't load (navigateOrFail)
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// ---- pure, testable decision: which profile dirs are orphaned ----
// entries: [{ dir, name, ownerPid }] — ownerPid is the pid read from the
// dir's own `owner.pid` file, or (for an old dir written before this
// module existed) parsed from the trailing number in the dir name.
// isAlive: (pid:number) => boolean
// Returns the subset whose owner is NOT alive. A dir whose ownerPid could
// not be determined (NaN/null) is treated as orphaned too — there is no
// live process that could still be holding it.
export function orphanDirs(entries, isAlive) {
  return entries.filter((e) => !(Number.isFinite(e.ownerPid) && isAlive(e.ownerPid)));
}

export function isPidAlive(pid) {
  if (!Number.isFinite(pid)) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// "nova-shot-profile-12345" / "nova-probe-12345" / "nova-rec-12345" -> 12345
export function pidFromDirName(name) {
  const m = /-(\d+)$/.exec(name);
  return m ? Number(m[1]) : NaN;
}

async function readOwnerPid(dirPath, dirName) {
  try {
    const txt = await readFile(path.join(dirPath, 'owner.pid'), 'utf8');
    const n = Number(txt.trim());
    if (Number.isFinite(n)) return n;
  } catch { /* no owner.pid — an old dir from before this module, or not ours */ }
  return pidFromDirName(dirName);
}

// Sweep $TMPDIR for profile dirs matching any of `prefixes` and kill any
// Chrome whose --user-data-dir points inside one whose owner is no longer
// alive, then remove the dir. Never touches a dir whose owner IS alive,
// and never touches a Chrome process with a different --user-data-dir
// (pgrep is scoped to this exact dir path).
export async function sweepOrphans(prefixes, { isAlive = isPidAlive, log = console.error } = {}) {
  const tmp = os.tmpdir();
  let names;
  try { names = await readdir(tmp); } catch { return; }
  const candidates = names.filter((n) => prefixes.some((p) => n.startsWith(p)));
  const entries = [];
  for (const name of candidates) {
    const dir = path.join(tmp, name);
    const ownerPid = await readOwnerPid(dir, name);
    entries.push({ dir, name, ownerPid });
  }
  const orphans = orphanDirs(entries, isAlive);
  for (const { dir, name } of orphans) {
    let pids = [];
    try {
      const outText = execFileSync('pgrep', ['-f', dir], { encoding: 'utf8' });
      pids = outText.split('\n').map((s) => s.trim()).filter(Boolean).map(Number).filter(Number.isFinite);
    } catch { /* pgrep exits 1 when nothing matches — not an error */ }
    for (const pid of pids) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
    }
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    log(`reaped orphan: ${name}${pids.length ? ` (chrome pid ${pids.join(',')})` : ' (no chrome process found)'}`);
  }
}

// ---- Chrome launched so it always dies with this script ----
// `ownerDir` is the top-level temp dir the orphan sweep matches by prefix
// (it may differ from Chrome's own --user-data-dir, e.g. rec.mjs's work
// dir contains a nested `profile` dir) — this writes this process's own
// pid there as `owner.pid`, read back by a later run's sweepOrphans.
// Spawned `detached: true` so it heads its own process group and every
// child (renderer, GPU) can be killed in one signal via killGroup.
export async function launchManagedChrome(chromePath, args, ownerDir) {
  await writeFile(path.join(ownerDir, 'owner.pid'), String(process.pid)).catch(() => {});
  return spawn(chromePath, args, { stdio: 'ignore', detached: true });
}

// SIGTERM the whole group, SIGKILL it 2s later if it's still around.
export function killGroup(pid) {
  if (!pid) return;
  try { process.kill(-pid, 'SIGTERM'); } catch { /* already gone, or never a group leader */ }
  setTimeout(() => { try { process.kill(-pid, 'SIGKILL'); } catch { /* gone */ } }, 2000);
}

// Registers cleanup against every exit path a hung or crashed instrument
// can take, so Chrome and its temp profile never outlive the node
// process. `killSync` runs in the `exit` handler (node allows only
// synchronous work there); `cleanupAsync` runs on signals/exceptions,
// where an await is still possible before the process actually exits.
export function registerCleanup({ killSync, cleanupAsync }) {
  let exiting = false;
  process.on('exit', () => { try { killSync(); } catch { /* best effort */ } });
  const onFatal = (code) => async (err) => {
    if (exiting) return;
    exiting = true;
    if (err) console.error(err && err.message ? err.message : String(err));
    try { await cleanupAsync(); } catch { /* best effort */ }
    process.exit(code);
  };
  process.on('SIGINT', onFatal(130));
  process.on('SIGTERM', onFatal(143));
  process.on('SIGHUP', onFatal(129));
  process.on('uncaughtException', onFatal(1));
  process.on('unhandledRejection', onFatal(1));
}

// A hard overall deadline. On expiry: print the standard message, run
// `onTimeout` (expected to kill Chrome / clean the profile dir), then
// exit 4. Returns a disposer to call once the run finishes normally.
export function installDeadline(seconds, toolName, onTimeout) {
  const timer = setTimeout(async () => {
    console.error(`${toolName}: timed out after ${seconds}s`);
    try { await onTimeout(); } catch { /* best effort */ }
    process.exit(4);
  }, seconds * 1000);
  return () => clearTimeout(timer);
}

// Navigate, but fail fast and clearly instead of waiting forever when the
// target refuses connection or the dev server is gone. CDP resolves
// Page.navigate's own promise with `errorText` set (e.g.
// net::ERR_CONNECTION_REFUSED) as soon as the browser-process navigation
// request fails, which is normally fast — the `timeoutMs` race is the
// backstop for the rarer case where it hangs (e.g. unresolvable DNS).
export async function navigateOrFail(send, url, toolName, timeoutMs = 15000) {
  const navP = send('Page.navigate', { url });
  const timeoutP = new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), timeoutMs));
  const result = await Promise.race([navP, timeoutP]);
  if (result && result.__timeout) {
    throw new Error(`${toolName}: ${url} did not respond within ${Math.round(timeoutMs / 1000)}s`);
  }
  if (result && result.errorText) {
    throw new Error(`${toolName}: ${url} failed to load (${result.errorText})`);
  }
  return result;
}
