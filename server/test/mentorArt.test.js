import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

// Tests without their own data dir write into his live server/data.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-mentor-art-'));
process.env.NOVA_DATA_DIR = dir;

// No Swift, no ffmpeg, no network: every outside step is a stub that writes
// a file where the real one would, and counts its calls.
let A; let P; let R; let server; let base;
let calls; let artReply; let failCut; let failSprite; let missingThumbs;
const art = () => path.join(dir, 'mentors', 'art');

before(async () => {
  A = await import('../lib/mentorArt.js');
  P = await import('../lib/mentorPeople.js');
  R = await import('../lib/mentorRegister.js');
  const { mentorsArtRouter } = await import('../routes/mentorsArt.js');
  const app = express();
  app.use('/api', mentorsArtRouter({ sweep: false }));
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); A._setArtDepsForTest(null); });

const VIDS = [
  { id: 'aaaaaaaaaa1', title: 'Newest', at: '2026-11-20T15:00:00.000Z' },
  { id: 'aaaaaaaaaa2', title: 'Older', at: '2026-10-01T15:00:00.000Z', approx: true },
  { id: 'aaaaaaaaaa3', title: 'Undated', at: null },
];

beforeEach(async () => {
  fs.rmSync(path.join(dir, 'mentors'), { recursive: true, force: true });
  R._resetRegisterForTests(); P._resetPeopleForTests(); A._resetArtForTests();
  calls = { helper: 0, cut: 0, fetch: [], sprite: [], art: [] }; artReply = { buf: Buffer.from('cover'), type: 'image/jpeg' }; failCut = null; failSprite = null; missingThumbs = new Set();
  A._setArtDepsForTest({
    ensureHelper: async () => { calls.helper += 1; return '/stub/helper'; },
    runCutout: async (bin, input, output) => {
      calls.cut += 1;
      if (failCut) throw new Error(failCut);
      fs.writeFileSync(output, 'png bytes');
      return { ok: true };
    },
    fetchThumb: async (url) => {
      calls.fetch.push(url);
      const id = url.split('/vi/')[1].split('/')[0];
      if (missingThumbs.has(id)) { const e = new Error('i.ytimg.com answered 404'); e.status = 404; throw e; }
      return Buffer.from(`jpeg of ${url}`);
    },
    fetchArt: async (url) => { calls.art.push(url); if (artReply instanceof Error) throw artReply; return artReply; },
    makeBlank: async (out) => { fs.writeFileSync(out, 'blank'); },
    buildSprite: async (files, out, opts) => {
      calls.sprite.push({ files: files.map((f) => path.basename(f)), ...opts });
      if (failSprite) throw new Error(failSprite);
      fs.writeFileSync(out, 'sprite');
    },
    log: () => {},
  });
  fs.mkdirSync(art(), { recursive: true });
  fs.writeFileSync(path.join(art(), 'jefferson-fisher-avatar.jpg'), 'avatar');
  await P.savePerson({ id: 'jefferson-fisher', name: 'Jefferson Fisher', status: 'following', art: { avatar: 'jefferson-fisher-avatar.jpg', banner: null } });
  await R.upsertSources(VIDS.map((v) => ({ key: `yt:${v.id}`, kind: 'video', tier: 1, title: v.title, publishedAt: v.at, publishedApprox: !!v.approx, durationSec: 600, people: [{ id: 'jefferson-fisher', role: 'host' }] })));
});

const get = (p) => fetch(base + p);

test('the cut-out is made once from his portrait and then served from the cache', async () => {
  const r1 = await get('/api/mentors/jefferson-fisher/cutout');
  assert.equal(r1.status, 200);
  assert.equal(await r1.text(), 'png bytes');
  assert.ok(fs.existsSync(path.join(art(), 'jefferson-fisher-cut.png')));
  const r2 = await get('/api/mentors/jefferson-fisher/cutout');
  assert.equal(r2.status, 200);
  assert.equal(calls.cut, 1, 'a second ask reads the cached file');
});

test('two asks at once make one cut-out', async () => {
  const [a, b] = await Promise.all([A.ensureCutout('jefferson-fisher'), A.ensureCutout('jefferson-fisher')]);
  assert.equal(a, b);
  assert.equal(calls.cut, 1);
});

test('no Swift on this Mac: a 404 that says the real cause, remembered so it is not retried on every ask', async () => {
  A._setArtDepsForTest({ ensureHelper: async () => { calls.helper += 1; throw new Error('the cut-out helper could not be built with swiftc: swiftc is not installed (swiftc)'); }, log: () => {} });
  const r = await get('/api/mentors/jefferson-fisher/cutout');
  assert.equal(r.status, 404);
  assert.match((await r.json()).error, /swiftc is not installed/);
  const r2 = await get('/api/mentors/jefferson-fisher/cutout');
  assert.equal(r2.status, 404);
  assert.equal(calls.helper, 1, 'the failure is remembered');
});

test('a portrait with no person in it says so', async () => {
  P._resetPeopleForTests();
  await P.savePerson({ id: 'someone', name: 'Someone', status: 'following', art: { avatar: 'jefferson-fisher-avatar.jpg' } });
  failCut = "Apple's subject lift found no person in the portrait";
  await assert.rejects(A.ensureCutout('someone'), /found no person/);
});

test('a person with no saved portrait, and an unknown person', async () => {
  await P.savePerson({ id: 'no-pic', name: 'No Pic', status: 'following', art: { avatar: null } });
  await assert.rejects(A.ensureCutout('no-pic'), /no portrait is saved for No Pic/);
  const r = await get('/api/mentors/nobody/cutout');
  assert.equal(r.status, 404);
  assert.match((await r.json()).error, /no person called "nobody"/);
});

test('the wall: catalogue order newest first, undated last, and a sprite built from it', async () => {
  const r = await get('/api/mentors/jefferson-fisher/wall');
  assert.equal(r.status, 200);
  const w = await r.json();
  assert.deepEqual(w.order.map((x) => x[0]), ['aaaaaaaaaa1', 'aaaaaaaaaa2', 'aaaaaaaaaa3']);
  assert.deepEqual(w.order[1], ['aaaaaaaaaa2', 'Older', 600, '2026-10-01T15:00:00.000Z', true]);
  assert.equal(w.sprite, null, 'nothing built yet');
  assert.equal(w.building, true);
  await A._wallSettled('jefferson-fisher');
  const w2 = await (await get('/api/mentors/jefferson-fisher/wall')).json();
  assert.equal(w2.building, false);
  assert.deepEqual(w2.sprite.ids, ['aaaaaaaaaa1', 'aaaaaaaaaa2', 'aaaaaaaaaa3']);
  assert.equal(w2.sprite.cols, 16);
  assert.equal(w2.sprite.rows, 1);
  assert.deepEqual(w2.sprite.cell, [160, 90]);
  assert.match(w2.sprite.url, /^\/api\/mentors\/art\/jefferson-fisher-wall-[0-9a-f]{10}\.jpg$/);
  assert.equal(calls.fetch.length, 3);
  assert.ok(calls.fetch.every((u) => /^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/mqdefault\.jpg$/.test(u)));
  assert.deepEqual(calls.sprite[0].files, ['aaaaaaaaaa1.jpg', 'aaaaaaaaaa2.jpg', 'aaaaaaaaaa3.jpg']);
});

test('a new video: the old sprite is served with its own ids while the new one builds, each thumbnail fetched once', async () => {
  await A.wallFor('jefferson-fisher'); await A._wallSettled('jefferson-fisher');
  await R.upsertSources([{ key: 'yt:aaaaaaaaaa0', kind: 'video', tier: 1, title: 'Brand new', publishedAt: '2026-11-21T15:00:00.000Z', durationSec: 60, people: [{ id: 'jefferson-fisher', role: 'host' }] }]);
  const w = await A.wallFor('jefferson-fisher');
  assert.equal(w.order[0][0], 'aaaaaaaaaa0');
  assert.deepEqual(w.sprite.ids, ['aaaaaaaaaa1', 'aaaaaaaaaa2', 'aaaaaaaaaa3'], 'the old sprite, mapped by id');
  await A._wallSettled('jefferson-fisher');
  const w2 = await A.wallFor('jefferson-fisher');
  assert.equal(w2.sprite.ids[0], 'aaaaaaaaaa0');
  assert.equal(calls.fetch.length, 4, 'only the new thumbnail was fetched');
  const walls = fs.readdirSync(art()).filter((f) => /-wall-.*\.jpg$/.test(f));
  assert.equal(walls.length, 1, 'the older sprite is removed');
});

test('a thumbnail YouTube does not have is a blank cell named in missing, and the build still lands', async () => {
  missingThumbs.add('aaaaaaaaaa2');
  await A.wallFor('jefferson-fisher'); await A._wallSettled('jefferson-fisher');
  const w = await A.wallFor('jefferson-fisher');
  assert.deepEqual(w.sprite.missing, [1]);
  assert.deepEqual(calls.sprite[0].files, ['aaaaaaaaaa1.jpg', '_blank.jpg', 'aaaaaaaaaa3.jpg']);
});

test('ffmpeg failing: no sprite, and the wall says the real cause', async () => {
  failSprite = 'ffmpeg is not installed (/opt/homebrew/bin/ffmpeg)';
  await A.wallFor('jefferson-fisher'); await A._wallSettled('jefferson-fisher');
  const w = await (await get('/api/mentors/jefferson-fisher/wall')).json();
  assert.equal(w.sprite, null);
  assert.match(w.error, /ffmpeg is not installed/);
});

test('one thumbnail: only a video the register knows, never an open proxy; hi asks YouTube for the 1280 px frame', async () => {
  assert.equal((await get('/api/mentors/thumb/zzzzzzzzzzz')).status, 404);
  assert.equal((await get('/api/mentors/thumb/..%2Fetc')).status, 404);
  assert.equal(calls.fetch.length, 0);
  const r = await get('/api/mentors/thumb/aaaaaaaaaa1');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /mqdefault/);
  missingThumbs.add('aaaaaaaaaa3');
  calls.fetch = [];
  const hi = await get('/api/mentors/thumb/aaaaaaaaaa1?size=hi');
  assert.equal(hi.status, 200);
  assert.match(await hi.text(), /maxresdefault/);
  assert.match(calls.fetch[0], /maxresdefault/);
});

test('the catalogue signature changes with the order and only with it', () => {
  assert.equal(A.signatureOf(['a', 'b']), A.signatureOf(['a', 'b']));
  assert.notEqual(A.signatureOf(['a', 'b']), A.signatureOf(['b', 'a']));
});

const COVER = 'https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg';
const withPodcast = (podcast) => P.savePerson({ id: 'jefferson-fisher', podcast });

test('the podcast cover is fetched once from Apple and then served from the cache', async () => {
  await withPodcast({ title: 'Pod', artworkUrl: COVER, episodes: 3 });
  const r1 = await get('/api/mentors/jefferson-fisher/podcast-art');
  assert.equal(r1.status, 200);
  assert.equal(await r1.text(), 'cover');
  assert.ok(fs.existsSync(path.join(art(), 'jefferson-fisher-podcast.jpg')));
  assert.equal((await get('/api/mentors/jefferson-fisher/podcast-art')).status, 200);
  assert.deepEqual(calls.art, [COVER], 'fetched once');
});

test('a podcast cover on a host outside the allow-list is refused and nothing is fetched', async () => {
  for (const u of ['https://evil.example.com/a.jpg', 'http://is1-ssl.mzstatic.com/a.jpg', 'https://mzstatic.com.evil.example/a.jpg']) {
    await withPodcast({ title: 'Pod', artworkUrl: u });
    const r = await get('/api/mentors/jefferson-fisher/podcast-art');
    assert.equal(r.status, 404);
    assert.match((await r.json()).error, /not on Apple's artwork host/);
  }
  assert.equal(calls.art.length, 0);
});

test('a podcast cover that is not a picture is refused and kept off the disk', async () => {
  await withPodcast({ title: 'Pod', artworkUrl: COVER });
  artReply = { buf: Buffer.from('<html>'), type: 'text/html; charset=utf-8' };
  await assert.rejects(A.ensurePodcastArt('jefferson-fisher'), /not a jpg, png or webp/);
  assert.equal(fs.readdirSync(art()).filter((f) => f.includes('-podcast')).length, 0);
});

test('no podcast, or no cover address, is a notFound with a plain sentence', async () => {
  await assert.rejects(A.ensurePodcastArt('jefferson-fisher'), (e) => e.notFound && /has no podcast saved/.test(e.message));
  await withPodcast({ title: 'Pod', artworkUrl: null });
  await assert.rejects(A.ensurePodcastArt('jefferson-fisher'), (e) => e.notFound && /no cover address/.test(e.message));
  assert.equal((await get('/api/mentors/jefferson-fisher/podcast-art')).status, 404);
});

test('a failed podcast cover fetch is remembered, so a poll does not retry', async () => {
  await withPodcast({ title: 'Pod', artworkUrl: COVER });
  artReply = new Error('is1-ssl.mzstatic.com answered 503');
  const r = await get('/api/mentors/jefferson-fisher/podcast-art');
  assert.equal(r.status, 404);
  assert.match((await r.json()).error, /answered 503/);
  assert.equal((await get('/api/mentors/jefferson-fisher/podcast-art')).status, 404);
  assert.equal(calls.art.length, 1, 'the failure is remembered');
});
