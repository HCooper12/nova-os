// THE MEDIA LANE — "pull up the latest Diary of a CEO video."
//
// His 21-Aug ask: Nova should know to go to YouTube, find the newest video
// by that channel, and START IT PLAYING — then offer to digest it. Nova's
// server runs on his Mac, so it can genuinely open the browser; this is the
// one place in Nova that reaches out of the app and into the machine, and
// it is deliberately narrow:
//
//   - it resolves ONLY through yt-dlp (the same binary and cookie jar the
//     Watcher and Study lanes already use), never by guessing a URL;
//   - it opens ONLY an https YouTube watch URL it just resolved, via
//     spawn with an argument array — never a shell string, so nothing in a
//     spoken phrase can become a command;
//   - it never plays anything on its own initiative. He asks, or it stays
//     shut.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const YTDLP = process.env.YTDLP_BIN || '/opt/homebrew/bin/yt-dlp';
const COOKIES = path.join(os.homedir(), '.config/watch/yt-cookies.txt');
const cookieArgs = () => (existsSync(COOKIES) ? ['--cookies', COOKIES] : []);

function run(bin, args, { timeoutMs = 45_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let out = '', err = '';
    const t = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timed out')); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error(err.trim().slice(0, 200) || `exit ${code}`)); });
    child.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

// Strip the ask down to the thing being named. "pull up the latest Diary of
// a CEO video" → "Diary of a CEO". Exported for tests: this is the part most
// likely to need his ear later.
export function channelQuery(text) {
  return String(text || '')
    .replace(/^\s*(hey\s+)?nova[,\s]*/i, '')
    .replace(/\b(please|for me|on youtube|in youtube|on the tv|up)\b/gi, ' ')
    .replace(/\b(pull|bring|put|open|play|start|find|show|watch|get|load)\b/gi, ' ')
    .replace(/\b(latest|newest|most recent|episode|video|clip|podcast)\b/gi, ' ')
    .replace(/[?!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // only LEADING filler goes — "Diary of a CEO" must keep its own words,
    // and stripping every "a"/"the" turned it into "Diary of CEO". Repeat
    // until stable: "the from Jeff Nippard" sheds two words, not one.
    // (?:\s+|$) so a phrase that is ONLY filler ("play the video" → "the")
    // collapses to nothing and is refused, rather than searching for "the"
    .replace(/^(?:(?:the|a|an|from|by|on|of|new|last|me|for)(?:\s+|$))+/i, '')
    .trim();
}

const WATCH_URL = (id) => `https://www.youtube.com/watch?v=${id}`;

// Find the channel by searching, then take that channel's NEWEST upload —
// searching alone returns whatever YouTube thinks is most relevant, which is
// very often a years-old episode. "Latest" has to mean latest.
export async function resolveLatestVideo(query, { runner = run } = {}) {
  const q = channelQuery(query);
  if (!q) throw new Error('nothing named to pull up');

  const searchRaw = await runner(YTDLP, ['--flat-playlist', '-J', '--playlist-end', '5', ...cookieArgs(), `ytsearch5:${q}`]);
  const entries = JSON.parse(searchRaw)?.entries || [];
  if (!entries.length) throw new Error(`nothing on YouTube for “${q}”`);

  // the channel that appears most across the top results is the one he meant
  const tally = new Map();
  for (const e of entries) {
    const url = e.channel_url || e.uploader_url;
    if (!url) continue;
    const cur = tally.get(url) || { n: 0, name: e.channel || e.uploader || q };
    cur.n += 1;
    tally.set(url, cur);
  }
  const best = [...tally.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  if (!best) {
    const e = entries[0];
    return { title: e.title, url: WATCH_URL(e.id), channel: e.channel || e.uploader || q, exact: false };
  }

  const [channelUrl, { name }] = best;
  try {
    const latestRaw = await runner(YTDLP, ['--flat-playlist', '-J', '--playlist-end', '1', ...cookieArgs(), `${channelUrl.replace(/\/$/, '')}/videos`]);
    const latest = (JSON.parse(latestRaw)?.entries || [])[0];
    if (latest?.id) {
      return {
        title: latest.title, url: WATCH_URL(latest.id), channel: name, exact: true,
        durationMin: latest.duration ? Math.round(latest.duration / 60) : null,
      };
    }
  } catch { /* the channel's uploads tab refused — fall back, and say so */ }

  const e = entries[0];
  return { title: e.title, url: WATCH_URL(e.id), channel: e.channel || e.uploader || name, exact: false };
}

// Open it on his Mac. Argument array, never a shell string, and only a URL
// this module just built.
export async function openInBrowser(url, { opener = run } = {}) {
  if (!/^https:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{6,}$/.test(String(url || ''))) {
    throw new Error('refusing to open anything but a resolved YouTube watch URL');
  }
  await opener('/usr/bin/open', [url], { timeoutMs: 8000 });
  return true;
}

// The model asks for a video the same way it asks for anything else: one
// typed line, parsed and validated by code.
const PLAY_RE = /^\s*PLAY\s*(\{[\s\S]*?\})\s*$/m;

export function parsePlayDirective(text) {
  const raw = String(text ?? '');
  const m = raw.match(PLAY_RE);
  if (!m) return { cleanText: raw, play: null };
  const cleanText = raw.replace(PLAY_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  try {
    const d = JSON.parse(m[1]);
    const query = String(d.query || '').trim().slice(0, 120);
    if (!query) return { cleanText, play: null, parseError: 'the play directive named nothing' };
    return { cleanText, play: { query } };
  } catch {
    return { cleanText, play: null, parseError: 'the play directive was not valid JSON' };
  }
}
