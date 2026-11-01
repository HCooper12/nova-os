import { fetchCarousel, carouselBrief } from './carousel.js';
import { spawn } from 'node:child_process';
import { firstBalancedObjectMatch, parseModelJson } from './jsonSalvage.js';
import { modelFor, laneEnabled, laneOffError, effortArgs } from './modelPrefs.js';
import { isGateModel } from './modelChoice.js';
import { readdirSync, existsSync, copyFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRecord, updateRecord } from './inboxStore.js';
import { NOVA_LENS } from './lens.js';
import { recordRun, fromEnvelope } from './modelSpend.js';
import { denyAllExcept } from './spawnBoundary.js';
import { assertNotProtected } from './protectedRoots.js';

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
const WATCH_TIMEOUT_MS = 6 * 60_000; // yt-dlp caption fetch, occasionally audio+whisper

// A transcript longer than this cannot survive one model pass (his first
// real video was a 4-hour podcast: 575k chars — past both the context
// window and any sane single-pass budget). Longer transcripts go through
// the digest stage: chunked extraction passes, then one judgment pass over
// the condensed notes.
export const SINGLE_PASS_MAX_CHARS = 150_000;
// Chunk SIZE is a separate question from the digest threshold, and measured:
// a 150k-char chunk cost $1.46 on the CLI's default (Opus) model and died at
// a $0.75 cap having written 218 tokens — it spent the whole budget reading.
// The same content at 60k chars on Sonnet costs ~$0.35 and returns ~7k
// tokens of dense notes. Extraction is a faithfulness job, not a judgment
// job, so Sonnet is the right instrument as well as the affordable one.
export const CHUNK_CHARS = 60_000;
const CHUNK_MODEL = () => modelFor('watcher-chunk');
const CHUNK_CONCURRENCY = 3;

// A PROJECT'S LENSES (Projects phase 2, PROJECTS-PLAN §2). A library watch
// still lets the model choose coach or reference; a project watch reads the
// video through the lens the project (or his per-video pick) names:
// reference = what it says, claims = do its claims hold, design = what it
// SHOWS, from frames the watch plugin samples. Shared with projectKernel.js.
export const WATCH_LENSES = ['reference', 'claims', 'design'];
// frames sampled for the design lens: enough to see a room from its angles,
// few enough that one model pass looks at every one
export const DESIGN_FRAMES = 24;

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
  // the frame list (only when frames were asked for): each line is
  // "- `<absolute path>` (t=MM:SS, reason=…)"; a path that is not there is a null
  const frames = [];
  const frameSection = (text.split(/^## Frames$/m)[1] || '').split(/^## Transcript$/m)[0];
  for (const m of frameSection.matchAll(/^- `([^`]+)` \(t=([0-9:]+)/gm)) frames.push({ path: m[1], t: m[2] });
  return { title, uploader, duration, transcriptSource, transcript, frames };
}

// Local transcript fetch — no model involved. Transcript detail skips the
// video download entirely when captions exist, so this is usually seconds.
// `frames: true` (the design lens) downloads the video and samples
// DESIGN_FRAMES keyframes into <workDir>/frames as well.
export function fetchVideoTranscript(url, workDir, { frames = false } = {}) {
  const script = resolveWatchScript();
  const detail = frames ? ['--detail', 'efficient', '--max-frames', String(DESIGN_FRAMES)] : ['--detail', 'transcript'];
  return new Promise((resolve, reject) => {
    const child = spawn(resolvePython(), [script, url, ...detail, '--out-dir', workDir], {
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
        // the LAST stderr line is the script's own "yt-dlp did not produce a
        // video file in <temp folder>"; the reason is yt-dlp's "ERROR:" line
        // above it (31 Oct 2026: an Instagram photo post said nothing but a
        // temp path). Keep that reason first.
        const lines = stderr.trim().split('\n');
        const why = [...lines].reverse().find((l) => /^ERROR:/i.test(l.trim()));
        const line = (why ? why.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/i, '') : lines.pop()) || `watch script exited with code ${code}`;
        return reject(new Error(line.slice(0, 300)));
      }
      resolve(parseWatchReport(stdout));
    });
  });
}

// Split on line boundaries so no caption segment is cut mid-sentence. A
// single line LONGER than the cap (a transcript delivered as one unbroken
// paragraph — rare, but it exists) is hard-split rather than left whole:
// an oversized chunk is exactly the budget kill this function prevents.
export function chunkTranscript(transcript, chunkChars = SINGLE_PASS_MAX_CHARS) {
  if (transcript.length <= chunkChars) return [transcript];
  const lines = [];
  for (const line of transcript.split('\n')) {
    if (line.length <= chunkChars) { lines.push(line); continue; }
    for (let i = 0; i < line.length; i += chunkChars) lines.push(line.slice(i, i + chunkChars));
  }
  const chunks = [];
  let cur = [];
  let len = 0;
  for (const line of lines) {
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

Output the notes as PLAIN MARKDOWN — start directly with the first heading or bullet. No JSON, no code fences, no preamble, no sign-off.`;
}

export function buildWatchPrompt({ url, title, uploader, duration, question, transcriptPath, transcriptSource, digest = false, him = '', project = null, lens = null, projectContext = '' }) {
  if (project) return buildProjectWatchPrompt({ url, title, uploader, duration, question, transcriptPath, transcriptSource, digest, him, project, lens, projectContext });
  return `${NOVA_LENS}

You are Nova's Watcher. Hayden submitted a video; ${digest ? 'it is LONG, so its full timestamped transcript was extracted locally and condensed by your own chunked extraction passes into the notes file below' : 'its full timestamped transcript has been extracted locally'}. Your job is to watch it FOR him — read ${digest ? 'the notes' : 'the transcript'}, weigh it, and draft the one note worth keeping.

The video:
- URL: ${url}
- Title: ${title || '(unknown)'}
- Uploader: ${uploader || '(unknown)'}
- Duration: ${duration || '(unknown)'}
- Transcript source: ${transcriptSource || 'captions'}
- ${digest ? 'Condensed notes file (Read this FIRST, in full — timestamps in it are from the real transcript)' : 'Transcript file (Read this FIRST, in full)'}: ${transcriptPath}
${question ? `\nHayden's specific ask: ${question}\n` : ''}${him ? `\nWHO YOU ARE WATCHING FOR (his profile page; judge relevance against it):\n${him}\n` : ''}
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

export function normalizeWatch(parsed, { lens = null } = {}) {
  const lane = lens && WATCH_LENSES.includes(lens) ? lens : parsed.lane === 'coach' ? 'coach' : 'reference';
  const title = String(parsed.title || '').trim().slice(0, 120);
  const verdict = String(parsed.verdict || '').trim().slice(0, 300);
  const body = String(parsed.body || '').trim();
  if (!title || !body) throw new Error('the Watcher returned an incomplete note');
  const out = { lane, title, verdict, body };
  // a project watch also answers "would this belong in his main library?"
  if (lens) out.libraryWorthy = normalizeLibraryWorthy(parsed.libraryWorthy);
  return out;
}

// STRICT: yes only when the model said a real boolean true AND gave a reason.
// Anything else (absent, "yes", a number, an empty reason) is a no, so the
// "Also file to my library" action appears only on a clear, reasoned yes.
export function normalizeLibraryWorthy(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { yes: false, reason: '' };
  const reason = typeof v.reason === 'string' ? v.reason.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
  if (v.yes !== true || !reason) return { yes: false, reason: v.yes === false ? reason : '' };
  return { yes: true, reason };
}

const LIBRARY_QUESTION = `"libraryWorthy": would this video ALSO belong in his main library (his Wiki: ideas, training, health, leadership, things he would want to find again outside this project)? {"yes": true|false, "reason": "one sentence"}. Say yes only when it clearly would; a video useful only to this project is a no.`;

// THE PROJECT WATCH (phase 2). The note goes ONLY into the project's own
// folder. The model gets the project's context handed in (never the vault to
// search: a project job reads what its brief names), the transcript, and the
// one lens to read it through.
export function buildProjectWatchPrompt({ url, title, uploader, duration, question, transcriptPath, transcriptSource, digest = false, him = '', project, lens = 'reference', projectContext = '' }) {
  const lane = lens === 'claims'
    ? `LENS "claims": list the video's actual claims and judge each for support: well-supported, contested, or wrong. Use web search to check the load-bearing ones against primary sources and cite what you find as [links]. Judge them against what this project needs. End with a straight verdict: adopt / partially useful / ignore, and exactly what to take for ${project.name}. If it is fluff, say so plainly.`
    : `LENS "reference": distil it for ${project.name}. A 2-3 sentence summary, then the key ideas each anchored to a transcript timestamp (M:SS), then what bears on this project's goal and phases, then actionable takeaways if any genuinely exist.`;
  return `${NOVA_LENS}

You are Nova's Watcher, watching a video FOR ONE OF HAYDEN'S PROJECTS: "${project.name}". The note you write goes ONLY into that project's own folder, never his main library. ${digest ? 'The video is LONG, so its transcript was condensed by your own extraction passes into the notes file below.' : 'Its full timestamped transcript has been extracted locally.'}

The video:
- URL: ${url}
- Title: ${title || '(unknown)'}
- Uploader: ${uploader || '(unknown)'}
- Duration: ${duration || '(unknown)'}
- Transcript source: ${transcriptSource || 'captions'}
- ${digest ? 'Condensed notes file (Read this FIRST, in full)' : 'Transcript file (Read this FIRST, in full)'}: ${transcriptPath}
${question ? `\nHayden's specific ask: ${question}\n` : ''}${him ? `\nWHO YOU ARE WATCHING FOR (his profile page):\n${him}\n` : ''}${projectContext ? `\nTHE PROJECT (read by code from its brief, log and pages; this is all you know about it):\n${projectContext.slice(0, 8000)}\n` : ''}
${lane}

Always:
- Cite transcript timestamps for anything specific.
- You have the words, not the pictures. If something can't be judged without seeing the screen, say so instead of guessing.
- No wikilinks to pages you have not been shown. Write timelessly (absolute dates). ~250-500 words.
- ${LIBRARY_QUESTION}

Output ONLY a JSON object: {"lane":"${lens}","title":"Short Note Title","verdict":"one sentence — what this video is worth to the project","body":"the full note in markdown","libraryWorthy":{"yes":false,"reason":"…"}}. No code fences, no commentary.`;
}

// THE DESIGN LENS (Q33): what the video SHOWS. The frames are files on this
// Mac; the model is told to open each one and to describe only what it sees,
// with the frame's timestamp. It reports how many it actually opened
// (framesRead), and code treats 0 as "the frames could not be read".
export function buildDesignPrompt({ url, title, uploader, duration, question, frames = [], transcriptPath = null, him = '', project, projectContext = '' }) {
  const list = frames.map((f) => `- ${f.path} (t=${f.t})`).join('\n');
  return `${NOVA_LENS}

You are Nova's Watcher reading a video through the DESIGN lens for Hayden's project "${project.name}". The note goes ONLY into that project's folder, never his main library.

The video: ${title || '(untitled)'}${uploader ? ` by ${uploader}` : ''}${duration ? `, ${duration}` : ''} — ${url}
${question ? `His ask: ${question}\n` : ''}${projectContext ? `\nTHE PROJECT (read by code; all you know about it):\n${projectContext.slice(0, 6000)}\n` : ''}${him ? `\nWHO IT IS FOR:\n${him.slice(0, 3000)}\n` : ''}
FRAMES sampled from the video (open EVERY one with the Read tool; each is an image):
${list}
${transcriptPath ? `\nThe transcript (what is said over the pictures) is at ${transcriptPath}. Read it after the frames.\n` : '\nThere is no transcript: the frames are all you have.\n'}
Write what the video SHOWS that matters to this project, each point with the timestamp(s) of the frame(s) you saw it in:
- colour and palette (name the colours you see; approximate, never invented hex codes)
- materials and finishes
- layout and the arrangement of the space
- light (natural, artificial, where it falls)
- storage
- furniture and objects
Then what is worth taking for ${project.name}, and what is not.

THE RULE: describe only what a frame actually shows. If you could not open a frame, or it shows nothing useful, say so; never fill a gap from the title or the transcript and present it as seen. Count the frames you actually opened and saw.

${LIBRARY_QUESTION}

Output ONLY a JSON object: {"lane":"design","title":"Short Note Title","verdict":"one sentence — what this video shows that is worth taking","body":"the full note in markdown, timestamps on every visual point","framesRead": <number of frames you actually opened>,"libraryWorthy":{"yes":false,"reason":"…"}}. No code fences, no commentary.`;
}

// the design verdict, strictly: framesRead is an integer between 0 and the
// frames offered; anything else is 0 (and 0 means the lens falls back)
export function normalizeDesign(parsed, frameCount) {
  const base = normalizeWatch(parsed, { lens: 'design' });
  const n = Number(parsed?.framesRead);
  const framesRead = Number.isInteger(n) && n > 0 ? Math.min(n, frameCount) : 0;
  return { ...base, framesRead };
}

// The note's header is composed in CODE from metadata the toolchain actually
// returned — the source line is never the model's to get wrong.
export function composeWatchNote({ url, title, uploader, duration, transcriptSource, verdict, body, first = null, readBy = null, noTranscript = false }) {
  const src = [title || url, uploader, duration].filter(Boolean).join(' — ');
  // `first`: a line that must lead the note (the design lens's honest
  // fallback); `readBy`: the model and lens, named on a project note
  const lines = [...(first ? [first] : []), `**Source:** [${src}](${url}) · ${noTranscript ? 'no transcript (frames only)' : `transcript via ${transcriptSource || 'captions'}`}`];
  if (readBy) lines.push(`**Read by:** ${readBy}`);
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

// `model`: an explicit per-run override from the model-choice gate — 'opus'
// or 'sonnet' only, applied to BOTH the chunk-extraction pass and the
// verdict pass so a video watched "on Opus" actually runs on Opus
// throughout, not just its final judgment. Omitted, both passes just use
// their own standing lane default, same as always.
//
// `project` (Projects phase 2): { id } of one of his projects, and `lens` an
// optional per-video override of the project's own lens. The note then goes
// ONLY to Projects/<Name>/Sources + Raw (route project-watch-note), the
// record carries projectId, and neither the library nor the ingest weave is
// touched. The project must exist, be his (not linked) and writable, and must
// not already hold this video.
export async function startVideoWatch(vaultPath, url, question = '', { model, project, lens } = {}) {
  return (await startVideoWatchJob(vaultPath, url, question, { model, project, lens })).record;
}

// …and the same with the job's promise, for a caller that runs several in
// sequence (a candidates card's "Watch them").
export async function startVideoWatchJob(vaultPath, url, question = '', { model, project, lens } = {}) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//.test(u)) throw new Error('a video URL is required');
  if (u.length > 500) throw new Error('that URL does not look right (500 chars max)');
  const q = String(question || '').trim().slice(0, 500);
  if (model !== undefined && !isGateModel(model)) throw new Error("model must be 'opus' or 'sonnet'");
  // Both passes are checked up front: a long video that clears the verdict
  // lane but not the chunk lane would fail halfway with a record stranded
  // in 'classifying'.
  if (!laneEnabled('watcher-verdict')) throw laneOffError('watcher-verdict');
  if (!laneEnabled('watcher-chunk')) throw laneOffError('watcher-chunk');
  if (lens !== undefined && lens !== null && !project) throw new Error('a lens belongs to a project watch');
  let proj = null;
  if (project) {
    const { prepareProjectWatch } = await import('./novaProjects.js');
    proj = await prepareProjectWatch(vaultPath, typeof project === 'string' ? project : project.id, u, lens);
    if (proj.lens === 'design' && !laneEnabled('watcher-design')) throw laneOffError('watcher-design');
  }

  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'video',
    text: `Watch: ${u}${q ? ` — ${q}` : ''}`,
    source: 'watcher',
    mode: 'draft',
    status: 'classifying', // shows as in-flight in the queue
    createdAt: new Date().toISOString(),
    ...(proj ? { projectId: proj.id, lens: proj.lens } : {}),
  });
  // the gate's answer rides the record so a retry keeps it (the Researcher's same fix)
  if (model) updateRecord(record.id, { model }).catch(() => {});
  const done = runWatchJob(vaultPath, record.id, u, q, model, proj);
  return { record, done };
}

// A video record carries its whole input in its text, so a failed run can
// re-fire in place — same record, same link, fresh attempt.
export async function retryWatch(vaultPath, record) {
  const m = String(record.text || '').match(/^Watch:\s*(\S+)(?:\s+—\s+([\s\S]+))?$/);
  if (!m) throw new Error('this video record has no URL to re-run');
  // a project watch retries as a project watch, with its own lens, and is
  // checked again (the project may have been archived or linked since)
  let proj = null;
  if (record.projectId) {
    const { prepareProjectWatch } = await import('./novaProjects.js');
    proj = await prepareProjectWatch(vaultPath, record.projectId, m[1], record.lens || undefined, { retryOf: record.id });
  }
  const updated = await updateRecord(record.id, { status: 'classifying', error: null });
  runWatchJob(vaultPath, record.id, m[1], (m[2] || '').trim(), record.model || undefined, proj);
  return updated;
}

// The fetch-then-reason step, shared by first runs and retries.
async function runWatchJob(vaultPath, recordId, url, question, model, proj = null) {
  if (proj) return runProjectWatchJob(vaultPath, recordId, url, question, model, proj);
  let workDir = null;
  try {
    workDir = await mkdtemp(path.join(os.tmpdir(), 'nova-watch-'));
    let report;
    let videoError = null;
    try { report = await fetchVideoTranscript(url, workDir); } catch (e) { videoError = e; }
    if (!report?.transcript) {
      // A photo carousel has no video to transcribe: read its slides instead.
      const slides = await fetchCarousel(url, path.join(workDir, 'slides')).catch(() => null);
      if (slides) {
        report = { title: slides.title, uploader: slides.uploader, duration: null, transcriptSource: `${slides.slidePaths.length} carousel slides`, transcript: carouselBrief(slides) };
      } else if (videoError) {
        throw videoError;
      } else {
        throw new Error('no transcript available — the video has no captions and no Whisper key is configured (~/.config/watch/.env)');
      }
    }
    // Long transcript → condense first; the judgment pass reads the notes.
    const digest = report.transcript.length > SINGLE_PASS_MAX_CHARS;
    let transcriptPath = path.join(workDir, 'transcript.txt');
    if (digest) {
      const notes = await digestTranscript(vaultPath, report, path.join(workDir, 'digest'), question, model);
      transcriptPath = path.join(workDir, 'notes.md');
      await writeFile(transcriptPath, notes, 'utf8');
    } else {
      await writeFile(transcriptPath, report.transcript, 'utf8');
    }

    const { lane, title, verdict, body } = await runWatchModel(vaultPath, {
      url, question, transcriptPath, digest,
      title: report.title, uploader: report.uploader,
      duration: report.duration, transcriptSource: report.transcriptSource,
    }, model);
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
    // HIS DECISION, 7 Sep 2026, reversing "external content never files
    // itself": a video he chose to send Nova is already his judgement that it
    // matters, and a Source page he has to approve is a Source page that sits
    // in the Inbox instead of being usable by the Coach tomorrow morning. So
    // it FILES ITSELF — and because a write he did not press deserves to be
    // announced, it pushes a notification that opens the record.
    // The rails are unchanged: undoData is stored, so one tap still removes
    // the page and its transcript.
    const decision = {
      route: 'watch-note',
      confidence: 'high',
      title,
      reason: lane === 'coach'
        ? "The Coach's read — filed to your vault automatically. Undo removes the Source page and its transcript."
        : 'Watched, weighed and filed to your vault automatically. Undo removes the Source page and its transcript.',
      payload: { title, body: note, url, lane, transcriptRef },
    };
    await fileWatchNote(vaultPath, recordId, decision, url);
  } catch (e) {
    await updateRecord(recordId, { status: 'error', error: e.message }).catch(() => {});
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// What the job calls out to, so a test can stand in for the watch script and
// the model (tests never spawn python or the CLI). Production never sets it.
const deps = { fetchReport: (...a) => fetchVideoTranscript(...a), runClaude: (...a) => runClaude(...a), fetchCarousel: (...a) => fetchCarousel(...a) };
export function _setWatchDepsForTest(over = {}) {
  const prev = { ...deps };
  Object.assign(deps, over);
  return () => Object.assign(deps, prev);
}

const dataRootOf = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

/**
 * A PROJECT WATCH (Projects phase 2). Same fetch, then the project's lens,
 * then the project-watch-note route: Projects/<Name>/Sources + Raw only. No
 * library page, no ingest weave, ever, from here. A video with no transcript
 * AND no frames is an error card with nothing written.
 */
async function runProjectWatchJob(vaultPath, recordId, url, question, model, proj) {
  let workDir = null;
  try {
    workDir = await mkdtemp(path.join(os.tmpdir(), 'nova-watch-'));
    const wantFrames = proj.lens === 'design';
    let report = null;
    let fetchError = null;
    let framesWhy = null;
    try { report = await deps.fetchReport(url, workDir, { frames: wantFrames }); } catch (e) { fetchError = e; }
    if (wantFrames && !report) {
      // the video itself would not download for frames: the words may still come
      framesWhy = `the frames could not be extracted (${String(fetchError?.message || 'no reason given').slice(0, 160)})`;
      try { report = await deps.fetchReport(url, path.join(workDir, 'words'), { frames: false }); fetchError = null; } catch (e) { fetchError = e; }
    }
    const frames = wantFrames ? (report?.frames || []).filter((f) => f?.path && existsSync(f.path)) : [];
    if (wantFrames && report && !frames.length && !framesWhy) framesWhy = 'no frames came out of the video on this Mac';
    if (!report?.transcript && !frames.length) {
      const slides = await deps.fetchCarousel(url, path.join(workDir, 'slides')).catch(() => null);
      if (slides) report = { title: slides.title, uploader: slides.uploader, duration: null, transcriptSource: `${slides.slidePaths.length} carousel slides`, transcript: carouselBrief(slides) };
      else throw new Error(`nothing to read: ${fetchError ? fetchError.message : 'the video has no transcript'}${wantFrames ? ` and ${framesWhy || 'no frames'}` : ''}. Nothing was written.`);
    }

    let transcriptPath = null;
    let digest = false;
    if (report.transcript) {
      digest = report.transcript.length > SINGLE_PASS_MAX_CHARS;
      transcriptPath = path.join(workDir, 'transcript.txt');
      if (digest) {
        const notes = await digestTranscript(vaultPath, report, path.join(workDir, 'digest'), question, model);
        transcriptPath = path.join(workDir, 'notes.md');
        await writeFile(transcriptPath, notes, 'utf8');
      } else {
        await writeFile(transcriptPath, report.transcript, 'utf8');
      }
    }

    let him = '';
    try { const { profileContext } = await import('./profile.js'); him = await profileContext(vaultPath); } catch (e) { him = `ABOUT HAYDEN: (his profile page could not be read: ${e.message})`; }
    let projectContext = '';
    try { const { projectContextSection } = await import('./projectContext.js'); projectContext = await projectContextSection(vaultPath, proj.id); } catch { projectContext = ''; }

    const meta = { url, question, title: report.title, uploader: report.uploader, duration: report.duration, transcriptSource: report.transcriptSource };
    let cost = 0;
    const onCost = (usd) => { if (Number.isFinite(usd)) cost += usd; };
    let out = null;
    let fellBack = null;
    let modelUsed = null;
    if (wantFrames && frames.length) {
      const framesDir = path.dirname(frames[0].path);
      try {
        // the model looks from inside the frames folder, with Read and nothing else
        assertNotProtected(framesDir, 'look at frames there');
        let tPath = null;
        if (transcriptPath) { tPath = path.join(framesDir, 'transcript.txt'); copyFileSync(transcriptPath, tPath); }
        modelUsed = model || modelFor('watcher-design');
        const text = await deps.runClaude(framesDir, buildDesignPrompt({ ...meta, frames, transcriptPath: tPath, him, project: proj, projectContext }), {
          allowedTools: 'Read', disallowed: denyAllExcept('Read'), model: modelUsed, lane: 'watcher-design', cwd: framesDir, onCost,
        });
        const d = normalizeDesign(parseJsonText(text), frames.length);
        if (!d.framesRead) fellBack = 'the model reported it could not open any of the frames';
        else out = d;
      } catch (e) {
        fellBack = `the frames could not be read (${String(e.message).slice(0, 160)})`;
      }
    } else if (wantFrames) {
      fellBack = framesWhy;
    }
    const lensUsed = out ? 'design' : wantFrames ? 'reference' : proj.lens;
    if (!out) {
      if (!transcriptPath) throw new Error(`${fellBack || 'the design read failed'}, and the video has no transcript to fall back on. Nothing was written.`);
      modelUsed = model || modelFor('watcher-verdict');
      const text = await deps.runClaude(workDir, buildWatchPrompt({ ...meta, transcriptPath, digest, him, project: proj, lens: lensUsed, projectContext }), {
        allowedTools: lensUsed === 'claims' ? 'Read WebSearch WebFetch' : 'Read',
        disallowed: denyAllExcept(lensUsed === 'claims' ? 'Read WebSearch WebFetch' : 'Read'),
        model: modelUsed, lane: 'watcher-verdict', cwd: workDir, onCost,
      });
      out = normalizeWatch(parseJsonText(text), { lens: lensUsed });
    }
    const first = fellBack ? `**Design lens unavailable:** ${fellBack}. This note is the reference read of what the video SAYS, not of what it shows.` : null;
    const readBy = `${modelUsed} · ${lensUsed} lens${out.framesRead ? ` · ${out.framesRead} of ${frames.length} frames looked at` : ''}`;
    const note = composeWatchNote({ ...meta, verdict: out.verdict, body: out.body, first, readBy, noTranscript: !report.transcript });

    let transcriptRef = null;
    if (report.transcript) {
      await mkdir(path.join(dataRootOf(), 'watch'), { recursive: true });
      transcriptRef = `${recordId}.txt`;
      await writeFile(path.join(dataRootOf(), 'watch', transcriptRef), report.transcript, 'utf8');
    }
    const decision = {
      route: 'project-watch-note',
      confidence: 'high',
      title: out.title,
      reason: `Watched for ${proj.name} and filed into its own folder only (Projects/${proj.name}/Sources). Not your library. Undo removes the page and its transcript.`,
      payload: { projectId: proj.id, title: out.title, body: note, url, lens: lensUsed, lensAsked: proj.lens, transcriptRef, model: modelUsed, framesRead: out.framesRead || 0, fellBack: fellBack || null, libraryWorthy: out.libraryWorthy || { yes: false, reason: '' } },
    };
    const { fileDecision } = await import('./inbox.js');
    let filed;
    try {
      filed = await fileDecision(vaultPath, decision);
    } catch (e) {
      // the project's folder refused it (gone, linked, archived away): an error
      // card that keeps the analysis on the record, with nothing written
      await updateRecord(recordId, { status: 'error', decision, error: `not filed: ${e.message}`, costUsd: cost || null });
      return;
    }
    await updateRecord(recordId, {
      status: 'filed', decision, destination: filed.destination, undoData: filed.undo,
      filedAt: new Date().toISOString(), auto: true,
      lensUsed, model: modelUsed, costUsd: cost || null,
      libraryWorthy: decision.payload.libraryWorthy,
    });
    notifyFiled(recordId, out.title, filed.destination, `Watched for ${proj.name} — Nova`);
  } catch (e) {
    await updateRecord(recordId, { status: 'error', error: e.message }).catch(() => {});
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function parseJsonText(text) {
  const jsonMatch = firstBalancedObjectMatch(text);
  if (!jsonMatch) throw new Error(String(text || '').slice(0, 200) || 'no JSON in the Watcher response');
  try { return parseModelJson(jsonMatch[0]); } catch { return JSON.parse(repairJsonControlChars(jsonMatch[0])); }
}

// Digest notes are expensive (~$3.50 and ~5 minutes for a 4-hour podcast)
// and depend only on the transcript — so they are cached per video id. A
// retry after a later-stage failure, or a second surface asking for the same
// video, must never re-pay for extraction that already succeeded.
export function digestNotesPath(videoId) {
  const dataRoot = process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  return path.join(dataRoot, 'watch', `${videoId}-notes.md`);
}

export async function digestTranscriptCached(vaultPath, report, digestDir, question, videoId, onProgress) {
  const cachePath = videoId ? digestNotesPath(videoId) : null;
  if (cachePath) {
    const cached = await readFile(cachePath, 'utf8').catch(() => null);
    if (cached && cached.trim()) return cached;
  }
  const notes = await digestTranscript(vaultPath, report, digestDir, question, undefined, onProgress);
  if (cachePath) {
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, notes, 'utf8').catch(() => {});
  }
  return notes;
}

// The chunked extraction stage: split, write chunk files, run a bounded
// number of cheap passes concurrently, join their notes with part headers.
// Exported for the ingest pipeline, which has the same long-video problem.
// `onProgress({done,total})` fires as each part lands. A digest is 15-40
// minutes of silence otherwise, and silence is indistinguishable from a
// dead job — which is exactly how a running book analysis looked like a
// failure to him.
export async function digestTranscript(vaultPath, report, digestDir, question = '', model, onProgress) {
  await mkdir(digestDir, { recursive: true });
  const chunks = chunkTranscript(report.transcript, CHUNK_CHARS);
  const notes = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const i = next++;
      const chunkPath = path.join(digestDir, `chunk-${i + 1}.txt`);
      await writeFile(chunkPath, chunks[i], 'utf8');
      // Plain markdown, not JSON: a 2000-word notes payload wrapped in a
      // JSON string is one stray literal newline away from a parse failure,
      // and the notes need no structure beyond themselves.
      const raw = await runClaudeText(vaultPath, buildChunkNotesPrompt({
        title: report.title, part: i + 1, total: chunks.length, chunkPath, question,
      }), { allowedTools: 'Read', model: model || CHUNK_MODEL(), lane: 'watcher-chunk' });
      const text = stripPreamble(raw);
      if (!text) throw new Error(`extraction pass ${i + 1}/${chunks.length} returned no notes`);
      notes[i] = `## Part ${i + 1} of ${chunks.length}\n\n${text}`;
      if (onProgress) {
        try { onProgress({ done: notes.filter(Boolean).length, total: chunks.length }); } catch { /* a receipt must never fail the work */ }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, worker));
  // the notes name the ask they were extracted under — a cached digest
  // reused for a different question would otherwise read as neutral
  const header = question
    ? `# Digest notes — extracted under the ask: “${String(question).trim().slice(0, 200)}”`
    : '# Digest notes — no specific ask; extracted for the general verdict';
  return [header, ...notes].join('\n\n');
}

async function runWatchModel(vaultPath, promptInputs, model) {
  // who he is (27 Oct 2026): "relevant to Hayden's goals" reads his profile
  let him = '';
  try {
    const { profileContext } = await import('./profile.js');
    him = await profileContext(vaultPath);
  } catch (e) { him = `ABOUT HAYDEN: (his profile page could not be read: ${e.message})`; }
  const parsed = await runClaudeJson(vaultPath, buildWatchPrompt({ ...promptInputs, him }), {
    allowedTools: 'Read Grep Glob WebSearch WebFetch',
    model: model || modelFor('watcher-verdict'), // was unpinned until the model board
    lane: 'watcher-verdict',
  });
  return normalizeWatch(parsed);
}

// A model asked for markdown sometimes opens with a line of chat ("Apologies,
// that tool call was inapplicable…") — observed live. Drop leading non-note
// lines, and unwrap a code fence if it wrapped the whole thing anyway.
export function stripPreamble(text) {
  let out = String(text || '').trim();
  const fence = out.match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/);
  if (fence) out = fence[1].trim();
  const lines = out.split('\n');
  let start = 0;
  while (start < lines.length && !/^\s*(#{1,6}\s|[-*+]\s|\d+\.\s|\*\*|\[)/.test(lines[start])) start++;
  // all prose and no markers: keep it whole rather than return nothing
  return (start === lines.length ? out : lines.slice(start).join('\n')).trim();
}

// The model occasionally emits a RAW newline/tab inside a JSON string literal,
// which is invalid JSON ("Bad control character in string literal") and killed
// a whole 4-hour digest. Escape control characters that sit inside a string.
export function repairJsonControlChars(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of String(text)) {
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; escaped = inString; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (inString && ch === '\n') { out += '\\n'; continue; }
    if (inString && ch === '\r') { out += '\\r'; continue; }
    if (inString && ch === '\t') { out += '\\t'; continue; }
    out += ch;
  }
  return out;
}

// One spawn, raw result text back.
function runClaudeText(vaultPath, prompt, opts = {}) {
  return deps.runClaude(vaultPath, prompt, opts);
}

// One spawn, one JSON object back — the judgment pass, which genuinely needs
// typed fields (lane/title/verdict/body).
async function runClaudeJson(vaultPath, prompt, opts = {}) {
  const text = await deps.runClaude(vaultPath, prompt, opts);
  const jsonMatch = firstBalancedObjectMatch(text);
  if (!jsonMatch) throw new Error(text.slice(0, 200) || 'no JSON in Watcher response');
  try {
    return parseModelJson(jsonMatch[0]);
  } catch {
    return JSON.parse(repairJsonControlChars(jsonMatch[0]));
  }
}

// `cwd` (a project watch): where the model runs, checked against the folders
// Nova never writes to; `disallowed`: a tighter deny-list (the design lens's
// Read-only one); `onCost(usd)`: the run's own cost, for the card.
function runClaude(vaultPath, prompt, { allowedTools, model, lane, cwd = null, disallowed = null, onCost = null } = {}) {
  const where = cwd || vaultPath;
  if (cwd) assertNotProtected(cwd, 'run the Watcher there');
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      '--allowedTools', allowedTools || 'Read',
      '--disallowedTools', disallowed || WATCH_DISALLOWED,
      '--strict-mcp-config', // MCP servers can't auth under launchd — drop them
      '--output-format', 'json',
      '--session-id', randomUUID(),
    ];
    if (model) args.push('--model', model);
    if (lane) args.push(...effortArgs(lane)); // every caller names its lane
    const child = spawn(CLAUDE_BIN, args, { cwd: where, stdio: ['ignore', 'pipe', 'pipe'] });

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
        if (lane) recordRun(lane, fromEnvelope(outer));
        if (onCost) { try { onCost(Number(outer.total_cost_usd)); } catch { /* a receipt never fails the run */ } }
        if (outer.is_error || code !== 0) {
          const spent = Number(outer.total_cost_usd);
          throw new Error(
            outer.result || stderr.trim()
            || `claude exited with code ${code} with no error text${Number.isFinite(spent) ? ` after $${spent.toFixed(2)}` : ''}`,
          );
        }
        const text = (outer.result || '').trim();
        if (!text) throw new Error('the model returned an empty response');
        resolve(text);
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Files the Source page, tells him, and sets the deep weave going — the three
// steps that used to wait behind an APPROVE tap.
//
// Order matters: the vault write is what he actually asked for, so it happens
// first and its failure is what gets reported. The notification and the weave
// are additive; neither can cost him the note.
async function fileWatchNote(vaultPath, recordId, decision, url) {
  const { fileDecision } = await import('./inbox.js');
  try {
    const { destination, undo } = await fileDecision(vaultPath, decision);
    await updateRecord(recordId, {
      status: 'filed', decision, destination, undoData: undo,
      filedAt: new Date().toISOString(), auto: true,
    });
    notifyFiled(recordId, decision.title, destination);
  } catch (e) {
    // filing failed — park it for review rather than losing the analysis
    await updateRecord(recordId, { status: 'pending', decision, error: 'auto-filing failed: ' + e.message });
    return;
  }
  // THE LINKS BETWEEN PEOPLE AND TOPICS — his words. The weave is what turns
  // one Source page into concept and entity pages the rest of Nova can reach.
  // It runs itself now and applies itself when it lands (autoApply), because
  // an analysis waiting for approval is an analysis the Coach cannot use.
  try {
    const { startIngest } = await import('./ingest.js');
    startIngest(vaultPath)('', url, null, null, { autoApply: true, notifyLabel: decision.title });
  } catch (e) {
    console.error('watcher: the weave did not start:', e.message);
  }
}

function notifyFiled(recordId, title, destination, heading = 'Watched and filed — Nova') {
  import('./push.js').then(({ sendPush }) => sendPush({
    title: heading,
    body: `${title}${destination ? ` → ${destination}` : ''}`,
    tag: `watched-${recordId}`,
    url: `./#/inbox?open=${recordId}`,
  })).catch(() => {});
}
