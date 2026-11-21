import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverDeps, listChannel, latestFromRss, findPodcast, readPodcastFeed, matchTwins,
  discoverBooks, sampleColour, channelUrlOf, channelBase, discoverError,
} from './mentorDiscover.js';
import { readClaudeUsage } from './claudeUsage.js';
import {
  sourceKey, personSlug, upsertSources, attachPerson, getSource, setHold,
} from './mentorRegister.js';

// WHO HE FOLLOWS (Mentors, 21 Nov 2026). A person is a channel plus, when he
// has one, a podcast and some books. Two flows:
//
//   previewPerson   finds everything and saves NOTHING, so he sees the size and
//                   the price of a person before he agrees to either;
//   followPerson    saves the person and records the whole catalogue in the
//                   register (lib/mentorRegister.js), one write for the list.
//
// Nothing here calls a language model and nothing writes to the vault. The
// channel is listed once per preview: follow reuses the draft for 30 minutes
// instead of listing it again (a listing is the cheap part of YouTube, but a
// 2,000-video channel still takes a while).

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
export const mentorsDir = () => path.join(dataRoot(), 'mentors');
export const artDir = () => path.join(mentorsDir(), 'art');
const peoplePath = () => path.join(mentorsDir(), 'people.json');

export const READ_USD_PER_HOUR = 0.23;
export const WEAVE_USD_PER_VIDEO = 0.94;
export const ESTIMATE_BASIS = 'pilot of 19 Nov 2026: 4 videos, weave-v1';
export const BIG_USD = 150;
const DRAFT_TTL_MS = 30 * 60_000;
export const SCOPES = ['everything', 'narrow', 'none'];
export const STATUSES = ['following', 'paused', 'guest'];

let deps = null;
export function _setPeopleDepsForTest(d) { deps = d || null; }
const D = () => ({
  readClaudeUsage,
  now: () => Date.now(),
  downloadImage: async (url, dest) => {
    const buf = await discoverDeps().fetchBuffer(url, 'image download');
    if (!buf.length) throw discoverError(`image download: ${new URL(url).host} answered with nothing`);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, buf);
  },
  ...(deps || {}),
});

/* ---------------------------------- store ---------------------------------- */

let store = null;
let loading = null;
let writing = Promise.resolve();
let tmpCounter = 0;
const emptyStore = () => ({ version: 1, people: {} });

async function readStore() {
  let text;
  try {
    text = await readFile(peoplePath(), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return emptyStore();
    await moveAside();
    return emptyStore();
  }
  try {
    const o = JSON.parse(text);
    if (o && typeof o === 'object' && o.people && typeof o.people === 'object' && !Array.isArray(o.people)) return { version: 1, people: o.people };
  } catch { /* fall through */ }
  await moveAside();
  return emptyStore();
}

// an unreadable file is not "empty": starting empty and then writing would
// destroy the only copy, so it is moved aside first
async function moveAside() {
  try { await rename(peoplePath(), `${peoplePath()}.corrupt-${Date.now()}`); } catch { /* already gone */ }
}

function load() {
  if (store) return Promise.resolve(store);
  if (!loading) loading = readStore().then((s) => { store = s; return s; }).finally(() => { loading = null; });
  return loading;
}

function persist() {
  const job = writing.then(async () => {
    await mkdir(mentorsDir(), { recursive: true });
    const tmp = `${peoplePath()}.${process.pid}.${Date.now()}.${tmpCounter++}.tmp`;
    await writeFile(tmp, JSON.stringify(store), 'utf8');
    await rename(tmp, peoplePath());
  });
  writing = job.then(() => {}, () => {});
  return job;
}

const copy = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function _resetPeopleForTests() { store = null; loading = null; drafts.clear(); }

export async function listPeople() {
  const { people } = await load();
  return Object.values(people).map(copy).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function getPerson(id) {
  const { people } = await load();
  return people[id] ? copy(people[id]) : null;
}

// merge by id: what is passed wins, what is not passed stays
export async function savePerson(person) {
  if (!person?.id) throw new Error('savePerson: a person needs an id');
  const s = await load();
  const clean = Object.fromEntries(Object.entries(copy(person)).filter(([, v]) => v !== undefined));
  s.people[person.id] = { ...(s.people[person.id] || {}), ...clean };
  await persist();
  return copy(s.people[person.id]);
}

export async function setStatus(id, status) {
  if (!STATUSES.includes(status)) throw new Error(`setStatus: unknown status "${status}" (expected ${STATUSES.join(', ')})`);
  const s = await load();
  const p = s.people[id];
  if (!p) throw new Error(`no person called "${id}"`);
  p.status = status;
  p.pausedAt = status === 'paused' ? new Date(D().now()).toISOString() : null;
  await persist();
  return copy(p);
}

/* ------------------------------- the draft --------------------------------- */

const drafts = new Map(); // key -> { at, entry }; keys: channel id, channel url, handle url

const draftKeys = (channelUrl, channel) => [
  channel.channelId,
  channelBase(channelUrl).toLowerCase(),
  channelBase(channel.url).toLowerCase(),
  channel.handle ? `https://www.youtube.com/${channel.handle}`.toLowerCase() : null,
  `https://www.youtube.com/channel/${channel.channelId}`.toLowerCase(),
].filter(Boolean);

function cachedDraft(channelUrl) {
  const key = channelBase(channelUrl).toLowerCase();
  const hit = drafts.get(key);
  if (!hit) return null;
  if (D().now() - hit.at > DRAFT_TTL_MS) { drafts.delete(key); return null; }
  return hit.entry;
}

export const _draftForTests = (channelUrl) => cachedDraft(channelUrlOf(channelUrl));

const round1 = (x) => Math.round(x * 10) / 10;

export function estimateFor({ videos, hours }) {
  const readUsd = Math.round(hours * READ_USD_PER_HOUR);
  const weaveUsd = Math.round(videos * WEAVE_USD_PER_VIDEO);
  const totalUsd = readUsd + weaveUsd;
  return { readUsd, weaveUsd, totalUsd, basis: ESTIMATE_BASIS };
}

// yt3 portrait: ask for a 640 px square; the banner at a sensible width
const avatarUrl = (u) => String(u).replace(/=[^=/]*$/, '=s640-c-k-c0x00ffffff-no-rj');
const bannerUrl = (u) => String(u).replace(/=[^=/]*$/, '=w1280-no-rj');

async function fetchArt(id, channel) {
  const art = { avatar: null, banner: null };
  const dir = artDir();
  const d = D();
  for (const [kind, url, rewrite] of [['avatar', channel.avatarUrl, avatarUrl], ['banner', channel.bannerUrl, bannerUrl]]) {
    if (!url) continue;
    const file = `${id}-${kind}.jpg`;
    try { await d.downloadImage(rewrite(url), path.join(dir, file)); art[kind] = file; } catch { /* a picture is cosmetic */ }
  }
  return art;
}

// Everything found about one channel, kept in memory for follow.
async function discover(channelUrl) {
  const hit = cachedDraft(channelUrl);
  if (hit) return hit;
  const listing = await listChannel(channelUrl);
  const { channel } = listing;
  const id = personSlug(channel.name);
  if (!id) throw discoverError(`reading ${channelUrl}: the channel has no name to follow it by`);
  const [rss, podcast, books, art] = await Promise.all([
    latestFromRss(channel.channelId),
    findPodcast(channel.name),
    discoverBooks(channel.name),
    fetchArt(id, channel),
  ]);
  let colour = null;
  if (art.avatar) { try { colour = await sampleColour(path.join(artDir(), art.avatar)); } catch { /* no colour, the screen has a default */ } }
  const twins = podcast ? matchTwins(listing.videos, podcast.episodes) : { pairs: [], episodeOnly: [] };
  const hours = round1(listing.videos.reduce((t, v) => t + (v.durationSec || 0), 0) / 3600);
  const rssDates = new Map(rss.map((r) => [r.id, r.publishedAt]));
  const person = {
    id,
    name: channel.name,
    followedAt: null,
    pausedAt: null,
    scope: 'everything',
    channel: { channelId: channel.channelId, handle: channel.handle, url: channel.url, subscribers: channel.subscribers, tagline: channel.tagline },
    podcast: podcast ? { title: podcast.title, feedUrl: podcast.feedUrl, artworkUrl: podcast.artworkUrl, episodes: podcast.episodes.length } : null,
    books: books.map((b) => ({ title: b.title, year: b.year, fileHeld: false, askedAt: null })),
    colour,
    art,
    lastCheckedAt: null,
  };
  const counts = { videos: listing.videos.length, hours, shorts: listing.shorts.length, streams: listing.streams.length, podcastEpisodes: podcast ? podcast.episodes.length : 0 };
  const entry = { person, counts, listing, rssDates, podcast, twins, at: D().now() };
  for (const k of draftKeys(channelUrl, channel)) drafts.set(k, { at: entry.at, entry });
  return entry;
}

export async function previewPerson({ channelUrl } = {}) {
  const url = channelUrlOf(channelUrl);
  if (!url) throw new Error('a channel address is needed: a youtube.com/@name link, a /channel/ link, or an @handle');
  const { person, counts, listing, rssDates } = await discover(url);

  const latest = listing.videos.slice(0, 6).map((v) => ({ id: v.id, title: v.title, durationSec: v.durationSec, publishedAt: rssDates.get(v.id) || null }));

  // what Nova already holds: the videos and books that are in the register
  // with a page in his vault (a backfill or an earlier weave put it there)
  const alreadyInVault = { videos: [], books: [] };
  for (const v of listing.videos) {
    const key = sourceKey({ videoId: v.id });
    const s = await getSource(key);
    if (s && (s.vault || s.legacy || s.stage === 'woven')) alreadyInVault.videos.push({ key, title: s.title || v.title, sourcePage: s.vault?.sourcePage || null });
  }
  for (const b of person.books) {
    const s = await getSource(sourceKey({ title: b.title, author: person.name }));
    if (s && s.vault) alreadyInVault.books.push({ title: b.title, sourcePage: s.vault.sourcePage || null });
  }

  const estimate = estimateFor({ videos: counts.videos, hours: listing.videos.reduce((t, v) => t + (v.durationSec || 0), 0) / 3600 });
  const usage = await D().readClaudeUsage();
  return { person: copy(person), counts: copy(counts), latest, alreadyInVault, estimate, big: estimate.totalUsd >= BIG_USD, usage };
}

/* -------------------------------- following -------------------------------- */

function buildSources(person, entry, scope) {
  const { listing, rssDates, podcast, twins } = entry;
  const channel = listing.channel;
  const people = [{ id: person.id, role: 'host' }];
  const hold = scope === 'none' ? { state: 'held', why: 'he chose not now', at: new Date(D().now()).toISOString(), retryAt: null } : undefined;
  const common = { show: channel.name, channelId: channel.channelId, people, ...(hold ? { hold } : {}) };
  const byGuid = new Map((podcast?.episodes || []).map((e) => [e.guid, e]));
  const twinOf = new Map(twins.pairs.map((p) => [p.videoId, byGuid.get(p.guid)]));
  const out = [];
  for (const v of listing.videos) {
    const ep = twinOf.get(v.id);
    out.push({
      ...common, key: sourceKey({ videoId: v.id }), kind: 'video', tier: 1, title: v.title,
      url: `https://www.youtube.com/watch?v=${v.id}`, publishedAt: rssDates.get(v.id) || ep?.publishedAt || null,
      durationSec: v.durationSec, views: v.views,
      audio: ep ? { feedUrl: podcast.feedUrl, guid: ep.guid, url: ep.audioUrl, sec: ep.durationSec } : null,
    });
  }
  for (const v of listing.shorts) {
    out.push({ ...common, key: sourceKey({ videoId: v.id }), kind: 'short', tier: 2, title: v.title, url: `https://www.youtube.com/shorts/${v.id}`, publishedAt: rssDates.get(v.id) || null, durationSec: v.durationSec, views: v.views });
  }
  for (const v of listing.streams) {
    out.push({ ...common, key: sourceKey({ videoId: v.id }), kind: 'stream', tier: 2, title: v.title, url: `https://www.youtube.com/watch?v=${v.id}`, publishedAt: rssDates.get(v.id) || null, durationSec: v.durationSec, views: v.views });
  }
  for (const guid of twins.episodeOnly) {
    const e = byGuid.get(guid);
    out.push({
      ...common, key: sourceKey({ feedUrl: podcast.feedUrl, guid }), kind: 'episode', tier: 2, title: e.title,
      url: e.audioUrl, show: podcast.title, publishedAt: e.publishedAt, durationSec: e.durationSec, views: null,
      audio: { feedUrl: podcast.feedUrl, guid, url: e.audioUrl, sec: e.durationSec },
    });
  }
  return out;
}

// Records the catalogue. A record that was already in the register (a backfill
// put his old Sources pages there) keeps its stage and gains the person; with
// scope 'none' every source that is still only "found" is held.
async function record(person, entry, scope) {
  const list = buildSources(person, entry, scope);
  const known = new Set();
  for (const s of list) if (await getSource(s.key)) known.add(s.key);
  await upsertSources(list, { origin: 'discovery' });
  // upsert merges people into a known record already; this says so out loud
  // for the records a backfill made, and costs nothing when nothing changed
  await attachPerson([...known], { id: person.id, role: 'host' });
  if (scope === 'none') {
    for (const s of list) {
      const cur = await getSource(s.key);
      if (cur && cur.stage === 'found' && !cur.hold) await setHold(s.key, { state: 'held', why: 'he chose not now' });
    }
  }
  return { keys: list.map((s) => s.key), known };
}

export async function followPerson({ channelUrl, scope = 'everything' } = {}) {
  if (!SCOPES.includes(scope)) throw new Error(`scope must be one of ${SCOPES.join(', ')}, not "${scope}"`);
  const url = channelUrlOf(channelUrl);
  if (!url) throw new Error('a channel address is needed: a youtube.com/@name link, a /channel/ link, or an @handle');
  const entry = await discover(url);
  const prior = await getPerson(entry.person.id);
  const nowIso = new Date(D().now()).toISOString();
  const saved = await savePerson({
    ...entry.person,
    status: 'following',
    followedAt: prior?.followedAt || nowIso,
    pausedAt: null,
    scope,
    // a person he already follows keeps the picture and colour he has
    ...(prior?.art?.avatar && !entry.person.art.avatar ? { art: prior.art, colour: prior.colour } : {}),
    lastCheckedAt: nowIso,
  });
  await record(saved, entry, scope);
  return saved;
}

// The channel listed again; what is new is what the News page will report.
export async function refreshPerson(id) {
  const person = await getPerson(id);
  if (!person) throw new Error(`no person called "${id}"`);
  if (!person.channel?.url) throw new Error(`${person.name} has no channel to check`);
  const [listing, rss, episodes] = await Promise.all([
    listChannel(person.channel.url),
    latestFromRss(person.channel.channelId),
    person.podcast?.feedUrl ? readPodcastFeed(person.podcast.feedUrl) : Promise.resolve([]),
  ]);
  const podcast = person.podcast?.feedUrl ? { ...person.podcast, episodes } : null;
  const entry = {
    listing, rssDates: new Map(rss.map((r) => [r.id, r.publishedAt])), podcast,
    twins: podcast ? matchTwins(listing.videos, episodes) : { pairs: [], episodeOnly: [] },
  };
  const { keys, known } = await record(person, entry, person.scope || 'everything');
  await savePerson({ id, lastCheckedAt: new Date(D().now()).toISOString(), podcast: podcast ? { ...person.podcast, episodes: episodes.length } : person.podcast });
  return { added: keys.filter((k) => !known.has(k)) };
}
