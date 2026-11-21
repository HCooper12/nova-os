import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, rename } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { transcribeLocal, localSttConfigured } from './sttLocal.js';

// THE WORDS OF ONE SOURCE (Mentors, part 2, 21 Nov 2026). Free, and on this
// Mac: audio in, transcribed by Nova's own ears (lib/sttLocal.js,
// whisper-large-v3-turbo on MLX, measured 21.5 times real time).
//
// Captions are NOT a route: YouTube refused the first caption request after
// two idle days (429), so no pacing stays under it. Audio was not refused.
// The order, cheapest and surest first:
//   1. a transcript already in his vault (a Raw file the backfill found);
//   2. the podcast episode that is the same recording (its own public feed);
//   3. the YouTube audio, with yt-dlp's DEFAULT client and nothing else.
// Never cookies, never a signed-in session, never another player client or a
// token provider. When YouTube refuses, the error says so (kind `refused`)
// and the queue lets the item wait; nothing here tries to get around it.
//
// This module only makes the text file. It does not touch the register (the
// queue does, lib/mentorQueue.js) and it never writes to the vault.
//
// Every tool and every download goes through `deps`, so the tests run with no
// yt-dlp, ffmpeg, ffprobe, network or transcriber. Binaries by absolute path
// (launchd's PATH has no brew), env override first, read lazily.

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
export const transcriptsDir = () => path.join(dataRoot(), 'mentors', 'transcripts');
export const safeKey = (key) => String(key).replace(/:/g, '_');
export const transcriptPathFor = (key) => path.join(transcriptsDir(), `${safeKey(key)}.txt`);

const YTDLP = () => process.env.NOVA_YTDLP || '/opt/homebrew/bin/yt-dlp';
const FFMPEG = () => process.env.NOVA_FFMPEG || '/opt/homebrew/bin/ffmpeg';
const FFPROBE = () => process.env.NOVA_FFPROBE || '/opt/homebrew/bin/ffprobe';

export const PIECE_SEC = 300;          // a cut near every 5 minutes
export const SILENCE_REACH_SEC = 25;   // a cut moves to a silence at most this far
export const LINE_MS = 30_000;         // the pilot's 30 s lines
const MAX_AUDIO_BYTES = 500 * 1024 * 1024;
const DOWNLOAD_MS = 10 * 60_000;
const PIECE_TIMEOUT_MS = 300_000;

// A failure with a kind the queue acts on: `refused` waits six hours,
// `unavailable` is skipped, `failed` retries in an hour.
export function transcriptError(kind, message) {
  const e = new Error(String(message || 'the transcript failed and gave no reason').slice(0, 200));
  e.kind = kind;
  return e;
}

const toolLine = (text) => {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.filter((l) => /ERROR/.test(l)).pop() || lines.pop() || 'no message';
};

// Run a tool to the end with stdin closed and a kill timer (an external tool,
// never the claude CLI), collecting both streams.
function runTool(bin, args, { timeoutMs, name }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      reject(Object.assign(new Error(`${name} could not start (${bin}): ${e.message}`), { stderr: '' }));
      return;
    }
    let out = '';
    let err = '';
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      reject(Object.assign(new Error(`${name} did not finish within ${Math.round(timeoutMs / 1000)} s and was stopped`), { stderr: err }));
    }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(Object.assign(new Error(`${name} could not start (${bin}): ${e.message}`), { stderr: err }));
    });
    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(Object.assign(new Error(`${name} exited with code ${code}: ${toolLine(err)}`), { stderr: err }));
        return;
      }
      resolve({ stdout: out, stderr: err });
    });
  });
}

// One public file over HTTPS into `dest`: redirects followed (podcast hosts
// bounce through trackers), a generic podcast-app user agent, nothing over
// 500 MB, ten minutes at most. Streamed to disk, never held in memory.
async function downloadFile(url, dest) {
  const host = (() => { try { return new URL(url).host; } catch { return url; } })();
  let res;
  const signal = AbortSignal.timeout(DOWNLOAD_MS);
  try {
    res = await fetch(url, { redirect: 'follow', signal, headers: { 'User-Agent': 'Podcasts/1.0', Accept: '*/*' } });
  } catch (e) {
    throw new Error(`could not reach ${host} (${e?.name === 'TimeoutError' ? 'no answer within 10 minutes' : (e.cause?.code || e.message)})`);
  }
  if (!res.ok) throw new Error(`${host} answered ${res.status} ${res.statusText || ''}`.trim());
  const size = Number(res.headers.get('content-length'));
  if (Number.isFinite(size) && size > MAX_AUDIO_BYTES) throw new Error(`${host} offered ${Math.round(size / 1048576)} MB, more than the 500 MB this takes`);
  let bytes = 0;
  const counter = new TransformStream({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > MAX_AUDIO_BYTES) { controller.error(new Error(`${host} sent more than 500 MB`)); return; }
      controller.enqueue(chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body.pipeThrough(counter)), createWriteStream(dest));
  } catch (e) {
    throw new Error(e?.name === 'TimeoutError' || e?.name === 'AbortError' ? `${host} did not finish sending within 10 minutes` : `downloading from ${host}: ${e.message}`);
  }
  return { bytes };
}

const realDeps = () => ({
  readText: (file) => readFile(file, 'utf8'),
  download: (url, dest) => downloadFile(url, dest),
  // the default client: no cookies, no signed-in session, no other player
  // client, no token provider. Returns the path of the file yt-dlp wrote.
  ytdlpAudio: async (url, dir) => {
    await runTool(YTDLP(), ['--no-progress', '-f', 'bestaudio[abr<=70]/bestaudio', '--no-playlist', '-o', path.join(dir, 'a.%(ext)s'), url], { timeoutMs: DOWNLOAD_MS, name: 'yt-dlp' });
    const got = (await readdir(dir)).filter((f) => f.startsWith('a.') && !f.endsWith('.part'));
    if (!got.length) throw Object.assign(new Error('yt-dlp finished but wrote no audio file'), { stderr: '' });
    return path.join(dir, got[0]);
  },
  probeSeconds: async (file) => {
    const { stdout } = await runTool(FFPROBE(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { timeoutMs: 60_000, name: 'ffprobe' });
    return Number(stdout.trim());
  },
  // one pass of silencedetect over the whole file -> [{ start, end }]
  silences: async (file) => {
    const { stderr } = await runTool(FFMPEG(), ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'silencedetect=noise=-32dB:d=0.35', '-f', 'null', '-'], { timeoutMs: DOWNLOAD_MS, name: 'ffmpeg silencedetect' });
    return parseSilences(stderr);
  },
  // split at `times` (seconds) into `dir`; a stream copy first, and when the
  // container will not copy-split, mono 16 kHz AAC re-encoded and split
  split: async (file, times, dir) => {
    const ext = (path.extname(file).slice(1) || 'mka').toLowerCase();
    const at = times.map((t) => t.toFixed(3)).join(',');
    const common = ['-hide_banner', '-v', 'error', '-i', file, '-map', '0:a:0'];
    try {
      await runTool(FFMPEG(), [...common, '-c', 'copy', '-f', 'segment', ...(times.length ? ['-segment_times', at] : []), '-reset_timestamps', '1', path.join(dir, `p%03d.${ext}`)], { timeoutMs: DOWNLOAD_MS, name: 'ffmpeg split' });
    } catch {
      for (const f of await readdir(dir)) await rm(path.join(dir, f), { force: true });
      await runTool(FFMPEG(), [...common, '-ac', '1', '-ar', '16000', '-c:a', 'aac', '-b:a', '64k', '-f', 'segment', ...(times.length ? ['-segment_times', at] : []), '-reset_timestamps', '1', path.join(dir, 'p%03d.m4a')], { timeoutMs: DOWNLOAD_MS, name: 'ffmpeg split (re-encoded)' });
    }
    return (await readdir(dir)).filter((f) => /^p\d{3}\./.test(f)).sort().map((f) => path.join(dir, f));
  },
  transcribe: (file, opts) => transcribeLocal(file, opts),
  sttConfigured: () => localSttConfigured(),
  yieldToHim: async () => {},
  tmpRoot: () => os.tmpdir(),
});

let override = null;
export function _setTranscriptDepsForTest(d) { override = d || null; }
const D = () => ({ ...realDeps(), ...(override || {}) });

/* ------------------------------ pure helpers ------------------------------- */

// ffmpeg's silencedetect lines -> [{ start, end }]. A silence still open at
// the end of the file has no end line; it ends at Infinity (the caller clamps).
export function parseSilences(stderr) {
  const out = [];
  let open = null;
  for (const line of String(stderr || '').split('\n')) {
    const s = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (s) { open = Math.max(0, Number(s[1])); continue; }
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (e && open !== null) { out.push({ start: open, end: Number(e[1]) }); open = null; }
  }
  if (open !== null) out.push({ start: open, end: Infinity });
  return out;
}

// A cut near every 5 minutes, each moved to the middle of the nearest silence
// within 25 s of its mark (a cut in a pause never splits a word), or left on
// the mark when there is none.
export function cutPoints(durationSec, silences = [], { every = PIECE_SEC, reach = SILENCE_REACH_SEC } = {}) {
  const cuts = [];
  const mids = silences.map((s) => (s.start + Math.min(s.end, durationSec)) / 2);
  for (let mark = every; mark < durationSec; mark += every) {
    let best = null;
    for (const m of mids) {
      const d = Math.abs(m - mark);
      if (d <= reach && (best === null || d < Math.abs(best - mark))) best = m;
    }
    cuts.push(Math.round((best ?? mark) * 1000) / 1000);
  }
  return cuts;
}

// The pilot's clock (design/mentors-pilot/stage1.mjs mmss), unchanged.
export const mmss = (ms) => {
  const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`;
};

// Segments -> lines of about 30 seconds, `[mm:ss] text`, grouped EXACTLY as
// the pilot grouped its caption events, so the measured read prompt sees the
// shape it was measured on.
export function linesFromSegments(segments) {
  const events = (segments || []).map((s) => ({ tStartMs: Math.round(Number(s.start) * 1000), text: String(s.text || '').replace(/\s+/g, ' ').trim() }));
  const lines = []; let cur = ''; let curStart = null;
  for (const e of events) {
    if (!e.text) continue;
    if (curStart === null) curStart = e.tStartMs;
    cur += (cur ? ' ' : '') + e.text;
    if (e.tStartMs - curStart >= LINE_MS) { lines.push(`[${mmss(curStart)}] ${cur.trim()}`); cur = ''; curStart = null; }
  }
  if (cur.trim()) lines.push(`[${mmss(curStart || 0)}] ${cur.trim()}`);
  return lines.join('\n');
}

// A vault Raw file: the header above the first line that is exactly `---`
// goes, the rest stays.
export function stripRawHeader(text) {
  const lines = String(text || '').split('\n');
  const i = lines.findIndex((l) => l.trim() === '---');
  return (i < 0 ? lines : lines.slice(i + 1)).join('\n').trim();
}

const TIMED_RE = /^\[\d{1,3}:\d{2}(?::\d{2})?\]/m;

// What yt-dlp said, as a kind. The age gate is checked first: its message
// also starts "Sign in to confirm", but it is a door, not a refusal.
export function classifyYtdlp(text) {
  const t = String(text || '');
  if (/confirm your age|age[- ]restricted|inappropriate for some users/i.test(t)) return 'unavailable';
  if (/HTTP Error 4(29|03)|\b(429|403)\b|Too Many Requests|Forbidden|Sign in to confirm|\brate[- ]?limit|\brate\b/i.test(t)) return 'refused';
  if (/private video|video unavailable|is not available|has been removed|been terminated|members[- ]only|join this channel|premieres in|live event will begin|this video has been deleted|video is private/i.test(t)) return 'unavailable';
  return 'failed';
}

/* ----------------------------- the long read ------------------------------- */

/**
 * One audio file -> { text, segments, audioSec, sttSec, pieces }. Cut at
 * silences near every 5 minutes, each piece transcribed in turn with time
 * marks, the times offset by the piece's start, the lines built the pilot's
 * way. Before every piece it waits for him (`deps.yieldToHim`, supplied by the
 * queue: no piece starts while a conversation turn is in flight). Every temp
 * file is gone afterwards, success or not.
 */
export async function transcribeLong(file, { title = 'this recording', yieldToHim = null } = {}) {
  const d = D();
  const wait = yieldToHim || d.yieldToHim;
  if (!d.sttConfigured()) throw transcriptError('failed', 'the local transcriber is not installed (run server/voice-stt/setup.sh)');
  const tmp = await mkdtemp(path.join(d.tmpRoot(), 'nova-mentor-pieces-'));
  try {
    let audioSec;
    try { audioSec = Number(await d.probeSeconds(file)); } catch (e) { throw transcriptError('failed', `ffprobe could not read the length of ${title}: ${toolLine(e.stderr || e.message)}`); }
    if (!Number.isFinite(audioSec) || audioSec <= 0) throw transcriptError('failed', `ffprobe gave no length for ${title}`);
    let silences = [];
    try { silences = await d.silences(file); } catch { /* no silences known: every cut stays on its mark */ }
    const cuts = cutPoints(audioSec, silences);
    let pieces;
    try { pieces = await d.split(file, cuts, tmp); } catch (e) { throw transcriptError('failed', `ffmpeg could not cut ${title} into pieces: ${toolLine(e.stderr || e.message)}`); }
    if (!pieces.length) throw transcriptError('failed', `ffmpeg cut ${title} into no pieces`);
    const starts = [0, ...cuts];
    const segments = [];
    let sttSec = 0;
    for (let i = 0; i < pieces.length; i++) {
      await wait();
      let r;
      try {
        r = await d.transcribe(pieces[i], { segments: true, timeoutMs: PIECE_TIMEOUT_MS });
      } catch (e) {
        throw transcriptError('failed', `transcribing piece ${i + 1} of ${pieces.length} of ${title}: ${e.message}`);
      }
      sttSec += Number(r.seconds) || 0;
      const off = starts[i] ?? 0;
      for (const s of r.segments || []) {
        segments.push({ start: Math.round((Number(s.start) + off) * 100) / 100, end: Math.round((Number(s.end) + off) * 100) / 100, text: s.text });
      }
    }
    const text = linesFromSegments(segments);
    if (audioSec > PIECE_SEC && text.length < 200) throw transcriptError('failed', `no speech found in ${title}`);
    return { text, segments, audioSec: Math.round(audioSec * 10) / 10, sttSec: Math.round(sttSec * 10) / 10, pieces: pieces.length };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/* ------------------------------ one source --------------------------------- */

async function writeTranscript(key, text) {
  const file = transcriptPathFor(key);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, file);
  return file;
}

/**
 * The words of one register source, written to
 * dataRoot()/mentors/transcripts/<safe key>.txt. Returns
 * { source, path, chars, timed, audioSec, sttSec }. Throws an Error with a
 * `kind` (refused | unavailable | failed) and a plain message.
 */
export async function getTranscript(source, { vaultPath = null, yieldToHim = null } = {}) {
  const d = D();
  const title = source?.title || source?.key || 'this source';
  if (!source?.key) throw transcriptError('failed', `no way to get the words of ${title}`);

  // 1. already in his vault: read it, no download
  if (source.transcript?.source === 'vault' && source.transcript.path) {
    if (!vaultPath) throw transcriptError('failed', `the vault path is not set, so the transcript of ${title} cannot be read`);
    const full = path.resolve(vaultPath, source.transcript.path);
    if (!full.startsWith(path.resolve(vaultPath) + path.sep)) throw transcriptError('failed', `the transcript path of ${title} points outside the vault`);
    let raw;
    try { raw = await d.readText(full); } catch (e) { throw transcriptError('failed', `could not read ${source.transcript.path} from the vault: ${e.code || e.message}`); }
    const text = stripRawHeader(raw);
    const file = await writeTranscript(source.key, text);
    return { source: 'vault', path: file, chars: text.length, timed: TIMED_RE.test(text), audioSec: null, sttSec: null };
  }

  const isYt = source.key.startsWith('yt:');
  if (!source.audio?.url && !isYt) throw transcriptError('failed', `no way to get the words of ${title}`);

  const tmp = await mkdtemp(path.join(d.tmpRoot(), 'nova-mentor-audio-'));
  try {
    let file;
    let via;
    const t0 = Date.now();
    if (source.audio?.url) {
      // 2. the podcast episode that is the same recording
      via = 'podcast-audio';
      const ext = (String(source.audio.url).split('?')[0].match(/\.(mp3|m4a|aac|ogg|opus|wav|webm)$/i)?.[1] || 'mp3').toLowerCase();
      file = path.join(tmp, `a.${ext}`);
      try { await d.download(source.audio.url, file); } catch (e) {
        throw transcriptError('failed', `downloading the podcast audio of ${title}: ${e.message}`);
      }
    } else {
      // 3. the YouTube audio, default client only
      via = 'youtube-audio';
      const url = source.url || `https://www.youtube.com/watch?v=${source.key.slice(3)}`;
      try { file = await d.ytdlpAudio(url, tmp); } catch (e) {
        const said = `${e.stderr || ''}\n${e.message || ''}`;
        const kind = classifyYtdlp(said);
        const what = kind === 'refused' ? 'YouTube refused the audio of' : kind === 'unavailable' ? 'YouTube will not serve' : 'yt-dlp could not fetch the audio of';
        throw transcriptError(kind, `${what} ${title}: ${toolLine(said)}`);
      }
    }
    const downloadMs = Date.now() - t0;
    const long = await transcribeLong(file, { title, yieldToHim });
    const out = await writeTranscript(source.key, long.text);
    return { source: via, path: out, chars: long.text.length, timed: true, audioSec: long.audioSec, sttSec: long.sttSec, downloadSec: Math.round(downloadMs / 100) / 10 };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
