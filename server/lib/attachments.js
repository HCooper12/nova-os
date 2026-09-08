// ATTACHMENTS — photos and short videos he hands to Nova or the Coach with a
// question ("which of these is the best option for my goals?" over three
// screenshots of a menu).
//
// His ask, 6 Sep 2026. The mechanism is deliberately the one the rest of the
// platform already trusts: the conversational lanes may READ files (their
// tool boundary is Read/Grep/Glob), and the CLI's Read renders an image. So
// an attachment is a file on this Mac plus one line in the question telling
// the model to read it — no new model path, no new permissions. A video
// becomes a handful of frames (ffmpeg, already here for the Watcher); there
// is no transcript for a local clip and the line says so.
//
// Files live under server/data/attachments and are pruned after seven days:
// an attachment is a question's material, not vault content. If he wants
// the photo kept, that is a capture, on the rails, like anything else.

import { mkdir, writeFile, readdir, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp|heic|gif);base64,([A-Za-z0-9+/=]+)$/;
const VIDEO_DATA_URL = /^data:video\/(mp4|quicktime|webm);base64,([A-Za-z0-9+/=]+)$/;
const MAX_FILES = 6;
const MAX_BYTES = 25 * 1024 * 1024;
const KEEP_MS = 7 * 86_400_000;
const FRAMES_PER_VIDEO = 8;

function dir() {
  return path.join(process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'), 'attachments');
}

async function extractFrames(videoPath, outDir, n = FRAMES_PER_VIDEO) {
  // evenly spaced stills — the same shape the Watcher reads a reel in
  let seconds = 0;
  try {
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath], { timeout: 20_000 });
    seconds = Number(String(stdout).trim()) || 0;
  } catch { /* no probe → fixed sampling below */ }
  const fps = seconds > 0 ? Math.max(0.05, n / seconds) : 0.5;
  await exec('ffmpeg', ['-y', '-v', 'error', '-i', videoPath, '-vf', `fps=${fps.toFixed(3)},scale='min(768,iw)':-2`, '-frames:v', String(n), path.join(outDir, 'frame-%02d.jpg')], { timeout: 120_000 });
  const frames = (await readdir(outDir)).filter((f) => /^frame-\d+\.jpg$/.test(f)).sort().map((f) => path.join(outDir, f));
  return { frames, seconds };
}

// Stores the data URLs; returns { id, items: [{ kind, path, frames?, seconds? }] }.
export async function storeAttachments(dataUrls) {
  const list = Array.isArray(dataUrls) ? dataUrls : [];
  if (!list.length) throw new Error('nothing was attached');
  if (list.length > MAX_FILES) throw new Error(`up to ${MAX_FILES} attachments at a time`);
  const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const base = path.join(dir(), id);
  await mkdir(base, { recursive: true });
  const items = [];
  for (let i = 0; i < list.length; i++) {
    const s = String(list[i] || '');
    const img = s.match(IMAGE_DATA_URL);
    const vid = img ? null : s.match(VIDEO_DATA_URL);
    if (!img && !vid) throw new Error(`attachment ${i + 1} is not a supported image or video`);
    const [, ext, b64] = img || vid;
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > MAX_BYTES) throw new Error(`attachment ${i + 1} is over ${Math.round(MAX_BYTES / 1024 / 1024)}MB`);
    const file = path.join(base, `${i + 1}.${ext === 'jpeg' ? 'jpg' : ext === 'quicktime' ? 'mov' : ext}`);
    await writeFile(file, buf);
    if (img) { items.push({ kind: 'image', path: file }); continue; }
    const frameDir = path.join(base, `${i + 1}-frames`);
    await mkdir(frameDir, { recursive: true });
    try {
      const { frames, seconds } = await extractFrames(file, frameDir);
      items.push({ kind: 'video', path: file, frames, seconds });
    } catch (e) {
      items.push({ kind: 'video', path: file, frames: [], seconds: 0, error: e.message });
    }
  }
  pruneOld().catch(() => {});
  return { id, items };
}

export async function loadAttachment(id) {
  if (!/^[a-z0-9]+-[a-f0-9]{6}$/.test(String(id))) return null;
  const base = path.join(dir(), id);
  if (!existsSync(base)) return null;
  const names = (await readdir(base)).sort();
  const items = [];
  for (const n of names) {
    if (/^\d+\.(png|jpg|webp|heic|gif)$/.test(n)) items.push({ kind: 'image', path: path.join(base, n) });
    else if (/^\d+\.(mp4|mov|webm)$/.test(n)) {
      const frameDir = path.join(base, `${n.split('.')[0]}-frames`);
      const frames = existsSync(frameDir) ? (await readdir(frameDir)).filter((f) => f.endsWith('.jpg')).sort().map((f) => path.join(frameDir, f)) : [];
      items.push({ kind: 'video', path: path.join(base, n), frames });
    }
  }
  return items.length ? { id, items } : null;
}

// The line that rides in front of his question. Absolute paths, the Read
// tool named, the video's honest limit stated.
export function attachmentPreamble(att) {
  if (!att?.items?.length) return '';
  const images = att.items.filter((i) => i.kind === 'image');
  const videos = att.items.filter((i) => i.kind === 'video');
  const lines = [];
  if (images.length) lines.push(`He attached ${images.length} image${images.length === 1 ? '' : 's'} — READ EACH with the Read tool before answering, and answer from what is actually in them:\n${images.map((i, k) => `  image ${k + 1}: ${i.path}`).join('\n')}`);
  for (const v of videos) {
    lines.push(v.frames.length
      ? `He attached a video (${v.seconds ? `${Math.round(v.seconds)}s` : 'length unknown'}); there is NO transcript of it — these ${v.frames.length} stills are evenly spaced through it, read each with the Read tool:\n${v.frames.map((f, k) => `  frame ${k + 1}: ${f}`).join('\n')}`
      : `He attached a video but its frames could not be extracted${v.error ? ` (${v.error})` : ''} — say so; do not guess its contents.`);
  }
  return `[ATTACHED MATERIAL]\n${lines.join('\n')}\n[END ATTACHED MATERIAL]`;
}

export async function pruneOld() {
  const base = dir();
  if (!existsSync(base)) return 0;
  let removed = 0;
  for (const name of await readdir(base)) {
    const p = path.join(base, name);
    try {
      const st = await stat(p);
      if (Date.now() - st.mtimeMs > KEEP_MS) { await rm(p, { recursive: true, force: true }); removed++; }
    } catch { /* gone already */ }
  }
  return removed;
}
