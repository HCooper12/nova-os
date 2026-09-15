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
// DELIBERATELY NARROW: this lane resolves video, because that is what he
// sends. A link yt-dlp cannot open is refused with a pointer at the
// Researcher, which already reads pages. Refusing is honest; guessing at an
// article from its URL is not.

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
    child.on('close', (code) => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error(err.trim().split('\n').pop()?.slice(0, 200) || `exit ${code}`)); });
    child.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

const cookieArgs = () => (existsSync(COOKIES) ? ['--cookies', COOKIES] : []);

/* --------------------------- stage 1: the fetch --------------------------- */

// Everything this returns is a FACT about what happened, including the
// failures. `read` is the receipt the report is built from.
export async function fetchSource(url, workDir, { runner = run } = {}) {
  const read = [];
  let meta = null;
  try {
    const raw = await runner(YTDLP, ['-J', '--no-warnings', ...cookieArgs(), url], { timeoutMs: 90_000 });
    meta = JSON.parse(raw);
    read.push(readEntry('Metadata', true, [meta.title, meta.uploader].filter(Boolean).join(' · ') || 'fetched'));
  } catch (e) {
    read.push(readEntry('Metadata', false, e.message.slice(0, 120)));
    const err = new Error(`nothing at that link could be opened as video (${e.message.slice(0, 120)}). If it is an article, ask the Researcher to read it instead.`);
    err.evidence = { source: { url }, read };
    throw err;
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
        transcript = String(await transcribeAudio(audio, { mime: 'audio/mpeg' }) || '').trim();
        via = 'Whisper — no captions on this platform';
      } catch (e) {
        read.push(readEntry('Transcript', false, e.message.slice(0, 120)));
      }
    }
  }
  if (transcript) {
    read.push(readEntry('Transcript', true, `${transcript.split('\n').filter(Boolean).length} lines · ${transcript.length} characters`, via));
  } else if (!read.some((r) => r.what === 'Transcript')) {
    read.push(readEntry('Transcript', false, 'no captions and no audio to transcribe'));
  }

  return { source, read, transcript, frames };
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
  const known = existing.length
    ? `\nALREADY IN HIS REPERTOIRE — do NOT propose these again, but you may reference them:\n${existing.map((t) => `- ${t.name} (${t.family})`).join('\n')}`
    : '';
  return `${NOVA_LENS}

You are Nova's Repertoire agent. Hayden sent a source and asked: "${prose || 'analyse this, research the techniques like it, and build me a plan I can practise one a day'}".

THE SOURCE
- ${sourceLine(source)}${source.title ? `: “${source.title}”` : ''}
- ${source.url}
${source.description ? `- The poster's own caption: “${source.description.slice(0, 600)}”` : ''}

THE TRANSCRIPT — this is verbatim, and it is the primary evidence:
"""
${transcript.slice(0, TRANSCRIPT_CHARS) || '(none — the clip had no readable audio)'}
"""
${frames.length ? `
THE FRAMES — cut from the clip by ffmpeg, in order. READ THEM with the Read tool. They carry anything on screen that the audio does not, including burned-in captions, and what the people actually DO:
${frames.map((f, i) => `- frame ${String(i + 1).padStart(2, '0')}: ${f}`).join('\n')}
` : ''}
YOUR JOB, in three parts.

1. WHAT THIS SOURCE ACTUALLY SHOWS. Break the technique down into the moves, in the order they happen, quoting the transcript. Be precise about the MECHANISM — why it works on a person, not just what was said. If the source labels the technique, say whether that label is correct; a popular mislabel is worth naming, because it sends someone researching the wrong literature.

2. RESEARCH OUTWARD. Search the web for the real, named techniques in the same family${focus ? ` — the focus he chose is: ${focus}` : ''}. Prefer the primary literature and practitioner sources (experimental psychology, stage mentalism and magic, interrogation and negotiation research, hypnosis and suggestion research). EVERY factual claim about research carries a numbered citation [1], and every number resolves to an entry in your sources array. Note where sources disagree instead of averaging them.

3. BUILD THE CURRICULUM. Order it so it actually teaches: the foundations that everything else needs come FIRST, showy things later. For each technique give a drill small enough to run in a normal day — something he can do to a friend, a barista or a colleague this afternoon — and a "tell" that says how he knows it landed.

HARD RULES
- Ground part 1 ONLY in the transcript and the frames. If the frames do not show something, say the frames do not show it.
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

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// Validate into the shape the catalogue writer accepts. A technique without a
// name or a drill is dropped: the whole promise of the daily card is that
// there is something to DO, so a nameless entry with no drill is not a
// half-useful technique, it is a blank card waiting to happen.
export function normalizeProposal(parsed) {
  const seen = new Set();
  const techniques = [];
  for (const t of Array.isArray(parsed?.techniques) ? parsed.techniques : []) {
    const name = clip(t?.name, 80);
    const drill = clip(t?.drill, 220);
    if (!name || !drill) continue;
    const id = slugFor(name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    techniques.push({
      family: clip(t?.family, 60) || clip(parsed?.family, 60) || 'Unfiled',
      name, summary: clip(t?.summary, 140), move: clip(t?.move, 220), drill,
      tell: clip(t?.tell, 220), source: clip(t?.source, 120),
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
