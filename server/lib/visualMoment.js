// THE EXACT MOMENT — turning "the bit where Hormozi talks about leverage"
// into 14:32, or into nothing at all.
//
// His 9-Sep ask: when Nova refers to a podcast, show its cover "and if we
// want to be smarter with it it would've even been better for it to indicate
// on this pop-up image the exact time code for when this concept is brought
// up in the conversation so that I could theoretically go back and watch it."
//
// His decision when asked how far to go: REAL, OR GO AND FIND IT. So there
// are two honest sources and no third:
//
//   1. HIS OWN VAULT. The Watcher already anchors every key idea it files to
//      a real transcript timestamp ("key ideas each anchored to a transcript
//      timestamp (M:SS)"). If he has had Nova watch the thing, the moment is
//      already written down in his own words. Free, instant, and his.
//   2. THE CAPTIONS. Otherwise pull the auto-captions and find the passage.
//      Slower, so it lands as an enrichment on a card already on the glass —
//      never as a reason to delay what Nova is saying.
//
// A miss returns null and the card shows the episode with no timecode. It
// NEVER estimates: a wrong timecode sends him to the wrong minute of an hour
// long podcast, which is worse than sending him to the start.

import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const YTDLP = process.env.YTDLP_BIN || '/opt/homebrew/bin/yt-dlp';
export const deps = { ytdlp: YTDLP };

const STOP = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'about', 'what', 'when', 'your', 'have', 'they', 'their', 'them', 'were', 'been', 'into', 'than', 'then', 'more', 'some', 'just', 'like', 'over', 'idea', 'talks', 'talking', 'part', 'bit', 'where', 'says', 'said']);

export const words = (s) => String(s || '').toLowerCase().match(/[a-z][a-z']{2,}/g)?.filter((w) => !STOP.has(w)) || [];

export function mmss(seconds) {
  const t = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function secondsOf(stamp) {
  const p = String(stamp || '').trim().split(':').map(Number);
  if (p.some((n) => !Number.isFinite(n))) return null;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return null;
}

/* ----------------------------- 1. his vault ------------------------------ */

// A Watcher note reads as prose with timestamps beside the ideas. Find the
// timestamp sitting closest to the words he is being told about.
const STAMP_RE = /\(?\b(\d{1,2}:\d{2}(?::\d{2})?)\b\)?/g;

export function momentInNote(noteText, phrase) {
  const text = String(noteText || '');
  if (!text) return null;
  const want = words(phrase);
  if (!want.length) return null;
  const hits = [];
  let m;
  STAMP_RE.lastIndex = 0;
  while ((m = STAMP_RE.exec(text))) {
    const at = secondsOf(m[1]);
    if (at == null) continue;
    // the line the stamp sits on, plus the one after it — that is where the
    // idea it anchors is actually written
    const from = text.lastIndexOf('\n', m.index) + 1;
    let to = text.indexOf('\n', m.index + m[0].length);
    if (to === -1) to = text.length;
    let nextEnd = text.indexOf('\n', to + 1);
    if (nextEnd === -1) nextEnd = text.length;
    // stop before the NEXT timestamp — a bullet list would otherwise let one
    // idea's words vouch for its neighbour's stamp
    const ahead = text.slice(to, nextEnd).search(/\b\d{1,2}:\d{2}\b/);
    const around = text.slice(from, ahead === -1 ? nextEnd : to + ahead);
    const have = new Set(words(around));
    const score = want.filter((w) => have.has(w)).length;
    if (score) hits.push({ at, score, line: around.replace(/\s+/g, ' ').trim().slice(0, 120) });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.score - a.score || a.at - b.at);
  const best = hits[0];
  // one word in common is a coincidence, not a citation
  if (best.score < 2 && want.length > 2) return null;
  return { at: best.at, stamp: mmss(best.at), source: 'vault', line: best.line };
}

/* ---------------------------- 2. the captions ---------------------------- */

// YouTube auto-captions carry inline timing tags and repeat the previous line
// as a rolling display; both are stripped so a cue is just words at a time.
export function parseVtt(vtt) {
  const out = [];
  const blocks = String(vtt || '').split(/\r?\n\r?\n/);
  for (const b of blocks) {
    const m = b.match(/(\d{2}:\d{2}:\d{2})[.,]\d{3}\s*-->/);
    if (!m) continue;
    const at = secondsOf(m[1]);
    if (at == null) continue;
    const text = b.split(/\r?\n/).slice(1)
      .join(' ')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    if (out.length && out[out.length - 1].text === text) continue;   // rolling repeat
    out.push({ at, text });
  }
  return out;
}

// A single cue is three or four words — far too little to recognise an idea.
// Score a sliding window of them and return where that window STARTS, which
// is where he would want the playhead.
export function pickMoment(cues, phrase, { window = 6, minWords = 2, minRatio = 0.5 } = {}) {
  const want = [...new Set(words(phrase))];
  if (!want.length || !cues?.length) return null;
  let best = null;
  for (let i = 0; i < cues.length; i++) {
    const slice = cues.slice(i, i + window);
    const have = new Set(words(slice.map((c) => c.text).join(' ')));
    const hit = want.filter((w) => have.has(w)).length;
    if (!best || hit > best.hit) best = { hit, i, slice };
  }
  if (!best || best.hit < minWords || best.hit / want.length < minRatio) return null;   // an honest miss
  // NARROW TO WHERE THE IDEA ACTUALLY STARTS. The window that scores best is
  // often the earliest one that merely REACHES the passage — its own first
  // cue can be half a minute of throat-clearing before it. Sending him to
  // 0:10 for a thing said at 14:30 is the failure this whole module exists
  // to avoid, so the playhead goes to the first cue that carries a match.
  const w = new Set(want);
  const firstHit = best.slice.findIndex((c) => words(c.text).some((x) => w.has(x)));
  const start = best.slice[firstHit < 0 ? 0 : firstHit];
  const line = best.slice.slice(Math.max(0, firstHit)).map((c) => c.text).join(' ').slice(0, 140);
  return { at: start.at, stamp: mmss(start.at), source: 'captions', line };
}

// Tighter than it looks: this runs AFTER the cover is already on the glass,
// so its only job is to land a chip before he has moved on. Past ~25s he has.
export async function captionsFor(videoId, { timeoutMs = 25_000 } = {}) {
  if (!/^[\w-]{6,}$/.test(String(videoId || ''))) return null;
  let dir = null;
  try {
    dir = await mkdtemp(path.join(os.tmpdir(), 'nova-cc-'));
    const ok = await new Promise((resolve) => {
      let child;
      try {
        child = spawn(deps.ytdlp, [
          `https://www.youtube.com/watch?v=${videoId}`,
          '--skip-download', '--no-warnings',
          '--write-auto-sub', '--write-sub', '--sub-lang', 'en.*', '--sub-format', 'vtt',
          '-o', path.join(dir, 'cc.%(ext)s'),
        ], { stdio: ['ignore', 'ignore', 'ignore'] });
      } catch { return resolve(false); }
      const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, timeoutMs);
      child.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
      child.on('error', () => { clearTimeout(timer); resolve(false); });
    });
    if (!ok) return null;
    const files = (await readdir(dir)).filter((f) => f.endsWith('.vtt'));
    if (!files.length) return null;
    return parseVtt(await readFile(path.join(dir, files[0]), 'utf8'));
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
