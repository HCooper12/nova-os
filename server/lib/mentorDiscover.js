import { spawn } from 'node:child_process';

// FINDING A PERSON'S MATERIAL, with no model anywhere (Mentors, 21 Nov 2026).
//
// A channel is listed with yt-dlp's flat playlist (a listing, never a caption
// request: the 19 Nov pilot found captions throttled hard and listings never
// refused), a podcast is found through Apple's free search and read from its
// own feed, books come from Open Library. Everything here returns plain data;
// nothing is saved, so he can look at what was found before he follows
// anyone (lib/mentorPeople.js previewPerson).
//
// Every network call and every spawned tool goes through `deps`, so the tests
// feed the saved real responses and never touch yt-dlp or the network. The
// binaries are named by absolute path because launchd's PATH has no brew, with
// an env override first (NOVA_YTDLP, NOVA_FFMPEG) read lazily.
//
// Errors say which step failed and what the host or tool answered, never an
// empty message. They carry `discovery: true` so the route can answer 502.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const YTDLP = () => process.env.NOVA_YTDLP || '/opt/homebrew/bin/yt-dlp';
const FFMPEG = () => process.env.NOVA_FFMPEG || '/opt/homebrew/bin/ffmpeg';

export function discoverError(message) {
  const e = new Error(message);
  e.discovery = true;
  return e;
}

function lastLine(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] || '';
}

// Run a tool to the end with stdin closed (an open pipe can stall a CLI) and a
// kill timer, collecting stdout as a Buffer.
function runTool(bin, args, { timeoutMs, name }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      reject(discoverError(`${name} could not start (${bin}): ${e.message}`));
      return;
    }
    const out = [];
    let err = '';
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      reject(discoverError(`${name} did not finish within ${Math.round(timeoutMs / 1000)} s and was stopped`));
    }, timeoutMs);
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(discoverError(`${name} could not start (${bin}): ${e.message}`));
    });
    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code !== 0) {
        const e = discoverError(`${name} exited with code ${code}: ${lastLine(err) || 'no message'}`);
        e.stderr = err;
        reject(e);
        return;
      }
      resolve(Buffer.concat(out));
    });
  });
}

async function httpGet(url, what) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': UA, Accept: '*/*' } });
  } catch (e) {
    const host = (() => { try { return new URL(url).host; } catch { return url; } })();
    throw discoverError(`${what}: could not reach ${host} (${e.cause?.code || e.message})`);
  }
  if (!res.ok) {
    const u = (() => { try { return new URL(url); } catch { return null; } })();
    throw discoverError(`${what}: ${u ? u.host : url} answered ${res.status} ${res.statusText || ''}`.trim());
  }
  return res;
}

const realDeps = () => ({
  // yt-dlp metadata as one parsed JSON document
  ytdlpJson: async (args) => {
    const buf = await runTool(YTDLP(), ['--no-warnings', ...args], { timeoutMs: 120_000, name: 'yt-dlp' });
    try { return JSON.parse(buf.toString('utf8')); } catch (e) {
      throw discoverError(`yt-dlp answered something that is not JSON (${e.message})`);
    }
  },
  fetchText: async (url, what = 'fetch') => (await httpGet(url, what)).text(),
  fetchJson: async (url, what = 'fetch') => {
    const res = await httpGet(url, what);
    try { return await res.json(); } catch (e) {
      throw discoverError(`${what}: ${new URL(url).host} answered something that is not JSON (${e.message})`);
    }
  },
  fetchBuffer: async (url, what = 'fetch') => Buffer.from(await (await httpGet(url, what)).arrayBuffer()),
  // a 32x32 raw RGB read of one image file (3,072 bytes)
  ffmpegRaw: (imagePath) => runTool(
    FFMPEG(),
    ['-v', 'error', '-i', imagePath, '-vf', 'scale=32:32', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { timeoutMs: 20_000, name: 'ffmpeg' },
  ),
});

let override = null;
export function _setDiscoverDepsForTest(d) { override = d || null; }
export const discoverDeps = () => ({ ...realDeps(), ...(override || {}) });

// run a dependency under a step name; whatever it throws becomes a discovery
// error that names the step, unless it already is one that says so
async function step(what, fn) {
  try { return await fn(); } catch (e) {
    if (e?.discovery && e.message.startsWith(what)) throw e;
    const err = discoverError(`${what}: ${e?.message || String(e)}`);
    err.stderr = e?.stderr;
    throw err;
  }
}

/* ------------------------------ small readers ------------------------------ */

const decodeXml = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&')
  .trim();

function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeXml(m[1]) : null;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function tagline(description) {
  const first = String(description || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
  return first.length > 160 ? `${first.slice(0, 157).trimEnd()}...` : first;
}

function candidateOf(meta) {
  const channelId = meta.channel_id || (/^UC[\w-]{20,}$/.test(meta.id || '') ? meta.id : null);
  if (!channelId) return null;
  const handle = meta.uploader_id && meta.uploader_id.startsWith('@') ? meta.uploader_id : null;
  return {
    name: meta.channel || meta.uploader || meta.title || null,
    handle,
    channelId,
    url: meta.uploader_url || meta.channel_url || `https://www.youtube.com/channel/${channelId}`,
    subscribers: num(meta.channel_follower_count),
    tagline: tagline(meta.description),
  };
}

// "https://www.youtube.com/@x/videos" -> "https://www.youtube.com/@x"
export function channelBase(url) {
  return String(url || '').trim().replace(/[?#].*$/, '').replace(/\/(videos|shorts|streams|featured|playlists|podcasts|community|about|live|releases)\/?$/i, '').replace(/\/+$/, '');
}

// Turns what he typed into a channel URL, or null when it is a search phrase.
export function channelUrlOf(query) {
  const q = String(query || '').trim();
  if (/^@[\w.-]+$/.test(q)) return `https://www.youtube.com/${q}`;
  try {
    const u = new URL(/^https?:\/\//i.test(q) ? q : `https://${q}`);
    if (/(^|\.)youtube\.com$/i.test(u.hostname) && /^\/(@[\w.-]+|channel\/UC[\w-]+|c\/[^/]+|user\/[^/]+)/.test(u.pathname)) {
      return channelBase(`https://www.youtube.com${u.pathname.match(/^\/(@[\w.-]+|channel\/UC[\w-]+|c\/[^/]+|user\/[^/]+)/)[0]}`);
    }
  } catch { /* a phrase, not a URL */ }
  return null;
}

/* --------------------------------- channels -------------------------------- */

// One channel, resolved from a pasted URL or an @handle: the first page of its
// videos tab carries the channel's own name, id, subscribers and handle.
async function resolveChannel(url) {
  const { ytdlpJson } = discoverDeps();
  const base = channelBase(url);
  const meta = await step(`looking up the YouTube channel ${base}`, () => ytdlpJson(['--flat-playlist', '--playlist-items', '1-1', '-J', `${base}/videos`]));
  const c = candidateOf(meta || {});
  if (!c) throw discoverError(`looking up the YouTube channel ${base}: yt-dlp answered, but not with a channel`);
  return c;
}

export async function searchChannels(query) {
  const q = String(query || '').trim();
  if (!q) throw discoverError('searching YouTube channels: there is nothing to search for');
  const direct = channelUrlOf(q);
  if (direct) return [await resolveChannel(direct)];
  const { ytdlpJson } = discoverDeps();
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAg%253D%253D`;
  const res = await step(`searching YouTube channels for "${q}"`, () => ytdlpJson(['--flat-playlist', '--playlist-items', '1-5', '-J', url]));
  return (Array.isArray(res?.entries) ? res.entries : []).map(candidateOf).filter(Boolean).slice(0, 5);
}

const entryOf = (e) => ({ id: e.id, title: e.title || '', durationSec: num(e.duration), views: num(e.view_count) });
const NO_TAB = /does not have a|has no (videos|shorts|streams)|unable to recognize tab|no (videos|shorts|streams) tab|this channel has no|not have any/i;

// A tab the channel does not have is an empty list, not an error.
async function readTab(base, tab) {
  const { ytdlpJson } = discoverDeps();
  try {
    const res = await ytdlpJson(['--flat-playlist', '-J', `${base}/${tab}`]);
    return res && typeof res === 'object' ? res : { entries: [] };
  } catch (e) {
    if (NO_TAB.test(`${e?.message || ''}\n${e?.stderr || ''}`)) return { entries: [], missing: true };
    throw discoverError(`listing the ${tab} tab of ${base}: ${e?.message || String(e)}`);
  }
}

export async function listChannel(channelUrl) {
  const base = channelBase(channelUrl);
  if (!base) throw discoverError('listing a YouTube channel: no channel address was given');
  const [videos, shorts, streams] = await Promise.all(['videos', 'shorts', 'streams'].map((t) => readTab(base, t)));
  const meta = [videos, shorts, streams].find((r) => r.channel_id || r.uploader_id) || {};
  const cand = candidateOf(meta);
  if (!cand) throw discoverError(`listing ${base}: yt-dlp answered, but not with a channel (no channel id in the ${videos.missing ? 'videos tab' : 'listing'})`);
  const thumb = (id) => (Array.isArray(meta.thumbnails) ? meta.thumbnails.find((t) => t.id === id)?.url : null) || null;
  const list = (r) => (Array.isArray(r.entries) ? r.entries : []).filter((e) => e && e.id).map(entryOf);
  return {
    channel: { ...cand, avatarUrl: thumb('avatar_uncropped'), bannerUrl: thumb('banner_uncropped') },
    videos: list(videos),
    shorts: list(shorts),
    streams: list(streams),
  };
}

// The 15 newest uploads WITH dates (a flat listing has none), shorts included.
export async function latestFromRss(channelId) {
  const { fetchText } = discoverDeps();
  const xml = await step(`reading the YouTube feed of channel ${channelId}`, () => fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, 'YouTube feed'));
  const out = [];
  for (const m of String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = tagText(m[1], 'yt:videoId');
    if (!id) continue;
    const published = tagText(m[1], 'published');
    out.push({ id, title: tagText(m[1], 'title') || '', publishedAt: published ? new Date(published).toISOString() : null });
  }
  return out;
}

/* --------------------------------- podcasts -------------------------------- */

const words = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

function durationOf(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  if (/^\d+(:\d{1,2}){1,2}$/.test(t)) return t.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
  return null;
}

export async function readPodcastFeed(feedUrl) {
  const { fetchText } = discoverDeps();
  const xml = await step(`reading the podcast feed ${feedUrl}`, () => fetchText(feedUrl, 'podcast feed'));
  const out = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const audioUrl = decodeXml((b.match(/<enclosure\b[^>]*\burl="([^"]*)"/i) || [])[1] || '') || null;
    const guid = tagText(b, 'guid') || audioUrl;
    if (!guid) continue;
    const pub = tagText(b, 'pubDate');
    const when = pub ? new Date(pub) : null;
    out.push({
      guid,
      title: tagText(b, 'title') || '',
      publishedAt: when && !Number.isNaN(when.getTime()) ? when.toISOString() : null,
      durationSec: durationOf(tagText(b, 'itunes:duration')),
      audioUrl,
    });
  }
  return out;
}

export async function findPodcast(name) {
  const { fetchJson } = discoverDeps();
  const want = words(name);
  if (!want.length) return null;
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(name).replace(/%20/g, '+')}+podcast&media=podcast&limit=5`;
  const res = await step(`searching Apple Podcasts for "${name}"`, () => fetchJson(url, 'Apple Podcasts search'));
  const hit = (Array.isArray(res?.results) ? res.results : []).find((r) => {
    const hay = new Set(words(`${r.collectionName || ''} ${r.artistName || ''}`));
    return r.feedUrl && want.every((w) => hay.has(w));
  });
  if (!hit) return null;
  const episodes = await readPodcastFeed(hit.feedUrl);
  return { title: hit.collectionName, feedUrl: hit.feedUrl, artworkUrl: hit.artworkUrl600 || hit.artworkUrl100 || null, episodes };
}

/* ---------------------------------- twins ---------------------------------- */

// Titles are compared as lower-case letters, digits and spaces, with
// everything from a "|" on dropped (a channel adds its own tail there).
function normTitle(t) {
  return String(t || '').split('|')[0].toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

// Sorensen-Dice on CHARACTER bigrams: short titles with a swapped word or a
// dropped "ft." still score high, which word bigrams would not.
function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let overlap = 0;
  let total = 0;
  for (const n of ga.values()) total += n;
  for (const n of gb.values()) total += n;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) || 0);
  return total ? (2 * overlap) / total : 0;
}

// A video and an episode are the same recording when their lengths are within
// 6 s AND (the titles are 0.25 alike OR that episode is the only one within
// 6 s of the video), or when the titles are 0.8 alike whatever the lengths.
// Candidates are paired best title first, so an episode is never taken twice
// and the order the lists arrive in does not decide the result.
export function matchTwins(videos, episodes) {
  const eps = (episodes || []).map((e) => ({ e, n: normTitle(e.title) }));
  const edges = [];
  for (const v of videos || []) {
    const vn = normTitle(v.title);
    const near = eps.filter(({ e }) => num(v.durationSec) !== null && num(e.durationSec) !== null && Math.abs(v.durationSec - e.durationSec) <= 6);
    for (const { e, n } of eps) {
      const sim = dice(vn, n);
      const isNear = near.some((x) => x.e === e);
      const ok = sim >= 0.8 || (isNear && (sim >= 0.25 || near.length === 1));
      if (ok) edges.push({ v, e, sim, gap: isNear ? Math.abs(v.durationSec - e.durationSec) : 1e9 });
    }
  }
  edges.sort((a, b) => b.sim - a.sim || a.gap - b.gap);
  const usedV = new Set();
  const usedE = new Set();
  const pairs = [];
  for (const { v, e } of edges) {
    if (usedV.has(v.id) || usedE.has(e.guid)) continue;
    usedV.add(v.id);
    usedE.add(e.guid);
    pairs.push({ videoId: v.id, guid: e.guid });
  }
  return { pairs, episodeOnly: (episodes || []).filter((e) => !usedE.has(e.guid)).map((e) => e.guid) };
}

/* ---------------------------------- books ---------------------------------- */

const NOT_A_BOOK = /\b(work ?book|study guide|summary|companion guide)\b/i;
const normBook = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// A nice-to-have at this step, so a failed lookup is an empty list.
export async function discoverBooks(name) {
  try {
    const { fetchJson } = discoverDeps();
    const res = await fetchJson(`https://openlibrary.org/search.json?author=${encodeURIComponent(name)}&limit=10&fields=title,author_name,first_publish_year`, 'Open Library search');
    const want = normBook(name);
    const seen = new Set();
    const out = [];
    for (const d of Array.isArray(res?.docs) ? res.docs : []) {
      if (!d?.title || NOT_A_BOOK.test(d.title)) continue;
      if (!(d.author_name || []).some((a) => normBook(a).includes(want))) continue;
      const k = normBook(d.title);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ title: d.title, year: num(d.first_publish_year) });
      if (out.length === 5) break;
    }
    return out;
  } catch {
    return [];
  }
}

/* --------------------------------- colour ---------------------------------- */

function hsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max / 255 };
}
const hex = ([r, g, b]) => `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;

// The person's colour, read from their own portrait: the average of the
// outer 2 px ring (the portrait's own background), or when that is nearly
// grey the most common saturated hue of the whole picture, or the ring
// average anyway when the picture has no colour at all. The ring average
// leaves out ring pixels far from the ring's median (hair or a shoulder
// touching the edge): measured on the three real portraits, a plain mean was
// 10 to 17 off the background colour, the trimmed one 0 to 6.
export async function sampleColour(imagePath) {
  const { ffmpegRaw } = discoverDeps();
  const raw = await step(`reading the colour of ${imagePath}`, () => ffmpegRaw(imagePath));
  const N = 32;
  if (!raw || raw.length < N * N * 3) throw discoverError(`reading the colour of ${imagePath}: ffmpeg returned ${raw ? raw.length : 0} bytes, expected ${N * N * 3}`);
  const ringPx = [];
  const buckets = Array.from({ length: 12 }, () => ({ n: 0, sum: [0, 0, 0] }));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 3;
      const r = raw[i]; const g = raw[i + 1]; const b = raw[i + 2];
      if (x < 2 || x >= N - 2 || y < 2 || y >= N - 2) ringPx.push([r, g, b]);
      const { h, s, v } = hsv(r, g, b);
      if (s >= 0.35 && v >= 0.25) {
        const k = buckets[Math.floor(h / 30) % 12];
        k.n += 1; k.sum[0] += r; k.sum[1] += g; k.sum[2] += b;
      }
    }
  }
  const med = [0, 1, 2].map((c) => ringPx.map((p) => p[c]).sort((a, b) => a - b)[ringPx.length >> 1]);
  const near = ringPx.filter((p) => Math.hypot(p[0] - med[0], p[1] - med[1], p[2] - med[2]) <= 40);
  const avg = [0, 1, 2].map((c) => near.reduce((t, p) => t + p[c], 0) / near.length);
  if (hsv(...avg).s >= 0.18) return hex(avg);
  const top = buckets.reduce((a, b) => (b.n > a.n ? b : a));
  return top.n ? hex(top.sum.map((x) => x / top.n)) : hex(avg);
}
