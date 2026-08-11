import { spawn } from 'node:child_process';
import { mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { backupFile } from './backup.js';

const SKIP = new Set(['.obsidian', '.claude', '.DS_Store']);
const MAX_BUDGET_USD = '3';
// A digested long video's weave reads condensed notes PLUS targeted slices
// of the verbatim transcript — the extra headroom is what makes "nothing
// lost" affordable to honor.
const DIGEST_BUDGET_USD = '5';
// launchd services don't inherit the interactive shell's PATH, so `claude` (installed
// under ~/.local/bin) wouldn't resolve via a bare spawn('claude', ...) — use the
// absolute path. Override with CLAUDE_BIN in .env if it lives somewhere else.
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const jobs = new Map();

// Only Wiki/ + CLAUDE.md need to exist in the staging copy — the ingest workflow
// reads/writes wiki pages, not old Raw/ transcripts. Copying the whole vault would
// force iCloud to download every previously-evicted file, which can hang for minutes.
export async function stageVault(vaultPath, stagingVault) {
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

export function diffTrees(originalDir, stagingDir) {
  // Raw/ is not staged (see stageVault), but the REAL Raw/ still decides
  // new-vs-updated: without it, rewriting an existing transcript reads as a
  // brand-new file and an identical rewrite shows as a change that isn't one.
  const before = new Set([
    ...listFiles(path.join(originalDir, 'Wiki')).map((p) => path.join('Wiki', p)),
    ...listFiles(path.join(originalDir, 'Raw')).map((p) => path.join('Raw', p)),
  ]);
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

// The header a fetched-video transcript carries into the ingest pass — the
// metadata is the toolchain's, composed in code, so the model starts from
// true facts about what it is reading. Pure: exported for the test.
// `body` overrides the transcript when a long video was condensed to notes
// (the label says so honestly; the verbatim full transcript still lands in
// Raw/ regardless, written by code below).
export function composeFetchedTranscript(report, sourceUrl, body = null) {
  const head = [
    `${report.title || sourceUrl}${report.uploader ? ` — ${report.uploader}` : ''}${report.duration ? ` (${report.duration})` : ''}`,
    `Source: ${sourceUrl}`,
    body
      ? `This video is long, so what follows is Nova's condensed timestamped notes over the full transcript (via ${report.transcriptSource || 'captions'}) — the verbatim transcript is stored separately in Raw/:`
      : `Timestamped video transcript, via ${report.transcriptSource || 'captions'}:`,
  ].join('\n');
  return `${head}\n\n${body ?? report.transcript}`;
}

// Match on the VIDEO ID, not the URL: the same video arrives as youtu.be/ID,
// watch?v=ID, with or without a ?si= tracking tail, so URL equality would
// miss the duplicate it is meant to catch.
export function videoIdOf(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

// What this video ALREADY has in the vault — the guard against a second copy
// of a podcast he has watched before. Scans only where a video's own pages
// land (Sources + Raw), so it stays cheap.
export async function findExistingVideoPages(vaultPath, url) {
  const id = videoIdOf(url);
  const out = { pages: [], transcriptRel: null };
  if (!id) return out;
  for (const rel of ['Wiki/Sources', 'Raw']) {
    const dir = path.join(vaultPath, rel);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const relPath = `${rel}/${name}`;
      let head;
      try {
        head = readFileSync(path.join(dir, name), 'utf8').slice(0, 4000);
      } catch { continue; }
      if (!head.includes(id)) continue;
      if (rel === 'Raw') out.transcriptRel ||= relPath;
      else out.pages.push(relPath);
    }
  }
  return out;
}

export function startIngest(vaultPath) {
  return function run(transcriptText, sourceUrl) {
    const jobId = randomUUID().slice(0, 8);
    const workDir = path.join(os.tmpdir(), 'nova-ingest', jobId);
    const stagingVault = path.join(workDir, 'vault');
    const job = { id: jobId, status: 'staging', summary: '', cost: 0, changes: [], error: null, stagingVault, workDir, vaultPath };
    jobs.set(jobId, job);

    (async () => {
      // No pasted text + a link = fetch the transcript ourselves via the
      // Watcher's toolchain, then ingest exactly as if he had pasted it.
      let fetched = false;
      let verbatimOverride = null;
      if ((!transcriptText || !transcriptText.trim()) && sourceUrl) {
        fetched = true;
        job.status = 'fetching';
        const { fetchVideoTranscript, digestTranscript, SINGLE_PASS_MAX_CHARS } = await import('./watcher.js');
        const report = await fetchVideoTranscript(sourceUrl, path.join(workDir, 'watch'));
        if (!report.transcript) {
          throw new Error('no transcript available — the video has no captions and Whisper could not transcribe it');
        }
        // A multi-hour transcript can't survive the single vault pass — the
        // model gets condensed notes; Raw/ still gets the full verbatim text.
        if (report.transcript.length > SINGLE_PASS_MAX_CHARS) {
          job.status = 'digesting';
          job.digested = true;
          const notes = await digestTranscript(vaultPath, report, path.join(workDir, 'digest'));
          transcriptText = composeFetchedTranscript(report, sourceUrl, notes);
          verbatimOverride = composeFetchedTranscript(report, sourceUrl);
        } else {
          transcriptText = composeFetchedTranscript(report, sourceUrl);
        }
        job.status = 'staging';
      }
      // Already in the vault? A watch filing (or an earlier weave) may have
      // left a Source page and the verbatim transcript. Re-running must
      // DEEPEN those pages, never mint a parallel set.
      const existing = sourceUrl ? await findExistingVideoPages(vaultPath, sourceUrl) : { pages: [], transcriptRel: null };
      job.existing = existing;

      await stageVault(vaultPath, stagingVault);
      const transcriptPath = path.join(workDir, 'transcript.txt');
      await writeFile(transcriptPath, transcriptText, 'utf8');

      // Claude paraphrases copyrighted third-party transcripts into Raw/ per CLAUDE.md's
      // own rule — this writes the exact original text too, at a path we control (so it
      // doesn't depend on Claude picking a matching filename), so the verbatim text stays
      // reachable regardless of whether this turns out to be a Source, Journal entry, etc.
      // When the transcript is ALREADY in Raw/, we reuse that file instead —
      // a second 500k-character copy of the same podcast helps nobody.
      const verbatimRelPath = existing.transcriptRel || path.join('Raw', `Original - ${jobId}.md`);
      if (!existing.transcriptRel) {
        await writeFile(
          path.join(stagingVault, verbatimRelPath),
          `${fetched ? "Verbatim video transcript fetched by Nova's Watcher from the link Hayden submitted" : 'Verbatim original text pasted by Hayden via Nova OS'}, received ${new Date().toISOString().slice(0, 10)}.${sourceUrl ? `\nSource URL: ${sourceUrl}` : ''}\n\n---\n\n${verbatimOverride ?? transcriptText}`,
          'utf8'
        );
      }
      const verbatimName = path.basename(verbatimRelPath, '.md');
      // Readable copy in the work dir: Raw/ is never staged, so when the
      // transcript already lives in the real vault the model still needs a
      // path it can actually open. The vault path is for LINKING only.
      const verbatimReadPath = path.join(workDir, 'verbatim.txt');
      await writeFile(verbatimReadPath, verbatimOverride ?? transcriptText, 'utf8');
      job.status = 'running';

      const prompt = `New content to add to the vault — ${fetched ? 'a timestamped video transcript Nova fetched from a link Hayden submitted' : 'pasted by Hayden via Nova OS'}, saved at ${transcriptPath}. This could be an external source (a podcast/video transcript, article, etc.) or it could be Hayden's own note, idea, or reflection that just came to mind — read it and use your own judgement, per this vault's root CLAUDE.md, to pick the right page type (Source, Concept, Entity, Topic, Journal, or Analysis) rather than assuming it's a Source. Follow CLAUDE.md exactly, in batch mode (process fully in one pass, no per-item discussion — just do the work).

The exact verbatim original text ${existing.transcriptRel ? 'is ALREADY in the vault' : 'is already saved in the vault'} at ${verbatimRelPath}${existing.transcriptRel ? ' (do NOT write another copy of it — it is not in this staged tree because Raw/ is not staged, and it must stay exactly as it is)' : ''}. If this is third-party copyrighted material needing the paraphrase treatment per CLAUDE.md's copyright rule, link to this file from whatever page you create (e.g. "Verbatim original: [[${verbatimName}]]" — the vault path is ${verbatimRelPath}). If it's Hayden's own writing, that rule already allows storing it verbatim directly — no need to paraphrase it, just fold it in or reference this file as you see fit.
${existing.pages.length ? `\nALREADY IN THE VAULT — DO NOT DUPLICATE. This exact video already has ${existing.pages.length === 1 ? 'this page' : 'these pages'}, present in the staged tree:\n${existing.pages.map((p) => `- ${p}`).join('\n')}\nRead ${existing.pages.length === 1 ? 'it' : 'them'} FIRST and EDIT in place to deepen ${existing.pages.length === 1 ? 'it' : 'them'} — never create a second page for the same video under a variant title. Preserve what is already written (and its frontmatter) while adding what is missing; the same rule applies to any Concept/Entity/Topic page that already exists — extend it rather than forking a near-duplicate.\n` : ''}
${job.digested ? `\nThis video was LONG, so the text at ${transcriptPath} is Nova's condensed timestamped notes over the full transcript, structured in parts. Treat the notes as the map, not the territory: while drafting each page, Read the relevant sections of the full verbatim transcript at ${verbatimReadPath} (targeted slices around the notes' timestamps — never the whole file at once) so specifics, phrasings, and nuances survive into the paraphrase. Hayden's standing requirement: NO concept or idea from the conversation is lost — cover every idea the notes enumerate, including minor ones, not just the headline themes.\n` : ''}
${sourceUrl ? `\nSource URL: ${sourceUrl} — include this as a \`url:\` field in whatever page's frontmatter is most relevant, so it's directly linkable.\n` : ''}
When done, give a concise final summary: pages created, pages updated, and any contradictions or open questions flagged.`;

      const child = spawn(CLAUDE_BIN, [
        '-p', prompt,
        '--permission-mode', 'bypassPermissions',
        '--allowedTools', 'Read,Write,Edit,Glob,Grep',
        '--output-format', 'json',
        '--max-budget-usd', job.digested ? DIGEST_BUDGET_USD : MAX_BUDGET_USD,
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
    // Same snapshot-before-overwrite policy as every other vault write path —
    // an "updated" change replaces a real page wholesale.
    await backupFile(dest);
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
