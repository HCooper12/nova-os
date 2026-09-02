import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { stageVault, diffTreesReport, conflictNote } from './ingest.js';
import { createRecord, listRecords } from './inboxStore.js';
import { stampPriors, applyChanges, undoChanges } from './stagedPass.js';
import { modelFor, laneSkipped } from './modelPrefs.js';
import { isGateModel } from './modelChoice.js';
import { boundaryArgs } from './spawnBoundary.js';
import { weeklyWindowOpen } from './cadence.js';
import { settleWatchdog } from './settle.js';

// The distiller — captures become knowledge. Filed captures land as FLAT
// pages (Wiki/Inbox, Studio ideas) with no wikilinks, so the graph never
// learns from them; compost can see the orphans but only proposes archiving.
// Once a week this stages a copy of the vault, lets a model weave the
// unlinked captures into the graph per the vault's own CLAUDE.md — links
// added where genuinely related, nothing deleted, nothing invented — and
// persists the resulting diff as a job on disk. A pending record carries it
// to his gate (and his Telegram buttons); approval applies the diff through
// THE STAGED PASS (lib/stagedPass.js — shared with the deep-weave ingest and
// Coach), with the safeties the vault-writer rules demand:
//   - DRIFT REFUSAL: every change stores the exact prior content it was
//     computed against; if the live file has moved since, apply refuses
//     honestly instead of clobbering newer edits.
//   - ALL OR NOTHING: a write failing mid-apply rolls the earlier files back.
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

// Pure-ish: unlinked capture pages, OLDEST FIRST (by file time), capped. A
// page with any [[wikilink]] already participates in the graph and is left
// alone. The sort was alphabetical while this comment said oldest — with more
// orphans than the cap, late-alphabet captures could starve indefinitely.
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
        const { mtimeMs } = await stat(full);
        out.push({ relPath: path.join(rel, name), size: raw.length, mtimeMs });
      } catch { /* unreadable → not a candidate */ }
    }
  }
  return out.sort((a, b) => (a.mtimeMs - b.mtimeMs) || a.relPath.localeCompare(b.relPath)).slice(0, cap);
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

THEN, one CROSS-SOURCE pass over Wiki/Sources (books, videos, podcasts): where two sources genuinely engage the same concept, make sure both link that Concept page (never each other directly without one). Where two sources genuinely DISAGREE — one's claim undercuts another's premise — add one honest sentence to EACH page naming the tension and linking the other (e.g. "Tension: [[Other Source]] argues the opposite on X"). Disagreement between sources is the most valuable link in this vault; a graph that only agrees is a scrapbook. Same hard rules: only where the engagement is real, at most a handful of the strongest connections, none manufactured to look busy.

Finish with a concise summary: per page, what was linked (or why it was left), any pages moved, and any cross-source tensions recorded.`;
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
// `model`: the per-run override the model-choice gate already resolved —
// 'opus' or 'sonnet' only. Omitted, this run uses the lane's standing
// default.
export async function runDistillation(vaultPath, { force = false, model } = {}) {
  if (model !== undefined && !isGateModel(model)) throw new Error("model must be 'opus' or 'sonnet'");
  if (laneSkipped('distill', 'the weekly distillation')) return { skipped: true, reason: 'lane switched off in Settings' };
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
      ...boundaryArgs('Read,Write,Edit,Glob,Grep'),
      '--output-format', 'json',
      // named explicitly — an unpinned call silently inherits the account's
      // ambient default model, which cost him a Fable-5 usage-limit hit on a
      // totally unrelated lane (Coach) once that became the default. The pin
      // now comes from the model board (lib/modelPrefs.js) so it is settable
      // in Settings; the default is the 'sonnet' this lane has always run on —
      // UNLESS the model-choice gate already asked and got a per-run answer.
      '--model', model || modelFor('distill'),
    '--max-budget-usd', MAX_BUDGET_USD,
      '--no-session-persistence',
    ], { cwd: stagingVault });
    let stdout = '';
    let stderr = '';
    settleWatchdog(child, { label: "the distillation pass", minutes: 20 });
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

    // diff against the staging baseline (never the vault now — see
    // diffTreesReport), and stamp each change with the exact prior it was
    // computed against: the drift check at apply time depends on it
    const { changes: diffed, conflicts } = diffTreesReport(vaultPath, stagingVault);
    const changes = stampPriors(vaultPath, diffed);
    if (!changes.length) {
      return {
        skipped: true,
        reason: conflicts.length
          ? `every page it touched moved in your vault while it ran (${conflicts.join(', ')}) — rerun`
          : 'the model found nothing worth linking',
      };
    }
    // pages left out are said first in the record he reviews
    if (conflicts.length) summary = [conflictNote(conflicts), summary].filter(Boolean).join('\n\n');

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
  if (!job) throw new Error("that distillation job's file is gone — run distillation again");
  if (job.status !== 'ready') throw new Error(`that distillation was already ${job.status}`);
  await applyChanges(vaultPath, job.changes, { what: 'this draft', remedy: 'discard it and rerun distillation' });
  job.status = 'applied';
  job.appliedAt = new Date().toISOString();
  await persistJob(job);
  await pruneSettledJobs().catch(() => {});
  return { applied: job.changes.length };
}

// Applied and undone jobs are the undo's memory, so they stay — for a month,
// like the ingest's (the same rail). The old apply-time message speculated
// about a pruner that did not exist while the job dir grew forever.
const SETTLED_KEEP_DAYS = 30;
async function pruneSettledJobs() {
  let names = [];
  try { names = (await readdir(jobsDir())).filter((f) => f.endsWith('.json')); } catch { return; }
  const cutoff = Date.now() - SETTLED_KEEP_DAYS * 86400e3;
  for (const f of names) {
    let d = null;
    try { d = JSON.parse(await readFile(path.join(jobsDir(), f), 'utf8')); } catch { continue; }
    if (!['applied', 'undone'].includes(d?.status)) continue;
    const settledAt = new Date(d.undoneAt || d.appliedAt || d.at || 0).getTime();
    if (settledAt < cutoff) await rm(path.join(jobsDir(), f), { force: true }).catch(() => {});
  }
}

export async function undoDistillJob(vaultPath, jobId) {
  const job = await loadDistillJob(jobId);
  if (!job) throw new Error(`that distillation job is gone — an applied distillation keeps its undo for ${SETTLED_KEEP_DAYS} days; restore the pages from Guardian's time machine`);
  if (job.status !== 'applied') throw new Error('only an applied distillation can be undone');
  const { restored } = await undoChanges(vaultPath, job.changes);
  job.status = 'undone';
  job.undoneAt = new Date().toISOString();
  await persistJob(job);
  return { restored };
}

/* ------------------------------- scheduler ------------------------------- */

// vaultPath: unused now that the gate raises a card instead of running
// directly — kept in the signature so every scheduler in index.js still
// takes the same shape.
export function startDistillScheduler(_vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('distill');
    try {
      const now = new Date();
      // Saturday onward, so a slept Saturday no longer skips the week.
      if (!weeklyWindowOpen(now, { day: DISTILL_WEEKDAY, hour: DISTILL_HOUR })) return;
      // The model-choice gate raises an Inbox card instead of running
      // directly — nobody is at the keyboard when a weekly cron fires to
      // answer a spoken question, so the run waits for a tap instead.
      const { raiseWeeklyModelChoice } = await import('./modelChoice.js');
      await raiseWeeklyModelChoice('distill');
    } catch (err) {
      console.error('distillation failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 30 * 60 * 1000);
}
