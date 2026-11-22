import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPerson, listPeople, artDir } from './mentorPeople.js';
import { listSources } from './mentorRegister.js';

// THE PICTURES A MENTOR'S PAGE NEEDS (Mentors, build slice 1, 22 Nov 2026).
// Two things the page draws that the server did not have:
//
//   the cut-out   the person lifted out of his channel portrait with Apple's
//                 subject lift (Vision, VNGenerateForegroundInstanceMaskRequest),
//                 so his face sits on any colour with no disc of the old
//                 background behind it. Made once per person, cached beside
//                 the avatar as <id>-cut.png, by a small Swift helper built
//                 on this Mac from server/native/mentor-cutout.swift.
//   the wall      one sprite of every video thumbnail of his, in catalogue
//                 order (newest first, as GET /api/mentors/:id lists them),
//                 16 columns of 160 x 90 cells, rebuilt when his catalogue
//                 changes, served with the order it was built in so the
//                 client can map a cell to a video. Each thumbnail comes from
//                 YouTube's public image host once and is kept.
//
// Both fail soft and say why: no cut-out, the page draws the square portrait;
// no sprite, the wall is plain cells in his colour. Nothing here calls a model
// or touches the vault. Everything outside the process comes through `deps`,
// so the tests run with no Swift, no ffmpeg and no network.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CUT_SIZE = 480;
export const COLS = 16;
export const CELL = [160, 90];
const FAIL_MEMO_MS = 10 * 60_000;
const THUMB_RETRY_MS = 24 * 3600_000;
const FETCH_AT_ONCE = 4;
const HELPER = () => process.env.NOVA_MENTOR_CUTOUT || path.join(__dirname, '..', 'bin', 'nova-mentor-cutout');
const HELPER_SRC = path.join(__dirname, '..', 'native', 'mentor-cutout.swift');
const FFMPEG = () => process.env.NOVA_FFMPEG || '/opt/homebrew/bin/ffmpeg';
const ART_MAX_BYTES = 5 * 1024 * 1024;
const ART_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
// Apple's artwork host, by exact host or a subdomain of it, over https only
const ART_HOSTS = ['mzstatic.com'];
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/* ---------------------------------- deps ----------------------------------- */

const run = (bin, args, timeoutMs) => new Promise((resolve, reject) => {
  execFile(bin, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) {
      const last = String(stderr || stdout || '').trim().split('\n').filter(Boolean).pop();
      const e = new Error(err.code === 'ENOENT' ? `${path.basename(bin)} is not installed (${bin})` : (last || err.message));
      e.code = err.code;
      return reject(e);
    }
    resolve(String(stdout));
  });
});

const realDeps = () => ({
  // build the helper once from its source; a Mac without Swift says so
  ensureHelper: async () => {
    if (existsSync(HELPER())) return HELPER();
    await mkdir(path.dirname(HELPER()), { recursive: true });
    try {
      await run('swiftc', ['-O', '-swift-version', '5', HELPER_SRC, '-o', HELPER()], 180_000);
    } catch (e) {
      throw new Error(`the cut-out helper could not be built with swiftc: ${e.message}`);
    }
    return HELPER();
  },
  runCutout: async (bin, input, output, size) => {
    const out = await run(bin, [input, output, String(size)], 60_000).catch((e) => {
      // the helper prints {"error": "..."} on stdout and exits 1
      const m = String(e.message).match(/"error":"(.*)"\}/);
      throw new Error(m ? m[1] : e.message);
    });
    const line = out.trim().split('\n').pop();
    let j = null;
    try { j = JSON.parse(line); } catch { /* not JSON */ }
    if (!j?.ok) throw new Error(j?.error || `the cut-out helper answered something unexpected: ${line.slice(0, 200)}`);
    return j;
  },
  fetchThumb: async (url) => {
    let res;
    try { res = await fetch(url, { signal: AbortSignal.timeout(20_000) }); } catch (e) {
      throw new Error(`could not reach i.ytimg.com (${e.cause?.code || e.message})`);
    }
    if (!res.ok) { const e = new Error(`i.ytimg.com answered ${res.status}`); e.status = res.status; throw e; }
    return Buffer.from(await res.arrayBuffer());
  },
  // a podcast cover from Apple's artwork host: the bytes and the content type
  fetchArt: async (url) => {
    let res;
    try { res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) }); } catch (e) {
      throw new Error(`could not reach ${new URL(url).host} (${e.cause?.code || e.message})`);
    }
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
    const len = Number(res.headers.get('content-length'));
    if (len > ART_MAX_BYTES) throw new Error(`the podcast cover is ${Math.round(len / 1024 / 1024)} MB, over the 5 MB limit`);
    const buf = Buffer.from(await res.arrayBuffer());
    return { buf, type: String(res.headers.get('content-type') || '') };
  },
  // one sprite from a list of image files, in order, with ffmpeg's tile filter
  buildSprite: async (files, out, { cols, rows, cell }) => {
    const list = `${out}.list.txt`;
    await writeFile(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
    try {
      await run(FFMPEG(), ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list,
        '-vf', `scale=${cell[0]}:${cell[1]}:flags=lanczos,setsar=1,tile=${cols}x${rows}`,
        '-frames:v', '1', '-q:v', '4', out], 120_000);
    } finally { await unlink(list).catch(() => {}); }
  },
  makeBlank: async (out) => {
    await run(FFMPEG(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x180', '-frames:v', '1', out], 20_000);
  },
  now: () => Date.now(),
  log: (msg) => console.log(msg),
});

let override = null;
export function _setArtDepsForTest(d) { override = d || null; }
const D = () => ({ ...realDeps(), ...(override || {}) });

/* -------------------------------- the cut-out ------------------------------ */

export const cutoutFile = (personId) => `${personId}-cut.png`;
const cutoutPath = (personId) => path.join(artDir(), cutoutFile(personId));
const cutting = new Map();
const cutFailed = new Map();

const notFound = (msg) => Object.assign(new Error(msg), { notFound: true });

/**
 * The cut-out of a person, made if it is missing. Resolves to the absolute
 * path; rejects with a plain cause (no portrait saved, no subject found, no
 * Swift on this Mac). A failure is remembered for ten minutes, so a page that
 * asks every few seconds does not rebuild the helper each time.
 */
export async function ensureCutout(personId) {
  const person = await getPerson(personId);
  if (!person) throw notFound(`no person called "${personId}" is followed or known`);
  const out = cutoutPath(person.id);
  if (existsSync(out)) return out;
  const memo = cutFailed.get(person.id);
  if (memo && D().now() - memo.at < FAIL_MEMO_MS) throw Object.assign(new Error(memo.why), { soft: true });
  if (cutting.has(person.id)) return cutting.get(person.id);
  const job = (async () => {
    const d = D();
    try {
      if (!person.art?.avatar) throw new Error(`no portrait is saved for ${person.name || person.id}, so there is nothing to cut out`);
      const input = path.join(artDir(), person.art.avatar);
      if (!existsSync(input)) throw new Error(`the portrait ${person.art.avatar} is missing from the mentors art folder`);
      const bin = await d.ensureHelper();
      await d.runCutout(bin, input, out, CUT_SIZE);
      if (!existsSync(out)) throw new Error('the cut-out helper finished but wrote no file');
      cutFailed.delete(person.id);
      d.log(`mentor art: cut ${person.id} out of his portrait`);
      return out;
    } catch (e) {
      const why = e?.message || 'the cut-out failed and gave no reason';
      cutFailed.set(person.id, { at: d.now(), why });
      d.log(`mentor art: no cut-out for ${person.id}: ${why}`);
      throw Object.assign(new Error(why), { soft: true });
    } finally { cutting.delete(person.id); }
  })();
  cutting.set(person.id, job);
  return job;
}

/* ------------------------------ the podcast cover --------------------------- */

const podcastFailed = new Map();
const podcasting = new Map();
const podcastCached = (personId) => ['jpg', 'png', 'webp'].map((e) => path.join(artDir(), `${personId}-podcast.${e}`)).find((f) => existsSync(f)) || null;

function artHostOk(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  return u.protocol === 'https:' && ART_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
}

/**
 * The cover of a person's podcast, fetched once from Apple's artwork host and
 * kept beside his other pictures as <id>-podcast.<jpg|png|webp>. Resolves to
 * the absolute path. Only an https address on an allowed Apple host is ever
 * fetched, so this is never an open proxy. A failed fetch is remembered for
 * ten minutes.
 */
export async function ensurePodcastArt(personId) {
  const person = await getPerson(personId);
  if (!person) throw notFound(`no person called "${personId}" is followed or known`);
  const have = podcastCached(person.id);
  if (have) return have;
  const url = person.podcast?.artworkUrl;
  if (!person.podcast) throw notFound(`${person.name || person.id} has no podcast saved, so there is no cover to show`);
  if (!url) throw notFound(`the podcast of ${person.name || person.id} has no cover address saved`);
  if (!artHostOk(url)) throw notFound(`the podcast cover is not on Apple's artwork host (mzstatic.com), so it is not fetched`);
  const memo = podcastFailed.get(person.id);
  if (memo && D().now() - memo.at < FAIL_MEMO_MS) throw Object.assign(new Error(memo.why), { soft: true });
  if (podcasting.has(person.id)) return podcasting.get(person.id);
  const job = (async () => {
    const d = D();
    try {
      const { buf, type } = await d.fetchArt(url);
      const ext = ART_EXT[String(type).split(';')[0].trim().toLowerCase()];
      if (!ext) throw new Error(`the podcast cover came back as ${type || 'an unknown type'}, not a jpg, png or webp picture`);
      if (buf.length > ART_MAX_BYTES) throw new Error('the podcast cover is over the 5 MB limit');
      if (!buf.length) throw new Error('the podcast cover came back empty');
      await mkdir(artDir(), { recursive: true });
      const dest = path.join(artDir(), `${person.id}-podcast.${ext}`);
      await writeFile(`${dest}.tmp`, buf);
      await rename(`${dest}.tmp`, dest);
      podcastFailed.delete(person.id);
      d.log(`mentor art: kept the podcast cover of ${person.id}`);
      return dest;
    } catch (e) {
      const why = e?.message || 'the podcast cover could not be fetched and gave no reason';
      podcastFailed.set(person.id, { at: d.now(), why });
      d.log(`mentor art: no podcast cover for ${person.id}: ${why}`);
      throw Object.assign(new Error(why), { soft: true });
    } finally { podcasting.delete(person.id); }
  })();
  podcasting.set(person.id, job);
  return job;
}

/* --------------------------------- the wall -------------------------------- */

// the same order GET /api/mentors/:id gives its catalogue: dated newest first,
// then the undated in the order the channel listed them
function newestFirst(list) {
  const dated = list.filter((s) => s.publishedAt).sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
  return [...dated, ...list.filter((s) => !s.publishedAt)];
}
const idOf = (s) => (s.key.startsWith('yt:') ? s.key.slice(3) : s.key);
const thumbsDir = () => path.join(artDir(), 'thumbs');
const manifestPath = (personId) => path.join(artDir(), `${personId}-wall.json`);
export const signatureOf = (ids) => createHash('sha1').update(ids.join(',')).digest('hex').slice(0, 10);
const building = new Map();

async function readManifest(personId) {
  try { return JSON.parse(await readFile(manifestPath(personId), 'utf8')); } catch { return null; }
}

/** The ids in a person's catalogue order, with what the wall's lens shows. */
export async function catalogueOrder(personId) {
  const list = newestFirst(await listSources({ personId, tier: 1 }));
  return list.map((s) => [idOf(s), s.title || '', Number(s.durationSec) || 0, s.publishedAt || null, !!s.publishedApprox]);
}

/**
 * The wall of a person: his catalogue order (id, title, seconds, date,
 * whether the date is approximate), and the newest sprite there is, with the
 * ids it was built from (it may be one build behind his catalogue for a few
 * seconds after a new video arrives; the client maps by id, so a video the
 * sprite does not hold yet is a plain cell). Starts a rebuild when the
 * catalogue changed; never waits for it.
 */
export async function wallFor(personId) {
  const person = await getPerson(personId);
  if (!person) throw notFound(`no person called "${personId}" is followed or known`);
  const order = await catalogueOrder(person.id);
  const ids = order.map((r) => r[0]);
  const sig = signatureOf(ids);
  const m = await readManifest(person.id);
  const have = m && m.file && existsSync(path.join(artDir(), m.file)) ? m : null;
  const job = building.get(person.id);
  // a build of this same catalogue that failed is not tried again for ten
  // minutes (ffmpeg missing would otherwise be asked on every poll)
  const failedNow = m?.error && m.errorSig === sig && D().now() - new Date(m.errorAt).getTime() < FAIL_MEMO_MS;
  if ((!have || have.sig !== sig) && !job && !failedNow) startWall(person.id, ids, sig);
  return {
    id: person.id,
    order,
    sig,
    sprite: have ? { file: have.file, ids: have.ids, cols: have.cols, rows: have.rows, cell: have.cell, missing: have.missing || [], builtAt: have.builtAt } : null,
    building: building.has(person.id),
    error: !building.has(person.id) && m?.error && m.errorSig === sig ? m.error : null,
  };
}

function startWall(personId, ids, sig) {
  const job = buildWall(personId, ids, sig).catch((e) => {
    D().log(`mentor art: the wall of ${personId} could not be built: ${e.message}`);
  }).finally(() => building.delete(personId));
  building.set(personId, job);
  return job;
}

// fetch what is missing, a few at a time; a thumbnail YouTube does not have is
// remembered for a day so it is not asked for on every rebuild
async function fetchThumbs(ids) {
  const d = D();
  await mkdir(thumbsDir(), { recursive: true });
  const failedPath = path.join(thumbsDir(), '_missing.json');
  let failed = {};
  try { failed = JSON.parse(await readFile(failedPath, 'utf8')); } catch { /* none yet */ }
  const todo = ids.filter((id) => VIDEO_ID.test(id) && !existsSync(path.join(thumbsDir(), `${id}.jpg`))
    && !(failed[id] && d.now() - failed[id].at < THUMB_RETRY_MS));
  let i = 0;
  let changed = false;
  const worker = async () => {
    while (i < todo.length) {
      const id = todo[i++];
      try {
        const buf = await d.fetchThumb(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`);
        const dest = path.join(thumbsDir(), `${id}.jpg`);
        await writeFile(`${dest}.tmp`, buf);
        await rename(`${dest}.tmp`, dest);
        if (failed[id]) { delete failed[id]; changed = true; }
      } catch (e) {
        failed[id] = { at: d.now(), why: e.message };
        changed = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(FETCH_AT_ONCE, todo.length) }, worker));
  if (changed) await writeFile(failedPath, JSON.stringify(failed));
  return failed;
}

async function buildWall(personId, ids, sig) {
  const d = D();
  await fetchThumbs(ids);
  const blank = path.join(thumbsDir(), '_blank.jpg');
  if (!existsSync(blank)) await d.makeBlank(blank);
  const files = [];
  const missing = [];
  ids.forEach((id, n) => {
    const f = path.join(thumbsDir(), `${id}.jpg`);
    if (VIDEO_ID.test(id) && existsSync(f)) files.push(f);
    else { files.push(blank); missing.push(n); }
  });
  const rows = Math.max(1, Math.ceil(ids.length / COLS));
  const file = `${personId}-wall-${sig}.jpg`;
  const out = path.join(artDir(), file);
  try {
    if (!ids.length) throw new Error('his catalogue is empty, so there is no wall to draw');
    await d.buildSprite(files, out, { cols: COLS, rows, cell: CELL });
    if (!existsSync(out)) throw new Error('ffmpeg finished but wrote no sprite');
  } catch (e) {
    const prev = await readManifest(personId);
    await writeFile(manifestPath(personId), JSON.stringify({ ...(prev || {}), error: `the wall could not be built: ${e.message}`, errorSig: sig, errorAt: new Date(d.now()).toISOString() }));
    throw e;
  }
  const manifest = { sig, file, ids, cols: COLS, rows, cell: CELL, missing, builtAt: new Date(d.now()).toISOString() };
  await writeFile(`${manifestPath(personId)}.tmp`, JSON.stringify(manifest));
  await rename(`${manifestPath(personId)}.tmp`, manifestPath(personId));
  // the sprites of older catalogues are no longer read by anything
  for (const f of await readdir(artDir())) {
    if (f.startsWith(`${personId}-wall-`) && f.endsWith('.jpg') && f !== file) await unlink(path.join(artDir(), f)).catch(() => {});
  }
  d.log(`mentor art: the wall of ${personId} built, ${ids.length} videos${missing.length ? `, ${missing.length} with no thumbnail` : ''}`);
  return manifest;
}

/** For tests and scripts: wait for a wall build in flight. */
export async function _wallSettled(personId) { await building.get(personId); }

/* ------------------------------ one thumbnail ------------------------------ */

const SIZES = { mq: 'mqdefault.jpg', hi: 'maxresdefault.jpg' };

/**
 * One video's thumbnail from the cache, fetched once from i.ytimg.com. Only
 * a video the register knows is served (so this is never an open proxy).
 * `hi` is the 1280 px frame where YouTube has one, else the 320 px one.
 */
export async function ensureThumb(videoId, size = 'mq') {
  if (!VIDEO_ID.test(String(videoId || ''))) throw notFound('no such video');
  const known = (await listSources({ kind: 'video' })).some((s) => s.key === `yt:${videoId}`);
  if (!known) throw notFound('no such video');
  await mkdir(thumbsDir(), { recursive: true });
  const want = size === 'hi' ? 'hi' : 'mq';
  const mq = path.join(thumbsDir(), `${videoId}.jpg`);
  const hi = path.join(thumbsDir(), `${videoId}-hi.jpg`);
  const d = D();
  if (want === 'hi') {
    if (existsSync(hi)) return hi;
    const no = `${hi}.none`;
    if (!existsSync(no)) {
      try {
        const buf = await d.fetchThumb(`https://i.ytimg.com/vi/${videoId}/${SIZES.hi}`);
        await writeFile(`${hi}.tmp`, buf);
        await rename(`${hi}.tmp`, hi);
        return hi;
      } catch (e) {
        if (e.status === 404) await writeFile(no, '');
        else throw e;
      }
    }
  }
  if (existsSync(mq)) return mq;
  const buf = await d.fetchThumb(`https://i.ytimg.com/vi/${videoId}/${SIZES.mq}`);
  await writeFile(`${mq}.tmp`, buf);
  await rename(`${mq}.tmp`, mq);
  return mq;
}

/* -------------------------------- start-up --------------------------------- */

/** Once after start: a cut-out and a wall for everyone followed who has none. */
export async function sweepMentorArt() {
  for (const p of await listPeople()) {
    if (p.status === 'guest') continue;
    await ensureCutout(p.id).catch(() => {});
    await wallFor(p.id).catch(() => {});
    await building.get(p.id);
  }
}

export function _resetArtForTests() { cutting.clear(); cutFailed.clear(); podcasting.clear(); podcastFailed.clear(); building.clear(); }
