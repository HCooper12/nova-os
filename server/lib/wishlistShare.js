import { readFile, writeFile, mkdir, copyFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readItems, readState, readPrices } from './wishlist.js';

// THE SHAREABLE WISHLIST (8 Nov 2026, his ask): a page he can send to anyone
// that is nicer to scroll than the Notion page and is always current.
//
// What it is: a static bundle (index.html + data.json + small photos). The
// page fetches data.json itself, so an update is one file changing. The
// bundle is built from the same cache the Nova Wishlist page reads
// (lib/wishlist.js), so it is exactly as current as Nova is: every Notion
// read (15 minutes, and after any add or change) rebuilds it.
//
// WHAT LEAVES THIS MAC is decided here, in code, and pinned by the test:
//   - only items still wanted (Considering, Purchasing This Month);
//     Purchased and Cancelled never appear (a gift-giver must not buy twice)
//   - name, stars, price (the shop's current AUD price when Nova knows it, with
//     the was-price on a sale), shop, link, categories, notes, photo, date added
//   - NEVER: priority, Notion page ids, Notion links, the status text
//   - his hand-written Sizes only when share.json says includeSizes: true
// Photos are re-encoded to 720px JPEG (sips), named by content hash.
//
// PUBLISHING is separate and OFF until server/data/wishlist/share.json names
// a git checkout: { "repoDir": "...", "includeSizes": false }. The server
// then commits and pushes ONLY when the bundle's content changed.

const here = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(here, '..', 'data');
const shareDir = () => path.join(dataRoot(), 'wishlist', 'share');
const configFile = () => path.join(dataRoot(), 'wishlist', 'share.json');
const PAGE = path.join(here, '..', 'share', 'wishlist.html');
export const SHARED_STATUSES = ['Considering Purchase', 'Purchasing This Month'];

export const deps = {
  resize: (src, dest) => new Promise((resolve, reject) => {
    execFile('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '78', '-Z', '720', src, '--out', dest], { timeout: 30_000 }, (e) => (e ? reject(e) : resolve()));
  }),
  git: (cwd, args) => new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 60_000 }, (e, out, err) => (e ? reject(new Error(String(err || e.message).trim())) : resolve(String(out))));
  }),
  now: () => new Date(),
};

// pure: what one item looks like to other people
// the shop's price now, when it is in Australian dollars and known; else his own noted price
export function publicPrice(it, rec) {
  const aud = rec && rec.price && !rec.failed && (!rec.currency || rec.currency.toUpperCase() === 'AUD');
  return aud ? { price: rec.price, was: rec.was || null } : { price: it.price ?? null, was: null };
}

export function publicItem(it, image, rec = null) {
  const { price, was } = publicPrice(it, rec);
  return {
    id: createHash('sha1').update(it.id).digest('hex').slice(0, 10),
    name: it.name,
    stars: it.stars || 0,
    price,
    was,
    store: it.store || null,
    link: it.link || null,
    categories: it.categories || [],
    notes: it.notes || null,
    image: image || null,
    addedOn: it.addedOn || null,
  };
}

// THE PAGE'S WORDS, his to edit (8 Nov): every line the visitor reads. A
// field he leaves out falls back to these. In `title`, *asterisks* make the
// accent word. Plain strings only; the page escapes them.
export const COPY_DEFAULTS = {
  eyebrow: 'Hayden Cooper',
  title: "Hayden's *wishlist*",
  lede: 'Kept up to date on its own. Tap anything to see it in the shop. The ones marked with stars are the ones I want most.',
  topTitle: 'Most wanted',
  topNote: 'Three stars is the top of the list.',
  restTitle: 'Everything else',
  sizesTitle: 'Sizes, for anyone buying clothes',
  footer: 'This page refreshes itself.',
};
export const COPY_KEYS = Object.keys(COPY_DEFAULTS);
const clip = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);

export async function readCopy() {
  const cfg = await readConfig();
  const out = {};
  for (const k of COPY_KEYS) out[k] = clip(cfg.copy?.[k]) || COPY_DEFAULTS[k];
  return out;
}
// { field: text }; an empty text puts the default back. Unknown fields refused.
export async function setCopy(patch = {}) {
  const bad = Object.keys(patch).filter((k) => !COPY_KEYS.includes(k));
  if (bad.length) throw Object.assign(new Error(`no such line: ${bad.join(', ')}`), { status: 400 });
  const cfg = await readConfig();
  const copy = { ...(cfg.copy || {}) };
  for (const [k, v] of Object.entries(patch)) { if (clip(v)) copy[k] = clip(v); else delete copy[k]; }
  await mkdir(path.dirname(configFile()), { recursive: true });
  await writeFile(configFile(), JSON.stringify({ ...cfg, copy }, null, 2));
  return readCopy();
}

async function readConfig() {
  try { return JSON.parse(await readFile(configFile(), 'utf8')); } catch { return {}; }
}

// Builds the bundle into outDir (default: the data folder's share/). Returns
// { count, changed, dir }. updatedAt only moves when the content did, so an
// unchanged list never makes a commit.
export async function buildShare({ outDir = shareDir(), includeSizes } = {}) {
  const cur = await readItems();
  const cfg = await readConfig();
  const sizesOn = includeSizes ?? cfg.includeSizes === true;
  const items = (cur.items || []).filter((i) => SHARED_STATUSES.includes(i.status));
  await mkdir(path.join(outDir, 'img'), { recursive: true });

  const media = path.join(dataRoot(), 'stash', 'media');
  const out = [];
  const prices = await readPrices();
  const keep = new Set();
  for (const it of items) {
    let image = null;
    if (it.image && existsSync(path.join(media, it.image))) {
      const name = `${createHash('sha1').update(it.image).digest('hex').slice(0, 16)}.jpg`;
      const dest = path.join(outDir, 'img', name);
      if (!existsSync(dest)) { try { await deps.resize(path.join(media, it.image), dest); } catch { /* the card shows its letter instead */ } }
      if (existsSync(dest)) { image = `img/${name}`; keep.add(name); }
    }
    out.push(publicItem(it, image, prices[it.id]));
  }
  for (const f of await readdir(path.join(outDir, 'img'))) if (!keep.has(f)) await rm(path.join(outDir, 'img', f), { force: true });

  const sizes = sizesOn ? (await readState()).sizes || null : null;
  const body = { items: out, sizes, copy: await readCopy() };
  const hash = createHash('sha1').update(JSON.stringify(body)).digest('hex');
  let prev = null;
  try { prev = JSON.parse(await readFile(path.join(outDir, 'data.json'), 'utf8')); } catch { /* first build */ }
  const changed = !prev || prev.hash !== hash;
  if (changed) await writeFile(path.join(outDir, 'data.json'), JSON.stringify({ ...body, hash, updatedAt: deps.now().toISOString() }));
  await copyFile(PAGE, path.join(outDir, 'index.html'));
  await writeFile(path.join(outDir, '.nojekyll'), '');
  return { count: out.length, changed, dir: outDir };
}

let publishing = null;
// Build, and when a git checkout is configured and the content changed,
// commit and push it. Never throws (it runs after every Notion read).
export function publishShare() {
  if (publishing) return publishing;
  publishing = (async () => {
    try {
      const cfg = await readConfig();
      if (!cfg.repoDir) { const r = await buildShare(); return { ...r, published: false, reason: 'no repoDir in share.json' }; }
      const r = await buildShare({ outDir: cfg.repoDir });
      if (!r.changed) return { ...r, published: false, reason: 'unchanged' };
      await deps.git(cfg.repoDir, ['add', '-A']);
      await deps.git(cfg.repoDir, ['commit', '-m', `wishlist: ${r.count} items`]);
      await deps.git(cfg.repoDir, ['push']);
      return { ...r, published: true };
    } catch (e) {
      return { published: false, error: e.message };
    }
  })().finally(() => { publishing = null; });
  return publishing;
}
