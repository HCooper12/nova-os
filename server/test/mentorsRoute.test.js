import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

// Tests without their own data dir write into his live server/data.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-mentor-route-'));
process.env.NOVA_DATA_DIR = dir;

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mentors');
const text = (f) => fs.readFileSync(path.join(FIX, f), 'utf8');
const json = (f) => JSON.parse(text(f));
const URL_FISHER = 'https://www.youtube.com/@jeffersonfisher';

let D; let P; let R; let U; let server; let base; let vault;
before(async () => {
  D = await import('../lib/mentorDiscover.js');
  P = await import('../lib/mentorPeople.js');
  R = await import('../lib/mentorRegister.js');
  U = await import('../lib/claudeUsage.js');
  const { mentorsRouter } = await import('../routes/mentors.js');
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-mentor-vault-'));
  const app = express();
  app.use(express.json());
  app.use('/api', mentorsRouter(vault));
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server?.close();
  D._setDiscoverDepsForTest(null); P._setPeopleDepsForTest(null); U._setClaudeUsageDepsForTest(null);
});

const orange = () => { const b = Buffer.alloc(32 * 32 * 3); for (let i = 0; i < b.length; i += 3) b.set([250, 107, 47], i); return b; };
let failYtdlp;
beforeEach(() => {
  fs.rmSync(path.join(dir, 'mentors'), { recursive: true, force: true });
  R._resetRegisterForTests(); P._resetPeopleForTests(); U._resetClaudeUsageForTests();
  failYtdlp = null;
  const head = json('ch-jeffersonfisher.json');
  const all = json('fisher-all.json');
  D._setDiscoverDepsForTest({
    ytdlpJson: async (args) => {
      if (failYtdlp) throw new Error(failYtdlp);
      const url = args.at(-1);
      if (url.includes('results?search_query')) return json('channel-search.json');
      if (url.endsWith('/videos')) return args.includes('--playlist-items') ? head : { ...head, entries: all.entries };
      if (url.endsWith('/shorts')) return { ...head, entries: [] };
      throw new Error('This channel does not have a streams tab');
    },
    fetchText: async (u) => (u.includes('feeds/videos.xml') ? text('fisher-youtube-rss.xml') : text('fisher-podcast-feed.xml')),
    fetchJson: async (u) => (u.includes('itunes') ? json('itunes-search.json') : { docs: [] }),
    fetchBuffer: async () => Buffer.from('fake jpeg bytes'),
    ffmpegRaw: async () => orange(),
  });
  P._setPeopleDepsForTest({ readClaudeUsage: async () => ({ at: 'x', session: { percent: 1, resetsAt: null }, week: { percent: 2, resetsAt: null }, scoped: [] }) });
});

async function call(method, url, body) {
  const res = await fetch(base + url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, body: ct.includes('json') ? await res.json() : await res.text() };
}
// the raw path, exactly as written: fetch would tidy ".." away
const raw = (p) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port: new URL(base).port, path: p }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }).on('error', reject);
});

test('POST /mentors/find: candidates, and a plain 400 for an empty query', async () => {
  const r = await call('POST', '/api/mentors/find', { query: 'Jefferson Fisher' });
  assert.equal(r.status, 200);
  assert.equal(r.body.candidates[0].channelId, 'UCXjnpu6lK0HoUyOMh2ZBwhQ');
  assert.equal((await call('POST', '/api/mentors/find', { query: '  ' })).status, 400);
});

test('a discovery failure is a 502 that says what failed', async () => {
  failYtdlp = 'yt-dlp exited with code 1: HTTP Error 429: Too Many Requests';
  for (const [u, b] of [['/api/mentors/find', { query: 'x y' }], ['/api/mentors/preview', { channelUrl: URL_FISHER }], ['/api/mentors/follow', { channelUrl: URL_FISHER }]]) {
    const r = await call('POST', u, b);
    assert.equal(r.status, 502, u);
    assert.match(r.body.error, /429/);
  }
});

test('POST /mentors/preview: the draft with art as /api URLs, and nothing saved', async () => {
  const r = await call('POST', '/api/mentors/preview', { channelUrl: URL_FISHER });
  assert.equal(r.status, 200);
  assert.equal(r.body.person.id, 'jefferson-fisher');
  assert.equal(r.body.person.art.avatar, '/api/mentors/art/jefferson-fisher-avatar.jpg');
  assert.equal(r.body.counts.videos, 236);
  assert.equal(r.body.latest.length, 6);
  assert.equal(r.body.usage.week.percent, 2);
  assert.deepEqual((await call('GET', '/api/mentors')).body.people, []);
  assert.equal((await call('POST', '/api/mentors/preview', {})).status, 400);
  assert.equal((await call('POST', '/api/mentors/preview', { channelUrl: 'banana' })).status, 400);
});

test('follow, list, one person, pause and resume', async () => {
  assert.equal((await call('POST', '/api/mentors/follow', { channelUrl: URL_FISHER, scope: 'sideways' })).status, 400);
  const f = await call('POST', '/api/mentors/follow', { channelUrl: URL_FISHER });
  assert.equal(f.status, 200);
  assert.equal(f.body.person.status, 'following');
  assert.equal(f.body.counts.total, 236);

  const list = await call('GET', '/api/mentors');
  assert.equal(list.body.people.length, 1);
  assert.equal(list.body.people[0].counts.total, 236);
  assert.equal(list.body.people[0].art.banner, '/api/mentors/art/jefferson-fisher-banner.jpg');

  const one = await call('GET', '/api/mentors/jefferson-fisher');
  assert.equal(one.status, 200);
  assert.equal(one.body.person.name, 'Jefferson Fisher');
  assert.equal(one.body.catalogue.length, 236);
  assert.deepEqual(one.body.catalogue[0], ['1HX8PQ9FiCU', 4199, 'f']);
  assert.equal(one.body.latest.length, 6);
  assert.equal(one.body.latest[0].id, '1HX8PQ9FiCU');

  const paused = await call('POST', '/api/mentors/jefferson-fisher/pause');
  assert.equal(paused.body.person.status, 'paused');
  assert.ok(paused.body.person.pausedAt);
  const resumed = await call('POST', '/api/mentors/jefferson-fisher/resume');
  assert.equal(resumed.body.person.status, 'following');
});

test('an unknown person is a 404 with a plain message', async () => {
  for (const [m, u] of [['GET', '/api/mentors/nobody'], ['POST', '/api/mentors/nobody/pause'], ['POST', '/api/mentors/nobody/resume']]) {
    const r = await call(m, u);
    assert.equal(r.status, 404, u);
    assert.match(r.body.error, /no person called "nobody"/);
  }
});

test('the catalogue codes: woven, read, transcript, working and each hold letter', async () => {
  await P.savePerson({ id: 'p', name: 'P', status: 'following' });
  const mk = (id, extra = {}) => ({ key: `yt:${id}`, kind: 'video', tier: 1, title: id, durationSec: 60, people: [{ id: 'p', role: 'host' }], ...extra });
  await R.upsertSources(['wv', 'rd', 'tr', 'fd', 'wk', 'rf', 'du', 'hd', 'sk'].map((i) => mk(i)));
  await R.upsertSources([{ ...mk('short1'), kind: 'short', tier: 2 }]);
  await R.setStage('yt:wv', 'woven'); await R.setStage('yt:rd', 'read'); await R.setStage('yt:tr', 'transcript');
  await R.setWorking('yt:wk', 'read');
  await R.setHold('yt:rf', { state: 'refused', why: 'x' }); await R.setHold('yt:du', { state: 'duplicate', why: 'x' });
  await R.setHold('yt:hd', { state: 'held', why: 'x' }); await R.setHold('yt:sk', { state: 'skipped', why: 'x' });
  const { body } = await call('GET', '/api/mentors/p');
  const by = Object.fromEntries(body.catalogue.map(([id, , c]) => [id, c]));
  assert.deepEqual(by, { wv: 'w', rd: 'r', tr: 't', fd: 'f', wk: 'k', rf: 'x', du: 'd', hd: 'h', sk: 's' });
  assert.equal(body.catalogue.length, 9, 'a short is tier 2 and not in the map');
});

test('GET /mentors/:id for a person with 2,338 sources stays under 80 KB', async () => {
  await P.savePerson({ id: 'big', name: 'Big', status: 'following' });
  const list = Array.from({ length: 2338 }, (_, i) => ({
    key: `yt:${String(i).padStart(11, 'a')}`, kind: 'video', tier: 1, title: `Video number ${i} with a long enough title to matter`,
    durationSec: 1000 + i, views: 10, people: [{ id: 'big', role: 'host' }],
  }));
  await R.upsertSources(list);
  const res = await fetch(`${base}/api/mentors/big`);
  const body = await res.text();
  assert.equal(JSON.parse(body).catalogue.length, 2338);
  assert.ok(Buffer.byteLength(body) < 80 * 1024, `${Buffer.byteLength(body)} bytes`);
});

test('GET /mentors/art/:file serves a plain existing file and refuses everything else', async () => {
  fs.mkdirSync(P.artDir(), { recursive: true });
  fs.writeFileSync(path.join(P.artDir(), 'x-avatar.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  fs.mkdirSync(path.join(P.artDir(), 'subdir'));
  fs.writeFileSync(path.join(dir, 'mentors', 'people.json'), '{"secret":true}');
  const ok = await fetch(`${base}/api/mentors/art/x-avatar.jpg`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'private, max-age=86400');
  assert.equal(ok.headers.get('content-type'), 'image/jpeg');
  assert.equal((await ok.arrayBuffer()).byteLength, 4);
  assert.equal(await raw('/api/mentors/art/missing.jpg'), 404);
  assert.equal(await raw('/api/mentors/art/subdir'), 404);
  assert.equal(await raw('/api/mentors/art/..'), 404);
  assert.equal(await raw('/api/mentors/art/..%2Fpeople.json'), 404);
  assert.equal(await raw('/api/mentors/art/%2e%2e%2Fpeople.json'), 404);
  assert.equal(await raw('/api/mentors/art/..%5Cpeople.json'), 404);
  assert.equal(await raw('/api/mentors/art/.hidden'), 404);
});

test('GET /mentors/usage: the usage, or null when it is not known', async () => {
  U._setClaudeUsageDepsForTest({ spawn: () => { throw new Error('no claude here'); } });
  assert.deepEqual((await call('GET', '/api/mentors/usage')).body, { usage: null });
  const stream = text('usage-stream.jsonl');
  const { EventEmitter } = await import('node:events');
  U._setClaudeUsageDepsForTest({
    spawn: () => {
      const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
      c.stdin = { end() {}, on() {} }; c.kill = () => {};
      setImmediate(() => { c.stdout.emit('data', stream); c.emit('close', 0); });
      return c;
    },
  });
  assert.equal((await call('GET', '/api/mentors/usage')).body.usage.session.percent, 17);
});

test('POST /mentors/backfill: reads the vault and answers with the counts', async () => {
  fs.mkdirSync(path.join(vault, 'Wiki', 'Sources'), { recursive: true });
  const r = await call('POST', '/api/mentors/backfill');
  assert.equal(r.status, 200);
  assert.equal(r.body.scanned, 0);
  assert.equal(r.body.added, 0);
});

test('the queue routes: status, pause, his go for reading, ceilings, retry; and a person shows what the queue is doing for him', async () => {
  const Q = await import('../lib/mentorQueue.js');
  Q._resetQueueForTests();
  const post = (p, body) => fetch(`${base}/api${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await (await post('/mentors/follow', { channelUrl: URL_FISHER })).json();
  let r = await fetch(`${base}/api/mentors/queue`);
  let st = await r.json();
  assert.equal(st.paused, false);
  assert.equal(st.people[0].id, 'jefferson-fisher');
  assert.equal(st.people[0].doing, 'idle');
  st = await (await post('/mentors/queue/pause', { paused: true })).json();
  assert.equal(st.paused, true);
  assert.equal((await post('/mentors/queue/pause', { paused: 'yes' })).status, 400);
  const one = await (await fetch(`${base}/api/mentors/jefferson-fisher`)).json();
  assert.equal(one.doing, 'paused');
  assert.equal(one.waiting, null);
  await post('/mentors/queue/pause', { paused: false });
  assert.deepEqual(await (await post('/mentors/jefferson-fisher/reading', { allowed: true })).json(), { id: 'jefferson-fisher', readingAllowed: true });
  assert.equal((await post('/mentors/nobody/reading', { allowed: true })).status, 404);
  assert.deepEqual((await (await post('/mentors/queue/ceilings', { session: 50 })).json()).ceilings, { session: 50, week: 75 });
  assert.equal((await post('/mentors/queue/ceilings', { session: 500 })).status, 400);
  await R.setHold('yt:1HX8PQ9FiCU', { state: 'failed', why: 'x' });
  r = await post('/mentors/source/retry', { key: 'yt:1HX8PQ9FiCU' });
  assert.equal((await r.json()).source.hold, null);
  assert.equal((await post('/mentors/source/retry', { key: 'yt:nope' })).status, 404);
  Q._resetQueueForTests();
});
