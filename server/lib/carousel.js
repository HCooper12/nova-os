// PHOTO CAROUSELS (23 Oct 2026). An Instagram /p/ link is often not a video
// at all: it is a run of image slides with the substance printed on them and
// a caption underneath. yt-dlp answers one with "No video formats found!", and
// Nova read that as a broken download — three of his links failed on 22 Oct
// that way. A carousel has no transcript to fetch; it has slides to read. So
// code fetches the caption and saves each slide image locally, and the model
// reads those images the way it reads a transcript. Code decides it is a
// carousel (a playlist whose entries carry no video formats), never a model.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const YTDLP = process.env.YTDLP_BIN || '/opt/homebrew/bin/yt-dlp';
const COOKIES = path.join(os.homedir(), '.config/watch/yt-cookies.txt');
// Instagram allows 20 slides; more than that is not a carousel we understand.
export const MAX_SLIDES = 20;
const MAX_SLIDE_BYTES = 8 * 1024 * 1024;

function run(args, { timeoutMs = 90_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('yt-dlp timed out reading the post')); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out);
      else reject(new Error(err.trim().split('\n').pop() || `yt-dlp exited ${code}`));
    });
  });
}

/** yt-dlp's JSON for a post → the carousel it describes, or null when it is not one. */
export function carouselFromInfo(info) {
  if (!info || info._type !== 'playlist' || !Array.isArray(info.entries) || !info.entries.length) return null;
  if (info.entries.some((e) => Array.isArray(e?.formats) && e.formats.length)) return null;   // has video: the video lanes handle it
  const slides = info.entries
    .map((e) => String(e?.thumbnail || ''))
    .filter((u) => /^https?:\/\//.test(u))
    .slice(0, MAX_SLIDES);
  if (!slides.length) return null;
  const first = info.entries[0] || {};
  return {
    title: String(info.title || first.title || ''),
    uploader: String(info.uploader || first.uploader || info.playlist_uploader || ''),
    caption: String(info.description || first.description || ''),
    slides,
  };
}

/**
 * The post at `url` as a photo carousel with its slides saved into `workDir`
 * (slide-01.jpg …), or null when it is not a carousel. A slide that will not
 * download is left out; a carousel with no slide saved is an error, not an
 * empty success.
 */
export async function fetchCarousel(url, workDir, deps = {}) {
  const info = deps.info
    ? await deps.info(url)
    : JSON.parse(await run([
      '--skip-download', '--no-warnings', '--ignore-no-formats-error', '-J',
      ...(existsSync(COOKIES) ? ['--cookies', COOKIES] : []),
      url,
    ]));
  const carousel = carouselFromInfo(info);
  if (!carousel) return null;
  const fetchImage = deps.fetchImage || (async (u) => {
    const res = await fetch(u, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`slide fetch ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_SLIDE_BYTES) throw new Error('slide too large');
    return buf;
  });
  await mkdir(workDir, { recursive: true });
  const paths = [];
  for (const [i, u] of carousel.slides.entries()) {
    try {
      const file = path.join(workDir, `slide-${String(i + 1).padStart(2, '0')}.jpg`);
      await writeFile(file, await fetchImage(u));
      paths.push(file);
    } catch { /* one missing slide does not sink the post */ }
  }
  if (!paths.length) throw new Error('that post is a photo carousel, but none of its slides would download');
  return { ...carousel, slidePaths: paths };
}

/** The text a model reads in place of a transcript: the caption, then the slides to open in order. */
export function carouselBrief({ caption, slidePaths }) {
  return [
    `This post is a PHOTO CAROUSEL of ${slidePaths.length} image slides, not a video. There is no transcript.`,
    'The substance is printed on the slides. Read EVERY slide image below, in order, with the Read tool, before you write anything.',
    'Cite a point by its slide number (slide 3) where you would cite a timestamp.',
    '',
    '## Caption',
    caption.trim() || '(no caption)',
    '',
    '## Slides',
    ...slidePaths.map((p, i) => `${i + 1}. ${p}`),
  ].join('\n');
}
