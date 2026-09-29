import { readFile, writeFile, mkdir, unlink, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { backupFile } from './backup.js';

const PHOTOS_DIR_REL = 'Wiki/Health/Recipe Photos';
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const EXT_MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const DATA_URL_RE = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,(.+)$/;

async function findExistingFile(vaultPath, recipeId) {
  const dir = path.join(vaultPath, PHOTOS_DIR_REL);
  if (!existsSync(dir)) return null;
  for (const ext of Object.keys(EXT_MIME)) {
    const p = path.join(dir, `${recipeId}.${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

// One image file per recipe, keyed by recipe id — independent files, so no
// write-lock needed (unlike the shared single-file stores elsewhere) beyond
// backing up whatever this exact recipe's photo already was.
export async function savePhoto(vaultPath, recipeId, dataUrl) {
  const m = typeof dataUrl === 'string' ? dataUrl.match(DATA_URL_RE) : null;
  if (!m) throw new Error('unsupported image format — use a jpeg, png, webp, or gif data URL');
  const ext = MIME_EXT[m[1]];
  const buffer = Buffer.from(m[2], 'base64');
  const dir = path.join(vaultPath, PHOTOS_DIR_REL);
  await mkdir(dir, { recursive: true });
  const existing = await findExistingFile(vaultPath, recipeId);
  const full = path.join(dir, `${recipeId}.${ext}`);
  if (existing) {
    await backupFile(existing);
    if (existing !== full) await unlink(existing);
  }
  await writeFile(full, buffer);
}

/** A short fingerprint of a photo's bytes, so an undo removes only the photo it saved. */
export function photoHash(buffer) {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

// Undo for a photo Nova saved (a reel's thumbnail). With `onlyIfHash`, a
// photo he has since replaced with his own is left alone. Backed up first.
export async function removePhoto(vaultPath, recipeId, { onlyIfHash = null } = {}) {
  const full = await findExistingFile(vaultPath, recipeId);
  if (!full) return false;
  if (onlyIfHash && photoHash(await readFile(full)) !== onlyIfHash) return false;
  await backupFile(full);
  await unlink(full);
  return true;
}

export async function getPhoto(vaultPath, recipeId) {
  const full = await findExistingFile(vaultPath, recipeId);
  if (!full) return null;
  const buffer = await readFile(full);
  const ext = path.extname(full).slice(1);
  return { buffer, mime: EXT_MIME[ext] || 'image/jpeg' };
}

export async function listPhotoRecipeIds(vaultPath) {
  const dir = path.join(vaultPath, PHOTOS_DIR_REL);
  if (!existsSync(dir)) return new Set();
  const files = await readdir(dir);
  return new Set(files.filter((f) => !f.startsWith('.')).map((f) => path.basename(f, path.extname(f))));
}
