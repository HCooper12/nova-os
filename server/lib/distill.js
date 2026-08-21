import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir, rm, unlink } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { stageVault, diffTrees } from './ingest.js';
import { createRecord, listRecords } from './inboxStore.js';
import { backupFile } from './backup.js';

// The distiller — captures become knowledge. Filed captures land as FLAT
// pages (Wiki/Inbox, Studio ideas) with no wikilinks, so the graph never
// learns from them; compost can see the orphans but only proposes archiving.
// Once a week this stages a copy of the vault, lets a model weave the
// unlinked captures into the graph per the vault's own CLAUDE.md — links
// added where genuinely related, nothing deleted, nothing invented — and
// persists the resulting diff as a job on disk. A pending record carries it
// to his gate (and his Telegram buttons); approval applies the diff, with
// two safeties the vault-writer rules demand:
//   - DRIFT REFUSAL: every change stores the exact prior content it was
//     computed against; if the live file has moved since, apply refuses
//     honestly instead of clobbering newer edits.
//   - FULL UNDO: priors are restored verbatim; files the job created are
//     removed.

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '3';
const MAX_TARGETS = 8;
const DISTILL_WEEKDAY = 6; // Saturday, an hour after the pattern scout
const DISTILL_HOUR = 17;

const jobsDir = () => path.join(process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'), 'distill');

/* ------------------------------ candidates ------------------------------- */

const CANDIDATE_DIRS = ['Wiki/Inbox', 'Wiki/Studio/Ideas'];
const CANDIDATE_SKIP = new Set(['To-Do.md']);

// Pure-ish: unlinked capture pages, oldest first, capped. A page with any
// [[wikilink]] already participates in the graph and is left alone.
export async function findCandidates(vaultPath, { cap = MAX_TARGETS } = {}) {
  const out = [];
  for (const rel of CANDIDATE_DIRS) {
    const dir = path.join(vaultPath, rel);
    if (!existsSync(dir)) continue;
    for (const name of await readdir(dir)) {
      if (!name.endsWith('.md') || CANDIDATE_SKIP.has(name)) continue;
      const full = path.join(dir, name);
      try {
        const raw = await readFile(full, 'utf8');
        if (raw.includes('[[')) continue; // already in the graph
        if (raw.trim().length < 40) continue; // nothing to weave
        out.push({ relPath: path.join(rel, name), size: raw.length });
      } catch { /* unreadable → not a candidate */ }
    }
  }
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath)).slice(0, cap);
}

/* -------------------------------- the job -------------------------------- */

export function buildDistillPrompt(candidates) {
  return `Distillation pass over Hayden's vault (you are in a STAGED COPY — work freely, everything is reviewed before touching the real vault). These capture pages were filed by Nova's inbox and are currently ORPHANS — no [[wikilinks]] in or out, invisible to the knowledge graph:

${candidates.map((c) => `- ${c.relPath}`).join('\n')}

For EACH page, following this vault's root CLAUDE.md conventions exactly:
1. Read it, then find the existing pages it GENUINELY relates to (search by its key terms). Add [[wikilinks]] into the capture's text where they fit naturally — only to pages that actually exist, only where the relation is real.
2. Where one clearly-related hub page exists (a Topic/Concept it obviously belongs under), add ONE line linking back to the capture from that page's most fitting section.
3. If CLAUDE.md's conventions say the capture belongs elsewhere (e.g. it is really a Concept note), you may move/rewrite it as CLAUDE.md directs — but preserve every fact and all of Hayden's own wording.

Hard rules: never delete content; never invent facts, names, or links to pages that don't exist; a page with no genuine relations gets LEFT ALONE (say so in the summary — honesty beats busywork). Batch mode: process everything in one pass.

Finish with a concise summary: per page, what was linked (or why it was left), and any pages moved.`;
}

async function persistJob(job) {
  await mkdir(jobsDir(), { recursive: true });
  await writeFile(path.join(jobsDir(), `${job.id}.json`), JSON.stringify(job, null, 2), 'utf8');
}

export async function loadDistillJob(jobId) {
  try {
    return JSON.parse(await readFile(path.join(jobsDir(), `${jobId}.json`), 'utf8'));
  } catch {
    return null;
  }
}

// Runs the staged model pass and files the pending record. Resolves when the
// job has settled (unlike the interactive ingest, nobody is polling a UI).
export async function runDistillation(vaultPath, { force = false } = {}) {
  const records = await listRecords();
  const cutoff = Date.now() - 6 * 86400e3;
  if (!force && records.some((r) => r.kind === 'distill' && new Date(r.createdAt).getTime() >= cutoff)) {
    return { skipped: true, reason: 'ran this week' };
  }
  const candidates = await findCandidates(vaultPath);
  if (!candidates.length) return { skipped: true, reason: 'no unlinked captures' };

  const jobId = randomUUID().slice(0, 8);
  const workDir = path.join(os.tmpdir(), 'nova-distill', jobId);
  const stagingVault = path.join(workDir, 'vault');
  await stageVault(vaultPath, stagingVault);

  const result = await new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, [
      '-p', buildDistillPrompt(candidates),
      '--permission-mode', 'bypassPermissions',
      '--allowedTools', 'Read,Write,Edit,Glob,Grep',
      '--output-format', 'json',
      // named explicitly — an unpinned call silently inherits the account's
    // ambient default model, which cost him a Fable-5 usage-limit hit on a
    // totally unrelated lane (Coach) once that became the default. 'sonnet'
    // matches the convention already used for this tier of task elsewhere
    // (see ingest.js).
    '--model', 'sonnet',
    '--max-budget-usd', MAX_BUDGET_USD,
      '--no-session-persistence',
    ], { cwd: stagingVault });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (err) => resolve({ code: -1, stdout: '', stderr: err.message }));
  });

  try {
    if (result.code !== 0) throw new Error(result.stderr.trim() || `claude exited with code ${result.code}`);
    let summary = result.stdout.trim();
    let parsed = null;
    try { parsed = JSON.parse(result.stdout); } catch { /* raw stdout stays the summary */ }
    if (parsed) {
      if (parsed.is_error) throw new Error(parsed.result || 'distillation failed');
      summary = (parsed.result || '').trim();
    }

    // diff, and stamp each change with the exact prior it was computed
    // against — the drift check at apply time depends on it
    const changes = diffTrees(vaultPath, stagingVault).map((c) => {
      const livePath = path.join(vaultPath, c.path);
      let prior = null;
      if (c.kind === 'updated' && existsSync(livePath)) {
        try { prior = readFileSync(livePath, 'utf8'); } catch { prior = null; }
      }
      return { ...c, prior };
    });
    if (!changes.length) return { skipped: true, reason: 'the model found nothing worth linking' };

    const job = { id: jobId, at: new Date().toISOString(), summary: summary.slice(0, 4000), status: 'ready', changes };
    await persistJob(job);

    const record = {
      id: randomUUID().slice(0, 8),
      kind: 'distill',
      text: `Distillation — ${changes.length} page${changes.length === 1 ? '' : 's'} woven into the graph`,
      source: 'nova',
      mode: 'review-all', // vault-wide edits are ALWAYS his call
      status: 'pending',
      createdAt: new Date().toISOString(),
      decision: {
        route: 'distill-apply',
        confidence: 'high',
        title: `Distill ${candidates.length} capture${candidates.length === 1 ? '' : 's'} into the graph (${changes.length} file${changes.length === 1 ? '' : 's'} touched)`,
        reason: summary.slice(0, 300),
        payload: { jobId, paths: changes.map((c) => c.path) },
      },
    };
    await createRecord(record);
    return { record, jobId };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ----------------------------- apply / undo ------------------------------ */

export async function applyDistillJob(vaultPath, jobId) {
  const job = await loadDistillJob(jobId);
  if (!job) throw new Error('that distillation job is gone (the server may have pruned it) — run distillation again');
  if (job.status !== 'ready') throw new Error(`that distillation was already ${job.status}`);
  // drift refusal FIRST, across every file, before any write
  for (const c of job.changes) {
    const live = path.join(vaultPath, c.path);
    if (c.kind === 'updated') {
      const current = existsSync(live) ? await readFile(live, 'utf8') : null;
      if (current !== c.prior) throw new Error(`the vault moved under this draft (${c.path} changed since the diff) — discard it and rerun distillation`);
    } else if (c.kind === 'new' && existsSync(live)) {
      throw new Error(`the vault moved under this draft (${c.path} now exists) — discard it and rerun distillation`);
    }
  }
  for (const c of job.changes) {
    const dest = path.join(vaultPath, c.path);
    await mkdir(path.dirname(dest), { recursive: true });
    await backupFile(dest);
    await writeFile(dest, c.content, 'utf8');
  }
  job.status = 'applied';
  await persistJob(job);
  return { applied: job.changes.length };
}

export async function undoDistillJob(vaultPath, jobId) {
  const job = await loadDistillJob(jobId);
  if (!job) throw new Error('that distillation job is gone');
  if (job.status !== 'applied') throw new Error('only an applied distillation can be undone');
  for (const c of job.changes) {
    const live = path.join(vaultPath, c.path);
    await backupFile(live);
    if (c.kind === 'new') await unlink(live).catch(() => {});
    else if (c.prior != null) await writeFile(live, c.prior, 'utf8');
  }
  job.status = 'undone';
  await persistJob(job);
  return { restored: job.changes.length };
}

/* ------------------------------- scheduler ------------------------------- */

export function startDistillScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('distill');
    try {
      const now = new Date();
      if (now.getDay() !== DISTILL_WEEKDAY || now.getHours() < DISTILL_HOUR) return;
      await runDistillation(vaultPath);
    } catch (err) {
      console.error('distillation failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 30 * 60 * 1000);
}
