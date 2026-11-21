import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Tests without their own data dir write into his live server/data.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-mentor-people-'));
process.env.NOVA_DATA_DIR = dir;

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mentors');
const text = (f) => fs.readFileSync(path.join(FIX, f), 'utf8');
const json = (f) => JSON.parse(text(f));
const URL_FISHER = 'https://www.youtube.com/@jeffersonfisher';

let D;
let P;
let R;
before(async () => {
  D = await import('../lib/mentorDiscover.js');
  P = await import('../lib/mentorPeople.js');
  R = await import('../lib/mentorRegister.js');
});
after(() => { D._setDiscoverDepsForTest(null); P._setPeopleDepsForTest(null); });

const orangeRing = () => { const b = Buffer.alloc(32 * 32 * 3); for (let i = 0; i < b.length; i += 3) b.set([250, 107, 47], i); return b; };

let ytdlpCalls;
let extraVideos;
function stubs() {
  const head = json('ch-jeffersonfisher.json');
  const all = json('fisher-all.json');
  ytdlpCalls = [];
  D._setDiscoverDepsForTest({
    ytdlpJson: async (args) => {
      const url = args.at(-1);
      ytdlpCalls.push(url);
      if (url.endsWith('/videos')) return { ...head, entries: [...extraVideos, ...all.entries] };
      if (url.endsWith('/shorts')) return { ...head, entries: [{ id: 'short000001', title: 'a short', duration: 30, view_count: 9 }] };
      const e = new Error('yt-dlp exited with code 1: ERROR: This channel does not have a streams tab');
      e.stderr = 'This channel does not have a streams tab';
      throw e;
    },
    fetchText: async (u) => (u.includes('feeds/videos.xml') ? text('fisher-youtube-rss.xml') : text('fisher-podcast-feed.xml')),
    fetchJson: async (u) => (u.includes('itunes') ? json('itunes-search.json') : { docs: [{ title: 'The Next Conversation', author_name: ['Jefferson Fisher'], first_publish_year: 2025 }] }),
    fetchBuffer: async () => Buffer.from('fake jpeg bytes'),
    ffmpegRaw: async () => orangeRing(),
  });
  P._setPeopleDepsForTest({ readClaudeUsage: async () => ({ at: 'x', session: { percent: 17, resetsAt: null }, week: { percent: 30, resetsAt: null }, scoped: [] }) });
}

beforeEach(() => {
  fs.rmSync(path.join(dir, 'mentors'), { recursive: true, force: true });
  R._resetRegisterForTests();
  P._resetPeopleForTests();
  extraVideos = [];
  stubs();
});

test('previewPerson: counts, six newest with RSS dates, estimate, colour and art; and it saves nothing', async () => {
  const d = await P.previewPerson({ channelUrl: URL_FISHER });
  assert.equal(d.person.id, 'jefferson-fisher');
  assert.equal(d.person.name, 'Jefferson Fisher');
  assert.equal(d.person.status, undefined);
  assert.equal(d.person.channel.subscribers, 1170000);
  assert.equal(d.person.podcast.feedUrl, 'https://feeds.megaphone.fm/CIVILITYMEDIALLC9599576334');
  assert.equal(d.person.podcast.episodes, 143);
  assert.deepEqual(d.person.books, [{ title: 'The Next Conversation', year: 2025, fileHeld: false, askedAt: null }]);
  assert.equal(d.counts.videos, 236);
  assert.equal(d.counts.shorts, 1);
  assert.equal(d.counts.streams, 0);
  assert.equal(d.counts.podcastEpisodes, 143);
  assert.ok(d.counts.hours > 20);
  assert.equal(d.latest.length, 6);
  assert.equal(d.latest[0].id, '1HX8PQ9FiCU');
  assert.equal(d.latest[0].publishedAt, '2026-11-20T15:00:23.000Z');
  assert.equal(d.person.colour, '#fa6b2f');
  assert.equal(d.person.art.avatar, 'jefferson-fisher-avatar.jpg');
  assert.ok(fs.existsSync(path.join(P.artDir(), 'jefferson-fisher-avatar.jpg')));
  // 236 videos at 0.94 plus the hours at 0.23, whole dollars, and big comes first
  assert.equal(d.estimate.weaveUsd, Math.round(236 * 0.94));
  assert.equal(d.estimate.readUsd, Math.round(d.counts.hours * 0.23));
  assert.equal(d.estimate.totalUsd, d.estimate.readUsd + d.estimate.weaveUsd);
  assert.equal(d.estimate.basis, 'pilot of 19 Nov 2026: 4 videos, weave-v1');
  assert.equal(d.big, d.estimate.totalUsd >= 150);
  assert.equal(d.big, true);
  assert.equal(d.usage.week.percent, 30);
  assert.deepEqual(d.alreadyInVault, { videos: [], books: [] });
  // nothing saved: no people file, nothing in the register
  assert.equal(fs.existsSync(path.join(dir, 'mentors', 'people.json')), false);
  assert.deepEqual(await R.listSources(), []);
  assert.deepEqual(await P.listPeople(), []);
});

test('previewPerson: pairs the podcast twins and lists what the vault already holds', async () => {
  await R.upsertSources([{ key: 'yt:1HX8PQ9FiCU', kind: 'video', tier: 1, title: 'old title' }], { origin: 'backfill' });
  await R.setStage('yt:1HX8PQ9FiCU', 'woven', { vault: { sourcePage: 'Wiki/Sources/married.md', rawPage: null } });
  await R.upsertSources([{ title: 'The Next Conversation', author: 'Jefferson Fisher', kind: 'book', tier: 1 }], { origin: 'backfill' });
  const bookKey = R.sourceKey({ title: 'The Next Conversation', author: 'Jefferson Fisher' });
  await R.setStage(bookKey, 'woven', { vault: { sourcePage: 'Wiki/Sources/next.md', rawPage: null } });
  const d = await P.previewPerson({ channelUrl: URL_FISHER });
  assert.deepEqual(d.alreadyInVault.videos.map((v) => [v.key, v.sourcePage]), [['yt:1HX8PQ9FiCU', 'Wiki/Sources/married.md']]);
  assert.deepEqual(d.alreadyInVault.books, [{ title: 'The Next Conversation', sourcePage: 'Wiki/Sources/next.md' }]);
  const draft = P._draftForTests(URL_FISHER);
  assert.ok(draft.twins.pairs.length >= 100);
});

test('previewPerson: a bad address is refused, and a discovery failure carries the real cause', async () => {
  await assert.rejects(() => P.previewPerson({ channelUrl: 'banana' }), /channel address/);
  D._setDiscoverDepsForTest({ ytdlpJson: async () => { throw new Error('yt-dlp exited with code 1: HTTP Error 429'); } });
  await assert.rejects(() => P.previewPerson({ channelUrl: URL_FISHER }), (e) => e.discovery && /429/.test(e.message));
});

test('followPerson: saves the person and the right kinds and tiers, sets audio on a paired video, lists the channel once', async () => {
  await P.previewPerson({ channelUrl: URL_FISHER });
  const before = ytdlpCalls.length;
  const person = await P.followPerson({ channelUrl: URL_FISHER });
  assert.equal(ytdlpCalls.length, before, 'follow reused the draft and did not list the channel again');
  assert.equal(person.status, 'following');
  assert.equal(person.scope, 'everything');
  assert.ok(person.followedAt && person.lastCheckedAt);
  assert.equal((await P.getPerson('jefferson-fisher')).name, 'Jefferson Fisher');

  const all = await R.listSources({ personId: 'jefferson-fisher' });
  const kinds = (k) => all.filter((s) => s.kind === k);
  assert.equal(kinds('video').length, 236);
  assert.ok(kinds('video').every((s) => s.tier === 1 && s.stage === 'found' && s.hold === null));
  assert.equal(kinds('short').length, 1);
  assert.equal(kinds('short')[0].tier, 2);
  assert.equal(kinds('stream').length, 0);
  const pairs = P._draftForTests(URL_FISHER).twins.pairs.length;
  assert.equal(kinds('episode').length, 143 - pairs);
  assert.ok(kinds('episode').every((s) => s.tier === 2 && s.show === 'The Jefferson Fisher Podcast' && s.audio?.guid));
  assert.equal(kinds('video').filter((s) => s.audio).length, pairs);
  const married = await R.getSource('yt:1HX8PQ9FiCU');
  assert.equal(married.audio.guid, '0c318ede-e478-11f1-ba50-a3e528672faa');
  assert.equal(married.audio.sec, 4198);
  assert.equal(married.show, 'Jefferson Fisher');
  assert.equal(married.channelId, 'UCXjnpu6lK0HoUyOMh2ZBwhQ');
  assert.equal(married.publishedAt, '2026-11-20T15:00:23.000Z');
  assert.deepEqual(married.people, [{ id: 'jefferson-fisher', role: 'host' }]);
  assert.equal((await R.countsFor('jefferson-fisher')).total, 236);
});

test('followPerson: a record already in the register from a backfill gains the person and keeps its stage', async () => {
  await R.upsertSources([{ key: 'yt:1HX8PQ9FiCU', kind: 'video', tier: 1, title: 'old title', people: [] }], { origin: 'backfill' });
  await R.setStage('yt:1HX8PQ9FiCU', 'woven', { vault: { sourcePage: 'Wiki/Sources/x.md', rawPage: null }, legacy: true });
  await P.followPerson({ channelUrl: URL_FISHER });
  const s = await R.getSource('yt:1HX8PQ9FiCU');
  assert.deepEqual(s.people, [{ id: 'jefferson-fisher', role: 'host' }]);
  assert.equal(s.stage, 'woven');
  assert.equal(s.origin, 'backfill');
  assert.equal(s.vault.sourcePage, 'Wiki/Sources/x.md');
  assert.ok(s.title.startsWith('Married 26 Years'));
});

test('followPerson: following twice duplicates nothing', async () => {
  const a = await P.followPerson({ channelUrl: URL_FISHER });
  const n = (await R.listSources()).length;
  P._resetPeopleForTests();
  const b = await P.followPerson({ channelUrl: URL_FISHER });
  assert.equal((await R.listSources()).length, n);
  assert.equal((await P.listPeople()).length, 1);
  assert.equal(b.followedAt, a.followedAt);
  const s = await R.getSource('yt:1HX8PQ9FiCU');
  assert.equal(s.people.length, 1);
});

test("followPerson: scope 'none' holds every source, and a bad scope is refused", async () => {
  const p = await P.followPerson({ channelUrl: URL_FISHER, scope: 'none' });
  assert.equal(p.scope, 'none');
  const all = await R.listSources({ personId: 'jefferson-fisher' });
  assert.ok(all.length > 236);
  assert.ok(all.every((s) => s.hold?.state === 'held' && s.hold.why === 'he chose not now'));
  await assert.rejects(() => P.followPerson({ channelUrl: URL_FISHER, scope: 'sideways' }), /scope must be/);
});

test("followPerson: scope 'narrow' is stored and holds nothing", async () => {
  const p = await P.followPerson({ channelUrl: URL_FISHER, scope: 'narrow' });
  assert.equal(p.scope, 'narrow');
  assert.ok((await R.listSources()).every((s) => s.hold === null));
});

test('refreshPerson: reports only the keys that are new, and sets lastCheckedAt', async () => {
  await P.followPerson({ channelUrl: URL_FISHER });
  const first = (await P.getPerson('jefferson-fisher')).lastCheckedAt;
  assert.deepEqual((await P.refreshPerson('jefferson-fisher')).added, []);
  extraVideos = [{ id: 'NEWVIDEO001', title: 'A brand new upload', duration: 600, view_count: 1 }];
  assert.deepEqual((await P.refreshPerson('jefferson-fisher')).added, ['yt:NEWVIDEO001']);
  assert.deepEqual((await P.refreshPerson('jefferson-fisher')).added, []);
  assert.ok((await P.getPerson('jefferson-fisher')).lastCheckedAt >= first);
  assert.equal((await R.getSource('yt:NEWVIDEO001')).title, 'A brand new upload');
  await assert.rejects(() => P.refreshPerson('nobody'), /no person called "nobody"/);
});

test('the store: merge by id, setStatus, and a corrupt file is moved aside', async () => {
  await P.savePerson({ id: 'a-b', name: 'A B', status: 'guest', scope: 'none' });
  await P.savePerson({ id: 'a-b', colour: '#112233' });
  assert.deepEqual(await P.getPerson('a-b'), { id: 'a-b', name: 'A B', status: 'guest', scope: 'none', colour: '#112233' });
  const paused = await P.setStatus('a-b', 'paused');
  assert.equal(paused.status, 'paused');
  assert.ok(paused.pausedAt);
  assert.equal((await P.setStatus('a-b', 'following')).pausedAt, null);
  await assert.rejects(() => P.setStatus('a-b', 'dancing'), /unknown status/);
  await assert.rejects(() => P.setStatus('nobody', 'paused'), /no person called/);
  fs.writeFileSync(path.join(dir, 'mentors', 'people.json'), '{ not json');
  P._resetPeopleForTests();
  assert.deepEqual(await P.listPeople(), []);
  assert.ok(fs.readdirSync(path.join(dir, 'mentors')).some((f) => f.startsWith('people.json.corrupt-')));
});

test('dates: the RSS or the twin is exact, the listing approximate, and a refresh never trades exact for approximate', async () => {
  const head = json('ch-jeffersonfisher.json');
  const approx = json('fisher-approx-dates.json');
  const all = json('fisher-all.json');
  const odd = { id: 'APPROXONLY1', title: 'Only the listing dates this', duration: 900, view_count: 5, timestamp: 1794000000 };
  const dated = new Map([...approx.entries, odd].map((e) => [e.id, e.timestamp]));
  dated.set('1HX8PQ9FiCU', 1790000000); // an approximate date far from both exact ones
  D._setDiscoverDepsForTest({
    ...D.discoverDeps(),
    ytdlpJson: async (args) => {
      const url = args.at(-1);
      if (url.endsWith('/videos')) return { ...head, entries: [odd, ...all.entries.map((e) => ({ ...e, timestamp: dated.get(e.id) ?? null }))] };
      return { ...head, entries: [] };
    },
  });
  await P.followPerson({ channelUrl: URL_FISHER });
  const rss = await R.getSource('yt:1HX8PQ9FiCU');
  assert.equal(rss.publishedAt, '2026-11-20T15:00:23.000Z', 'the RSS beats the listing');
  assert.equal(rss.publishedApprox, false);
  const only = await R.getSource('yt:APPROXONLY1');
  assert.equal(only.publishedAt, new Date(1794000000 * 1000).toISOString());
  assert.equal(only.publishedApprox, true);
  const undated = (await R.listSources({ personId: 'jefferson-fisher', kind: 'video' })).find((s) => !s.publishedAt);
  if (undated) assert.equal(undated.publishedApprox, null);

  // the RSS no longer lists it: its exact date stays
  D._setDiscoverDepsForTest({
    ...D.discoverDeps(),
    fetchText: async (u) => (u.includes('feeds/videos.xml') ? '<feed></feed>' : text('fisher-podcast-feed.xml')),
  });
  await P.refreshPerson('jefferson-fisher');
  // its podcast twin's date (also exact) may stand in; the listing's never does
  const again = await R.getSource('yt:1HX8PQ9FiCU');
  assert.equal(again.publishedAt.slice(0, 10), '2026-11-20');
  assert.equal(again.publishedApprox, false);
  assert.notEqual(again.publishedAt, new Date(dated.get('1HX8PQ9FiCU') * 1000).toISOString());
});

test('previewPerson: the narrower choice is priced by the same selection the queue uses', async () => {
  P._setPeopleDepsForTest({ readClaudeUsage: async () => null, now: () => Date.parse('2026-11-21T00:00:00Z') });
  const d = await P.previewPerson({ channelUrl: URL_FISHER });
  const { inScope } = await import('../lib/mentorQueue.js');
  const vids = json('fisher-all.json').entries.map((e) => ({ key: `yt:${e.id}`, tier: 1, views: e.view_count, durationSec: e.duration, publishedAt: null }));
  const want = inScope(vids, { scope: 'narrow', now: Date.parse('2026-11-21T00:00:00Z') });
  // the six newest have RSS dates inside the last 12 months, so they join the 60 most viewed
  assert.ok(d.estimateNarrow.videos >= 60 && d.estimateNarrow.videos < d.counts.videos);
  assert.ok(d.estimateNarrow.videos >= want.length);
  const hours = want.reduce((t, v) => t + (v.durationSec || 0), 0) / 3600;
  assert.ok(d.estimateNarrow.hours >= Math.round(hours * 10) / 10);
  assert.equal(d.estimateNarrow.basis, d.estimate.basis);
  assert.equal(d.estimateNarrow.totalUsd, d.estimateNarrow.readUsd + d.estimateNarrow.weaveUsd);
  assert.equal(d.estimateNarrow.weaveUsd, Math.round(d.estimateNarrow.videos * 0.94));
});
