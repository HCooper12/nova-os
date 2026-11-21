import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { Vault } from './vault.js';
import { classifyKind, noteTitle } from './library.js';
import { videoIdOf } from './ingest.js';
import { bookKey } from './librarian.js';

// THE REGISTER: one record per source Nova has read, or could read, kept in
// his own data folder (code writes it, never a model). It is what makes
// "I have read this before, on 3 Oct, 12 concepts" answerable, and it is the
// ledger the Mentors queue works down. Nothing in here calls a model and
// nothing writes to the vault; the backfill only READS the vault.
//
// The shape and the merge rules are the contract in design/MENTORS-PLAN.md
// ("The register") and the mentors SPEC. The idiom is bookCovers.js: one
// in-memory copy, one write at a time through a promise chain, a unique temp
// file renamed into place, a corrupt file moved aside rather than a crash.

const dataRoot = () => process.env.NOVA_DATA_DIR
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const dir = () => path.join(dataRoot(), 'mentors');
const registerPath = () => path.join(dir(), 'register.json');

export const STAGES = ['found', 'transcript', 'read', 'woven'];
export const stageRank = (stage) => STAGES.indexOf(stage);

const HOLD_STATES = ['refused', 'failed', 'skipped', 'duplicate', 'held'];
const WORKING = ['transcript', 'read', 'weave'];
// `publishedApprox` says which date `publishedAt` is: false when it came from
// the RSS or the podcast feed (exact), true when only the channel listing's
// approximate date was there, null when there is no date at all.
const DESCRIPTIVE = ['title', 'url', 'show', 'channelId', 'publishedAt', 'publishedApprox', 'durationSec', 'views', 'audio', 'kind', 'tier'];

const sha = (s) => createHash('sha1').update(String(s)).digest('hex');
const now = () => new Date().toISOString();
const has = (v) => v !== null && v !== undefined;

/* -------------------------------- identity -------------------------------- */

// "Jefferson Fisher" -> "jefferson-fisher". ASCII only, so an accent is
// folded first ("Zoë" -> "zoe") rather than dropped.
export function personSlug(name) {
  return String(name || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// The same page arrives with and without a tracking tail or a trailing slash;
// the key must not change with them.
function normaliseUrl(url) {
  const s = String(url || '').trim();
  try {
    const u = new URL(s);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|si$)/i.test(k)) u.searchParams.delete(k);
    }
    return u.toString().replace(/\/+$/, '');
  } catch {
    return s.toLowerCase().replace(/[#].*$/, '').replace(/\/+$/, '');
  }
}

// One key per source: a YouTube id, a podcast episode, a book, or a link.
// Returns null when there is nothing to identify it by.
export function sourceKey({ url, videoId, feedUrl, guid, title, author } = {}) {
  if (videoId) return `yt:${videoId}`;
  const vid = url ? videoIdOf(url) : null;
  if (vid) return `yt:${vid}`;
  if (feedUrl && guid) return `pod:${sha(feedUrl).slice(0, 8)}:${sha(guid).slice(0, 12)}`;
  if (!url && title && author) return `book:${bookKey(title, author)}`;
  if (url) return `url:${sha(normaliseUrl(url)).slice(0, 16)}`;
  return null;
}

/* ---------------------------------- store ---------------------------------- */

let store = null;      // { version, sources }
let loading = null;    // single flight
let writing = Promise.resolve();
let tmpCounter = 0;
let writeCount = 0;

const emptyStore = () => ({ version: 1, sources: {} });

async function readStore() {
  let text;
  try {
    text = await readFile(registerPath(), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return emptyStore();
    // an unreadable file is not "empty"; starting empty and writing over it
    // would destroy the only copy, so say what failed and move it aside
    await moveAside();
    return emptyStore();
  }
  try {
    const raw = JSON.parse(text);
    if (raw && typeof raw === 'object' && raw.sources && typeof raw.sources === 'object' && !Array.isArray(raw.sources)) {
      return { version: 1, sources: raw.sources };
    }
  } catch { /* falls through to the aside below */ }
  await moveAside();
  return emptyStore();
}

async function moveAside() {
  const from = registerPath();
  const to = `${from}.corrupt-${Date.now()}`;
  try {
    await rename(from, to);
    console.warn(`[mentorRegister] register.json could not be read as a register; moved it to ${to} and started an empty one`);
  } catch (e) {
    console.warn(`[mentorRegister] register.json could not be read and could not be moved aside (${e.message}); starting empty in memory`);
  }
}

export function loadRegister() {
  if (store) return Promise.resolve(store);
  if (!loading) {
    loading = readStore().then((s) => { store = s; return s; }).finally(() => { loading = null; });
  }
  return loading;
}

// Every mutation edits the one in-memory object synchronously, then queues a
// write. The write serialises the object AT WRITE TIME, so two overlapping
// calls can never overwrite each other's change with a stale snapshot.
function persist() {
  const job = writing.then(async () => {
    await mkdir(dir(), { recursive: true });
    const tmp = `${registerPath()}.${process.pid}.${Date.now()}.${tmpCounter++}.tmp`;
    await writeFile(tmp, JSON.stringify(store), 'utf8');
    await rename(tmp, registerPath());
    writeCount += 1;
  });
  writing = job.then(() => {}, () => {});
  return job;
}

export function _resetRegisterForTests() {
  store = null;
  loading = null;
  writing = Promise.resolve();
  writeCount = 0;
}
export const _writeCountForTests = () => writeCount;

const copy = (v) => (v === undefined ? v : structuredClone(v));

/* --------------------------------- reading --------------------------------- */

export async function getSource(key) {
  const { sources } = await loadRegister();
  return sources[key] ? copy(sources[key]) : null;
}

export async function listSources({ personId = null, tier = null, stage = null, kind = null } = {}) {
  const { sources } = await loadRegister();
  return Object.values(sources)
    .filter((s) => (personId === null || s.people.some((p) => p.id === personId))
      && (tier === null || s.tier === tier)
      && (stage === null || s.stage === stage)
      && (kind === null || s.kind === kind))
    .map(copy);
}

export async function countsFor(personId, { tier = 1 } = {}) {
  const list = await listSources({ personId, tier });
  const out = {
    total: list.length, hours: 0, found: 0, transcript: 0, read: 0, woven: 0, working: 0,
    held: { refused: 0, failed: 0, skipped: 0, duplicate: 0, held: 0 },
  };
  let sec = 0;
  for (const s of list) {
    out[s.stage] += 1;
    if (s.working) out.working += 1;
    if (s.hold && s.hold.state in out.held) out.held[s.hold.state] += 1;
    sec += Number(s.durationSec) || 0;
  }
  out.hours = Math.round((sec / 3600) * 10) / 10;
  return out;
}

/* --------------------------------- writing --------------------------------- */

const kindFor = (key) => (key.startsWith('yt:') ? 'video' : key.startsWith('pod:') ? 'episode' : key.startsWith('book:') ? 'book' : 'article');

function newRecord(key, item, origin) {
  const kind = has(item.kind) ? item.kind : kindFor(key);
  const t = now();
  const rec = {
    key, kind,
    tier: has(item.tier) ? item.tier : (kind === 'video' || kind === 'book' ? 1 : 2),
    title: has(item.title) ? item.title : key,
    url: has(item.url) ? item.url : null,
    show: has(item.show) ? item.show : null,
    channelId: has(item.channelId) ? item.channelId : null,
    publishedAt: has(item.publishedAt) ? item.publishedAt : null,
    publishedApprox: has(item.publishedApprox) ? !!item.publishedApprox : (has(item.publishedAt) ? false : null),
    durationSec: has(item.durationSec) ? item.durationSec : null,
    views: has(item.views) ? item.views : null,
    people: [],
    audio: has(item.audio) ? item.audio : null,
    stage: 'found', working: null, hold: has(item.hold) ? item.hold : null,
    transcript: null, read: null, reads: 0, woven: null,
    vault: has(item.vault) ? item.vault : null,
    legacy: false,
    origin,
    foundAt: t, updatedAt: t,
  };
  mergePeople(rec, item.people);
  return rec;
}

function mergePeople(rec, people) {
  let changed = false;
  for (const p of Array.isArray(people) ? people : []) {
    if (!p || !p.id || rec.people.some((x) => x.id === p.id)) continue;
    rec.people.push({ id: p.id, role: p.role || 'host' });
    changed = true;
  }
  return changed;
}

// `list` items carry the descriptive fields; the key is `item.key`, else it
// is worked out from the item's own url / videoId / feedUrl + guid.
export async function upsertSources(list, { origin = 'discovery' } = {}) {
  const { sources } = await loadRegister();
  let added = 0;
  let updated = 0;
  let dirty = false;
  for (const item of Array.isArray(list) ? list : []) {
    const key = item?.key || sourceKey(item || {});
    if (!key) throw new Error(`upsertSources: cannot identify "${item?.title || 'a source'}": it has no key, url, video id, or feed and guid`);
    const cur = sources[key];
    if (!cur) {
      sources[key] = newRecord(key, item, origin);
      added += 1;
      dirty = true;
      continue;
    }
    updated += 1;
    let changed = false;
    for (const f of DESCRIPTIVE) {
      if (has(item[f]) && JSON.stringify(cur[f]) !== JSON.stringify(item[f])) { cur[f] = copy(item[f]); changed = true; }
    }
    if (mergePeople(cur, item.people)) changed = true;
    if (changed) { cur.updatedAt = now(); dirty = true; }
  }
  if (dirty) await persist();
  return { added, updated };
}

export async function attachPerson(keys, { id, role = 'host' } = {}) {
  const { sources } = await loadRegister();
  let changed = 0;
  for (const key of keys || []) {
    const s = sources[key];
    if (s && mergePeople(s, [{ id, role }])) { s.updatedAt = now(); changed += 1; }
  }
  if (changed) await persist();
  return changed;
}

function need(sources, key) {
  const s = sources[key];
  if (!s) throw new Error(`mentorRegister: no source with key "${key}"`);
  return s;
}

// A stage only moves forward. Lowering is "read it again", which is his
// call, so it needs `force`. A stale job finishing late (a transcript landing
// on a source already read) is a quiet no-op, not an error and not a patch.
export async function setStage(key, stage, patch = {}, { force = false } = {}) {
  const { sources } = await loadRegister();
  const s = need(sources, key);
  if (!STAGES.includes(stage)) throw new Error(`mentorRegister: unknown stage "${stage}" (expected ${STAGES.join(', ')})`);
  if (stageRank(stage) < stageRank(s.stage) && !force) return copy(s);
  const { key: _k, ...rest } = patch || {};
  Object.assign(s, copy(rest));
  // a read that lands counts as one more time he has been read
  if (stage === 'read' && rest.read) s.reads = (s.reads || 0) + 1;
  s.stage = stage;
  s.working = null;
  if (s.hold && (s.hold.state === 'refused' || s.hold.state === 'failed')) s.hold = null;
  s.updatedAt = now();
  await persist();
  return copy(s);
}

export async function setWorking(key, working) {
  const { sources } = await loadRegister();
  const s = need(sources, key);
  if (working !== null && !WORKING.includes(working)) throw new Error(`mentorRegister: unknown working value "${working}" (expected ${WORKING.join(', ')} or null)`);
  s.working = working;
  s.updatedAt = now();
  await persist();
}

export async function setHold(key, { state, why, retryAt = null } = {}) {
  const { sources } = await loadRegister();
  const s = need(sources, key);
  if (!HOLD_STATES.includes(state)) throw new Error(`mentorRegister: unknown hold state "${state}" (expected ${HOLD_STATES.join(', ')})`);
  s.hold = { state, why: why || '', at: now(), retryAt };
  s.updatedAt = now();
  await persist();
}

export async function clearHold(key) {
  const { sources } = await loadRegister();
  const s = need(sources, key);
  if (!s.hold) return;
  s.hold = null;
  s.updatedAt = now();
  await persist();
}

// After a restart nothing is in flight, whatever the file last said.
export async function resetWorking() {
  const { sources } = await loadRegister();
  let n = 0;
  for (const s of Object.values(sources)) if (s.working) { s.working = null; n += 1; }
  if (n) await persist();
  return n;
}

/* --------------------------------- backfill -------------------------------- */

const TIMED_RE = /^\[\d{1,3}:\d{2}(?::\d{2})?\]/m;
const posix = (p) => p.split(path.sep).join('/');

// Everything already in the vault, entered once as a legacy woven record.
// READ ONLY on the vault: no write, no touch. Identity order: a book page by
// its type, then a YouTube id (frontmatter url or video_id, else the first
// YouTube link in the page, else in its Raw transcript), then the page's own
// link. A page with an explicit non-YouTube `url:` is never turned into a
// video by a stray YouTube link in its body. No link at all: unidentified.
export async function backfillFromVault(vaultPath) {
  const { sources } = await loadRegister();
  const vault = new Vault(vaultPath);
  const rels = await vault.listRelativePaths();
  const pages = rels.map(posix).filter((r) => r.startsWith('Wiki/Sources/'));
  const rawRels = rels.map(posix).filter((r) => r.startsWith('Raw/'));
  const rawSet = new Set(rawRels);
  let rawHeads = null; // read lazily, once, only when a page has no Raw link
  const headsOf = async () => {
    if (rawHeads) return rawHeads;
    rawHeads = [];
    for (const r of rawRels) {
      try { rawHeads.push({ rel: r, head: (await readFile(path.join(vaultPath, r), 'utf8')).slice(0, 4000) }); } catch { /* skip */ }
    }
    return rawHeads;
  };

  const out = { scanned: 0, added: 0, alreadyKnown: 0, unidentified: [] };
  for (const rel of pages.sort()) {
    out.scanned += 1;
    let text;
    try { text = await readFile(path.join(vaultPath, rel), 'utf8'); } catch { out.unidentified.push(rel); continue; }
    let fm = {}; let body = text;
    try { ({ data: fm, content: body } = matter(text)); } catch { /* malformed frontmatter: still use the body */ }
    fm = fm || {};

    // its Raw transcript: the page's own `raw:` link first
    const rawName = typeof fm.raw === 'string' ? fm.raw.match(/\[\[([^\]|#]+)/)?.[1] : null;
    let rawRel = rawName && rawSet.has(`Raw/${rawName}.md`) ? `Raw/${rawName}.md` : null;
    let rawText = null;
    const readRaw = async (r) => { try { return await readFile(path.join(vaultPath, r), 'utf8'); } catch { return null; } };
    if (rawRel) rawText = await readRaw(rawRel);

    const fmUrl = typeof fm.url === 'string' && fm.url.trim() ? fm.url.trim() : null;
    const title = noteTitle(fm, body, rel);
    const isBook = classifyKind(fm) === 'book';
    let key = null; let kind = 'article'; let url = fmUrl; let id = null;

    if (isBook) {
      const author = fm.author || fm.creator || null;
      key = sourceKey({ title: fm.book_title || fm.title || title, author: author ? String(author) : '' });
      kind = 'book';
      // a book with no author cannot be told from another of the same name
      if (!key && fmUrl) key = sourceKey({ url: fmUrl });
    } else {
      id = (fm.video_id ? String(fm.video_id) : null) || (fmUrl && videoIdOf(fmUrl)) || null;
      if (!id && !fmUrl) {
        id = videoIdOf(body);
        if (!id && rawText) id = videoIdOf(rawText);
      }
      if (id) {
        key = `yt:${id}`; kind = 'video';
        url = fmUrl && videoIdOf(fmUrl) ? fmUrl : `https://www.youtube.com/watch?v=${id}`;
      } else if (fmUrl) {
        key = sourceKey({ url: fmUrl });
        // a reel or a clip from somewhere other than YouTube is still a video
        // (the Library counts it as one); only its key is a plain link
        const k = classifyKind(fm);
        kind = k === 'podcast' ? 'episode' : k === 'video' ? 'video' : 'article';
      }
    }
    if (!key) { out.unidentified.push(rel); continue; }
    if (sources[key]) { out.alreadyKnown += 1; continue; }

    // no `raw:` link: the Raw note that carries this video's id
    if (!rawRel && id) {
      const hit = (await headsOf()).find((h) => h.head.includes(id));
      if (hit) { rawRel = hit.rel; rawText = await readRaw(hit.rel); }
    }

    const t = now();
    const people = [];
    for (const p of Array.isArray(fm.people) ? fm.people : []) {
      const name = typeof p === 'string' ? p : (p?.id || p?.name);
      const pid = personSlug(name);
      if (pid && !people.some((x) => x.id === pid)) people.push({ id: pid, role: (typeof p === 'object' && p?.role) || (isBook ? 'author' : 'host') });
    }
    sources[key] = {
      key, kind, tier: kind === 'video' || kind === 'book' ? 1 : 2,
      title, url: url || null,
      show: [fm.show, fm.channel, fm.uploader].find((v) => typeof v === 'string' && v.trim()) || null,
      channelId: null, publishedAt: null, publishedApprox: null, durationSec: null, views: null,
      people, audio: null,
      stage: 'woven', working: null, hold: null,
      transcript: rawRel && rawText != null
        ? { source: 'vault', path: rawRel, chars: rawText.length, timed: TIMED_RE.test(rawText), at: null }
        : null,
      read: null, reads: 0, woven: null,
      vault: { sourcePage: rel, rawPage: rawRel },
      legacy: true, origin: 'backfill', foundAt: t, updatedAt: t,
    };
    out.added += 1;
  }
  if (out.added) await persist();
  return out;
}
