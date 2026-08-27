import { spawn } from 'node:child_process';
import { mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { modelFor, laneEnabled, laneOffError } from './modelPrefs.js';
import { backupFile } from './backup.js';

const SKIP = new Set(['.obsidian', '.claude', '.DS_Store']);
const MAX_BUDGET_USD = '3';
// Mirrors watcher.js's own threshold — imported lazily there, so name it
// here rather than reaching into that module at load time.
const SINGLE_PASS_MAX_CHARS_ING = 150_000;
// A cache key must be a safe filename AND stable across re-uploads of the
// same book, so a retry reads yesterday's notes instead of re-paying.
const slugKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// The routing decision, pure and exported so it can be tested without
// spawning a model: is this text too big for one vault pass, and what key
// does its digest cache under? The bug this replaces was a decision buried
// inside the video-fetch branch, where a book could never reach it.
export function needsDigest(text) {
  return !!text && text.length > SINGLE_PASS_MAX_CHARS_ING;
}
export function digestCacheKey(book, text) {
  return book
    ? `book-${slugKey(`${book.title}-${book.author}`)}`
    : `text-${createHash('sha1').update(text).digest('hex').slice(0, 16)}`;
}
// A digested long video's weave reads condensed notes PLUS targeted slices
// of the verbatim transcript — the extra headroom is what makes "nothing
// lost" affordable to honor.
const DIGEST_BUDGET_USD = '8';
// launchd services don't inherit the interactive shell's PATH, so `claude` (installed
// under ~/.local/bin) wouldn't resolve via a bare spawn('claude', ...) — use the
// absolute path. Override with CLAUDE_BIN in .env if it lives somewhere else.
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const jobs = new Map();

// Jobs persist to disk (the Distiller's pattern) so a ready weave survives a
// server restart — a $6 diff died in this Map twice before this existed, and
// its approval had to be applied out-of-band from the surviving staging tree.
// One file per job, single-writer, so there is no shared-cache clobber risk.
// The in-memory Map stays the fast path; disk is the recovery path.
const jobsDir = () => path.join(process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'), 'ingest');

async function persistJob(job) {
  try {
    await mkdir(jobsDir(), { recursive: true });
    const { id, status, summary, cost, changes, error, vaultPath, workDir, stagingVault, digested, createdAt, book, person, progress, heartbeatAt } = job;
    await writeFile(path.join(jobsDir(), `${id}.json`),
      JSON.stringify({ id, status, summary, cost, changes, error, vaultPath, workDir, stagingVault, digested, createdAt, book, person, progress, heartbeatAt }), 'utf8');
  } catch (e) {
    console.error(`ingest job ${job.id} failed to persist:`, e.message);
  }
}

async function loadJobFromDisk(jobId) {
  if (!/^[a-f0-9-]+$/i.test(jobId)) return null; // job ids are uuid slices — never a path
  try {
    return JSON.parse(await readFile(path.join(jobsDir(), `${jobId}.json`), 'utf8'));
  } catch {
    return null;
  }
}

async function removeJobFile(jobId) {
  await rm(path.join(jobsDir(), `${jobId}.json`), { force: true }).catch(() => {});
}

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
  // `book` = {title, author, notes?}: no text and no URL — Nova's Librarian
  // researches the book first (lib/librarian.js) and the resulting dossier
  // rides this exact rail from there. One rail, one review UI, one undo.
  // `person` = a Scout subject (see lib/scout.js): the same shape of work as
  // a book — research first, then this rail weaves it. One rail, one review
  // UI, one undo, however the knowledge arrived.
  return function run(transcriptText, sourceUrl, book = null, person = null) {
    if (!laneEnabled('ingest')) throw laneOffError('ingest');
    if (book && !laneEnabled('librarian')) throw laneOffError('librarian');
    if (person && !laneEnabled('scout')) throw laneOffError('scout');
    if (book && (!String(book.title || '').trim() || !String(book.author || '').trim())) {
      throw new Error('a book needs both a title and an author');
    }
    const jobId = randomUUID().slice(0, 8);
    const workDir = path.join(os.tmpdir(), 'nova-ingest', jobId);
    const stagingVault = path.join(workDir, 'vault');
    const job = { id: jobId, status: 'staging', summary: '', cost: 0, changes: [], error: null, stagingVault, workDir, vaultPath, createdAt: new Date().toISOString(), ...(book ? { book: { title: String(book.title).trim(), author: String(book.author).trim(), ...(book.reading ? { reading: book.reading } : {}) } } : {}), ...(person ? { person } : {}) };
    jobs.set(jobId, job);
    persistJob(job);

    (async () => {
      // BOOK MODE: research before the weave. The dossier is Nova's own
      // authored synthesis (researched, never the book's text), so it is
      // safe — and right — to keep verbatim in Raw/ as provenance.
      const bookProvided = !!(book && transcriptText && transcriptText.trim());
      if (book && !bookProvided) {
        job.status = 'researching';
        persistJob(job);
        const { runBookResearch, composeBookDossier } = await import('./librarian.js');
        await mkdir(workDir, { recursive: true });
        const { dossier, cost } = await runBookResearch({ ...job.book, notes: book.notes || '', model: book.model }, workDir);
        job.cost += cost;
        transcriptText = composeBookDossier(job.book, dossier);
        job.status = 'staging';
        persistJob(job);
      }
      // PERSON MODE: the Scout researches an individual or an account, and
      // its dossier rides this same rail. Like the book dossier it is Nova's
      // OWN synthesis — researched, never their work reproduced — so keeping
      // it verbatim in Raw/ as provenance is both safe and right.
      if (person) {
        job.status = 'researching';
        persistJob(job);
        const { runPersonResearch, composePersonDossier } = await import('./scout.js');
        await mkdir(workDir, { recursive: true });
        const { dossier, cost } = await runPersonResearch(vaultPath, person, { notes: person.notes || '', model: person.model, workDir });
        job.cost += cost;
        transcriptText = composePersonDossier(person, dossier);
        job.status = 'staging';
        persistJob(job);
      }
      // No pasted text + a link = fetch the transcript ourselves via the
      // Watcher's toolchain, then ingest exactly as if he had pasted it.
      let fetched = false;
      let verbatimOverride = null;
      if ((!transcriptText || !transcriptText.trim()) && sourceUrl) {
        fetched = true;
        job.status = 'fetching';
        const { fetchVideoTranscript, digestTranscriptCached, SINGLE_PASS_MAX_CHARS } = await import('./watcher.js');
        const report = await fetchVideoTranscript(sourceUrl, path.join(workDir, 'watch'));
        if (!report.transcript) {
          throw new Error('no transcript available — the video has no captions and Whisper could not transcribe it');
        }
        // A multi-hour transcript can't survive the single vault pass — the
        // model gets condensed notes; Raw/ still gets the full verbatim text.
        if (report.transcript.length > SINGLE_PASS_MAX_CHARS) {
          job.status = 'digesting';
          job.digested = true;
          const notes = await digestTranscriptCached(vaultPath, report, path.join(workDir, 'digest'), '', videoIdOf(sourceUrl));
          transcriptText = composeFetchedTranscript(report, sourceUrl, notes);
          verbatimOverride = composeFetchedTranscript(report, sourceUrl);
        } else {
          transcriptText = composeFetchedTranscript(report, sourceUrl);
        }
        job.status = 'staging';
      }
      // LONG IS LONG, WHATEVER IT CAME FROM.
      //
      // The "too big for one pass" branch above lives inside the VIDEO
      // fetch, so it could only ever fire for a link. A book he uploads
      // arrives as text with no sourceUrl, skips it entirely, and gets the
      // $3 single-pass cap — while a 4-hour podcast gets $8. Atomic Habits
      // is 495,673 characters, over three times the single-pass threshold
      // and comparable to that podcast: the weave died at $3.13 having
      // written nothing, which is his money spent for zero pages.
      //
      // Any over-long text now takes the same condensed-notes path, with
      // the verbatim kept for targeted reads. The digest is cached under a
      // stable key so a retry NEVER re-pays for it — that lesson is already
      // written in blood for videos.
      if (!job.digested && needsDigest(transcriptText)) {
        job.status = 'digesting';
        job.digested = true;
        persistJob(job);
        const { digestTranscriptCached } = await import('./watcher.js');
        const key = digestCacheKey(book ? job.book : null, transcriptText);
        const notes = await digestTranscriptCached(
          vaultPath,
          { title: book ? `${job.book.title} — ${job.book.author}` : 'Pasted text', transcript: transcriptText },
          path.join(workDir, 'digest'),
          '',
          key,
          // A book digest is 15-40 minutes. Without this the job looked
          // identical to a dead one, which is precisely how a WORKING
          // analysis read as another failure to him.
          ({ done, total }) => {
            job.progress = { done, total, of: 'parts read' };
            job.heartbeatAt = new Date().toISOString();
            persistJob(job);
          },
        );
        verbatimOverride = transcriptText; // Raw/ still gets every word
        transcriptText = notes;
        job.status = 'staging';
      }
      // Already in the vault? A watch filing (or an earlier weave) may have
      // left a Source page and the verbatim transcript. Re-running must
      // DEEPEN those pages, never mint a parallel set.
      let existing = { pages: [], transcriptRel: null };
      if (sourceUrl) existing = await findExistingVideoPages(vaultPath, sourceUrl);
      else if (book) {
        // same contract as videos: a re-research must DEEPEN the earlier
        // pages, never mint a parallel set under a variant title
        const { findExistingBookPages } = await import('./librarian.js');
        existing = { ...(findExistingBookPages(vaultPath, job.book.title, job.book.author)), transcriptRel: null };
      } else if (person) {
        // researching someone twice must deepen what he already holds on
        // them — the same contract, extended to people
        const { findExistingPersonPages } = await import('./scout.js');
        existing = { ...findExistingPersonPages(vaultPath, person), transcriptRel: null };
      }
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
          `${book ? (bookProvided ? "Text/notes of a book supplied by Hayden from his own copy via Nova OS" : "Research dossier authored by Nova's Librarian (Nova's own synthesis from public sources — not the book's text)") : person ? ("Research dossier authored by Nova's Scout (Nova's own synthesis about a person's public work — not their words reproduced)") : fetched ? "Verbatim video transcript fetched by Nova's Watcher from the link Hayden submitted" : 'Verbatim original text pasted by Hayden via Nova OS'}, received ${new Date().toISOString().slice(0, 10)}.${sourceUrl ? `\nSource URL: ${sourceUrl}` : ''}\n\n---\n\n${verbatimOverride ?? transcriptText}`,
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
      persistJob(job); // carries the digested flag into the durable copy

      const bookRules = book ? (await import('./librarian.js')).bookWeaveRules(job.book, bookProvided) : '';
      const personRules = person ? (await import('./scout.js')).personWeaveRules(person) : '';
      const prompt = `New content to add to the vault — ${book ? bookProvided ? `the text/notes of the book "${job.book.title}" by ${job.book.author}, supplied by Hayden from his own copy` : `a research dossier Nova's Librarian compiled about the book "${job.book.title}" by ${job.book.author}, which Hayden asked to add to his vault` : fetched ? 'a timestamped video transcript Nova fetched from a link Hayden submitted' : person ? `a research dossier Nova's Scout compiled about ${person.label}, whom Hayden asked to research` : 'pasted by Hayden via Nova OS'}, saved at ${transcriptPath}.${bookRules}${personRules} This could be an external source (a podcast/video transcript, article, etc.) or it could be Hayden's own note, idea, or reflection that just came to mind — read it and use your own judgement, per this vault's root CLAUDE.md, to pick the right page type (Source, Concept, Entity, Topic, Journal, or Analysis) rather than assuming it's a Source. Follow CLAUDE.md exactly, in batch mode (process fully in one pass, no per-item discussion — just do the work).

The exact verbatim original text ${existing.transcriptRel ? 'is ALREADY in the vault' : 'is already saved in the vault'} at ${verbatimRelPath}${existing.transcriptRel ? ' (do NOT write another copy of it — it is not in this staged tree because Raw/ is not staged, and it must stay exactly as it is)' : ''}. If this is third-party copyrighted material needing the paraphrase treatment per CLAUDE.md's copyright rule, link to this file from whatever page you create (e.g. "Verbatim original: [[${verbatimName}]]" — the vault path is ${verbatimRelPath}). If it's Hayden's own writing, that rule already allows storing it verbatim directly — no need to paraphrase it, just fold it in or reference this file as you see fit.
${existing.pages.length ? `\nALREADY IN THE VAULT — DO NOT DUPLICATE. This exact ${book ? 'book' : 'video'} already has ${existing.pages.length === 1 ? 'this page' : 'these pages'}, present in the staged tree:\n${existing.pages.map((p) => `- ${p}`).join('\n')}\nRead ${existing.pages.length === 1 ? 'it' : 'them'} FIRST and EDIT in place to deepen ${existing.pages.length === 1 ? 'it' : 'them'} — never create a second page for the same ${book ? 'book' : 'video'} under a variant title. Preserve what is already written (and its frontmatter) while adding what is missing; the same rule applies to any Concept/Entity/Topic page that already exists — extend it rather than forking a near-duplicate.\n` : ''}
${job.digested ? `\nThis ${book ? 'BOOK' : 'video'} was LONG, so the text at ${transcriptPath} is Nova's condensed notes over the full ${book ? 'text' : 'transcript'}, structured in parts. Treat the notes as the map, not the territory: while drafting each page, Read the relevant sections of the full ${book ? 'book text' : 'verbatim transcript'} at ${verbatimReadPath} (targeted slices around the passages the notes point at — never the whole file at once) so specifics, phrasings, and nuances survive into the paraphrase. Hayden's standing requirement: NO concept or idea from the ${book ? 'book' : 'conversation'} is lost — cover every idea the notes enumerate, including minor ones, not just the headline themes.\n` : ''}
${sourceUrl ? `\nSource URL: ${sourceUrl} — include this as a \`url:\` field in whatever page's frontmatter is most relevant, so it's directly linkable.\n` : ''}
When done, give a concise final summary: pages created, pages updated, and any contradictions or open questions flagged.`;

      // A long transcript rides a SEPARATE lane, so it can be switched off (or
      // moved to a cheaper model) without touching short pasted ingests.
      if (job.digested && !laneEnabled('ingest-digest')) throw laneOffError('ingest-digest');

      const child = spawn(CLAUDE_BIN, [
        '-p', prompt,
        '--permission-mode', 'bypassPermissions',
        '--allowedTools', 'Read,Write,Edit,Glob,Grep',
        '--output-format', 'json',
        '--max-budget-usd', job.digested ? DIGEST_BUDGET_USD : MAX_BUDGET_USD,
        // Digested weaves write pages FROM exhaustive notes — structured
        // transformation, not judgment. On the ambient default (Opus at the
        // time) the 4-hour-podcast weave burned $8.15 and died at the cap;
        // Sonnet does this job well inside it. Short pasted ingests default
        // to Opus — there, one pass is doing all the thinking. Both are now
        // named lanes rather than an implicit fall-through to the account.
        '--model', job.digested ? modelFor('ingest-digest') : modelFor('ingest'),
        '--no-session-persistence',
        // stdin must be closed, not an open pipe: the CLI waits 3s for stdin
        // data it will never get, warns on stderr, and that warning then
        // masqueraded as the job's error message.
      ], { cwd: stagingVault, stdio: ['ignore', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('close', (code) => {
        // Parse stdout FIRST even on a non-zero exit: a budget kill reports
        // is_error + total_cost_usd there, while stderr carries only noise.
        // Reading stderr first is how a harmless stdin warning came to be
        // shown as the cause of a fifteen-minute failure.
        let result = null;
        try { result = JSON.parse(stdout); } catch { /* not JSON — handled below */ }
        if (result) {
          // ADD, don't assign: a book job already spent its research cost
          // before the weave started (measured: the ready total showed $1.75
          // after $3.91 of research — the overwrite was hiding real money).
          job.cost += result.total_cost_usd || 0;
          job.summary = result.result || '(no summary returned)';
        }
        if (code !== 0 || result?.is_error) {
          const spent = Number(result?.total_cost_usd);
          const budget = Number(job.digested ? DIGEST_BUDGET_USD : MAX_BUDGET_USD);
          job.status = 'error';
          job.error = (result?.is_error && result?.result)
            || (Number.isFinite(spent) && spent >= budget * 0.98
              // A dead end is not a report. Say what it cost, what it left
              // behind, and the ONE setting that changes the outcome — he
              // lost $3.13 to this message and had nothing to act on.
              ? `the vault pass ran out of budget — $${spent.toFixed(2)} spent against a $${budget} cap, and nothing was written to your vault.`
                + (job.digested ? ` The condensed notes ARE saved, so running it again skips that cost and re-tries only the weave.` : '')
                + (job.digested && modelFor('ingest-digest') !== 'sonnet'
                  ? ` This pass ran on ${modelFor('ingest-digest')}; Settings → Claude models → "Vault ingest · long transcripts" is designed for sonnet, which is the cheaper structured path and the reason this lane exists.`
                  : '')
              : stderr.trim() || `claude exited with code ${code}${Number.isFinite(spent) ? ` after $${spent.toFixed(2)}` : ''}`);
        }
        if (!result) job.summary = stdout.trim();
        if (job.status !== 'error') {
          try {
            job.changes = diffTrees(vaultPath, stagingVault);
            job.status = 'ready';
          } catch (e) {
            job.status = 'error';
            job.error = 'Failed to compute changes: ' + e.message;
          }
        }
        persistJob(job); // ready (with full changes) or error — durable either way
      });
      child.on('error', (err) => {
        job.status = 'error';
        job.error = err.message;
        persistJob(job);
      });
    })().catch((e) => {
      job.status = 'error';
      job.error = e.message;
      persistJob(job);
    });

    return jobId;
  };
}

function redact(job) {
  return { id: job.id, status: job.status, summary: job.summary, cost: job.cost, error: job.error,
    changes: (job.changes || []).map((c) => ({ path: c.path, kind: c.kind, content: c.content })) };
}

export async function getJob(jobId) {
  const job = jobs.get(jobId);
  if (job) return redact(job);
  const disk = await loadJobFromDisk(jobId);
  if (!disk) return null;
  // On disk but not in memory = the server restarted. A ready/error job is
  // fully recoverable (changes travel in the file); a mid-flight one lost
  // its process — say so instead of showing an eternal spinner.
  if (!['ready', 'error', 'applied'].includes(disk.status)) {
    return { ...redact(disk), status: 'error', error: 'the server restarted mid-job — start it again (a cached digest makes the re-run cheap)' };
  }
  return redact(disk);
}

async function loadJobAnywhere(jobId) {
  return jobs.get(jobId) || await loadJobFromDisk(jobId);
}

export async function approveJob(jobId) {
  const job = await loadJobAnywhere(jobId);
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
  await removeJobFile(jobId);
}

export async function discardJob(jobId) {
  const job = await loadJobAnywhere(jobId);
  if (!job) throw new Error('job not found');
  await cleanup(job);
  jobs.delete(jobId);
  await removeJobFile(jobId);
}

async function cleanup(job) {
  // the tmp workDir may already be gone after a restart or reboot — fine
  if (job.workDir) await rm(job.workDir, { recursive: true, force: true }).catch(() => {});
}
