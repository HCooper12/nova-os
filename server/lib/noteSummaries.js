import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// honors NOVA_DATA_DIR (it was one of two hard-coded paths that leaked test
// writes into the real data dir)
const CACHE_DIR = () => path.join(process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data'), 'summaries');
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '0.15';
const jobs = new Map();

function cacheFile(noteId) {
  const hash = createHash('sha1').update(noteId).digest('hex').slice(0, 16);
  return path.join(CACHE_DIR(), `${hash}.json`);
}

// GC: summaries are keyed by note-id hash, so a deleted note's cache file was
// orphaned forever. Prune anything untouched for 60 days (a live note's cache
// gets rewritten whenever its content changes). Called once at server start.
export async function pruneStaleSummaries({ maxAgeDays = 60 } = {}) {
  const dir = CACHE_DIR();
  if (!existsSync(dir)) return { pruned: 0 };
  const { readdir, stat, unlink } = await import('node:fs/promises');
  const cutoff = Date.now() - maxAgeDays * 24 * 3600_000;
  let pruned = 0;
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const full = path.join(dir, f);
      if ((await stat(full)).mtimeMs < cutoff) { await unlink(full); pruned++; }
    } catch { /* best-effort */ }
  }
  return { pruned };
}
function contentHash(text) {
  return createHash('sha1').update(text).digest('hex');
}

// Cached per note, keyed off a hash of its body so an edit in Obsidian
// invalidates it automatically without needing a separate "dirty" flag.
export async function getCachedSummary(noteId, bodyText) {
  const file = cacheFile(noteId);
  if (!existsSync(file)) return null;
  const cached = JSON.parse(await readFile(file, 'utf8'));
  if (cached.sourceHash !== contentHash(bodyText)) return null;
  return cached.summary;
}

function buildPrompt(title, bodyText) {
  return `Summarize this personal wiki page in ONE or TWO sentences — the core idea or takeaway, written plainly. Don't just restate the title, and don't pad with "this page discusses..." framing.

Title: "${title}"

${bodyText.slice(0, 6000)}

Output ONLY a JSON object with a single key "summary". No markdown, no code fences, no commentary before or after.`;
}

export function startSummaryJob(noteId, title, bodyText) {
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const child = spawn(CLAUDE_BIN, [
    '-p', buildPrompt(title, bodyText),
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', '',
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--no-session-persistence',
  ]);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', async (code) => {
    if (code !== 0) {
      job.status = 'error';
      job.error = stderr.trim() || `claude exited with code ${code}`;
      return;
    }
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error) throw new Error(outer.result || 'summary generation failed');
      const text = (outer.result || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON object found in the response');
      const parsed = JSON.parse(jsonMatch[0]);
      const summary = String(parsed.summary || '').trim();
      if (!summary) throw new Error('Empty summary in response');
      await mkdir(CACHE_DIR(), { recursive: true });
      await writeFile(cacheFile(noteId), JSON.stringify({ summary, sourceHash: contentHash(bodyText), generatedAt: new Date().toISOString() }), 'utf8');
      job.result = { summary };
      job.status = 'ready';
    } catch (e) {
      job.status = 'error';
      job.error = 'Could not generate a summary: ' + e.message;
    }
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
  });

  return jobId;
}

export function getSummaryJob(jobId) {
  return jobs.get(jobId) || null;
}
