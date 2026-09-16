import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { NOVA_LENS } from './lens.js';
import { modelFor, laneEnabled, laneOffError } from './modelPrefs.js';
import { boundaryArgs } from './spawnBoundary.js';
import { settleWatchdog } from './settle.js';
import { parseModelJson } from './jsonSalvage.js';
import { readEntry, isGrounded, assembleReport, confirmLine, sourceLine } from './captureReport.js';
import { flatten, loadRepertoire, slugFor } from './repertoire.js';

// THE REPERTOIRE LANE — "analyse this, find me the others like it, and teach
// me one a day."
//
// His ask, 15 Sep, sent with a 42-second Mentalist reel: a confirmed report on
// what was analysed, anything noteworthy from the research, then a plan that
// hands him one technique a day to actually use.
//
// The shape follows the Method rather than the convenient path. Code fetches
// and records; the model reasons ONCE over material it did not choose; code
// validates, renders and files. Specifically:
//
//   1. FETCH (code) — yt-dlp for metadata and media, captions if they exist
//      and Whisper if they do not, ffmpeg for frames. Every stage appends an
//      evidence entry, success or failure, and that list becomes the report's
//      receipt. The model never describes its own coverage.
//   2. REASON (model, once) — handed the real transcript and the real frames,
//      it names the technique actually demonstrated, researches outward for
//      the others in that family, and returns STRUCTURED techniques.
//   3. RENDER (code) — the curriculum is rendered from those fields, not from
//      model prose, so the catalogue page and the report cannot disagree.
//
// TWO KINDS OF SOURCE, one report. A video is read as transcript + frames; an
// article is rendered in Nova's own signed-in browser and read as page text
// (his 15 Sep ask — "allow it to read and analyse articles too"). The choice is
// made from the URL and then PROVEN by what comes back: a link that looks like
// video but will not open falls through to the page reader rather than failing,
// and a source neither path could read is refused outright, because the receipt
// has to mean something.

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const YTDLP = process.env.YTDLP_BIN || '/opt/homebrew/bin/yt-dlp';
const FFMPEG = process.env.FFMPEG_BIN || '/opt/homebrew/bin/ffmpeg';
const COOKIES = path.join(os.homedir(), '.config/watch/yt-cookies.txt');
const MAX_BUDGET_USD = '2.5';
export const REPERTOIRE_LANE = 'repertoire';

// Enough to read a technique's setup, delivery and reaction without paying for
// a frame a second on a long clip.
const FRAME_EVERY_SEC = 3;
const MAX_FRAMES = 18;
const TRANSCRIPT_CHARS = 12_000;

function run(bin, args, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let out = '', err = '';
    const t = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timed out')); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      clearTimeout(t);
      if (code === 0) resolve(out);
      else reject(new Error(err.trim().split('\n').pop()?.slice(0, 200) || `exit ${code}`));
    });
    child.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

const cookieArgs = () => (existsSync(COOKIES) ? ['--cookies', COOKIES] : []);

/* --------------------------- stage 1: the fetch --------------------------- */

// Everything this returns is a FACT about what happened, including the
// failures. `read` is the receipt the report is built from.
// Does this link deserve the video toolchain at all? Pure, so the routing is
// testable without spending a yt-dlp timeout to find out. A plain article URL
// skips straight to the page reader instead of waiting 90s to be told it is
// not a video.
const VIDEO_PATH_RE = /watch\?v=|youtu\.be\/|\/reel\/|\/shorts\/|\/video\/|vimeo\.com\/\d+|\/p\/|\/status\//i;
export function looksLikeVideo(url, toolHint) {
  return toolHint !== 'fetch' || VIDEO_PATH_RE.test(String(url || ''));
}

// An ARTICLE: rendered in Nova's own browser profile, because a logged-out
// fetch of half the web returns a consent wall. readWithBrowser never throws —
// a refusal is a RESULT, and one the receipt states plainly.
export async function fetchArticle(url, read, { reader } = {}) {
  const readPage = reader || (await import('./browserResearch.js')).readWithBrowser;
  const page = await readPage(url);
  if (!page.ok) {
    read.push(readEntry('Page text', false, page.reason || 'the page could not be read'));
    const err = new Error(`that link could not be read (${page.reason || 'unknown'})`);
    err.evidence = { source: { url, title: page.title || null }, read };
    throw err;
  }
  read.push(readEntry('Page text', true, `${page.text.length} characters`, "rendered in Nova's browser"));
  return {
    source: { url, title: page.title || null, author: null, durationSec: null, description: '', kind: 'article', id: null },
    read,
    transcript: page.text,
    frames: [],
  };
}

export async function fetchSource(url, workDir, { runner = run, reader, toolHint } = {}) {
  const read = [];
  const hint = toolHint || (await import('./browserResearch.js')).toolFor(url);
  if (!looksLikeVideo(url, hint)) return fetchArticle(url, read, { reader });

  let meta = null;
  try {
    const raw = await runner(YTDLP, ['-J', '--no-warnings', ...cookieArgs(), url], { timeoutMs: 90_000 });
    meta = JSON.parse(raw);
    read.push(readEntry('Metadata', true, [meta.title, meta.uploader].filter(Boolean).join(' · ') || 'fetched'));
  } catch (e) {
    // it looked like video and was not, or the platform refused — read the page
    read.push(readEntry('Video', false, e.message.slice(0, 120)));
    return fetchArticle(url, read, { reader });
  }

  const source = {
    url,
    title: meta.title || null,
    author: meta.uploader || meta.channel || null,
    durationSec: Number(meta.duration) || null,
    description: String(meta.description || '').slice(0, 2_000),
    id: meta.id || null,
  };

  // media — one download, reused for both frames and audio
  let mediaPath = null;
  try {
    await runner(YTDLP, ['-o', path.join(workDir, 'clip.%(ext)s'), '--no-warnings', ...cookieArgs(), url], { timeoutMs: 180_000 });
    const files = (await readdir(workDir)).filter((f) => /^clip\./.test(f));
    mediaPath = files.length ? path.join(workDir, files[0]) : null;
  } catch (e) {
    read.push(readEntry('Media', false, e.message.slice(0, 120)));
  }

  // frames — the visible half. The reel that prompted this carries its claim
  // in a burned-in caption that exists nowhere in the audio, so a transcript
  // alone would have missed the single most quotable thing on screen.
  let frames = [];
  if (mediaPath) {
    try {
      const dir = path.join(workDir, 'frames');
      await mkdir(dir, { recursive: true });
      await runner(FFMPEG, ['-y', '-v', 'error', '-i', mediaPath, '-vf', `fps=1/${FRAME_EVERY_SEC},scale=640:-1`, '-frames:v', String(MAX_FRAMES), '-q:v', '4', path.join(dir, 'f_%02d.jpg')], { timeoutMs: 120_000 });
      frames = (await readdir(dir)).filter((f) => /^f_\d+\.jpg$/.test(f)).sort().map((f) => path.join(dir, f));
      read.push(frames.length
        ? readEntry('Frames', true, `${frames.length} frames at 1 per ${FRAME_EVERY_SEC}s`)
        : readEntry('Frames', false, 'ffmpeg produced none'));
    } catch (e) {
      read.push(readEntry('Frames', false, e.message.slice(0, 120)));
    }
  }

  // transcript — captions first because they are free and exact; Whisper only
  // when there are none, which is every Instagram reel he has ever sent.
  let transcript = '';
  let via = null;
  try {
    transcript = await fetchCaptions(url, workDir, runner);
    via = 'platform captions';
  } catch {
    if (mediaPath) {
      try {
        const audio = path.join(workDir, 'audio.mp3');
        await runner(FFMPEG, ['-y', '-v', 'error', '-i', mediaPath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-q:a', '6', audio], { timeoutMs: 120_000 });
        const { transcribeAudio } = await import('./transcribe.js');
        // `{ text, backend }`, NOT a string. The first draft did
        // String(await …) and handed the model the literal "[object Object]"
        // — fifteen characters that the receipt then reported, straight-faced,
        // as a successful transcript of a 42-second clip.
        const { text } = await transcribeAudio(audio, { mime: 'audio/mpeg' });
        transcript = String(text || '').trim();
        via = 'Whisper — no captions on this platform';
      } catch (e) {
        read.push(readEntry('Transcript', false, e.message.slice(0, 120)));
      }
    }
  }
  // A CALL THAT RETURNED IS NOT A TRANSCRIPT. The receipt's whole job is to be
  // trustworthy, and the first version reported "1 lines · 15 characters" for a
  // 42-second clip as a ✓ — because the fetch had succeeded. The content has to
  // clear a plausibility floor too, or the receipt certifies garbage and the
  // findings built on it inherit the certificate.
  const tooShort = transcript && !plausibleTranscript(transcript, source.durationSec);
  if (transcript && !tooShort) {
    read.push(readEntry('Transcript', true, `${transcript.split('\n').filter(Boolean).length} lines · ${transcript.length} characters`, via));
  } else if (tooShort) {
    read.push(readEntry('Transcript', false, `${transcript.length} characters for a ${Math.round(source.durationSec)}s clip — too short to be a real transcript`));
    transcript = ''; // and it must not reach the prompt as if it were one
  } else if (!read.some((r) => r.what === 'Transcript')) {
    read.push(readEntry('Transcript', false, 'no captions and no audio to transcribe'));
  }

  return { source, read, transcript, frames };
}

// Speech runs ~10-15 characters a second; silence and music run at zero. The
// floor is deliberately generous — one character per second, and at least 20
// overall — because the job here is to catch a BROKEN read (an error string, a
// stringified object, an empty result dressed as success), not to judge a
// quiet clip. A genuinely near-silent video fails this and is reported as
// unreadable audio, which is the honest answer for it anyway.
export function plausibleTranscript(text, durationSec) {
  const n = String(text || '').trim().length;
  if (n < 20) return false;
  const d = Number(durationSec);
  if (!Number.isFinite(d) || d <= 0) return n >= 20;
  return n >= d;
}

async function fetchCaptions(url, workDir, runner) {
  const dir = path.join(workDir, 'subs');
  await mkdir(dir, { recursive: true });
  await runner(YTDLP, ['--skip-download', '--write-auto-subs', '--write-subs', '--sub-langs', 'en.*,en', '--sub-format', 'vtt', '-o', path.join(dir, 'v'), ...cookieArgs(), url], { timeoutMs: 90_000 });
  const files = (await readdir(dir)).filter((f) => f.endsWith('.vtt'));
  if (!files.length) throw new Error('no captions');
  const { dedupeRollingCaptions } = await import('./studyLane.js');
  const text = dedupeRollingCaptions(await readFile(path.join(dir, files[0]), 'utf8'));
  if (!text) throw new Error('captions were empty');
  return text;
}

/* -------------------------- stage 2: the reasoning ------------------------ */

export function buildRepertoirePrompt({ source, transcript, frames, prose, existing = [], focus }) {
  const isArticle = source?.kind === 'article';
  const known = existing.length
    ? `\nALREADY IN HIS REPERTOIRE — do NOT propose these again, but you may reference them:\n${existing.map((t) => `- ${t.name} (${t.family})`).join('\n')}`
    : '';
  return `${NOVA_LENS}

You are Nova's Repertoire agent. Hayden sent a source and asked: "${prose || 'analyse this, research the techniques like it, and build me a plan I can practise one a day'}".

THE SOURCE
- ${sourceLine(source)}${source.title ? `: “${source.title}”` : ''}
- ${source.url}
${source.description ? `- The poster's own caption: “${source.description.slice(0, 600)}”` : ''}

${isArticle ? 'THE PAGE — read from the live page, and it is the primary evidence' : 'THE TRANSCRIPT — this is verbatim, and it is the primary evidence'}:
"""
${transcript.slice(0, TRANSCRIPT_CHARS) || (isArticle ? '(none — the page could not be read)' : '(none — the clip had no readable audio)')}
"""
${frames.length ? `
THE FRAMES — cut from the clip by ffmpeg, in order. READ THEM with the Read tool. They carry anything on screen that the audio does not, including burned-in captions, and what the people actually DO:
${frames.map((f, i) => `- frame ${String(i + 1).padStart(2, '0')}: ${f}`).join('\n')}
` : ''}
YOUR JOB, in three parts.

1. WHAT THIS SOURCE ACTUALLY ${isArticle ? 'SAYS' : 'SHOWS'}. Break the technique down into the moves, in the order they happen, quoting the ${isArticle ? 'page' : 'transcript'}. Be precise about the MECHANISM — why it works on a person, not just what was said. If the source labels the technique, say whether that label is correct; a popular mislabel is worth naming, because it sends someone researching the wrong literature.

2. RESEARCH OUTWARD. Search the web for the real, named techniques in the same family${focus ? ` — the focus he chose is: ${focus}` : ''}. Prefer the primary literature and practitioner sources (experimental psychology, stage mentalism and magic, interrogation and negotiation research, hypnosis and suggestion research). EVERY factual claim about research carries a numbered citation [1], and every number resolves to an entry in your sources array. Note where sources disagree instead of averaging them.

3. BUILD THE CURRICULUM. Order it so it actually teaches: the foundations that everything else needs come FIRST, showy things later. For each technique give a drill small enough to run in a normal day — something he can do to a friend, a barista or a colleague this afternoon — and a "tell" that says how he knows it landed.

HARD RULES
- Ground part 1 ONLY in ${isArticle ? 'the page text above — it is all you have of this source, so do not describe images, video or anything else you cannot read there' : 'the transcript and the frames. If the frames do not show something, say the frames do not show it'}.
- Never invent a study, an author, a date or a result. An honest "I could not establish this" beats a confident guess — this files into his vault and he will act on it.
- Keep every field short enough to read on a phone: summary ≤ 140 characters, move / drill / tell ≤ 220 each.
- Techniques must be REAL and named as practitioners name them, not invented labels.
- Do not write a coverage or "what was analysed" section — that is written for you from what was actually fetched.
${known}
Output ONLY this JSON object, no code fences, no commentary:
{
  "title": "Short title for the report",
  "family": "the name of the technique family this source sits in",
  "whatItShows": "markdown — the breakdown from part 1, with quotes",
  "noteworthy": "markdown bullets — what is genuinely notable from the research, including any mislabel",
  "techniques": [
    {"family": "...", "name": "...", "summary": "...", "move": "...", "drill": "...", "tell": "...", "source": "where it comes from"}
  ],
  "sources": [{"n": 1, "title": "...", "url": "https://..."}],
  "consulted": 0
}`;
}

function askModel(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      // Read for the frames, the web pair for the research half
      ...boundaryArgs('Read WebSearch WebFetch'),
      '--output-format', 'json',
      '--max-budget-usd', MAX_BUDGET_USD,
      '--model', modelFor(REPERTOIRE_LANE),
      '--no-session-persistence',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    settleWatchdog(child, { label: 'the repertoire analysis', minutes: 20 });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(err.trim().split('\n').pop()?.slice(0, 300) || `claude exited ${code}`));
      try {
        const outer = JSON.parse(out);
        if (outer.is_error) return reject(new Error(String(outer.result || 'the analysis failed').slice(0, 300)));
        resolve(String(outer.result || ''));
      } catch (e) { reject(new Error(e.message)); }
    });
    child.on('error', reject);
  });
}

/* -------------------------- stage 3: code renders ------------------------- */

// Clip to a WORD boundary, not a character count. The first live run put
// "…more people falsely remembered broken glass that was " on a card — cut
// mid-sentence, which reads as a broken card rather than a trimmed one. Back
// off to the last sentence end if there is one late in the window, else the
// last space, and mark the trim so he knows the source said more.
export function clip(s, n) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const window = t.slice(0, n - 1);
  const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
  if (sentence >= n * 0.6) return window.slice(0, sentence + 1);
  const space = window.lastIndexOf(' ');
  return `${(space >= n * 0.5 ? window.slice(0, space) : window).replace(/[,;:\s]+$/, '')}…`;
}

// A CARD HAS NO BIBLIOGRAPHY. The report renders its citations beside a Sources
// list, so [19][20] means something there. On the technique card — and on the
// catalogue page, and in the line Nova SPEAKS in the morning — the same markers
// are noise pointing at nothing, and the live run put "…Milton Model pattern
// [19][20]…" on a card. Stripped from card fields only; the report's prose
// keeps them.
export function cardField(s, n) {
  return clip(String(s ?? '').replace(/\s*\[\d{1,3}\](?:\s*\[\d{1,3}\])*/g, ''), n);
}

// Validate into the shape the catalogue writer accepts. A technique without a
// name or a drill is dropped: the whole promise of the daily card is that
// there is something to DO, so a nameless entry with no drill is not a
// half-useful technique, it is a blank card waiting to happen.
// A DRILL THAT REFUSES TO BE A DRILL IS NOT ONE. The research proposed "Voodoo
// Death" as a scale marker with the drill "No drill. Read Cannon's case
// descriptions…" — true, interesting, and useless as a daily card: it would
// eventually surface on Home with nothing to do. His call, 16 Sep: "cut it
// because it confuses me and I don't see the point."
//
// The normaliser already required a drill; it did not require the drill to BE
// one. Context belongs in the report, which keeps it — only the curriculum is
// for things he can go and do.
const NOT_A_DRILL = /^\s*(?:no drill|none|n\/a|not applicable|nothing to (?:do|practi[sc]e)|do not (?:attempt|try)|not something to (?:attempt|try)|read about|just read)\b/i;

export function normalizeProposal(parsed) {
  const seen = new Set();
  const techniques = [];
  for (const t of Array.isArray(parsed?.techniques) ? parsed.techniques : []) {
    const name = cardField(t?.name, 80);
    const drill = cardField(t?.drill, 220);
    if (!name || !drill || NOT_A_DRILL.test(drill)) continue;
    const id = slugFor(name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    techniques.push({
      family: clip(t?.family, 60) || clip(parsed?.family, 60) || 'Unfiled',
      name, summary: cardField(t?.summary, 140), move: cardField(t?.move, 220), drill,
      tell: cardField(t?.tell, 220), source: cardField(t?.source, 120),
    });
  }
  const sources = (Array.isArray(parsed?.sources) ? parsed.sources : [])
    .map((s, i) => ({ n: Number(s?.n) || i + 1, title: clip(s?.title, 140), url: clip(s?.url, 400) }))
    .filter((s) => /^https?:\/\//.test(s.url));
  return {
    title: clip(parsed?.title, 90) || 'Repertoire',
    family: clip(parsed?.family, 60) || 'Unfiled',
    whatItShows: String(parsed?.whatItShows || '').trim(),
    noteworthy: String(parsed?.noteworthy || '').trim(),
    techniques,
    sources,
    consulted: Number(parsed?.consulted) || sources.length,
  };
}

// The curriculum is rendered from FIELDS, never from model prose — the same
// values the catalogue page gets, so the report and the page cannot drift.
export function renderCurriculum(techniques = []) {
  if (!techniques.length) return '';
  const lines = ['## The plan', '', `${techniques.length} techniques, in the order they teach best. One a day, and the ones you actually practise come back less often.`, ''];
  techniques.forEach((t, i) => {
    lines.push(`**${i + 1}. ${t.name}** — _${t.family}_`);
    if (t.summary) lines.push(t.summary);
    if (t.move) lines.push(`- **Move:** ${t.move}`);
    lines.push(`- **Drill:** ${t.drill}`);
    if (t.tell) lines.push(`- **Tell:** ${t.tell}`);
    if (t.source) lines.push(`- **Source:** ${t.source}`);
    lines.push('');
  });
  return lines.join('\n').trim();
}

export function renderSources(sources = []) {
  if (!sources.length) return '';
  return ['## Sources', '', ...sources.map((s) => `${s.n}. [${s.title || s.url}](${s.url})`)].join('\n');
}

export function buildReport({ evidence, proposal }) {
  const findings = [
    proposal.whatItShows ? `## What it shows\n\n${proposal.whatItShows}` : '',
    proposal.noteworthy ? `## Noteworthy\n\n${proposal.noteworthy}` : '',
    renderCurriculum(proposal.techniques),
    renderSources(proposal.sources),
  ].filter(Boolean).join('\n\n');
  return assembleReport({ evidence, findings, title: proposal.title });
}

/* --------------------------------- the job -------------------------------- */

async function runRepertoireJob(vaultPath, record, { url, prose, focus }) {
  const { updateRecord } = await import('./inboxStore.js');
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'nova-rep-'));
  try {
    const { source, read, transcript, frames } = await fetchSource(url, workDir);
    const evidence = { source, read };
    const { grounded } = isGrounded(evidence);
    if (!grounded) {
      // Honest degradation: file the receipt as the finding. He learns the
      // link is unreadable, which is a real answer, and retry is one tap.
      throw Object.assign(new Error(`could not read anything from that link — ${isGrounded(evidence).why}`), { evidence });
    }

    const existing = flatten(await loadRepertoire(vaultPath).catch(() => []));
    const raw = await askModel(buildRepertoirePrompt({ source, transcript, frames, prose, existing, focus }));
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('the analysis did not come back as JSON');
    const proposal = normalizeProposal(parseModelJson(match[0]));
    if (!proposal.techniques.length) throw new Error('the analysis proposed no usable techniques (each needs a name and a drill)');

    evidence.research = { consulted: proposal.consulted, cited: proposal.sources.length, failed: [] };
    const body = buildReport({ evidence, proposal });

    // the transcript is kept beside the record so a retry never re-pays for it
    await writeFile(path.join(workDir, '..', `nova-rep-${record.id}.txt`), transcript, 'utf8').catch(() => {});

    await updateRecord(record.id, {
      status: 'pending',
      analysed: true,
      confirmLine: confirmLine(evidence),
      repertoireTechniques: proposal.techniques,
      decision: {
        route: 'repertoire',
        confidence: 'high',
        title: proposal.title,
        reason: `${confirmLine(evidence)} Approve to file the report and add ${proposal.techniques.length} technique${proposal.techniques.length === 1 ? '' : 's'} to your Repertoire.`,
        payload: { title: proposal.title, body, techniques: proposal.techniques },
      },
      error: null,
    });
  } catch (e) {
    const patch = { status: 'error', error: e.message.slice(0, 400) };
    if (e.evidence) patch.confirmLine = confirmLine(e.evidence);
    await updateRecord(record.id, patch).catch(() => {});
  } finally {
    rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ------------------------------ the top-up -------------------------------- */
//
// "Have Nova research more when it runs low, but it's okay to still repeat
// ones." (15 Sep.) So this is a RUNWAY check, not a panic: with three new
// techniques a week, MIN_RUNWAY untaught is about a fortnight's notice, and the
// curriculum keeps working the whole time — an exhausted catalogue reviews
// rather than going blank, which is why this can afford to propose instead of
// filing itself.
//
// It has no source to read, so there is no coverage receipt: nothing was
// "analysed", and claiming otherwise would be the exact fiction captureReport
// exists to prevent. What it files is a plainly-labelled proposal whose
// evidence is his own catalogue plus cited research.
export const MIN_RUNWAY = 6;
export const TOPUP_TARGET = 6;

export function buildTopUpPrompt({ existing, families, prose }) {
  return `${NOVA_LENS}

You are Nova's Repertoire agent. Hayden is working through a curriculum of
psychological techniques one at a time and is running low on new ones. Research
and propose ${TOPUP_TARGET} MORE, in the same domain, that he does not already have.

WHAT HE ALREADY HAS (${existing.length} techniques — do NOT propose any of these again):
${existing.map((t) => `- ${t.name} (${t.family})`).join('\n')}

THE FAMILIES he is already working in: ${families.join(', ') || '(none yet)'}

Stay in this domain. Go WIDER within it rather than deeper into one family —
the point is new ground he can actually practise, not five more variations on
what he has. Prefer techniques with a real literature behind them and name them
the way practitioners do.
${prose ? `\nHis standing instruction for this curriculum: ${prose}\n` : ''}
HARD RULES
- EVERY factual claim about research carries a numbered citation [1], and every
  number resolves to an entry in your sources array. No citation, no claim.
- Never invent a study, an author, a date or a result. These file into his vault.
- Each technique needs a DRILL small enough to run in a normal day, and a TELL
  that says how he knows it landed. One without a drill is not a technique on
  this list, it is trivia.
- Keep every field short enough to read on a phone: summary ≤ 140 characters,
  move / drill / tell ≤ 220 each.

Output ONLY this JSON object, no code fences, no commentary:
{
  "title": "Short title for this addition",
  "family": "the broad domain",
  "noteworthy": "markdown bullets — what is genuinely notable in what you found",
  "techniques": [
    {"family": "...", "name": "...", "summary": "...", "move": "...", "drill": "...", "tell": "...", "source": "where it comes from"}
  ],
  "sources": [{"n": 1, "title": "...", "url": "https://..."}],
  "consulted": 0
}`;
}

// How much new work is left before he is only reviewing. Pure.
export function runwayLeft(techniques = [], state = {}) {
  const st = state.techniques || {};
  return techniques.filter((t) => !(st[t.id]?.lastSurfacedOn || st[t.id]?.lastSurfacedAt)).length;
}

// Should the loop spend money this tick? Pure, so every guard is testable
// without a scheduler, a clock or a vault. Returns the reason either way,
// because "it did nothing" is the answer he will want explained.
export function shouldTopUp({ techniques = [], state = {}, openRecords = 0, minRunway = MIN_RUNWAY } = {}) {
  // An EMPTY catalogue is not "running low" — he has not started one, and
  // topping up a curriculum he never asked for would be Nova inventing work.
  if (!techniques.length) return { go: false, why: 'no catalogue yet — nothing to top up' };
  // A second proposal stacked on an unanswered first is nagging, not helping.
  if (openRecords > 0) return { go: false, why: 'a repertoire record is already running or waiting on him' };
  const runway = runwayLeft(techniques, state);
  if (runway >= minRunway) return { go: false, why: `${runway} untaught left — still plenty`, runway };
  return { go: true, why: `down to ${runway} untaught`, runway };
}

async function runTopUpJob(vaultPath, record) {
  const { updateRecord } = await import('./inboxStore.js');
  try {
    const existing = flatten(await loadRepertoire(vaultPath));
    const families = [...new Set(existing.map((t) => t.family))];
    const raw = await askModel(buildTopUpPrompt({ existing, families, prose: record.repertoireProse || '' }));
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('the top-up did not come back as JSON');
    const proposal = normalizeProposal(parseModelJson(match[0]));
    const fresh = proposal.techniques.filter((t) => !existing.some((e) => e.id === slugFor(t.name)));
    if (!fresh.length) throw new Error('nothing came back that is not already in your Repertoire');

    const body = [
      `# ${proposal.title}`,
      '',
      `_Researched because your Repertoire was down to ${record.runwayAtRaise} untaught technique${record.runwayAtRaise === 1 ? '' : 's'}. Nothing was analysed for this — it is research against the ${existing.length} you already have._`,
      '',
      proposal.noteworthy ? `## Noteworthy\n\n${proposal.noteworthy}` : '',
      renderCurriculum(fresh),
      renderSources(proposal.sources),
    ].filter(Boolean).join('\n\n');

    await updateRecord(record.id, {
      status: 'pending',
      repertoireTechniques: fresh,
      decision: {
        route: 'repertoire',
        confidence: 'high',
        title: proposal.title,
        reason: `Your Repertoire was down to ${record.runwayAtRaise} untaught. Approve to add ${fresh.length} more.`,
        payload: { title: proposal.title, body, techniques: fresh },
      },
      error: null,
    });
  } catch (e) {
    await updateRecord(record.id, { status: 'error', error: e.message.slice(0, 400) }).catch(() => {});
  }
}

export async function startTopUp(vaultPath, { runway = 0, prose = '' } = {}) {
  if (!laneEnabled(REPERTOIRE_LANE)) throw laneOffError(REPERTOIRE_LANE);
  const { createRecord } = await import('./inboxStore.js');
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'repertoire',
    text: `Repertoire running low — researching ${TOPUP_TARGET} more techniques`,
    repertoireProse: prose, runwayAtRaise: runway, topUp: true,
    source: 'nova', mode: 'draft', status: 'classifying',
    createdAt: new Date().toISOString(),
  });
  runTopUpJob(vaultPath, record);
  return record;
}

// THE SCHEDULER. Half-hourly like its neighbours, but it does real work only
// when the runway is short AND nothing is already in flight or waiting on him —
// a second proposal stacked on an unanswered first is nagging, not helping.
export function startRepertoireTopUpScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('repertoire-topup');
    try {
      if (!laneEnabled(REPERTOIRE_LANE)) return;
      const { loadRepertoire: load, readState } = await import('./repertoire.js');
      const { listRecords } = await import('./inboxStore.js');
      const techniques = flatten(await load(vaultPath));
      const state = await readState();
      const openRecords = (await listRecords()).filter((r) => r.kind === 'repertoire' && ['classifying', 'pending'].includes(r.status)).length;
      const verdict = shouldTopUp({ techniques, state, openRecords });
      if (!verdict.go) return;
      await startTopUp(vaultPath, { runway: verdict.runway });
    } catch (err) {
      console.error('repertoire top-up failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 30 * 60 * 1000).unref?.();
}

export async function startRepertoire(vaultPath, { url, prose, focus } = {}) {
  const link = String(url || '').trim();
  if (!/^https?:\/\/\S+$/.test(link)) throw new Error('a repertoire analysis needs a link');
  if (!laneEnabled(REPERTOIRE_LANE)) throw laneOffError(REPERTOIRE_LANE);
  const { createRecord } = await import('./inboxStore.js');
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'repertoire',
    text: `Analyse & learn: ${prose ? clip(prose, 70) : link}`,
    repertoireUrl: link, repertoireProse: prose || '', repertoireFocus: focus || '',
    source: 'nova', mode: 'draft', status: 'classifying',
    createdAt: new Date().toISOString(),
  });
  runRepertoireJob(vaultPath, record, { url: link, prose, focus });
  return record;
}

export async function retryRepertoire(vaultPath, record) {
  const { updateRecord } = await import('./inboxStore.js');
  const updated = await updateRecord(record.id, { status: 'classifying', error: null });
  runRepertoireJob(vaultPath, updated, { url: record.repertoireUrl, prose: record.repertoireProse, focus: record.repertoireFocus });
  return updated;
}
