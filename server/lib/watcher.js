import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRecord, updateRecord } from './inboxStore.js';
import { NOVA_LENS } from './lens.js';

// The Watcher — Nova's eyes on video. Hayden hands it a link (a fitness
// video, a podcast, a talk); the watch toolchain (yt-dlp + the bundled watch
// skill scripts) pulls the transcript locally, then one model pass reads it
// against the vault and the web and drafts EITHER a Coach evaluation (is
// this training claim actually supported? worth adopting?) or a distilled
// reference note (key ideas, timestamps, wikilinks into his graph). Same
// structural boundaries as the Researcher: runs only on an explicit ask,
// never files itself — the note ALWAYS lands pending in the Inbox, and the
// verbatim transcript never enters the vault (the vault's own rules forbid
// storing third-party transcripts wholesale).

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '1.5';
const WATCH_TIMEOUT_MS = 6 * 60_000; // yt-dlp caption fetch, occasionally audio+whisper

// A transcript longer than this cannot survive one model pass (his first
// real video was a 4-hour podcast: 575k chars — past both the context
// window and any sane single-pass budget). Longer transcripts go through
// the digest stage: chunked extraction passes, then one judgment pass over
// the condensed notes.
export const SINGLE_PASS_MAX_CHARS = 150_000;
const CHUNK_BUDGET_USD = '0.75';
const CHUNK_CONCURRENCY = 3;

// Everything except vault reads and the web-read tools. Edit/Write matter most.
const WATCH_DISALLOWED = [
  'Bash', 'Agent', 'Skill', 'ToolSearch', 'ScheduleWakeup', 'ReportFindings', 'Artifact',
  'SendMessage', 'CronCreate', 'CronDelete', 'CronList', 'DesignSync',
  'EnterWorktree', 'ExitWorktree', 'NotebookEdit', 'PushNotification', 'RemoteTrigger',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate', 'Monitor',
  'Edit', 'Write',
].join(',');

// launchd starts the server with a bare PATH; yt-dlp/ffmpeg live in brew's bin.
const SPAWN_PATH = [process.env.PATH, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
  .filter(Boolean).join(':');

// Prefer the brew python the watch toolchain was set up under (its pycache is
// 3.14); Apple's /usr/bin/python3 (3.9) parses the scripts but is the fallback.
function resolvePython() {
  for (const p of ['/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/usr/bin/python3']) {
    if (existsSync(p)) return p;
  }
  return 'python3';
}

// The watch skill ships as a Claude plugin; its cache dir is versioned. Pick
// the newest installed version that actually carries the script, so a plugin
// update never silently strands us on a deleted dir. NOVA_WATCH_DIR overrides.
export function resolveWatchScript() {
  const override = process.env.NOVA_WATCH_DIR;
  if (override) {
    const p = path.join(override, 'scripts', 'watch.py');
    if (existsSync(p)) return p;
    throw new Error(`NOVA_WATCH_DIR is set but ${p} does not exist`);
  }
  const base = path.join(os.homedir(), '.claude/plugins/cache/claude-video/watch');
  let versions = [];
  try {
    versions = readdirSync(base).filter((v) => /^\d+\.\d+/.test(v));
  } catch {
    throw new Error('the watch toolchain is not installed (no claude-video plugin cache found)');
  }
  const byVersion = (a, b) => {
    const pa = a.split('.').map(Number); const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
  };
  for (const v of versions.sort(byVersion).reverse()) {
    const p = path.join(base, v, 'skills/watch/scripts/watch.py');
    if (existsSync(p)) return p;
  }
  throw new Error('the watch toolchain is installed but watch.py was not found in any version');
}

// A pasted thought may be "URL question" in either order — pull the first
// video-looking URL out and treat the rest as the question.
const VIDEO_HOSTS = /(?:youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|twitch\.tv|x\.com|twitter\.com|instagram\.com|loom\.com|facebook\.com)/i;
export function extractVideoUrl(text) {
  const m = String(text || '').match(/https?:\/\/\S+/);
  if (!m) return null;
  const url = m[0].replace(/[).,;\]]+$/, '');
  if (!VIDEO_HOSTS.test(url)) return null;
  const question = String(text).replace(m[0], ' ').replace(/\s+/g, ' ').trim();
  return { url, question };
}

// The watch script prints a markdown report to stdout — metadata bullets,
// then the transcript inside the one fenced block under "## Transcript".
// Parsed deterministically; a missing transcript is a null, never a guess.
export function parseWatchReport(stdout) {
  const text = String(stdout || '');
  const grab = (re) => { const m = text.match(re); return m ? m[1].trim() : null; };
  const title = grab(/^- \*\*Title:\*\* (.+)$/m);
  const uploader = grab(/^- \*\*Uploader:\*\* (.+)$/m);
  const duration = grab(/^- \*\*Duration:\*\* (\S+)/m);
  const transcriptSource = grab(/^- \*\*Transcript:\*\* \d+ segments[^(]*\(via ([^)]+)\)/m);
  let transcript = null;
  const section = text.split(/^## Transcript$/m)[1];
  if (section) {
    const fence = section.match(/```\n([\s\S]*?)\n```/);
    if (fence && fence[1].trim()) transcript = fence[1].trim();
  }
  return { title, uploader, duration, transcriptSource, transcript };
}

// Local transcript fetch — no model involved. Transcript detail skips the
// video download entirely when captions exist, so this is usually seconds.
export function fetchVideoTranscript(url, workDir) {
  const script = resolveWatchScript();
  return new Promise((resolve, reject) => {
    const child = spawn(resolvePython(), [script, url, '--detail', 'transcript', '--out-dir', workDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: SPAWN_PATH },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, WATCH_TIMEOUT_MS);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const line = stderr.trim().split('\n').pop() || `watch script exited with code ${code}`;
        return reject(new Error(line.slice(0, 300)));
      }
      resolve(parseWatchReport(stdout));
    });
  });
}

// Split on line boundaries so no caption segment is cut mid-sentence.
export function chunkTranscript(transcript, chunkChars = SINGLE_PASS_MAX_CHARS) {
  if (transcript.length <= chunkChars) return [transcript];
  const chunks = [];
  let cur = [];
  let len = 0;
  for (const line of transcript.split('\n')) {
    if (len + line.length + 1 > chunkChars && cur.length) {
      chunks.push(cur.join('\n'));
      cur = [];
      len = 0;
    }
    cur.push(line);
    len += line.length + 1;
  }
  if (cur.length) chunks.push(cur.join('\n'));
  return chunks;
}

export function buildChunkNotesPrompt({ title, part, total, chunkPath, question }) {
  return `${NOVA_LENS}

You are Nova's Watcher doing an EXHAUSTIVE extraction pass over part ${part} of ${total} of a long video transcript ("${title || 'untitled'}"). Read the transcript chunk at ${chunkPath} in full. Your notes are the only representation of this part that later passes will see — anything you omit is LOST from Hayden's second brain, so completeness beats brevity every time.

Capture, each with its transcript timestamp (M:SS or H:MM:SS):
- EVERY distinct idea, framework, argument, claim, and mental model — not just the headline ones. When the speakers signal a chapter or topic shift, mark it as a heading and capture the ideas inside it.
- Stories and examples that carry a point (one line each, with the point).
- Every person, book, study, company, and work referenced, and what was said about it.
- Disagreements between speakers, self-corrections, nuances, caveats, and anything else you notice that a second brain should keep.
${question ? `- Anything bearing on Hayden's ask: "${question}".\n` : ''}
Dense bullets, not prose — no verdicts yet, no filler, no padding. Length follows the content: a dense part of a deep podcast often needs 1000-2000 words of notes. Never compress two distinct ideas into one line.

Output ONLY a JSON object: {"notes":"the notes in markdown"}. No code fences, no commentary.`;
}

export function buildWatchPrompt({ url, title, uploader, duration, question, transcriptPath, transcriptSource, digest = false }) {
  return `${NOVA_LENS}

You are Nova's Watcher. Hayden submitted a video; ${digest ? 'it is LONG, so its full timestamped transcript was extracted locally and condensed by your own chunked extraction passes into the notes file below' : 'its full timestamped transcript has been extracted locally'}. Your job is to watch it FOR him — read ${digest ? 'the notes' : 'the transcript'}, weigh it, and draft the one note worth keeping.

The video:
- URL: ${url}
- Title: ${title || '(unknown)'}
- Uploader: ${uploader || '(unknown)'}
- Duration: ${duration || '(unknown)'}
- Transcript source: ${transcriptSource || 'captions'}
- ${digest ? 'Condensed notes file (Read this FIRST, in full — timestamps in it are from the real transcript)' : 'Transcript file (Read this FIRST, in full)'}: ${transcriptPath}
${question ? `\nHayden's specific ask: ${question}\n` : ''}
First decide what this video is, then take the matching lane:

LANE "coach" — training / nutrition / health / fitness content. Put on the Coach's hat:
- List the video's actual claims and judge each for scientific and empirical support: well-supported, contested, or wrong. Use web search to check the load-bearing claims against primary sources and cite what you find as [links].
- Judge relevance to Hayden's own training (his routines and sessions are in this vault — read them if it sharpens the call).
- End with a straight verdict: adopt / partially useful / ignore, and exactly WHAT to take if anything. If the video is fluff or content-farming, say so plainly — an honest "nothing here" beats manufactured value.

LANE "reference" — podcast / talk / ideas content. Distill it:
- A 2-3 sentence summary, then the key ideas each anchored to a transcript timestamp (M:SS), then the parts most relevant to Hayden's goals, then actionable takeaways if any genuinely exist.

Both lanes:
- Cite transcript timestamps for anything specific.
- Weave the note into his vault: grep the vault for genuinely related pages and include 2-5 wikilinks like [[Exact Page Title]] — ONLY pages that actually exist or broad topics ([[Hypertrophy]], [[Sleep]]); never invent specific page titles.
- You have the words, not the pictures. If a claim can't be judged without seeing the screen (form demonstrations, on-screen data), flag that honestly instead of guessing.
- Write timelessly (absolute dates, no "recently"). ~250-500 words.

Output ONLY a JSON object: {"lane":"coach"|"reference","title":"Short Note Title","verdict":"one sentence — the watch-it-or-skip-it call","body":"the full note in markdown"}. No code fences, no commentary.`;
}

export function normalizeWatch(parsed) {
  const lane = parsed.lane === 'coach' ? 'coach' : 'reference';
  const title = String(parsed.title || '').trim().slice(0, 120);
  const verdict = String(parsed.verdict || '').trim().slice(0, 300);
  const body = String(parsed.body || '').trim();
  if (!title || !body) throw new Error('the Watcher returned an incomplete note');
  return { lane, title, verdict, body };
}

// The note's header is composed in CODE from metadata the toolchain actually
// returned — the source line is never the model's to get wrong.
export function composeWatchNote({ url, title, uploader, duration, transcriptSource, verdict, body }) {
  const src = [title || url, uploader, duration].filter(Boolean).join(' — ');
  const lines = [`**Source:** [${src}](${url}) · transcript via ${transcriptSource || 'captions'}`];
  if (verdict) lines.push(`**Verdict:** ${verdict}`);
  return `${lines.join('\n')}\n\n${body}\n`;
}

// A conversation reply may end with one WATCH line — same structural boundary
// as RESEARCH: only fires when Hayden explicitly handed over a video link.
export function parseWatchDirective(text) {
  const m = (text || '').match(/^\s*WATCH\s+(\{.*\})\s*$/m);
  if (!m) return { cleanText: text, watch: null };
  const cleanText = text.replace(m[0], '').replace(/\n{3,}/g, '\n\n').trim();
  try {
    const parsed = JSON.parse(m[1]);
    const url = String(parsed.url || '').trim();
    if (!/^https?:\/\//.test(url)) return { cleanText, watch: null, parseError: 'the watch directive had no usable URL' };
    return { cleanText, watch: { url, question: String(parsed.question || '').trim() } };
  } catch {
    return { cleanText, watch: null, parseError: 'the watch directive was not valid JSON' };
  }
}

export async function startVideoWatch(vaultPath, url, question = '') {
  const u = String(url || '').trim();
  if (!/^https?:\/\//.test(u)) throw new Error('a video URL is required');
  if (u.length > 500) throw new Error('that URL does not look right (500 chars max)');
  const q = String(question || '').trim().slice(0, 500);

  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'video',
    text: `Watch: ${u}${q ? ` — ${q}` : ''}`,
    source: 'watcher',
    mode: 'draft',
    status: 'classifying', // shows as in-flight in the queue
    createdAt: new Date().toISOString(),
  });
  runWatchJob(vaultPath, record.id, u, q);
  return record;
}

// A video record carries its whole input in its text, so a failed run can
// re-fire in place — same record, same link, fresh attempt.
export async function retryWatch(vaultPath, record) {
  const m = String(record.text || '').match(/^Watch:\s*(\S+)(?:\s+—\s+([\s\S]+))?$/);
  if (!m) throw new Error('this video record has no URL to re-run');
  const updated = await updateRecord(record.id, { status: 'classifying', error: null });
  runWatchJob(vaultPath, record.id, m[1], (m[2] || '').trim());
  return updated;
}

// The fetch-then-reason step, shared by first runs and retries.
async function runWatchJob(vaultPath, recordId, url, question) {
  let workDir = null;
  try {
    workDir = await mkdtemp(path.join(os.tmpdir(), 'nova-watch-'));
    const report = await fetchVideoTranscript(url, workDir);
    if (!report.transcript) {
      throw new Error('no transcript available — the video has no captions and no Whisper key is configured (~/.config/watch/.env)');
    }
    // Long transcript → condense first; the judgment pass reads the notes.
    const digest = report.transcript.length > SINGLE_PASS_MAX_CHARS;
    let transcriptPath = path.join(workDir, 'transcript.txt');
    if (digest) {
      const notes = await digestTranscript(vaultPath, report, path.join(workDir, 'digest'), question);
      transcriptPath = path.join(workDir, 'notes.md');
      await writeFile(transcriptPath, notes, 'utf8');
    } else {
      await writeFile(transcriptPath, report.transcript, 'utf8');
    }

    const { lane, title, verdict, body } = await runWatchModel(vaultPath, {
      url, question, transcriptPath, digest,
      title: report.title, uploader: report.uploader,
      duration: report.duration, transcriptSource: report.transcriptSource,
    });
    const note = composeWatchNote({
      url, title: report.title, uploader: report.uploader, duration: report.duration,
      transcriptSource: report.transcriptSource, verdict, body,
    });
    // Persist the transcript so approval can file it into Raw/ alongside the
    // source page — the vault filing must not depend on this tmp workDir.
    // fileURLToPath, NEVER URL.pathname — a space in the repo path ("Claude
    // Projects") percent-encodes and silently writes a ghost directory tree
    const dataRoot = process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
    await mkdir(path.join(dataRoot, 'watch'), { recursive: true });
    const transcriptRef = `${recordId}.txt`;
    await writeFile(path.join(dataRoot, 'watch', transcriptRef), report.transcript, 'utf8');
    // ALWAYS pending — external content never files itself
    await updateRecord(recordId, {
      status: 'pending',
      lane,
      decision: {
        route: 'watch-note',
        confidence: 'high',
        title,
        reason: lane === 'coach'
          ? "The Coach's read. Worth keeping? APPROVE files a Source page + the transcript. Want every concept woven into your second brain? DEEP WEAVE runs the full analysis."
          : 'Watched and weighed. Worth keeping? APPROVE files a Source page + the transcript. Want every concept woven into your second brain? DEEP WEAVE runs the full analysis.',
        payload: { title, body: note, url, lane, transcriptRef },
      },
    });
  } catch (e) {
    await updateRecord(recordId, { status: 'error', error: e.message }).catch(() => {});
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// The chunked extraction stage: split, write chunk files, run a bounded
// number of cheap passes concurrently, join their notes with part headers.
// Exported for the ingest pipeline, which has the same long-video problem.
export async function digestTranscript(vaultPath, report, digestDir, question = '') {
  await mkdir(digestDir, { recursive: true });
  const chunks = chunkTranscript(report.transcript);
  const notes = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const i = next++;
      const chunkPath = path.join(digestDir, `chunk-${i + 1}.txt`);
      await writeFile(chunkPath, chunks[i], 'utf8');
      // Full-strength model: extraction faithfulness is the whole game here —
      // whatever a cheap pass drops is unrecoverable downstream.
      const parsed = await runClaudeJson(vaultPath, buildChunkNotesPrompt({
        title: report.title, part: i + 1, total: chunks.length, chunkPath, question,
      }), { allowedTools: 'Read', budget: CHUNK_BUDGET_USD });
      const text = String(parsed.notes || '').trim();
      if (!text) throw new Error(`extraction pass ${i + 1}/${chunks.length} returned no notes`);
      notes[i] = `## Part ${i + 1} of ${chunks.length}\n\n${text}`;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, worker));
  return notes.join('\n\n');
}

async function runWatchModel(vaultPath, promptInputs) {
  const parsed = await runClaudeJson(vaultPath, buildWatchPrompt(promptInputs), {
    allowedTools: 'Read Grep Glob WebSearch WebFetch',
    budget: MAX_BUDGET_USD,
  });
  return normalizeWatch(parsed);
}

// One spawn, one JSON object back — shared by the judgment and chunk passes.
function runClaudeJson(vaultPath, prompt, { allowedTools, budget, model } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      '--allowedTools', allowedTools || 'Read',
      '--disallowedTools', WATCH_DISALLOWED,
      '--strict-mcp-config', // MCP servers can't auth under launchd — drop them
      '--output-format', 'json',
      '--max-budget-usd', budget || MAX_BUDGET_USD,
      '--session-id', randomUUID(),
    ];
    if (model) args.push('--model', model);
    const child = spawn(CLAUDE_BIN, args, { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        let outer;
        try {
          outer = JSON.parse(stdout);
        } catch {
          throw new Error(`claude returned no JSON (exit ${code}): ${(stderr || stdout).trim().slice(0, 300) || 'no output'}`);
        }
        if (outer.is_error || code !== 0) {
          throw new Error(outer.result || stderr.trim() || `claude exited with code ${code} with no error text (likely budget or context exhausted)`);
        }
        const text = (outer.result || '').trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error(text.slice(0, 200) || 'no JSON in Watcher response');
        resolve(JSON.parse(jsonMatch[0]));
      } catch (e) {
        reject(e);
      }
    });
  });
}
