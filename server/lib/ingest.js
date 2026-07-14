import { spawn } from 'node:child_process';
import { mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const SKIP = new Set(['.obsidian', '.claude', '.DS_Store']);
const MAX_BUDGET_USD = '3';
// launchd services don't inherit the interactive shell's PATH, so `claude` (installed
// under ~/.local/bin) wouldn't resolve via a bare spawn('claude', ...) — use the
// absolute path. Override with CLAUDE_BIN in .env if it lives somewhere else.
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const jobs = new Map();

// Only Wiki/ + CLAUDE.md need to exist in the staging copy — the ingest workflow
// reads/writes wiki pages, not old Raw/ transcripts. Copying the whole vault would
// force iCloud to download every previously-evicted file, which can hang for minutes.
async function stageVault(vaultPath, stagingVault) {
  await mkdir(stagingVault, { recursive: true });
  const claudeMd = path.join(vaultPath, 'CLAUDE.md');
  if (existsSync(claudeMd)) await cp(claudeMd, path.join(stagingVault, 'CLAUDE.md'));
  const wikiDir = path.join(vaultPath, 'Wiki');
  if (existsSync(wikiDir)) {
    await cp(wikiDir, path.join(stagingVault, 'Wiki'), {
      recursive: true,
      filter: (src) => !SKIP.has(path.basename(src)),
    });
  }
  await mkdir(path.join(stagingVault, 'Raw', 'assets'), { recursive: true });
}

function listFiles(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, base, out);
    else out.push(path.relative(base, full));
  }
  return out;
}

function diffTrees(originalDir, stagingDir) {
  const before = new Set([...listFiles(path.join(originalDir, 'Wiki')).map((p) => path.join('Wiki', p))]);
  const after = [
    ...listFiles(path.join(stagingDir, 'Wiki')).map((p) => path.join('Wiki', p)),
    ...listFiles(path.join(stagingDir, 'Raw')).map((p) => path.join('Raw', p)),
  ];
  const changes = [];
  for (const rel of after) {
    const stagedPath = path.join(stagingDir, rel);
    const newContent = readFileSync(stagedPath, 'utf8');
    if (!before.has(rel)) {
      changes.push({ path: rel, kind: 'new', content: newContent });
    } else {
      const originalPath = path.join(originalDir, rel);
      const oldContent = readFileSync(originalPath, 'utf8');
      if (oldContent !== newContent) changes.push({ path: rel, kind: 'updated', content: newContent });
    }
  }
  return changes;
}

export function startIngest(vaultPath) {
  return function run(transcriptText, sourceUrl) {
    const jobId = randomUUID().slice(0, 8);
    const workDir = path.join(os.tmpdir(), 'nova-ingest', jobId);
    const stagingVault = path.join(workDir, 'vault');
    const job = { id: jobId, status: 'staging', summary: '', cost: 0, changes: [], error: null, stagingVault, workDir, vaultPath };
    jobs.set(jobId, job);

    (async () => {
      await stageVault(vaultPath, stagingVault);
      const transcriptPath = path.join(workDir, 'transcript.txt');
      await writeFile(transcriptPath, transcriptText, 'utf8');

      // Claude paraphrases copyrighted third-party transcripts into Raw/ per CLAUDE.md's
      // own rule — this writes the exact original text too, at a path we control (so it
      // doesn't depend on Claude picking a matching filename), so the verbatim text stays
      // reachable regardless of whether this turns out to be a Source, Journal entry, etc.
      const verbatimName = `Original - ${jobId}.md`;
      const verbatimRelPath = path.join('Raw', verbatimName);
      await writeFile(
        path.join(stagingVault, verbatimRelPath),
        `Verbatim original text pasted by Hayden via Nova OS, received ${new Date().toISOString().slice(0, 10)}.${sourceUrl ? `\nSource URL: ${sourceUrl}` : ''}\n\n---\n\n${transcriptText}`,
        'utf8'
      );
      job.status = 'running';

      const prompt = `New content to add to the vault — pasted by Hayden via Nova OS, saved at ${transcriptPath}. This could be an external source (a podcast/video transcript, article, etc.) or it could be Hayden's own note, idea, or reflection that just came to mind — read it and use your own judgement, per this vault's root CLAUDE.md, to pick the right page type (Source, Concept, Entity, Topic, Journal, or Analysis) rather than assuming it's a Source. Follow CLAUDE.md exactly, in batch mode (process fully in one pass, no per-item discussion — just do the work).

The exact verbatim original text is already saved in the vault at ${verbatimRelPath}. If this is third-party copyrighted material needing the paraphrase treatment per CLAUDE.md's copyright rule, link to this file from whatever page you create (e.g. "Verbatim original: [[Raw/${verbatimName.replace(/\.md$/, '')}]]"). If it's Hayden's own writing, that rule already allows storing it verbatim directly — no need to paraphrase it, just fold it in or reference this file as you see fit.
${sourceUrl ? `\nSource URL: ${sourceUrl} — include this as a \`url:\` field in whatever page's frontmatter is most relevant, so it's directly linkable.\n` : ''}
When done, give a concise final summary: pages created, pages updated, and any contradictions or open questions flagged.`;

      const child = spawn(CLAUDE_BIN, [
        '-p', prompt,
        '--permission-mode', 'bypassPermissions',
        '--allowedTools', 'Read,Write,Edit,Glob,Grep',
        '--output-format', 'json',
        '--max-budget-usd', MAX_BUDGET_USD,
        '--no-session-persistence',
      ], { cwd: stagingVault });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('close', (code) => {
        if (code !== 0) {
          job.status = 'error';
          job.error = stderr.trim() || `claude exited with code ${code}`;
          return;
        }
        try {
          const result = JSON.parse(stdout);
          job.summary = result.result || '(no summary returned)';
          job.cost = result.total_cost_usd || 0;
          if (result.is_error) { job.status = 'error'; job.error = job.summary; return; }
        } catch {
          job.summary = stdout.trim();
        }
        try {
          job.changes = diffTrees(vaultPath, stagingVault);
          job.status = 'ready';
        } catch (e) {
          job.status = 'error';
          job.error = 'Failed to compute changes: ' + e.message;
        }
      });
      child.on('error', (err) => {
        job.status = 'error';
        job.error = err.message;
      });
    })().catch((e) => {
      job.status = 'error';
      job.error = e.message;
    });

    return jobId;
  };
}

export function getJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return null;
  return { id: job.id, status: job.status, summary: job.summary, cost: job.cost, error: job.error,
    changes: job.changes.map((c) => ({ path: c.path, kind: c.kind, content: c.content })) };
}

export async function approveJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) throw new Error('job not found');
  if (job.status !== 'ready') throw new Error('job not ready');
  for (const change of job.changes) {
    const dest = path.join(job.vaultPath, change.path);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, change.content, 'utf8');
  }
  job.status = 'applied';
  await cleanup(job);
  jobs.delete(jobId);
}

export async function discardJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) throw new Error('job not found');
  await cleanup(job);
  jobs.delete(jobId);
}

async function cleanup(job) {
  await rm(job.workDir, { recursive: true, force: true }).catch(() => {});
}
