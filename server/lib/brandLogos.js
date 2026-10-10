import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { USER_AGENT, detectBlock } from './shopPrices.js';

// THE REAL LOGOS (10 Oct 2026, his call: "Real logos", with the rule that
// the repo is PUBLIC, so no logo file is ever committed). Each programme's
// and chain's own site names its icon in its page head (the apple-touch-icon
// a phone puts on a home screen, or the site icon). The server reads that
// once, keeps the file in server/data/logos/ (gitignored with all of
// server/data), and serves it to the app. A site that refuses, or has no
// usable icon, is noted as a miss and asked again a day later at most; the
// screen draws its own coloured mark meanwhile. Nothing is ever evaded.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const DIR = () => path.join(dataRoot(), 'logos');
const META = () => path.join(DIR(), 'logos.json');

export const BRANDS = {
  er: { name: 'Everyday Rewards', home: 'https://www.everyday.com.au/' },
  fb: { name: 'Flybuys', home: 'https://experience.flybuys.com.au/' },
  w: { name: 'Woolworths', home: 'https://www.woolworths.com.au/' },
  c: { name: 'Coles', home: 'https://www.coles.com.au/' },
  a: { name: 'Aldi', home: 'https://www.aldi.com.au/' },
};
const MISS_RETRY_MS = 24 * 60 * 60 * 1000;
const TYPES = { 'image/png': 'png', 'image/svg+xml': 'svg', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico' };

// the best icon a page's head names: the largest apple-touch-icon, then an
// SVG site icon, then the largest PNG icon
export function findIconUrl(html, base) {
  const links = [];
  for (const m of String(html || '').matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (tag.match(/\brel=["']?([^"'>]+)/i) || [])[1]?.toLowerCase() || '';
    const href = (tag.match(/\bhref=["']?([^"'\s>]+)/i) || [])[1];
    if (!href || !/icon/.test(rel)) continue;
    const sizes = Number((tag.match(/\bsizes=["']?(\d+)x\d+/i) || [])[1] || 0);
    const type = (tag.match(/\btype=["']?([^"'\s>]+)/i) || [])[1] || '';
    let score = 0;
    if (/apple-touch-icon/.test(rel)) score = 3000 + sizes;
    else if (/svg/.test(type) || /\.svg(\?|$)/i.test(href)) score = 2000;
    else if (/\.png(\?|$)/i.test(href) || /png/.test(type)) score = 1000 + sizes;
    else score = 100 + sizes;
    try { links.push({ url: new URL(href.replace(/&amp;/g, '&'), base).href, score }); } catch { /* a broken href */ }
  }
  links.sort((a, b) => b.score - a.score);
  return links[0]?.url || null;
}

async function loadMeta() {
  try { return JSON.parse(await readFile(META(), 'utf8')); } catch { return {}; }
}
async function saveMeta(m) {
  await mkdir(DIR(), { recursive: true });
  await writeFile(`${META()}.tmp`, JSON.stringify(m, null, 1));
  await rename(`${META()}.tmp`, META());
}
export function _resetForTests() { try { rmSync(DIR(), { recursive: true, force: true }); } catch { /* none */ } }

// One brand, once: two requests at most (its page, then its icon).
export async function ensureLogo(key, { fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const brand = BRANDS[key];
  if (!brand) throw new Error('unknown brand');
  const meta = await loadMeta();
  const have = meta[key];
  if (have?.file && existsSync(path.join(DIR(), have.file))) return have;
  if (have?.miss && now.getTime() - Date.parse(have.at) < MISS_RETRY_MS) return have;
  const miss = async (reason, extra = {}) => {
    meta[key] = { miss: reason, at: now.toISOString(), page: brand.home, ...extra };
    await saveMeta(meta);
    return meta[key];
  };
  let page;
  try {
    const res = await fetchImpl(brand.home, { headers: { 'user-agent': USER_AGENT, accept: 'text/html' }, redirect: 'follow' });
    page = await res.text();
    const blocked = detectBlock(res.status, page);
    if (blocked) return miss(`${brand.name}'s site answered with ${blocked}`);
    if (!res.ok) return miss(`${brand.name}'s site answered ${res.status}`);
  } catch (e) {
    return miss(`${brand.name}'s site did not answer (${String(e.message).slice(0, 80)})`);
  }
  const iconUrl = findIconUrl(page, brand.home);
  if (!iconUrl) return miss(`${brand.name}'s page names no icon`);
  try {
    const res = await fetchImpl(iconUrl, { headers: { 'user-agent': USER_AGENT, accept: 'image/*' }, redirect: 'follow' });
    const type = String(res.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = TYPES[type];
    if (!res.ok) return miss(`its icon answered ${res.status}`, { source: iconUrl });
    if (!ext) return miss(`its icon is not an image (${type || 'no type'})`, { source: iconUrl });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100 || buf.length > 512 * 1024) return miss(`its icon is ${buf.length} bytes, not a logo`, { source: iconUrl });
    await mkdir(DIR(), { recursive: true });
    const file = `${key}.${ext}`;
    await writeFile(path.join(DIR(), file), buf);
    meta[key] = { file, type, source: iconUrl, page: brand.home, at: now.toISOString(), bytes: buf.length };
    await saveMeta(meta);
    return meta[key];
  } catch (e) {
    return miss(`its icon did not arrive (${String(e.message).slice(0, 80)})`, { source: iconUrl });
  }
}

// Every brand, one after another with a pause: never two requests at once.
let running = null;
export function ensureAllLogos({ fetchImpl, delayMs = 3000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now } = {}) {
  if (running) return running;
  running = (async () => {
    let first = true;
    for (const key of Object.keys(BRANDS)) {
      const meta = await loadMeta();
      const have = meta[key];
      const fresh = (have?.file && existsSync(path.join(DIR(), have.file))) || (have?.miss && (now || new Date()).getTime() - Date.parse(have.at) < MISS_RETRY_MS);
      if (fresh) continue;
      if (!first) await sleep(delayMs);
      first = false;
      try { await ensureLogo(key, { fetchImpl, now }); } catch (e) { console.error('logo read failed:', e.message); }
    }
  })().finally(() => { running = null; });
  return running;
}

// What the app reads: which logos exist, and where each came from. A brand
// with no file is absent, and the app draws its mark.
export async function logosView() {
  const meta = await loadMeta();
  const out = {};
  for (const key of Object.keys(BRANDS)) {
    const m = meta[key];
    out[key] = m?.file && existsSync(path.join(DIR(), m.file))
      ? { has: true, type: m.type, source: m.source, at: m.at }
      : { has: false, miss: m?.miss || null };
  }
  return out;
}

export async function logoFile(key) {
  if (!BRANDS[key]) return null;
  const m = (await loadMeta())[key];
  if (!m?.file) return null;
  const full = path.join(DIR(), m.file);
  return existsSync(full) ? { path: full, type: m.type } : null;
}
