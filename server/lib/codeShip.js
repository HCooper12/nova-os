// NOVA SHIPS HIS OWN CHANGES, ON HIS TAP (27 Oct 2026).
//
// His decision, asked plainly: "You say a request to Nova, he sends it to the
// Builder; the finished change lands in your Inbox as one card with what it
// changes and the check results; your yes lets CODE (not the model) commit,
// push, wait for the deploy, check it's live, and reload safely, with Undo."
// He answered yes, always with his tap before anything ships.
//
// This file is the deterministic half. The Builder (claudeCode.js startMessage)
// works in its own worktree (shipWorktree.js); when it finishes, code files
// ONE card (kind 'code-ship'). His yes runs shipRecord: every step is code,
// recorded on the record as it goes (shipSteps), and the first failure stops
// the ship loudly with the reason. Nothing is called live until the served
// bundle carries strings unique to the change (his standing rule).
//
// Every outside effect goes through `deps` (exec, gh, fetch, reload, now,
// sleep, runGates) so the whole pipeline is tested end to end against a
// throwaway origin, a fake gh and a fake site.

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runCommand, runGates as realRunGates, failingOnHead, causedFailures } from './builderGate.js';
import { createShipWorktree, removeShipWorktree, worktreeFor } from './shipWorktree.js';
import { createRecord, getRecord, updateRecord, listRecords } from './inboxStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const SHIP_KIND = 'code-ship';
export const SITE_URL = 'https://hcooper12.github.io/nova-os/';
const DIFF_LINES = 120;

export const STEP_LABELS = {
  verify: 'Check the change is what you approved',
  commit: 'Commit it',
  rebase: 'Catch up with main',
  gates: 'Run the checks again',
  push: 'Push to main',
  deploy: 'Wait for the deploy',
  live: 'See it live',
  reload: 'Reload the server',
  revert: 'Revert the commit',
};

function withDefaults(deps = {}) {
  const exec = deps.exec || runCommand;
  return {
    exec,
    gh: deps.gh || ((args, { cwd }) => exec('gh', args, { cwd, timeoutMs: 60_000 })),
    fetch: deps.fetch || ((url, opts) => fetch(url, opts)),
    now: deps.now || (() => Date.now()),
    sleep: deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))),
    runGates: deps.runGates || ((cwd) => realRunGates(cwd, {
      // a failure is the change's unless it also fails on origin/main: HEAD
      // is the ship's own commit by now, so it cannot be the baseline
      headCheck: (repo, testCwd, files, o) => failingOnHead(repo, testCwd, files, { ...o, ref: 'origin/main' }),
    })),
    reload: deps.reload || detachedReload,
    repoRoot: deps.repoRoot || REPO_ROOT,
    siteUrl: deps.siteUrl || SITE_URL,
    healthUrl: deps.healthUrl || `http://localhost:${process.env.PORT || 4173}/api/health`,
    deployWaitMs: deps.deployWaitMs ?? 15 * 60_000,
    liveWaitMs: deps.liveWaitMs ?? 5 * 60_000,
    pollMs: deps.pollMs ?? 15_000,
  };
}

// The reload restarts THIS process, so it cannot be awaited: it is started
// detached, and the server that comes back finishes the step (resumeShipWork).
function detachedReload(repoRoot) {
  const child = spawn(process.execPath, [path.join(repoRoot, 'scripts', 'reload-server.mjs')], { cwd: repoRoot, detached: true, stdio: 'ignore' });
  child.unref();
  return Promise.resolve({ detached: true });
}

const git = (d, cwd, args, timeoutMs = 120_000) => d.exec('git', args, { cwd, timeoutMs });
const out = (r) => String(r?.out || '').trim();
const lastLine = (s, n = 300) => String(s || '').trim().split('\n').slice(-4).join(' ').slice(-n);
const iso = (ms) => new Date(ms).toISOString();

// ------------------------------------------------------------ the card

/** The first plain line of the Builder's reply, as the card's title. */
export function titleFrom(replyText, brief) {
  const line = String(replyText || '').split('\n')
    .map((l) => l.replace(/^[#>*\-\s]+/, '').replace(/\*\*/g, '').replace(/`/g, '').trim())
    .find((l) => l && !/^checked by nova/i.test(l));
  const t = line || String(brief || 'A change to Nova').trim();
  return t.length > 90 ? `${t.slice(0, 89).trimEnd()}…` : t;
}

/** builderGate results → the card's four chips. */
export function gateSummary(results = []) {
  const pick = (id) => {
    const r = results.find((x) => x.id === id);
    if (!r) return null;
    const ok = r.ok || !r.caused;
    return {
      ok,
      ...(r.counts && r.counts.total != null ? { pass: r.counts.pass, total: r.counts.total } : {}),
      ...(r.preExisting?.length ? { preExisting: r.preExisting.length } : {}),
    };
  };
  return { lint: pick('lint'), build: pick('build'), serverTests: pick('server-test'), guard: pick('guard') };
}

function parseNumstat(text) {
  return String(text || '').split('\n').filter(Boolean).map((l) => {
    const [a, r, ...p] = l.split('\t');
    return { path: p.join('\t'), added: a === '-' ? 0 : Number(a), removed: r === '-' ? 0 : Number(r) };
  });
}

/** Stage the worktree's change (its OWN index) and read what it is. */
export async function readChange(cwd, d) {
  await git(d, cwd, ['add', '-A']);
  const files = parseNumstat(out(await git(d, cwd, ['diff', '--cached', '--numstat'])));
  const diffStat = out(await git(d, cwd, ['diff', '--cached', '--shortstat']));
  const diff = out(await git(d, cwd, ['diff', '--cached'])).split('\n').slice(0, DIFF_LINES).join('\n');
  return { files, diffStat, diff };
}

/**
 * The Builder finished: file ONE record. Gates passed (and the Breaker's
 * findings answered) → a pending card he can ship. Anything else → an
 * informational `error` record that cannot be approved.
 */
export async function fileShipCard({ shipId, cwd, branch, baseSha, brief, job, source = 'voice' }, deps = {}) {
  const d = withDefaults(deps);
  const id = randomUUID().slice(0, 8);
  const now = iso(d.now());
  const base = { brief: String(brief || '').slice(0, 1000), jobId: job?.id || null, shipId, worktree: cwd, branch, baseSha };
  const informational = async (title, error, extra = {}) => createRecord({
    id, kind: 'code-ship', text: String(brief || '').slice(0, 300), source, mode: 'review-all', status: 'error', createdAt: now,
    error, shipApprovable: false,
    decision: { route: 'code-ship', confidence: 'high', title, reason: error, payload: { recordId: id, ...base, ...extra } },
  });
  if (!job || job.status === 'error') return informational('The Builder stopped before finishing', `The Builder stopped: ${job?.error || 'no reply'}`);
  const result = job.result || {};
  const summary = String(result.text || '').slice(0, 4000);
  const title = titleFrom(result.text, brief);
  const change = await readChange(cwd, d);
  if (!change.files.length || result.checked?.skipped) {
    await removeShipWorktree(shipId, { repoRoot: d.repoRoot, exec: d.exec });
    return informational('The Builder made no change', 'The Builder finished without changing any file, so there is nothing to ship.', { summary });
  }
  const results = result.checked?.results || [];
  const gates = gateSummary(results);
  const failed = causedFailures(results);
  const breaker = result.checked?.breaker || null;
  if (!results.length || failed.length) {
    const why = results.length ? `These checks still fail after the fix rounds: ${failed.map((r) => r.name).join(', ')}.` : 'Nova could not run the checks on this change.';
    return informational(title, `${why} This change cannot be shipped.`, { ...change, gates, breaker, summary });
  }
  return createRecord({
    id, kind: 'code-ship', text: String(brief || '').slice(0, 300), source, mode: 'review-all', status: 'pending', createdAt: now,
    shipApprovable: true,
    decision: {
      route: 'code-ship', confidence: 'high', title,
      reason: 'The Builder made this change in its own copy of Nova and the checks passed. Ship it commits, pushes, waits for the deploy, checks it is live and reloads the server; Undo reverts it.',
      payload: { recordId: id, ...base, ...change, gates, breaker, summary },
    },
  });
}

/** His words → a ship-mode Builder job in its own worktree. */
export async function startShipBuild(brief, { source = 'voice', repoRoot = REPO_ROOT, exec = runCommand, start = null } = {}) {
  const text = String(brief || '').trim();
  if (!text) throw new Error('say what to change');
  const shipId = randomUUID().slice(0, 8);
  const wt = await createShipWorktree(shipId, { repoRoot, exec });
  const startMessage = start || (await import('./claudeCode.js')).startMessage;
  const onDone = (job) => fileShipCard({ shipId, cwd: wt.cwd, branch: wt.branch, baseSha: wt.baseSha, brief: text, job, source }, { repoRoot, exec })
    .then(() => import('./events.js').then(({ broadcast }) => broadcast('inbox')).catch(() => {}))
    .catch((e) => console.error('code-ship: could not file the card:', e.message));
  const jobId = startMessage(wt.cwd, { text, onDone });
  return { shipId, jobId, ...wt };
}

// ---------------------------------------------------- strings, live

/**
 * 1-3 strings unique to the change, derived by code: string literals of 12+
 * characters on added lines of src/ files that do not exist anywhere in src/
 * at `baseRef`. Empty when the change touches no src/ file.
 */
export async function liveStrings(cwd, baseRef, d) {
  const diff = out(await git(d, cwd, ['diff', baseRef, 'HEAD', '--', 'src']));
  const lits = [];
  for (const line of diff.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    for (const m of line.slice(1).matchAll(/(['"`])((?:(?!\1)[^\\\n])+?)\1/g)) {
      const s = m[2];
      if (s.length >= 12 && !s.includes('${') && !lits.includes(s)) lits.push(s);
    }
  }
  const unique = [];
  for (const s of lits) {
    if (unique.length >= 3) break;
    const g = await git(d, cwd, ['grep', '-F', '-q', '-e', s, baseRef, '--', 'src']);
    if (g.code === 1) unique.push(s);
  }
  return unique;
}

/** Fetch the served index and every JS chunk it reaches; which strings appear. */
export async function bundleContains(siteUrl, strings, d) {
  const base = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
  const getText = async (url) => {
    try { const r = await d.fetch(url, { cache: 'no-store' }); return r.ok ? await r.text() : null; } catch { return null; }
  };
  const index = await getText(`${base}?nv=${d.now()}`);
  if (index == null) return { reached: false, found: [] };
  const refs = (text) => {
    const names = new Set();
    for (const m of text.matchAll(/assets\/([A-Za-z0-9_.-]+\.js)/g)) names.add(m[1]);
    for (const m of text.matchAll(/["'`]\.\/([A-Za-z0-9_.-]+\.js)["'`]/g)) names.add(m[1]);
    return names;
  };
  const found = new Set();
  const seen = new Set();
  const queue = [...refs(index)];
  while (queue.length && seen.size < 600 && found.size < strings.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const js = await getText(`${base}assets/${name}`);
    if (js == null) continue;
    for (const s of strings) if (js.includes(s)) found.add(s);
    for (const n of refs(js)) if (!seen.has(n)) queue.push(n);
  }
  return { reached: true, found: [...found], chunks: seen.size };
}

// ---------------------------------------------------------- the steps

function stepper(id, field, d) {
  const steps = [];
  const mark = async (step, state, detail = '') => {
    const row = { step, ok: state === 'done' ? true : state === 'stopped' ? false : null, state, detail: String(detail).slice(0, 500), at: iso(d.now()) };
    const i = steps.findIndex((s) => s.step === step);
    if (i === -1) steps.push(row); else steps[i] = row;
    await updateRecord(id, { [field]: steps.map((s) => ({ ...s })) });
  };
  return { steps, mark };
}

async function waitForRun(sha, cwd, d, mark, step) {
  const until = d.now() + d.deployWaitMs;
  let seen = null;
  for (;;) {
    const r = await d.gh(['run', 'list', '--commit', sha, '--json', 'databaseId,status,conclusion,url,workflowName'], { cwd });
    let runs = [];
    try { runs = JSON.parse(out(r) || '[]'); } catch { runs = []; }
    if (runs.length) {
      seen = runs;
      if (runs.every((x) => x.status === 'completed')) {
        const bad = runs.find((x) => x.conclusion !== 'success');
        if (bad) return { ok: false, detail: `The deploy run failed (${bad.conclusion || 'no result'})${bad.url ? `: ${bad.url}` : ''}` };
        return { ok: true, detail: `The Actions run is green${runs[0].url ? `: ${runs[0].url}` : ''}` };
      }
      await mark(step, 'running', `The Actions run is ${runs.find((x) => x.status !== 'completed')?.status || 'running'}`);
    }
    if (d.now() >= until) return { ok: false, detail: seen ? 'The deploy run did not finish within 15 minutes' : 'No Actions run appeared for this commit within 15 minutes' };
    await d.sleep(d.pollMs);
  }
}

async function waitForStrings(strings, d, { absent = false } = {}) {
  const until = d.now() + d.liveWaitMs;
  let last = { reached: false, found: [] };
  for (;;) {
    last = await bundleContains(d.siteUrl, strings, d);
    const done = absent ? last.reached && last.found.length === 0 : last.found.length === strings.length;
    if (done) return { ok: true, last };
    if (d.now() >= until) return { ok: false, last };
    await d.sleep(d.pollMs);
  }
}

/** git pull --ff-only in HIS tree, only when git allows it without touching his uncommitted files. */
async function pullMainTree(d) {
  const branch = out(await git(d, d.repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']));
  if (branch !== 'main') return { ok: false, detail: `Your Nova folder is on "${branch}", not main, so the server reload needs a manual pull.` };
  const r = await git(d, d.repoRoot, ['pull', '--ff-only', 'origin', 'main']);
  if (r.code !== 0) return { ok: false, detail: `Git would not fast-forward your Nova folder (${lastLine(r.out, 220)}), so the server reload needs a manual pull. Nothing in it was changed.` };
  return { ok: true };
}

async function reloadAndCheck(id, d, mark, field) {
  const pulled = await pullMainTree(d);
  if (!pulled.ok) { await mark('reload', 'stopped', pulled.detail); return { ok: false, detail: pulled.detail }; }
  await mark('reload', 'running', 'Pulled into your Nova folder; reloading safely (waits until no AI job is running)');
  const res = await d.reload(d.repoRoot);
  if (res?.detached) {
    await updateRecord(id, { pendingReloadCheck: { field, at: iso(d.now()), pid: process.pid } });
    return { ok: null, detail: 'reloading; checked when the server comes back' };
  }
  if (res?.code !== 0) {
    const detail = `The reload script refused or failed: ${lastLine(res?.out, 220)}`;
    await mark('reload', 'stopped', detail);
    return { ok: false, detail };
  }
  const health = await checkHealth(d);
  await mark('reload', health.ok ? 'done' : 'stopped', health.detail);
  return health;
}

async function checkHealth(d) {
  try {
    const r = await d.fetch(d.healthUrl);
    if (r.ok) return { ok: true, detail: 'Server reloaded; /api/health answered' };
    return { ok: false, detail: `Server reloaded but /api/health answered ${r.status}` };
  } catch (e) { return { ok: false, detail: `Server reloaded but /api/health did not answer (${e.message})` }; }
}

const commitType = (summary) => (/^(fix|fixe[sd]|repair|correct|stop|prevent)\b/i.test(String(summary).trim()) ? 'fix' : 'feat');
export function commitMessage(title, recordId) {
  const s = String(title || 'a change from the Builder').replace(/\s+/g, ' ').replace(/[.…]+$/, '').trim();
  const body = s.replace(/^(fix|feat)\s*:\s*/i, '');
  return `${commitType(body)}: ${body.charAt(0).toLowerCase()}${body.slice(1)}\n\nBuilt by Nova's Builder on his approval (record ${recordId})`;
}

/**
 * HIS YES. Ships the record's change, step by step; stops at the first failure.
 * Returns { ok, destination, undo, sha } — undo is set once the commit is on
 * origin/main, whatever happens after, so a red deploy can still be reverted.
 */
export async function shipRecord(id, deps = {}) {
  const d = withDefaults(deps);
  const record = await getRecord(id);
  if (!record || record.kind !== SHIP_KIND) throw new Error('not a ship card');
  const p = record.decision?.payload || {};
  const cwd = p.worktree;
  const { mark } = stepper(id, 'shipSteps', d);
  let undo = null;
  let sha = null;
  const stop = async (step, detail) => {
    await mark(step, 'stopped', detail);
    const head = sha ? `Shipped ${sha.slice(0, 7)} but stopped at "${STEP_LABELS[step]}"` : `Stopped at "${STEP_LABELS[step]}"`;
    return { ok: false, stoppedAt: step, destination: `${head}: ${detail}${undo ? ' Undo reverts it.' : ' Nothing was pushed.'}`, undo, sha };
  };

  // 1. the change is still exactly what he approved
  await mark('verify', 'running');
  if (!cwd || !existsSync(cwd)) return stop('verify', 'The Builder\'s worktree is gone.');
  const head = out(await git(d, cwd, ['rev-parse', 'HEAD']));
  if (head !== p.baseSha) return stop('verify', `The worktree moved from ${String(p.baseSha).slice(0, 7)} to ${head.slice(0, 7)} since the card was made.`);
  await git(d, cwd, ['add', '-A']);
  const now = out(await git(d, cwd, ['diff', '--cached', '--name-only'])).split('\n').filter(Boolean).sort();
  const was = (p.files || []).map((f) => f.path).sort();
  if (JSON.stringify(now) !== JSON.stringify(was)) return stop('verify', 'The files changed since the card was made, so this is not what you approved.');
  await mark('verify', 'done', `${was.length} file${was.length === 1 ? '' : 's'}, on ${String(p.baseSha).slice(0, 7)}`);

  // 2. the commit (local to the worktree's branch; a rebase needs one)
  await mark('commit', 'running');
  const msg = commitMessage(record.decision?.title, id);
  const c = await git(d, cwd, ['commit', '-m', msg]);
  if (c.code !== 0) return stop('commit', `git commit failed: ${lastLine(c.out)}`);
  await mark('commit', 'done', msg.split('\n')[0]);

  // 3. catch up with origin/main
  await mark('rebase', 'running');
  const f = await git(d, cwd, ['fetch', 'origin', 'main']);
  if (f.code !== 0) return stop('rebase', `Could not fetch origin: ${lastLine(f.out)}`);
  const originMain = out(await git(d, cwd, ['rev-parse', 'origin/main']));
  if (originMain !== p.baseSha) {
    const rb = await git(d, cwd, ['rebase', 'origin/main']);
    if (rb.code !== 0) {
      const conflicted = out(await git(d, cwd, ['diff', '--name-only', '--diff-filter=U'])).split('\n').filter(Boolean);
      await git(d, cwd, ['rebase', '--abort']);
      return stop('rebase', `main moved and the change no longer applies cleanly${conflicted.length ? ` (${conflicted.join(', ')})` : ''}.`);
    }
    await mark('rebase', 'done', `main had moved to ${originMain.slice(0, 7)}; rebased onto it`);
  } else {
    await mark('rebase', 'done', 'main had not moved');
  }

  // 4. the checks, again, on the tree that will ship
  await mark('gates', 'running');
  const results = await d.runGates(cwd);
  const failed = causedFailures(results);
  const gates = gateSummary(results);
  await updateRecord(id, { shipGates: gates });
  if (failed.length) return stop('gates', `These checks fail on the tree that would ship: ${failed.map((r) => r.name).join(', ')}.`);
  await mark('gates', 'done', results.map((r) => `${r.name} ${r.ok || !r.caused ? 'pass' : 'fail'}`).join(', '));

  // 5. push, fast-forward only
  await mark('push', 'running');
  sha = out(await git(d, cwd, ['rev-parse', 'HEAD']));
  const strings = await liveStrings(cwd, 'origin/main', d);
  const pushed = await git(d, cwd, ['push', 'origin', 'HEAD:main']);
  if (pushed.code !== 0) { sha = null; return stop('push', `origin refused the push (${lastLine(pushed.out, 220)}).`); }
  const files = (p.files || []).map((x) => x.path);
  const serverChanged = files.some((x) => x.startsWith('server/'));
  undo = { kind: SHIP_KIND, recordId: id, sha, serverChanged, strings, files };
  await updateRecord(id, { undoData: undo, shippedSha: sha });
  await mark('push', 'done', `${sha.slice(0, 7)} is on main`);
  await removeShipWorktree(p.shipId, { repoRoot: d.repoRoot, exec: d.exec }).catch(() => {});

  // 6. the deploy
  await mark('deploy', 'running');
  const run = await waitForRun(sha, d.repoRoot, d, mark, 'deploy');
  if (!run.ok) return stop('deploy', `${run.detail}. The commit is on main.`);
  await mark('deploy', 'done', run.detail);

  // 7. live, by his rule: strings unique to the change in the served bundle
  let liveLine;
  if (!strings.length) {
    const why = files.some((x) => x.startsWith('src/')) ? 'no string unique to the change could be found to look for, so live was not checked' : 'server-only change, nothing to see in the app bundle';
    await mark('live', 'skipped', why);
    liveLine = files.some((x) => x.startsWith('src/')) ? 'deployed; not checked live' : null;
  } else {
    await mark('live', 'running', `Looking for ${strings.length} string${strings.length === 1 ? '' : 's'} in the served bundle`);
    const seen = await waitForStrings(strings, d);
    if (seen.ok) { await mark('live', 'done', 'Seen in the served bundle'); liveLine = 'live (seen in the served bundle)'; } else {
      await mark('live', 'stopped', `Deployed but not seen live yet (${seen.last.found.length} of ${strings.length} strings found)`);
      liveLine = 'deployed but not seen live yet';
    }
  }

  // 8. the server, if the change touched it
  let reloadLine = null;
  if (serverChanged) {
    const r = await reloadAndCheck(id, d, mark, 'shipSteps');
    reloadLine = r.ok === true ? 'server reloaded' : r.ok === null ? 'server reloading' : `server not reloaded: ${r.detail}`;
  }
  const parts = [liveLine, reloadLine].filter(Boolean);
  return { ok: true, destination: `Shipped ${sha.slice(0, 7)}${parts.length ? `: ${parts.join(', ')}` : ''}`, undo, sha };
}

/**
 * UNDO. `git revert` in a fresh worktree from origin/main, pushed; never a
 * force-push, never a reset. Returns once the revert is on main, with
 * `finish`: the deploy, the bundle no longer carrying the strings, and the
 * reload, recorded on the record as undoSteps.
 */
export async function revertShip(undo, deps = {}) {
  const d = withDefaults(deps);
  const id = undo.recordId;
  const { mark } = stepper(id, 'undoSteps', d);
  const wtId = `revert-${String(undo.sha).slice(0, 7)}-${randomUUID().slice(0, 4)}`;
  await mark('revert', 'running');
  const wt = await createShipWorktree(wtId, { repoRoot: d.repoRoot, exec: d.exec });
  const cleanup = () => removeShipWorktree(wtId, { repoRoot: d.repoRoot, exec: d.exec }).catch(() => {});
  const rv = await git(d, wt.cwd, ['revert', '--no-edit', undo.sha]);
  if (rv.code !== 0) {
    await git(d, wt.cwd, ['revert', '--abort']);
    await cleanup();
    await mark('revert', 'stopped', `The revert does not apply cleanly on today's main: ${lastLine(rv.out, 200)}`);
    throw new Error(`${String(undo.sha).slice(0, 7)} can't be reverted cleanly on today's main; nothing was pushed`);
  }
  const revSha = out(await git(d, wt.cwd, ['rev-parse', 'HEAD']));
  const pushed = await git(d, wt.cwd, ['push', 'origin', 'HEAD:main']);
  await cleanup();
  if (pushed.code !== 0) {
    await mark('revert', 'stopped', `origin refused the revert (${lastLine(pushed.out, 200)})`);
    throw new Error(`origin refused the revert of ${String(undo.sha).slice(0, 7)}; nothing changed on main`);
  }
  await mark('revert', 'done', `${revSha.slice(0, 7)} reverts ${String(undo.sha).slice(0, 7)} on main`);
  const finish = (async () => {
    await mark('deploy', 'running');
    const run = await waitForRun(revSha, d.repoRoot, d, mark, 'deploy');
    if (!run.ok) { await mark('deploy', 'stopped', run.detail); return { ok: false, detail: run.detail }; }
    await mark('deploy', 'done', run.detail);
    if (undo.strings?.length) {
      await mark('live', 'running', 'Checking the served bundle no longer carries the change');
      const gone = await waitForStrings(undo.strings, d, { absent: true });
      await mark('live', gone.ok ? 'done' : 'stopped', gone.ok ? 'Gone from the served bundle' : 'Reverted and deployed, but the served bundle still carries it');
    } else {
      await mark('live', 'skipped', 'nothing to look for in the app bundle');
    }
    if (undo.serverChanged) await reloadAndCheck(id, d, mark, 'undoSteps');
    return { ok: true };
  })();
  return { summary: `Reverted ${String(undo.sha).slice(0, 7)} with ${revSha.slice(0, 7)} on main; the deploy is being checked.`, revSha, finish };
}

/** Discard: the worktree goes with the card. */
export async function discardShip(record, deps = {}) {
  const d = withDefaults(deps);
  const shipId = record?.decision?.payload?.shipId;
  if (shipId) await removeShipWorktree(shipId, { repoRoot: d.repoRoot, exec: d.exec });
}

/**
 * At boot: finish a reload check the old process started, say plainly when a
 * ship was cut off by a restart, and sweep worktrees older than 14 days.
 */
export async function resumeShipWork(deps = {}) {
  const d = withDefaults(deps);
  const records = (await listRecords()).filter((r) => r.kind === SHIP_KIND);
  for (const r of records) {
    if (r.pendingReloadCheck && r.pendingReloadCheck.pid !== process.pid) {
      const field = r.pendingReloadCheck.field || 'shipSteps';
      const steps = (r[field] || []).filter((s) => s.step !== 'reload');
      const health = await checkHealth(d);
      steps.push({ step: 'reload', ok: health.ok, state: health.ok ? 'done' : 'stopped', detail: health.detail, at: iso(d.now()) });
      await updateRecord(r.id, { [field]: steps, pendingReloadCheck: null,
        ...(field === 'shipSteps' && r.destination ? { destination: r.destination.replace('server reloading', health.ok ? 'server reloaded' : 'server reload not confirmed') } : {}) });
    } else if (r.status === 'shipping' && !r.pendingReloadCheck) {
      const at = (r.shipSteps || []).find((s) => s.state === 'running');
      const cut = `The server restarted while shipping${at ? ` (at "${STEP_LABELS[at.step] || at.step}")` : ''}.`;
      await updateRecord(r.id, r.undoData
        ? { status: 'filed', filedAt: iso(d.now()), destination: `Shipped ${String(r.undoData.sha).slice(0, 7)}; ${cut} The later steps were not checked.` }
        : { status: 'error', error: `${cut} Nothing was pushed.`, shipApprovable: false });
    }
  }
  const { sweepShipWorktrees } = await import('./shipWorktree.js');
  return sweepShipWorktrees({ repoRoot: d.repoRoot, exec: d.exec, now: d.now() });
}

// A RELOAD THAT NEVER CAME (27 Oct 2026): the reload script refuses while AI
// jobs keep running, and then no new process ever boots to finish the check,
// so the card would say "reloading" forever. Checked on a clock: after 20
// minutes the step stops and says plainly that the reload did not happen.
export const RELOAD_LIMIT_MS = 20 * 60 * 1000;
export async function expireStuckReloads(deps = {}) {
  const d = withDefaults(deps);
  const now = d.now();
  for (const r of (await listRecords()).filter((x) => x.kind === SHIP_KIND && x.pendingReloadCheck)) {
    const field = r.pendingReloadCheck.field || 'shipSteps';
    const step = (r[field] || []).find((s) => s.step === 'reload' && s.state === 'running');
    const since = Date.parse(step?.at || r.pendingReloadCheck.at || '') || null;
    if (!since || now - since < RELOAD_LIMIT_MS) continue;
    const detail = 'The server did not reload within 20 minutes, most likely because AI jobs kept it busy. The code is pulled; the next reload picks it up.';
    const steps = (r[field] || []).filter((s) => s.step !== 'reload');
    steps.push({ step: 'reload', ok: false, state: 'stopped', detail, at: iso(now) });
    await updateRecord(r.id, { [field]: steps, pendingReloadCheck: null,
      ...(field === 'shipSteps' && r.destination ? { destination: r.destination.replace('server reloading', 'server not reloaded yet') } : {}) });
  }
}

export { worktreeFor };
